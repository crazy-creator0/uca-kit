# Step-log baseline: protocol, fixed before any run

Pushed with release 0.3.7, before the run. Results go in `RESULTS.md` next to this file without changing this text; changes go under Deviations.

A real OpenCode run (Big Pickle, snake prompt, one run per arm) made 43 requests with the kit against 24 without, with no record of where the extra requests went. This run measures the same task with the step log on in both arms, so the next release can cut requests where they are spent. It measures only: nothing ships, and nothing is rolled back, on its result.

## Task, prompt and arms
- **Task:** snake, a small build.
- **Prompt:** `../round-2/prompts/task-3-snake.txt`, byte for byte, as the whole first message. If the earlier OpenCode run used a different prompt, it is saved next to this file and used instead, and the change is recorded under Deviations before the run.
- **Host and model:** OpenCode with Big Pickle. The OpenCode version and the operating system are recorded in the results.
- **Kit arm:** an empty folder, then `npx --yes github:crazy-creator0/uca-kit#<release branch or tag> init . --platform opencode --tier standard`. The commit is recorded in the results.
- **No-kit arm:** an empty folder holding only `.opencode/plugins/uca-usage.js`, copied from the kit arm (`OPENCODE-SETUP.md`, "Comparing with no kit"). Nothing else is in the folder when the run starts.
- **Step log:** `UCA_USAGE_STEPS` set to a new file per arm before OpenCode starts. After the first reply in each arm, the log's first line must be a start line (`loaded`); if it is not, the run stops and is restarted after the cause is fixed (recorded under Deviations).
- **Runs:** one per arm, back to back on the same day. One run per arm is thin evidence; differences of a few requests are read as noise.
- **The operator:** answers the agent's questions with "Go ahead, use your judgment", and types nothing else until the agent says it is done.

## What is recorded, per arm
From `node scripts/uca-usage.cjs steps <kit log> <no-kit log>`:
- requests, and how each ended (tool calls, reply, cut off);
- tool calls by kind: read, write, check, shell, agent, other;
- reads before the first write;
- input tokens summed over all requests (new, cache read, cache write), and output tokens;
- peak context;
- wall time;
- kit arm only: the kit files opened.

A number the host does not give stays unknown. Both step logs are kept next to this file; they hold no prompts, replies, file contents, commands or paths outside the kit (`USAGE-PRIVACY.md`).

## Quality check
A sanity check, not a score: the same eight items on both builds, each pass or fail.
1. The page opens with no console errors.
2. Start Game starts the game.
3. The arrow keys turn the snake.
4. Eating food adds to the score and grows the snake.
5. Hitting a wall or the snake's own body ends the game with a Game Over message.
6. Restart resets the score and starts again.
7. After a mouse click on a button, the arrow keys still steer the snake.
8. The board and buttons fit a 390-pixel-wide screen without sideways scrolling.

## What the result is used for
- Where the kit's extra requests go, by kind: reads before code, check runs, fix passes, subagents or replies.
- Whether they come from the kit's instructions (kit files opened, reads before the first write) or from the model's own habits, which show in both arms.
- A change meant to cut requests names which of these it aims at, and is checked by the same measure.

## Deviations
- 27 Nov, first attempt: neither arm wrote a step log. The plugin was named `uca-usage.mjs`, and OpenCode's docs list only `.js` and `.ts` plugins. Fixed in 0.3.7 before the tag; the run is repeated with the start-line check above. The builds from that attempt are not used.
