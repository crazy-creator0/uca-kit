## Check it like the user
Before saying the main task works, check it the way the user will do it. Take the steps and expected results from the plan or the request (the user's words), not from how the code happens to work. Include at least one hard input from the user's world: long text, a file made by the tool they use, another language, the largest size they mentioned. If every input was made by you, say so.

Find out what you can do by doing it, never by assuming: run the test command, or `node -v` and `python3 --version` (`py --version` on Windows). Then use the highest level available, per step:
1. **Read** (any model): trace the step through the code: which handler runs, what happens to the input, what decides size, spacing, order and saving. Counts as "read, not run".
2. **Script** (you can run commands): with what is already installed, the project's own test tools first, do what the user does: real clicks and typing for a page, real requests for an API, real arguments for a CLI, real files for a file tool. Print at most about 20 lines: counts, pass or fail, the first failures. Print positions and counts, never the user's private content. Install nothing without asking (name it, its size and licence).
3. **One look** (only if you can read images, only for what a script cannot judge, such as whether a font looks the same): one picture of the app's own page or window, never the whole screen; keep it local and delete it after. First read a picture whose content you know (a page you made showing one word); if you cannot name the word, you cannot look. A picture you did not read is not a check.
4. **Hand over** (always, for whatever is left): 2 or 3 steps the user can try in a minute and what they should see; if they want it researched, a ready prompt with the problem and the tools available, without their content.

Report one Checks line per step as `step | level | result`, for example `type a long line in a paragraph | script | FAIL: 58pt past the margin`.
