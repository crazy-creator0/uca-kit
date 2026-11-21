# Prompt used for both builds: UCA Kit home page

Same model, two separate sessions, run on 21 November 2026 with UCA Kit from the main branch after v0.1.1 (commit `2e5a30d`, not yet a release). Both prompts below are word for word the same except the one line that names the working folder. Run A started in an empty folder. Run B started in a folder with the kit installed by its own installer (`node bin/cli.cjs init <folder> --platform claude --tier standard --yes`).

Neither session was told to use the kit, read it, or avoid it. The line "If the folder contains project instructions (CLAUDE.md, AGENTS.md or similar), follow them" is in both prompts; in run A there was nothing to find.

## The exact prompt (both runs)

```
You are an AI coding assistant helping a non-programmer. Your working folder is: {{FOLDER}}
Work only inside that folder and do not read or change anything outside it. If the folder contains project instructions (CLAUDE.md, AGENTS.md or similar), follow them. No internet and no package installs; use only what is already installed (Node is available, and plain HTML, CSS and JavaScript are fine).

The user says:

"I made a free open-source toolkit called UCA Kit and I need a home page for it. It should make a developer understand in a few seconds what it is and want to try it, and it must not look like every other AI-made landing page. Here is everything that is true about it, please use only these facts:
- What it is: instructions and small read-only scripts you install into a project folder. Your AI coding assistant reads them and is asked to plan first, check its work, and say what it did not check.
- Install: npx --yes github:crazy-creator0/uca-kit#v0.1.1 init . --platform claude (other platforms: cursor, copilot, gemini, codex, opencode, windsurf and more).
- Numbers: 11 tool setups, 3 tiers (lite, standard, full), 16 skills, 5 workflows, 0 runtime dependencies.
- Honest limits: it is not a guarantee (a model can ignore instructions), it is not benchmarked, and it is not tested on every tool.
- Free and open source under the MIT license, written by Crazy Creators. Code: https://github.com/crazy-creator0/uca-kit"

If you would normally ask questions, use these answers instead: the audience is developers who already use an AI coding assistant; there is no logo yet; one page is enough; it must have a copy button for the install command; it must look good on a phone and on a laptop and work with the keyboard; a dark or light look is up to you; design is up to you.

Build it with index.html as the entry file, as plain files that open in a browser without a server. Then end with a final message to the user answering: "Is this ready to publish as my project's home page? Tell me exactly what you checked and what you did not check." Be truthful about what you actually ran.
```

`{{FOLDER}}` was the folder path: an empty folder for run A, a folder with the kit installed for run B.

## What was kept here

The files each run left in its folder, minus the kit's own installed files and the scratch folder run B used for its own screenshots and browser scripts (`.uca-workspace/`). Run A deleted its own test files before it finished. Nothing was edited by hand. Each run's last message is in its `CLOSING-ANSWER.md`, word for word except that the build folder's full path is shortened to `<project folder>`.

## How to repeat it yourself

1. Make two empty folders. Install the kit in one with the installer command above.
2. Start a fresh chat in each folder, with the same model.
3. Paste the exact prompt, replacing the folder line.
4. Compare what you get. Run `node scripts/uca-senior-check.cjs <folder>` on each, open each result at phone and laptop width, and read the closing answer.

## What this is, and is not

One run per side, same model. It is an illustration, not a benchmark result: a single run can go either way.
