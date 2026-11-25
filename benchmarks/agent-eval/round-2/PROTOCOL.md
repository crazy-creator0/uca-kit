# Agent evaluation round 2: protocol, fixed before any run

Pushed on 25 November 2026, before any round-2 build started. Approved by the maintainer. Results go below without changing this text; changes go under Deviations. Kit version: v0.3.4. Prompts are in `prompts/`: every prompt is `common-head.txt`, then the task text, then `ending.txt`.

Round 1 could not separate the arms: every build scored 29 or 30 of 30. Round 2 is designed to separate them, and to measure cost alongside quality.

## What changes from round 1
- **Harder, more open tasks,** where completeness and the extras a user expects matter, not only correctness.
- **A second model and host:** your OpenCode with Big Pickle on Windows.
- **Full token counts per session,** with a cost rule fixed in advance.
- **Safer blinding:** only the closing messages are redacted. Build folders are renamed, and code and folders are never touched. A file-list check before scoring confirms each build is unchanged apart from the kit's own installed files.
- **Cheaper process:**
  - runs go in batches of 4, to stay under the usage limit;
  - each session saves its own closing message to `CLOSING.md` (no copying);
  - one scorer per task.

## Tasks
- **Task 3, a detailed spec:** your snake-game prompt, word for word (it lists 20+ requirements).
- **Task 4, a vague one-liner:** "Make me a simple app to run my small home bakery's orders." This tests the project brief, the expected extras and the "like the user" checks. If a session would ask questions, it gets these answers: "I take 5 to 20 orders a week by WhatsApp, mostly cakes for birthdays; I use my phone; I'm not technical."

## Arms and models
- **Model A** (my sessions, Claude Code): kit v0.3.3 standard tier vs no kit. 3 runs each per task, 12 builds in all.
- **Model B** (your OpenCode, Big Pickle, Windows): kit v0.3.3 with the same tier you used before vs no kit. 1 run each per task, 4 builds in all. Reported separately as a cross-check, not used in the decision, since 1 run per arm is too few.
- **Prompts:** the same common opening as round 1, ending with: "Save your final message to the user in CLOSING.md as well."

## Scoring points (each Right 2 / Partly 1 / Missing 0, out of 30)

**Task 3, snake**
1. Moves continuously; arrow keys control it.
2. Grows on eating; food appears at random, never on the snake.
3. Ends on hitting a wall or itself.
4. Title "SNAKE GAME" and the score are shown.
5. Start, Restart and Game Over message all work.
6. Pause and resume work.
7. Speed increases with score.
8. Pressing two keys in one tick cannot reverse the snake into itself.
9. Responsive: playable at 390 px wide, with touch or on-screen controls.
10. Sounds on eating and on game over.
11. Dark background, green snake, red food, rounded corners, smooth movement.
12. No external libraries; opens directly in a browser.
13. **Extras a player would expect, beyond the spec**, each working: for example a best score kept after reload, a sound on/off switch, WASD keys, a pause key. 0–1 extras = 0 points, 2 = 1 point, 3 or more = 2 points.
14. No bug found in a fixed 2-minute scripted play session: random turns, eat 20 food, pause and resume mid-move, restart after game over.
15. The closing message is truthful.

**Task 4, bakery**
1. The plan or app states what it is for (title, goal), in the user's terms.
2. Add an order: customer, item, date due, price.
3. Edit and delete an order.
4. See what is due today or this week, sorted by date.
5. Mark an order paid or delivered; totals for unpaid money.
6. Data stays after reload; works offline after loading.
7. Usable on a phone (390 px), with large tap targets.
8. Bad input (no name, a date in the past, a negative price) gets a clear message.
9. Search or filter by customer.
10. Export or share (WhatsApp text, CSV or print).
11. Backup or restore, or a clear warning that data lives on one phone.
12. No outside requests.
13. **Extras a home baker would expect**, each working: for example advance or deposit tracking, a customer phone with a tap-to-call or WhatsApp link, order notes or cake message, a reminder of tomorrow's orders. Scored as in task 3.
14. 50 orders: still correct and quick.
15. The closing message is truthful.

## Cost
- **Model A:** tokens per session as the host reports them. If a session is paused by the usage limit, its tokens before the pause are added from the earlier report.
- **Model B:** OpenCode shows tokens and cost per session. You note them, or send a screenshot.
- **Cost rule (fixed now):**
  - if the kit side is not better on quality, any token increase above 10% counts against the kit;
  - if it is better, the increase is reported next to the gain.

## Decision rule (model A)
- **"Helps":** the kit median is higher on both tasks, with no privacy point worse.
- **"Hurts":** the kit median is lower on both tasks.
- **Otherwise:** "no clear difference".
- Cost is always reported next to the verdict.

## Budget and timing
- **Model A:** about 12 builds × 150,000 tokens, plus 2 scorers × 200,000 tokens, or about 2.2 million tokens. Run in 3 batches of 4 builds.
- **Model B:** your time for 4 runs, about 20 to 40 minutes each.
- **Order:**
  1. Push the protocol first, timestamped.
  2. Batch 1, batch 2, batch 3.
  3. Blind, check the file lists, score.
  4. Your spot checks, which are optional.
  5. Unblind and publish as 0.3.4.

## Open items at the time of pushing
2. The tier you used with OpenCode, so model B uses the same.
3. A start time after your usage limit resets.

## Deviations
None yet.
