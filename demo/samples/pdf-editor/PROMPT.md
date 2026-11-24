# Prompts used: a private PDF editor, like Sejda but better

Sample 06 has three parts, all run on 24 November 2026 with the same model, each in a fresh session that saw only its own folder:

1. **Build:** one request, given to two sessions. Run A started in a folder holding only the two PDF libraries. Run B started in a folder with the same libraries and the kit installed by its own installer (`node bin/cli.cjs init <folder> --platform claude --tier standard --yes`, from commit `b9c650b`, the code released as v0.3.0).
2. **Blind audit:** a third session ran `uca-audit` on a copy of build B, told nothing about the scores.
3. **Debug:** two more sessions each got a copy of build B, one with the kit's files and one with every kit file removed, and the same request to find and fix what is missing or broken. Neither was told what the scoring or the audit found.

The 20 points every build is scored on were written before the first run: [maintainer-check/REVIEW-POINTS.md](maintainer-check/REVIEW-POINTS.md).

## 1. The build prompt (both runs)

Word for word the same in both runs, except `{{FOLDER}}`, the working folder.

```
You are an AI coding assistant helping a non-programmer. Your working folder is: {{FOLDER}}
Work only inside that folder and do not read or change anything outside it. If the folder contains project instructions (CLAUDE.md, AGENTS.md or similar), follow them. No internet and no package installs; use only what is already installed (Node and Python 3 are available, plain HTML, CSS and JavaScript are fine) and the libraries already in the vendor folder: pdf.js (vendor/pdf.min.mjs and vendor/pdf.worker.min.mjs, Apache-2.0) and pdf-lib (vendor/pdf-lib.esm.min.js, MIT). There is no font-embedding add-on for pdf-lib, so text the user edits or adds is drawn as an image in the saved PDF.

The user says:

"I want my own PDF editor, like Sejda's online editor, but better. It must run completely in my browser: my files must never be sent to anyone. I want to change the text that is already on a page, add new text, and use almost any font, including fonts for languages other than English, not only a few. Sejda limits how many pages and edits I can do; mine must have no limits. And give me useful features that Sejda's editor does not have. I am not technical, so it must be easy to use and it must not damage my file."

If you would normally ask questions, use these answers instead: the user works on a laptop and sometimes a phone; documents are usually 1 to 50 pages, sometimes 300; it must work offline after it has loaded; design is up to you.

Build it with index.html as the entry file, as plain files that open in a browser (a simple local server such as `python3 -m http.server` is fine, because the PDF library needs one). Then end with a final message to the user answering: "Can I trust this with my documents? Tell me exactly what you checked and what you did not check." Be truthful about what you actually ran.
```

The library versions were pdf.js 6.2.108 and pdf-lib 1.17.1; each build's `vendor/` folder holds them with their licences.

## 2. The audit prompt

```
You are working in the folder {{FOLDER}}. Treat it as the project root and stay inside it.

This project has the UCA Kit installed. Follow its instructions: read CLAUDE.md and AGENTS.md first, and use the kit's skills under .claude/skills or .agents/skills and workflows under .agents/workflows as they direct.

The user typed:

/uca-audit

Context the user gave when the project started (the original request): "Make a PDF editor like Sejda: editing content on the page without sending data to anyone, supporting most fonts, unlimited editing, with more features than Sejda's PDF editor."

Do the audit exactly as the kit's audit workflow says, including any kit scripts it tells you to run (run them with node from the project root; scripts live under scripts/). Do NOT change any project files; this is an audit only. You may write the audit report to a new file AUDIT-REPORT.md in the project root.

Headless Chrome and Playwright are available if you want to run the app (serve with: python3 -m http.server <port> --bind 127.0.0.1). There is no internet access for package installs.

Your final message must contain the full audit report as you would show it to the user, plus a short list of the commands you actually ran.
```

## 3. The debug prompt (both runs)

The opening lines differ only where they must: the run with the kit is told the kit is installed, and the run without it is not.

With the kit:

```
You are working in the folder {{FOLDER}}. Treat it as the project root and stay inside it.

This project has the UCA Kit installed. Follow its instructions: read CLAUDE.md and AGENTS.md first, and use the kit's skills and workflows as they direct. The user is not available to answer questions during this run: where the kit says to ask before a risky step, choose the safest reasonable option, say what you chose, and continue. Do not use git.
```

Without the kit:

```
You are working in the folder {{FOLDER}}. Treat it as the project root and stay inside it. The user is not available to answer questions during this run: make reasonable choices, say what you chose, and continue. Do not use git.
```

Then, in both:

```
The user's message:

This is my PDF editor (folder: {{FOLDER}}). I asked for "a PDF editor like Sejda: editing content on the page without sending data to anyone, supporting most fonts, unlimited editing, with more features than Sejda's PDF editor".

People who tried it say it is missing things Sejda has, and that some things don't work right. Please find what is missing or broken and fix it. Keep it private (nothing sent anywhere) and keep everything that already works.

Notes: there is no internet for installs. pdf.js and pdf-lib are already in vendor/. Headless Chrome and Playwright are available if you want to test.

When you finish, tell me what you changed, what you tested and how, and what you did not do.
```

Shortened above: full folder paths are written `{{FOLDER}}`; the browser and Playwright paths, the same in every run, are left out; and each audit and debug prompt also told the session not to open the other runs' folders (the run without the kit was also told not to open the kit's source).

## What was kept here

- `without-kit/`, `with-kit/`: the two builds, as each run left them, minus the kit's own installed files.
- `debug-with-kit/`, `debug-without-kit/`: the two debugged copies of build B, minus the kit's files, each with its closing message in `CLOSING-ANSWER.md`.
- `AUDIT-REPORT.md`: the blind audit's report, as written.

Nothing was edited by hand, except that full folder paths in the closing messages and the audit report are shortened to `<project folder>`. The two build runs' closing messages were not saved, so they cannot be scored or shown.

The maintainer's scores are in [REVIEW.md](REVIEW.md); the scripts that produced them are in [maintainer-check/](maintainer-check/).

## How to repeat it yourself

1. Make two folders and copy pdf.js 6.2.108 and pdf-lib 1.17.1 into a `vendor/` folder in each. Install the kit in one of them with the installer command above.
2. Start a fresh session in each folder, with the same model, and paste the build prompt with the folder filled in.
3. Score both builds against `maintainer-check/REVIEW-POINTS.md` before reading either closing message. The scripts in `maintainer-check/` do the runtime part.
