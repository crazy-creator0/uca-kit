# Prompt used for both builds: Python basics, visualised

Same model, two separate sessions, run on 21 November 2026 with UCA Kit v0.2.0 (the released tag). Both prompts below are word for word the same except the one line that names the working folder. Run A started in an empty folder. Run B started in a folder with the kit installed by its own installer (`node bin/cli.cjs init <folder> --platform claude --tier standard --yes`, run from the `v0.2.0` tag).

Neither session was told to use the kit, read it, or avoid it. The line "If the folder contains project instructions (CLAUDE.md, AGENTS.md or similar), follow them" is in both prompts; in run A there was nothing to find.

## The exact prompt (both runs)

```
You are an AI coding assistant helping a non-programmer. Your working folder is: {{FOLDER}}
Work only inside that folder and do not read or change anything outside it. If the folder contains project instructions (CLAUDE.md, AGENTS.md or similar), follow them. No internet and no package installs; use only what is already installed (Node and Python 3 are available, and plain HTML, CSS and JavaScript are fine).

The user says:

"I teach Python to beginners and I want one study page they can open in a browser: Python basics, visualised, so it is easy to understand. It should cover:
- variables and how names point to values,
- the data types: int, float, str, bool, None, and how to convert between them,
- operators: arithmetic (including // and % ), comparison, logical, identity (is), membership (in), and assignment like +=,
- strings and their common methods,
- list, tuple, set and dict: how to create them, read from them, change them, loop over them, and their most useful methods, and when to pick which one,
- OOP in an easy way: class, object, __init__ and self, attributes and methods, class versus instance attributes, inheritance and super(), and __str__.
Use pictures and diagrams where they help more than words, and small interactive parts if they help learning. Every code example must show the output Python really prints. Put each code example in a <pre><code class="language-python"> block and its printed output in a <pre class="output"> block right after it, so I can check them later. Beginners will read this, so a wrong output or a wrong explanation is worse than a missing topic."

If you would normally ask questions, use these answers instead: the students are adults who have never programmed; Python version is 3.12 or newer; one page is fine but it can be long; it must work on a phone and a laptop and with the keyboard; it must work offline; design is up to you.

Build it with index.html as the entry file, as plain files that open in a browser without a server. Then end with a final message to the user answering: "Can I give this to my students as it is? Tell me exactly what you checked and what you did not check." Be truthful about what you actually ran.
```

`{{FOLDER}}` was the folder path: an empty folder for run A, a folder with the kit installed for run B.

## What was kept here

The files each run left in its folder, minus the kit's own installed files and run B's scratch folder (`.uca-workspace/`, its screenshots). Both runs kept their own example checkers; they are part of what each run delivered. Nothing was edited by hand. Each run's last message is in its `CLOSING-ANSWER.md`, word for word except that the build folder's full path is shortened to `<project folder>`.

The maintainer's own checks are in [REVIEW.md](REVIEW.md), and the script that ran every example is [maintainer-check.py](maintainer-check.py).

## How to repeat it yourself

1. Make two empty folders. Install the kit in one with the installer command above.
2. Start a fresh chat in each folder, with the same model.
3. Paste the exact prompt, replacing the folder line.
4. Compare what you get. Run `node scripts/uca-senior-check.cjs <folder>` on each, open each result at phone and laptop width, and read the closing answer.

## What this is, and is not

One run per side, same model. It is an illustration, not a benchmark result: a single run can go either way.
