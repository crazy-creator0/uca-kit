# Run sheet: the same numbers on every host

Every eval run records the same numbers, whatever the host shows. OpenCode writes them for you with the step log; on any other host you copy them into a run sheet. `node scripts/uca-usage.cjs steps <file>` totals either kind the same way, and with two files prints them side by side.

## OpenCode: the step log

Set `UCA_USAGE_STEPS` to a file path before you start OpenCode in the project, one file per run:

```powershell
# Windows PowerShell
$env:UCA_USAGE_STEPS = "D:\runs\snake-kit-1.jsonl"; opencode
```

```bash
# macOS or Linux
UCA_USAGE_STEPS=~/runs/snake-kit-1.jsonl opencode
```

Then `node scripts/uca-usage.cjs steps D:\runs\snake-kit-1.jsonl`, or with the other arm's file as a second argument.

**The no-kit arm** is an empty folder plus one file, `.opencode/plugins/uca-usage.mjs`, copied from the kit arm (commands in `OPENCODE-SETUP.md`). The plugin carries no instructions; without the kit's scripts it writes only the step log, so both arms are counted by the same code. Check before the run that the folder holds nothing else. On every other host both arms fill the same run sheet from their transcripts. Totalling a log needs Node; the run itself does not, because the plugin runs inside OpenCode. What the log holds, and what it never holds, is in `USAGE-PRIVACY.md`.

## Any other host: the run sheet

Copy `run-sheet.csv` from this folder, one file per run, and fill one row per model request. Where a host shows only totals for the run, fill one row with `request` set to `all` and `count` set to the number of requests. Leave a cell empty, or write `unknown`, when the host does not show that number. Never write 0 for a number you do not have: the summary prints an empty cell as unknown and a partial total as "at least".

| Column | What goes in it |
|---|---|
| `request` | 1, 2, 3 … in order; or `all` for a totals-only row |
| `count` | Only on an `all` row: how many requests the run made |
| `time` | Clock time of the request (`14:05:30`) or an ISO time; on an `all` row, the run's length (`6m`, `6m30s`, `390s`) |
| `input` | New (uncached) input tokens of the request |
| `cache_read`, `cache_write` | Cached input read and written, where the host splits them |
| `output` | Output tokens |
| `context` | The context size the host shows for that request, if it shows one instead of the split; on an `all` row, the largest or final context it shows |
| `ended` | `tool-calls` if the request asked for tools, `stop` if it was a reply to you, `length` if it was cut off |
| `tools` | Kinds of the tool calls it asked for, separated by spaces: `read`, `write`, `check` (a test run or a kit check script), `shell`, `agent`, `other` |
| `source` | `exact` when copied from the host's own usage view, `estimated` when worked out (characters / 4, or counted from the transcript) |

**Counting requests where a host shows no number.** One request is one model reply in the transcript: each time the agent speaks or calls tools before you type again. A reply that calls three tools at once is one request; three replies that call one tool each are three. Fill `ended` and `tools` from the transcript; leave the token columns empty if the host shows no tokens.

**Where hosts show usage.** Hosts change their usage views often, and the kit has not checked any of them yet (see `docs/TOOL-COMPATIBILITY.md`). Look for a per-request or per-session usage, context or cost view in the host; note the host version and where you found the numbers in the run's notes. Where nothing is shown, the token columns stay unknown and the run still counts requests from the transcript.

## What the summary prints

Requests (and how each ended), input tokens summed over all requests (new, cache read, cache write), output tokens, peak context (new input plus cache read plus cache write of the largest request), wall time, tool calls by kind, reads before the first write, how many gaps between two requests held one tool call or several, and, for the step log, the kit files opened. `--json` prints the same figures for a results table.

Peak context and summed input are different numbers: a host's "total tokens" or context bar usually shows the last request's context, not what the run spent. A run's spend is about requests × context per request, which is why requests come first.
