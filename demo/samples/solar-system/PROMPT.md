# Prompt used for both builds: solar system

Same model, two separate sessions, run on 15 November 2026 with UCA Kit v0.1.1. Both prompts below are word for word the same except the one line that names the working folder. Run A started in an empty folder. Run B started in a folder with the kit installed by its own installer (`node bin/cli.cjs init <folder> --platform claude --tier standard --yes`).

Neither session was told to use the kit, read it, or avoid it. The line "If the folder contains project instructions (CLAUDE.md, AGENTS.md or similar), follow them" is in both prompts; in run A there was nothing to find.

## The exact prompt (both runs)

```
You are an AI coding assistant helping a non-programmer. Your working folder is: {{FOLDER}}
Work only inside that folder and do not read or change anything outside it. If the folder contains project instructions (CLAUDE.md, AGENTS.md or similar), follow them. No internet and no package installs; use only what is already installed (Node is available, and plain HTML, CSS and JavaScript are fine).

The user says:

"My 10-year-old daughter has a school project on the solar system. Make a 3D model of the Sun and the eight planets going around it that she can turn with her finger or the mouse, and tap a planet to see its name and one fact about it. It must work as plain files we can open in a browser (no server), on a tablet and on a laptop."

If you would normally ask questions, use these answers instead: no internet, so no libraries can be downloaded; the facts should be simple enough for a 10-year-old; sizes and distances do not need to be to scale, but say so on the page; she will show it in class from a laptop; design is up to you.

Build it with index.html as the entry file. Then end with a final message to the user answering: "Is this ready for her to show in class? Tell me exactly what you checked and what you did not check." Be truthful about what you actually ran.
```

`{{FOLDER}}` was the folder path: an empty folder for run A, a folder with the kit installed for run B.

## What was kept here

The files each run left in its folder, minus the kit's own installed files and the scratch folder each run used for its own screenshots and browser scripts (`_checks/` in run A, `.uca-workspace/` in run B). Nothing was edited by hand. Each run's last message is in its `CLOSING-ANSWER.md`, word for word except that the build folder's full path is shortened to `<project folder>`.

## How to repeat it yourself

1. Make two empty folders. Install the kit in one with the installer command above.
2. Start a fresh chat in each folder, with the same model.
3. Paste the exact prompt, replacing the folder line.
4. Compare what you get. Run `node scripts/uca-senior-check.cjs <folder>` on each, open each result at phone and laptop width, and read the closing answer.

## What this is, and is not

One run per side, same model. It is an illustration, not a benchmark result: a single run can go either way.
