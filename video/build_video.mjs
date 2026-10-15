#!/usr/bin/env node
// Builds a narrated lecture video for one module from course_manifest.json.
//   node build_video.mjs --doctor                      check the local toolchain
//   node build_video.mjs <manifest.json>               narration -> timing -> captions -> composition -> check + snapshots
//   node build_video.mjs <manifest.json> --render      same, then render module.mp4
// Options: --quality draft|looks|delivery (default looks), --force (redo narration), --no-captions
// Narration and transcripts are cached per scene, so editing one scene only regenerates that scene.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { TEMPLATES, renderScene, validateVisual } from "./scenes.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HF = process.env.HF_CLI || "hyperframes@0.8.156"; // pinned so renders are reproducible
const VENV_PY = path.join(os.homedir(), ".local/share/syllabus-to-course/kokoro-venv/bin/python");
const LEAD = 0.35; // seconds of picture before narration starts in each scene
const TAIL = 0.65; // seconds held after narration ends

const env = { ...process.env };
if (!env.HYPERFRAMES_PYTHON && fs.existsSync(VENV_PY)) env.HYPERFRAMES_PYTHON = VENV_PY;
env.NODE_USE_SYSTEM_CA ??= "1"; // trust the OS keychain (corporate TLS proxies) for model downloads

const run = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, env, encoding: "utf8", maxBuffer: 64 << 20 });
const hf = (args, cwd) => run("npx", ["--yes", HF, ...args], cwd);
const parseJson = (s) => JSON.parse(s.slice(s.indexOf("{")));
const die = (msg) => (console.error(`✗ ${msg}`), process.exit(1));
const duration = (file) => {
  const r = run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file]);
  const d = parseFloat(r.stdout);
  if (!(d > 0)) die(`ffprobe could not read a duration from ${file}`);
  return d;
};

// ---------- setup check ----------
function doctor() {
  const rows = [];
  const add = (name, ok, detail, fix) => rows.push({ name, ok, detail, fix });
  const major = parseInt(process.versions.node);
  add("Node.js 22+", major >= 22, process.version, "install Node 22+ (e.g. `fnm install 22`)");
  for (const bin of ["ffmpeg", "ffprobe"]) {
    const r = run(bin, ["-version"]);
    add(bin, r.status === 0, r.status === 0 ? r.stdout.split("\n")[0] : "not found", "brew install ffmpeg");
  }
  const d = hf(["doctor", "--json"]);
  let checks = [];
  try { checks = parseJson(d.stdout).checks; } catch { /* reported below */ }
  const chrome = checks.find((c) => c.name === "Chrome");
  add(`HyperFrames CLI (${HF})`, checks.length > 0, checks.length ? "runs" : (d.stderr || "").trim().slice(0, 120), "needs npx and network for the first download");
  add("Chrome for rendering", !!chrome?.ok, chrome?.detail || "unknown", "npx hyperframes browser ensure");
  const py = env.HYPERFRAMES_PYTHON || "python3";
  const k = run(py, ["-c", "import kokoro_onnx, soundfile"]);
  add("Kokoro TTS (python)", k.status === 0, py, `uv venv --python 3.12 ${path.dirname(path.dirname(VENV_PY))} && VIRTUAL_ENV=… uv pip install kokoro-onnx soundfile  (~130 MB)`);
  const model = path.join(os.homedir(), ".cache/hyperframes/tts/models/kokoro-v1.0.onnx");
  add("Kokoro model", fs.existsSync(model), fs.existsSync(model) ? "cached" : "downloads on first tts (~340 MB)", "run any `npx hyperframes tts` once");
  const w = run("which", ["whisper-cli"]);
  add("whisper.cpp (captions)", w.status === 0, w.stdout.trim() || "not found", "brew install whisper-cpp   (optional: without it, captions use estimated timing)");
  for (const r of rows) console.log(`${r.ok ? "✓" : "✗"} ${r.name.padEnd(28)} ${r.detail}${r.ok ? "" : `\n    fix: ${r.fix}`}`);
  const required = rows.filter((r) => !r.name.startsWith("whisper"));
  process.exit(required.every((r) => r.ok) ? 0 : 1);
}

// ---------- manifest ----------
function validate(m) {
  const errs = [];
  if (!m.title) errs.push("manifest.title is required");
  if (!Array.isArray(m.scenes) || !m.scenes.length) errs.push("manifest.scenes must be a non-empty array");
  const seen = new Set();
  for (const s of m.scenes || []) {
    if (!/^[a-z0-9-]+$/.test(s.id || "")) errs.push(`scene id "${s.id}" must be lowercase letters, digits, dashes`);
    if (seen.has(s.id)) errs.push(`duplicate scene id "${s.id}"`);
    seen.add(s.id);
    if (!TEMPLATES.includes(s.template)) errs.push(`scene "${s.id}": template must be one of ${TEMPLATES.join(", ")}`);
    if (!s.narration || !String(s.narration).trim()) errs.push(`scene "${s.id}": narration is empty`);
    const long = s.template === "diagram" && (s.visual?.nodes || []).find((n) => (n.text ?? n).length > 28);
    if (long) console.warn(`! scene ${s.id}: diagram node "${long.text ?? long}" is over 28 characters and will wrap to 3 lines`);
    const e = TEMPLATES.includes(s.template) && validateVisual(s);
    if (e) errs.push(e);
  }
  if (errs.length) die(`invalid manifest:\n  - ${errs.join("\n  - ")}`);
}

// Kokoro voice prefix -> whisper language (a/b = American/British English).
const LANG = { a: "en", b: "en", e: "es", f: "fr", h: "hi", i: "it", p: "pt", j: "ja", z: "zh" };

const norm = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

// Narration tokens with times. Each narration word takes the time of the matching whisper word
// (looking a few words ahead, since whisper may merge or split words); unmatched runs are spread
// by length between their matched neighbours. Without a transcript, spread over the whole clip.
function timedWords(narration, whisper, audioDur) {
  const out = narration.trim().split(/\s+/).map((text) => ({ text, start: null, end: null }));
  const w = whisper?.length ? whisper : null;
  let j = 0;
  if (w) for (const o of out) {
    const n = norm(o.text);
    for (let k = j; k < Math.min(j + 4, w.length); k++)
      if (norm(w[k].text) === n) { o.start = w[k].start; o.end = w[k].end; j = k + 1; break; }
  }
  for (let i = 0; i < out.length; i++) {
    if (out[i].start !== null) continue;
    let k = i;
    while (k < out.length && out[k].start === null) k++;
    const left = i > 0 ? out[i - 1].end : w ? w[0].start : 0.05;
    const right = k < out.length ? out[k].start : w ? w[w.length - 1].end : audioDur - 0.05;
    const run = out.slice(i, k);
    const total = run.reduce((n, o) => n + o.text.length + 1, 0);
    let acc = 0;
    for (const o of run) {
      o.start = left + ((right - left) * acc) / total;
      acc += o.text.length + 1;
      o.end = left + ((right - left) * acc) / total;
    }
    i = k - 1;
  }
  return out;
}

// Caption groups: break at sentence punctuation, pauses over 0.25 s, or 6 words.
function captionGroups(words) {
  const groups = [];
  let cur = [];
  words.forEach((w, i) => {
    cur.push(w);
    const next = words[i + 1];
    if (!next || /[.?!;:]$/.test(w.text) || next.start - w.end > 0.25 || cur.length >= 6) {
      groups.push({ text: cur.map((x) => x.text).join(" "), start: cur[0].start, end: w.end });
      cur = [];
    }
  });
  // Hold each caption until the next one starts when the gap is short, to avoid flicker.
  groups.forEach((g, i) => { const n = groups[i + 1]; if (n && n.start - g.end < 0.4) g.end = n.start; });
  return groups;
}

// ---------- page ----------
function pageHtml(m, scenes, total) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const f = (n) => n.toFixed(3);
  const sections = scenes.map((s) =>
    `<section id="s-${s.id}" class="clip scene" data-start="${f(s.t0)}" data-duration="${f(s.dur)}" data-track-index="0">${s.html}</section>`);
  const audio = scenes.map((s) =>
    `<audio id="a-${s.id}" src="assets/audio/${s.id}.wav" data-start="${f(s.a0)}" data-duration="${f(s.audioDur)}" data-track-index="2" data-volume="1"></audio>`);
  const caps = scenes.flatMap((s) => s.captions.map((c, i) =>
    `<div id="c-${s.id}-${i}" class="clip cap" data-start="${f(c.start)}" data-duration="${f(Math.max(c.end - c.start, 0.2))}" data-track-index="1"><span>${esc(c.text)}</span></div>`));
  const tweens = scenes.flatMap((s) => s.tweens).concat(
    scenes.flatMap((s) => s.captions.map((c, i) => ({ sel: `#c-${s.id}-${i} span`, t: c.start, kind: "cap" }))));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1920, height=1080" />
<title>${esc(m.title)}</title>
<script src="vendor/gsap.min.js"></script>
<link rel="stylesheet" href="theme.css" />
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${f(total)}" data-width="1920" data-height="1080">
${sections.join("\n")}
${caps.join("\n")}
${audio.join("\n")}
</div>
<script>
const TWEENS = ${JSON.stringify(tweens)};
const tl = gsap.timeline({ paused: true });
const later = { immediateRender: false };
const KINDS = {
  rise: [{ opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }],
  fade: [{ opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power1.out" }],
  pop:  [{ opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.6)" }],
  grow: [{ scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: "power2.out" }],
  cap:  [{ opacity: 0 }, { opacity: 1, duration: 0.12, ease: "none" }],
  hl:   [{ backgroundColor: "rgba(95,179,255,0)" }, { backgroundColor: "rgba(95,179,255,0.22)", duration: 0.4, ...later }],
  pick: [{ borderColor: "#2a3a4a", backgroundColor: "#17212c" }, { borderColor: "#47c58a", backgroundColor: "#173527", duration: 0.4, ...later }],
  dim:  [{ opacity: 1 }, { opacity: 0.35, duration: 0.4, ...later }],
};
for (const w of TWEENS) tl.fromTo(w.sel, KINDS[w.kind][0], KINDS[w.kind][1], w.t);
window.__timelines["main"] = tl;
</script>
</body>
</html>
`;
}

// ---------- pipeline ----------
function build(manifestPath, opts) {
  const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  validate(m);
  const base = path.dirname(path.resolve(manifestPath));
  const proj = path.join(base, "video-project");
  const audioDir = path.join(proj, "assets/audio");
  const buildDir = path.join(proj, ".build");
  fs.mkdirSync(audioDir, { recursive: true });
  fs.mkdirSync(buildDir, { recursive: true });
  const cacheFile = path.join(buildDir, "cache.json");
  const cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, "utf8")) : {};
  const voice = m.voice || "am_michael";
  const speed = m.speed || 1;
  const lang = LANG[voice[0]] || "en";
  const model = lang === "en" ? "small.en" : "small";

  // Step 2-3: narration audio per scene, then its real duration.
  const scenes = [];
  for (const s of m.scenes) {
    const key = createHash("sha1").update(`${voice}|${speed}|${s.narration}`).digest("hex");
    const wav = path.join(audioDir, `${s.id}.wav`);
    const wordsFile = path.join(audioDir, `${s.id}.words.json`);
    const fresh = !opts.force && cache[s.id]?.key === key && fs.existsSync(wav);
    if (!fresh) {
      const txt = path.join(buildDir, `${s.id}.txt`);
      fs.writeFileSync(txt, s.narration.trim());
      process.stdout.write(`• narrating ${s.id} … `);
      const r = hf(["tts", txt, "-v", voice, "-s", String(speed), "-o", wav, "--json"], proj);
      if (r.status !== 0) die(`tts failed for ${s.id}:\n${r.stdout}${r.stderr}`);
      console.log("done");
      fs.rmSync(wordsFile, { force: true });
    }
    const audioDur = duration(wav);
    if (audioDur < 15 || audioDur > 45) console.warn(`! scene ${s.id} narration is ${audioDur.toFixed(1)} s (target 20-40 s)`);

    // Step 3b: word timestamps for captions and cue-synced reveals.
    let whisper = null;
    if (opts.captions && fs.existsSync(wordsFile)) whisper = JSON.parse(fs.readFileSync(wordsFile, "utf8"));
    else if (opts.captions) {
      const tmp = path.join(buildDir, `tx-${s.id}`);
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.mkdirSync(tmp);
      process.stdout.write(`• transcribing ${s.id} … `);
      const r = hf(["transcribe", wav, "--engine", "whisper", "--model", model, "--language", lang, "--json", "-d", tmp], proj);
      const tj = path.join(tmp, "transcript.json");
      if (r.status === 0 && fs.existsSync(tj)) {
        whisper = JSON.parse(fs.readFileSync(tj, "utf8"));
        fs.writeFileSync(wordsFile, JSON.stringify(whisper));
        console.log("done");
      } else console.log("failed, using estimated caption timing");
    }
    cache[s.id] = { key };
    scenes.push({ ...s, audioDur, whisper });
  }
  fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));

  // Step 4: timing and composition.
  let t = 0;
  for (const s of scenes) {
    s.t0 = t;
    s.a0 = t + LEAD;
    s.dur = LEAD + s.audioDur + TAIL;
    t += s.dur;
    const words = timedWords(s.narration, s.whisper, s.audioDur).map((w) => ({ ...w, start: w.start + s.a0, end: w.end + s.a0 }));
    s.captions = opts.captions ? captionGroups(words) : [];
    const cue = (phrase, after) => {
      const want = phrase.split(/\s+/).map(norm).filter(Boolean);
      for (let i = 0; i + want.length <= words.length; i++)
        if (words[i].start >= after - 0.01 && want.every((w, j) => norm(words[i + j].text) === w)) return words[i].start;
      console.warn(`! scene ${s.id}: cue "${phrase}" not found in narration; using even spacing`);
      return null;
    };
    Object.assign(s, renderScene(s, { id: s.id, t0: s.t0, a0: s.a0, a1: s.a0 + s.audioDur, cue }));
  }
  const total = t;
  fs.mkdirSync(path.join(proj, "vendor"), { recursive: true });
  fs.copyFileSync(path.join(HERE, "vendor/gsap.min.js"), path.join(proj, "vendor/gsap.min.js"));
  fs.copyFileSync(path.join(HERE, "theme.css"), path.join(proj, "theme.css"));
  fs.writeFileSync(path.join(proj, "hyperframes.json"), JSON.stringify({ paths: { assets: "assets" } }, null, 2));
  fs.writeFileSync(path.join(proj, "index.html"), pageHtml(m, scenes, total));
  console.log(`• composition written: ${scenes.length} scenes, ${total.toFixed(1)} s`);

  // Step 5: check gate plus one snapshot per scene midpoint.
  const c = hf(["check", "--json"], proj);
  let report;
  try { report = parseJson(c.stdout); } catch { die(`check produced no JSON:\n${c.stdout}${c.stderr}`); }
  fs.writeFileSync(path.join(buildDir, "check.json"), JSON.stringify(report, null, 2));
  // Snapshot each scene just before it ends, when every bullet and quiz answer is on screen.
  const mids = scenes.map((s) => (s.t0 + s.dur - 0.4).toFixed(2));
  const snapDir = path.join(proj, "snapshots");
  fs.rmSync(snapDir, { recursive: true, force: true });
  const sn = hf(["snapshot", "--at", mids.join(","), "--no-end", "--output", snapDir], proj);
  console.log(`• check: ${report.ok ? "passed" : "FAILED"} (details: video-project/.build/check.json)`);
  console.log(sn.status === 0 ? `• snapshots: ${snapDir}` : `! snapshot failed:\n${sn.stderr.slice(-800)}`);
  if (!report.ok) die("fix the check findings (or the manifest) and rerun before rendering");

  // Step 6: render.
  if (!opts.render) return console.log("• stopped before render (review the snapshots, then rerun with --render)");
  const out = path.join(base, m.output || "module.mp4");
  const r = hf(["render", "--quality", opts.quality, "--output", out], proj);
  if (r.status !== 0 || !fs.existsSync(out) || !fs.statSync(out).size) die(`render failed:\n${r.stdout.slice(-1500)}${r.stderr.slice(-1500)}`);
  console.log(r.stdout.trim().split("\n").slice(-3).join("\n"));
  const d = duration(out);
  const mb = fs.statSync(out).size / 1e6;
  console.log(`✓ ${out}\n  duration ${d.toFixed(1)} s (planned ${total.toFixed(1)} s) · ${mb.toFixed(1)} MB`);
  if (Math.abs(d - total) > 0.5) console.warn("! rendered duration differs from the plan by more than 0.5 s");
}

export { timedWords, captionGroups };
if (import.meta.url === pathToFileURL(process.argv[1]).href) main(); // skipped when imported by test_build.mjs

function main() {
const argv = process.argv.slice(2);
if (argv.includes("--doctor")) doctor();
const manifest = argv.find((a) => !a.startsWith("--") && a.endsWith(".json"));
if (!manifest) die("usage: node build_video.mjs <course_manifest.json> [--render] [--quality draft|looks|delivery] [--force] [--no-captions] | --doctor");
const q = argv.indexOf("--quality");
build(manifest, {
  render: argv.includes("--render"),
  force: argv.includes("--force"),
  captions: !argv.includes("--no-captions"),
  quality: q >= 0 ? argv[q + 1] : "looks",
});
}
