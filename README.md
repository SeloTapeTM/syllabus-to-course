# syllabus-to-course

A [Claude Code](https://claude.com/claude-code) skill that turns a course syllabus (PDF, Word, pasted text, or web page) into a complete self-study course, one module at a time: lessons, exercises with solutions, quizzes, and resources. Optionally it renders a narrated video lecture (MP4) per module, locally.

Works for any subject. Handles Hebrew and Arabic syllabi too.

## Install

```bash
git clone https://github.com/SeloTapeTM/syllabus-to-course ~/.claude/skills/syllabus-to-course
```

Restart Claude Code. To update later: `git -C ~/.claude/skills/syllabus-to-course pull`.

## Use

In Claude Code:

```
/syllabus-to-course path/to/syllabus.pdf
```

Or just share a syllabus and say "make me a course from this".

Claude works in four phases and checks in with you between each:

1. **Intake**: reads the syllabus and asks your level, weekly hours, and goal
2. **Course map**: proposes the module outline for your approval
3. **Modules**: writes them one at a time (lesson, practice, quiz, resources)
4. **Wrap-up**: optional final quiz, capstone project, or next steps

## Video lectures (optional)

Ask for "the video lecture for module 3" after a module is done. Requirements:

- Node 22+, ffmpeg
- HyperFrames CLI + headless Chrome
- Kokoro TTS (Python 3.10+)
- whisper.cpp for captions (optional, skip with `--no-captions`)

Run `node ~/.claude/skills/syllabus-to-course/video/build_video.mjs --doctor` to see what's missing. Claude asks before installing anything. Full details: [references/video-lecture.md](references/video-lecture.md).

## License

MIT, see [LICENSE](LICENSE).

Includes GSAP (© GreenSock/Webflow) in `video/vendor/gsap.min.js`, used under the [GSAP Standard License](https://gsap.com/standard-license). The MIT license covers everything else in this repo.
