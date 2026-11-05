# Prompt used for both builds

Same model, two separate sessions. Both prompts below are word for word the same except the one line that names the working folder. The only real difference between the two runs is what was in that folder: run A started empty, run B started with the UCA Kit installed by its own installer (standard tier, `node bin/cli.cjs init <folder> --platform claude --tier standard --yes`).

Neither session was told to use the kit, read it, or avoid it. The line "If the folder contains project instructions (CLAUDE.md, AGENTS.md or similar), follow them" is in both prompts; in run A there was nothing to find.

## The exact prompt (both runs)

```
You are an AI coding assistant helping a non-programmer. Your working folder is: {{FOLDER}}
Work only inside that folder and do not read or change anything outside it. If the folder contains project instructions (CLAUDE.md, AGENTS.md or similar), follow them. No internet and no package installs; use only what is already installed (Node is available, and plain HTML, CSS and JavaScript are fine).

The user says:

"I teach 25 students at home in the evenings and I track who has paid their monthly fee in a notebook. Make me an app for this. I want to see each student, how much they owe, mark a month as paid, and see the total still pending. I will use it on my phone. I am not a programmer. It must work as plain files I can open in a browser (no server)."

If you would normally ask questions, use these answers instead: only the teacher uses it; no logins and no online payments, just records; runs on phone and laptop, not on the internet yet; fee amounts differ per student, between 500 and 2000; design is up to you.

Build the app with index.html as the entry file. Then end with a final message to the user answering: "Is this ready for me to start using with my real students? Tell me exactly what you checked and what you did not check." Be truthful about what you actually ran.
```

`{{FOLDER}}` was the folder path: an empty folder for run A, a folder with the kit installed for run B.

## How to repeat it yourself

1. Make two empty folders. Install the kit in one with the installer command above.
2. Start a fresh chat in each folder, with the same model.
3. Paste the exact prompt, replacing the folder line.
4. Compare what you get. Run `node scripts/uca-senior-check.cjs <folder>` on each, open each app on a phone-width screen, and read the closing answer.

## What this is, and is not

One run per side, same model. It is an illustration, not a benchmark result: a single run can go either way. An earlier run, with different instructions around the same request, produced a with-kit build that included 14 automatic tests; this run's with-kit build did not. That spread is the reason one run proves nothing. The repeatable procedure with a human scoring rubric is in the benchmarks folder of the repository.
