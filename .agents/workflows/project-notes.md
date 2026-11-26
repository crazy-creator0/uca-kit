# Workflow: Key file notes

Short facts about what the code does, saved in PROJECT.md so the next session reads a few lines instead of opening the same files again. Each note quotes the line it came from, and `scripts/uca-project-check.cjs` proves every quote.

## Read first
Use when: the user asks for notes (for example "uca-notes", "make project notes", "remember how this project works"); or you are about to read the files under "Key files" in PROJECT.md anyway: then offer once, in one line, to save notes while you are there.
Not when: nobody asked. Do not write notes nobody asked for; reading the files costs tokens up front, and the saving comes in later sessions.
Must do: every note quotes the exact line it came from; never quote a secret; `node scripts/uca-project-check.cjs` passes before you report.
Done when: the check passes and the user knows how many notes you saved, for which files.
Read on only for: "Steps" before writing; "What makes a good note" while writing; "When the code changes" on CHANGED.

## Steps
1. If PROJECT.md has no "Key files" block, run `node scripts/uca-project-discover.cjs --write PROJECT.md --section key-files` (or the full command without `--section` when there is no PROJECT.md).
2. Read the files listed under "Key files", in order. On a small model read only the first 3. Read each file once.
3. Under a `## Key file notes` heading **outside** the `uca:generated` markers (the generator rewrites only text between its markers), write at most 5 notes per file:
   `- <fact in plain words> (source: <path>:<line> "<exact text from that line>")`
4. Run `node scripts/uca-project-check.cjs`. Fix every WRONG (the quote is not in the file: re-read and correct or delete the note), MOVED (update the line number) and SHORT (quote more of the line). Repeat until it passes.
5. Tell the user how many notes you saved, for which files, and that the check passed.

## What makes a good note
Behaviour a file name, an import or a dependency cannot show: defaults (port, timeouts, page sizes), limits, who may do what, what happens on an error, token lifetimes, which value wins when two are set, side effects. One fact per note.

- Quote 6 or more characters from one line, copied exactly, and stop before any `")`.
- A quote proves the line exists, not your sentence. Write only what the quoted line shows; if the fact needs two lines, write two notes.
- Never quote a line that holds a real-looking key, token, password or connection string. Describe it and cite the line without a quote: `- A secret falls back to a value written in the code (source: src/auth.ts:4)`. Never open `.env` files.
- No guesses. If a file does not show something, leave it out or put it under "Assumed or unknown".

## When the code changes
`node scripts/uca-project-check.cjs` reports files CHANGED since the card was verified. Re-read only those files, fix or delete their notes, run the check again, and set `Verified at`. Notes for unchanged files stay as they are.
