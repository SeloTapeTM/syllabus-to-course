---
name: syllabus-to-course
description: Turns a course syllabus, course outline, or curriculum (usually a PDF, but also pasted text, a Word file, or a web page) into a complete self-study course delivered one module at a time, with lessons, exercises, quizzes, and resources, plus an optional narrated video lecture (MP4) per module rendered locally. Use when the user shares a syllabus or course outline and wants to learn from it, recreate it, study it on their own, or turn it into study material, for any subject. Also use when they say things like "I can't take this class but want to learn it" or "make me a course from this", or ask for a video lecture of a module from such a course. Do not use for writing a new syllabus from scratch with no source, for grading or reviewing someone else's syllabus, or for summarizing a document they don't intend to study.
---

# Syllabus to Course

Recreate a course the user can't enroll in as a self-study course that follows the syllabus faithfully. Work in four phases with a checkpoint between each. The checkpoints exist because the user's level, time, and goal decide what a good lesson looks like, and a wrong outline wastes every module built on top of it.

## Phase 1: Intake

1. **Read the whole syllabus.** For a PDF, extract the text (use the pdf skill or `pdftotext -layout` if available). Then check that schedules and tables survived: week numbers in order, dates matched to topics, no columns merged into one line. If a table came out garbled, re-extract it with a table-aware method or read that page as an image before moving on. For right-to-left languages (Hebrew, Arabic), also check that words and lines didn't come out reversed or with numbers flipped. If they did, read the pages as images instead. Mention any part you couldn't recover.
2. **Summarize what you found** in a compact block: title, level, prerequisites, weekly topics, assignments, grading, required readings. Put a **Missing or unclear** list under it covering things like weeks with no topics, readings cited only as "Ch. 4", or assignments named but not described.
3. **Ask at most three questions, in one short message:**
   - Current level in this subject (and in the prerequisites)
   - Weekly time budget, in hours
   - Goal: what they want to be able to do when they finish

   Don't start Phase 2 until they answer. If they say "just go", assume a motivated beginner with 5 hours a week and say that you assumed it.

## Phase 2: Course map

Before writing any lessons, produce the full outline using `templates/course-map.md`. It covers:

- Modules in syllabus order. One module usually equals one syllabus week or unit. Merge or split weeks only when the time budget requires it, and say so.
- Estimated hours per module, based on their weekly budget, plus the total number of weeks.
- How each syllabus assignment maps to a practice task.
- Gaps: topics the syllabus names but gives no detail on.

Stay inside the syllabus scope. Label anything you add **Optional extension**. Then stop and ask them to approve or adjust the map.

## Phase 3: Module-by-module delivery

Build **one module per turn** using `templates/module.md`. Continue only when the user says "next" (or otherwise clearly asks for the next module). If they ask questions, answer them and stay on the current module. Each module has:

1. **Learning objectives:** 3-5 objectives, each measurable (start with verbs like *calculate*, *implement*, *compare*, *explain*, not *understand*).
2. **Lesson:** written in your own words and covering every topic the syllabus lists for that module, with concrete examples and at least one analogy for the hardest idea. Check your coverage against the syllabus topic list and the section list of the assigned reading before sending.
3. **Practice:** exercises or a mini-project that mirrors the syllabus assignment for that week. If the syllabus has no assignment for the week, set a short practice task and label it as your own. Give brief solutions or expected results after the exercises. Before sending, check every "you should see X" against the lesson's own code or worked examples, because a wrong expected result teaches the learner to distrust correct work.
4. **Quiz:** 5 questions. Put answers and explanations in a separate section after all the questions so the user can attempt them first.
5. **Further resources:** list only resources you are confident exist (title and author or publisher). Mark anything you're unsure of **[unverified]**. Never invent a URL. Describe each source accurately (for example, a community wiki is not an "official reference"). Point to the syllabus's own readings first.

**Accuracy pass before sending.** The user can't easily tell when a lesson is wrong. Before sending each module, read `references/accuracy-checklist.md` and run through it. It covers recomputing numbers and running code, the replication status of studies, examples that fit their concept exactly, covering every section of the assigned reading, and exact citations.

End each module with one line: what's done, what the next module covers, and "Say **next** to continue, or **video** for a narrated video lecture of this module." After the first module, also ask once whether they want a video for every module, just some, or none. Then follow that answer without asking again.

**Video lecture (optional, per module).** When the user asks for a video of a module they've approved, read `references/video-lecture.md` and follow it. It covers a one-time setup check, writing `course_manifest.json` from the approved lesson (same scope, own words, every lesson topic), building and reviewing snapshots, and rendering `module.mp4` only after the user approves. Then return to the module flow.

## Phase 4: Wrap-up

After the last module, offer three things and build whichever the user picks (see `templates/wrap-up.md`):
- A final review quiz that spans all modules
- A capstone project tied to their stated goal
- A one-page cheat sheet

## Rules

- **Language:** if the syllabus isn't in English, add one line to the Phase 1 question message, which doesn't count as a fourth question: "I'll write the course in English, which also lets me make narrated video lectures. Reply with *<syllabus language>* if you'd rather have it in that language (text only: the local voice engine has no voice for it)." Skip the video part of that line when the language is one Kokoro speaks (see `references/video-lecture.md`). Use whichever language they pick for the whole course, and keep each technical term the way the syllabus writes it, with the English or original term in parentheses the first time.
- **Copyright:** never reproduce passages from textbooks, papers, or course slides. Summarize the ideas in your own words and cite the source (author, title, chapter) so the user can read the original.
- **Fit depth to their level.** A beginner needs worked steps. An advanced learner needs the subtle parts and edge cases. Don't pad either one.
- **Concrete over abstract.** Lead with an example or problem, then the principle. Favor exercises over extra explanation.
- **Thin syllabus means ask, not invent.** If a topic is only a word or two in the syllabus, say so and ask whether to fill it in from standard coverage of the subject. If they agree, label the filled content as such.
- **Exports:** offer to export as a Word doc (docx skill), a slide deck (pptx skill), or an interactive quiz or flashcard set (HTML artifact). Offer it at the end of the first module you deliver in a conversation and again at wrap-up. If you can't see whether it was already offered, add it as one short line. Don't repeat it in every module, because repeated offers turn into noise.
