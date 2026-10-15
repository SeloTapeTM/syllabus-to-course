# Video lecture for a module (optional)

Turns an approved module into `module.mp4`: a narrated slide lecture with word-timed captions, rendered locally with HyperFrames, Kokoro TTS, Whisper, and FFmpeg. The pipeline lives in `video/` next to this folder, so `<skill>` below means this skill's directory.

## Contents
1. One-time setup
2. Write the manifest
3. Build, review, render
4. Editing and regenerating
5. Troubleshooting

## 1. One-time setup

Run the setup check before the first video in a conversation:

```bash
node <skill>/video/build_video.mjs --doctor
```

It reports Node 22+, ffmpeg/ffprobe, the HyperFrames CLI, Chrome for rendering, Kokoro, and whisper.cpp, with a fix line for anything missing. **Ask before installing anything**, and give the size:

| Missing | Install | Size |
|---|---|---|
| Kokoro (Python 3.10+) | `uv venv --python 3.12 ~/.local/share/syllabus-to-course/kokoro-venv && VIRTUAL_ENV=~/.local/share/syllabus-to-course/kokoro-venv uv pip install kokoro-onnx soundfile` | ~130 MB |
| Kokoro model | downloads on the first `tts` run into `~/.cache/hyperframes/tts/` | ~340 MB |
| Chrome (headless shell) | `npx hyperframes browser ensure` | ~150 MB |
| whisper.cpp + `small.en` model (captions) | `brew install whisper-cpp`; the model downloads on first use | ~470 MB |

The script finds the Kokoro venv automatically (it sets `HYPERFRAMES_PYTHON`). Whisper is optional: without it, run with `--no-captions`.

## 2. Write the manifest

Save it as `<course-folder>/module-NN/course_manifest.json`. Ask once where the course folder should go; default to `./<course-name>/` in the current directory. Build it **from the approved module only**:

- **Scope:** cover every topic in the module's lesson, in the lesson's order. Add nothing the module doesn't cover. Narration that introduces new material is out of scope even if it's true.
- **Copyright:** write slides and narration in your own words. Never put textbook or paper passages on a slide or in the narration. Cite readings by author and chapter.
- **Narration:** spoken style, short sentences, about 55–100 words per scene (Kokoro speaks about 2.6 words per second, so that's roughly 20–40 s). Write symbols as they're spoken: "n squared", not "n²". Slides may use symbols.
- **Accuracy:** the module already passed the accuracy checklist. Don't add numbers or claims in the narration that aren't in the module.
- **Shape:** title-slide first, then one scene per lesson topic (bullet-slide, diagram, or code), one or two quiz-question scenes taken from the module quiz, and a summary last. A typical module comes to 8–18 scenes, about 4–10 minutes. When full coverage and length conflict, coverage wins: a chapter-sized module may need more scenes.

```json
{
  "course": "ECON 101 (self-study)",
  "module": 4,
  "title": "Module 4: Elasticity",
  "voice": "am_michael",
  "speed": 1.0,
  "scenes": [
    { "id": "intro", "template": "title-slide", "narration": "…",
      "visual": { "kicker": "Module 4", "title": "Elasticity", "subtitle": "How strongly buyers react to price" } }
  ]
}
```

`id` must be lowercase letters, digits and dashes, unique within the module. `voice` takes any Kokoro voice (`npx hyperframes tts --list`; `am_michael` and `af_heart` are American English, `bm_george` and `bf_emma` are British). A non-English voice switches captions to the multilingual Whisper model, which is a separate ~470 MB download. **Kokoro has no Hebrew or Arabic voice**, and the slide theme is left-to-right only. For a course in those languages, tell the user before writing the manifest, and offer an English-narrated video (slides in English too) instead. Don't produce Hebrew narration with a non-Hebrew voice.

### Templates and their `visual` fields

| Template | Required | Optional |
|---|---|---|
| `title-slide` | `title` | `kicker`, `subtitle` |
| `bullet-slide` | `heading`, `bullets` (strings or `{text, cue}`) | `kicker` |
| `diagram` | `heading`, `nodes` (≤ 5, strings or `{text, cue}`, ≤ 28 characters each; drawn left to right with arrows) | `kicker`, `caption` |
| `code` | `code` (string with `\n`) | `heading`, `kicker`, `language`, `highlight` (1-based line numbers), `cue` (when to highlight) |
| `quiz-question` | `question`, `options` (2–6), `answer` (0-based index) | `kicker`, `cue` (when to reveal the answer) |
| `summary` | `heading`, `points` (strings or `{text, cue}`) | `kicker` |

**Cues sync visuals to speech.** A `cue` is a short phrase copied word for word from that scene's narration. The item appears, or the answer reveals, when that phrase is spoken. Without cues, items spread evenly over the narration. For quiz scenes, have the narration ask the question, say "pause and decide", then say the answer with a cue on that sentence. Keep slide text short (about 8 words per bullet); the narration carries the detail.

See `<skill>/video/example/course_manifest.json` for a working three-scene example.

## 3. Build, review, render

```bash
node <skill>/video/build_video.mjs <course-folder>/module-NN/course_manifest.json
```

This runs narration (one WAV per scene) → real durations via ffprobe → Whisper word timing → the HyperFrames composition → `hyperframes check` → one snapshot per scene. It stops before rendering, as HyperFrames' review rule requires. Then:

1. Look at `video-project/snapshots/contact-sheet*.jpg` (read them as images; there are 9 scenes per sheet). Each frame is the scene just before it ends, with every bullet and the quiz answer showing. Fix anything unreadable or crowded.
2. Show the user the contact sheet(s) and the planned length, and ask whether to render.
3. When they approve, render:

```bash
node <skill>/video/build_video.mjs <course-folder>/module-NN/course_manifest.json --render
```

The script prints the MP4 path, its duration against the plan, and its size. Report all three from the script's final ✓ line; HyperFrames' own summary shows size in binary MB, so it reads a little smaller. `--quality draft` renders faster for a rough look; the default is `looks`, and `delivery` is the highest quality.

## 4. Editing and regenerating

Edit the manifest and rerun the same command. Narration and transcripts are cached per scene and keyed on voice, speed and text, so only the scenes you changed are re-narrated. `--force` re-narrates everything. To restyle every module, edit `<skill>/video/theme.css`. `video-project/` is generated output, so don't hand-edit it: changes there are overwritten on the next build.

## 5. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `self-signed certificate in certificate chain` | A TLS proxy. The script already sets `NODE_USE_SYSTEM_CA=1`. If it persists, export `NODE_EXTRA_CA_CERTS=<proxy-root.pem>` |
| `kokoro-onnx package is not installed` | The venv is missing. Run `--doctor` and install from §1 |
| `cue "…" not found` warning | The cue isn't word for word in that scene's narration. Copy the phrase exactly |
| `check: FAILED` | Read `video-project/.build/check.json`. Usually text overflow, so shorten the slide text |
| `narration is N s (target 20-40 s)` | Split or trim the scene's narration |
| Lint warnings `timeline_track_too_dense`, `nested_structure_needs_subcomposition`, `composition_file_too_large` | Expected: the video is one generated file. They're readability hints for the Studio timeline and don't affect the render |
