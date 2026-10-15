// Scene templates: each turns one manifest scene into HTML plus a list of tweens.
// A tween is { sel, t, kind } with absolute time t; the page runtime in build_video.mjs maps
// kinds to GSAP fromTo calls, so every animation is seekable.

export const TEMPLATES = ["title-slide", "bullet-slide", "diagram", "code", "quiz-question", "summary"];

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const item = (x) => (typeof x === "string" ? { text: x } : x);

// Required visual fields per template, checked by validate().
const REQUIRED = {
  "title-slide": ["title"],
  "bullet-slide": ["heading", "bullets"],
  diagram: ["heading", "nodes"],
  code: ["code"],
  "quiz-question": ["question", "options", "answer"],
  summary: ["heading", "points"],
};

export function validateVisual(scene) {
  const v = scene.visual || {};
  const missing = (REQUIRED[scene.template] || []).filter((k) => v[k] === undefined);
  if (missing.length) return `scene "${scene.id}" (${scene.template}) is missing visual.${missing.join(", visual.")}`;
  if (scene.template === "quiz-question" && !(v.answer >= 0 && v.answer < v.options.length))
    return `scene "${scene.id}": visual.answer must index into visual.options`;
  if (scene.template === "diagram" && v.nodes.length > 5) return `scene "${scene.id}": diagram supports at most 5 nodes`;
  return null;
}

// ctx: { id, t0, a0, a1, cue(text, after) } where a0/a1 bound the narration audio and
// cue() returns the absolute time a phrase is spoken (or null).
export function renderScene(scene, ctx) {
  const v = scene.visual || {};
  const p = `s-${ctx.id}`;
  const tw = [];
  const span = ctx.a1 - ctx.a0;
  // Reveal times: a spoken cue if given and found, else evenly spread over the first 70% of narration.
  const times = (list) => {
    let after = ctx.a0;
    return list.map((x, i) => {
      const hit = x.cue ? ctx.cue(x.cue, after) : null;
      const t = hit ?? ctx.a0 + span * (0.06 + (0.7 * i) / Math.max(list.length, 1));
      after = Math.max(after, t);
      return t;
    });
  };
  const heading = (text, kicker) =>
    (kicker ? `<div class="kicker" id="${p}-k">${esc(kicker)}</div>` : "") +
    (text ? `<div class="heading" id="${p}-h">${esc(text)}</div>` : "");
  const headTweens = () => {
    if (v.kicker) tw.push({ sel: `#${p}-k`, t: ctx.t0 + 0.05, kind: "fade" });
    if (v.heading) tw.push({ sel: `#${p}-h`, t: ctx.t0 + 0.12, kind: "rise" });
  };
  let body = "";

  switch (scene.template) {
    case "title-slide":
      body = `<div class="stage title-wrap">${v.kicker ? `<div class="kicker" id="${p}-k">${esc(v.kicker)}</div>` : ""}
        <div class="title" id="${p}-t">${esc(v.title)}</div>
        ${v.subtitle ? `<div class="subtitle" id="${p}-st">${esc(v.subtitle)}</div>` : ""}
        <div class="bar" id="${p}-bar"></div></div>`;
      if (v.kicker) tw.push({ sel: `#${p}-k`, t: ctx.t0 + 0.05, kind: "fade" });
      tw.push({ sel: `#${p}-t`, t: ctx.t0 + 0.15, kind: "rise" });
      if (v.subtitle) tw.push({ sel: `#${p}-st`, t: ctx.t0 + 0.6, kind: "rise" });
      tw.push({ sel: `#${p}-bar`, t: ctx.t0 + 0.9, kind: "grow" });
      break;

    case "bullet-slide":
    case "summary": {
      const list = (v.bullets || v.points).map(item);
      body = `<div class="stage ${scene.template === "summary" ? "summary" : ""}">${heading(v.heading, v.kicker)}
        <ul class="list">${list.map((b, i) => `<li id="${p}-b${i}">${esc(b.text)}</li>`).join("")}</ul></div>`;
      headTweens();
      times(list).forEach((t, i) => tw.push({ sel: `#${p}-b${i}`, t, kind: "rise" }));
      break;
    }

    case "diagram": {
      const nodes = v.nodes.map(item);
      const parts = nodes.map(
        (n, i) => (i ? `<div class="arrow" id="${p}-a${i}"></div>` : "") + `<div class="node" id="${p}-n${i}">${esc(n.text)}</div>`,
      );
      body = `<div class="stage">${heading(v.heading, v.kicker)}<div class="flow">${parts.join("")}</div>
        ${v.caption ? `<div class="diagram-caption" id="${p}-c">${esc(v.caption)}</div>` : ""}</div>`;
      headTweens();
      const ts = times(nodes);
      ts.forEach((t, i) => {
        if (i) tw.push({ sel: `#${p}-a${i}`, t: Math.max(t - 0.35, ctx.t0), kind: "grow" });
        tw.push({ sel: `#${p}-n${i}`, t, kind: "pop" });
      });
      if (v.caption) tw.push({ sel: `#${p}-c`, t: ts[ts.length - 1] + 0.6, kind: "fade" });
      break;
    }

    case "code": {
      const lines = String(v.code).replace(/\s+$/, "").split("\n");
      body = `<div class="stage">${heading(v.heading, v.kicker)}<div class="code">
        ${v.language ? `<div class="lang">${esc(v.language)}</div>` : ""}
        ${lines.map((l, i) => `<span class="ln" id="${p}-l${i + 1}">${esc(l) || " "}</span>`).join("")}</div></div>`;
      headTweens();
      // Type lines in over the first half of the narration, then highlight.
      lines.forEach((_, i) =>
        tw.push({ sel: `#${p}-l${i + 1}`, t: ctx.a0 + (span * 0.45 * i) / Math.max(lines.length, 1), kind: "fade" }),
      );
      const ht = (v.cue && ctx.cue(v.cue, ctx.a0)) ?? ctx.a0 + span * 0.6;
      (v.highlight || []).forEach((n) => tw.push({ sel: `#${p}-l${n}`, t: ht, kind: "hl" }));
      break;
    }

    case "quiz-question": {
      const opts = v.options.map(item);
      const L = "ABCDEF";
      body = `<div class="stage">${v.kicker ? `<div class="kicker" id="${p}-k">${esc(v.kicker)}</div>` : ""}
        <div class="question" id="${p}-q">${esc(v.question)}</div>
        <div class="options">${opts.map((o, i) => `<div class="option" id="${p}-o${i}"><b>${L[i]}</b>${esc(o.text)}</div>`).join("")}</div></div>`;
      if (v.kicker) tw.push({ sel: `#${p}-k`, t: ctx.t0 + 0.05, kind: "fade" });
      tw.push({ sel: `#${p}-q`, t: ctx.t0 + 0.12, kind: "rise" });
      // Options appear right after the question (the learner needs them while thinking) unless cued.
      opts.forEach((o, i) => {
        const t = (o.cue && ctx.cue(o.cue, ctx.a0)) ?? ctx.t0 + 0.9 + 0.3 * i;
        tw.push({ sel: `#${p}-o${i}`, t, kind: "rise" });
      });
      const rt = (v.cue && ctx.cue(v.cue, ctx.a0)) ?? ctx.a0 + span * 0.78;
      opts.forEach((_, i) => tw.push({ sel: `#${p}-o${i}`, t: rt, kind: i === v.answer ? "pick" : "dim" }));
      break;
    }
  }
  return { html: body, tweens: tw };
}
