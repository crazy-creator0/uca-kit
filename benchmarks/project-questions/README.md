# Project questions: how much must an agent read to understand a real repository?

This is the "before" measurement for the v0.3.0 project view. Thirty fixed questions about three real open-source repositories, pinned to one commit each, with answer keys read from the code.

| Repo | Commit | Size |
| --- | --- | --- |
| [fastapi/full-stack-fastapi-template](https://github.com/fastapi/full-stack-fastapi-template) | `77e550a73bb4` | 252 tracked files (the 200 to 250 file test in the plan) |
| [gothinkster/node-express-realworld-example-app](https://github.com/gothinkster/node-express-realworld-example-app) | `30b68e1` | 67 tracked files |
| [koajs/koa](https://github.com/koajs/koa) | `a0702b9` | 112 tracked files |

The questions are the kind a new developer asks first: where the app starts, the full path of the login route, how tokens are made and checked, which database, who may change a record, how tests run. They are in `questions.json`. No code from these repositories is copied here, only the facts, the file names and a short fragment of the line that proves each one.

## Checks that need no model

```
git clone https://github.com/koajs/koa /tmp/koa && git -C /tmp/koa checkout a0702b9
node benchmarks/project-questions/score.cjs verify koa /tmp/koa
node benchmarks/project-questions/score.cjs map koa /tmp/koa
```

- `verify` proves the answer keys: the checkout is at the pinned commit, and every evidence fragment is still on a line of its file.
- `map` runs the project scanner (`scripts/uca-project-discover.cjs`) on the checkout and counts the questions its card answers by itself, with no file opened.

### Results on 22 Nov 2026 (scanner at main `6fde3b0`)

| Repo | Evidence lines found | Answered by the card alone | Card size |
| --- | --- | --- | --- |
| fastapi-template | 14 of 14 | 1 of 10 | 10,906 characters |
| realworld-express | 11 of 11 | 3 of 10 | 7,556 characters |
| koa | 12 of 12 | 3 of 10 | 2,981 characters |
| **All** | **37 of 37** | **7 of 30** | |

What the card misses is the target for v0.3.0. Some gaps are facts the scanner already half-has: it shows `/api/v1` and `POST /login/access-token` but never joins them into the full path, and it lists PyJWT but not where the token is checked. Others need it to read deeper: the database behind SQLModel, Docker Compose, password hashing, the token's lifetime, an unsafe default secret.

### Progress of the card

| Scanner | fastapi-template | realworld-express | koa | All |
| --- | --- | --- | --- | --- |
| main `6fde3b0` (baseline) | 1 | 3 | 3 | 7 of 30 |
| Full FastAPI paths, Python database and hashing dependencies, Docker Compose services | 4 (F02, F04, F10 added) | 3 | 3 | 10 of 30 |

Every change to the scanner is general (tested on its own fixtures first) and is never written for one of these repositories. A question answered here by a fact built only for that question would make the count useless.

The card count is a floor, not the score that matters. An agent with the card still opens files; the question is how many fewer.

## The token test (needs a model, not yet run)

For each repo, a fresh chat per condition, same model, host and settings:

1. **Without the map:** the checkout as it is. Prompt: `Answer these questions about this repository. For each, name the file that proves your answer.` followed by the ten questions, unchanged.
2. **With the map:** the same checkout with the card written to `PROJECT.md` (`node scripts/uca-project-discover.cjs --root <checkout> --write <checkout>/PROJECT.md`), and the same prompt.
3. Save the answers as `{"F01": "...", ...}` and score them: `node benchmarks/project-questions/score.cjs answers fastapi-template answers.json`.
4. Record input and output tokens from the host's usage report or the model's tokenizer, never characters divided by four (`EVALUATION.md`), and the number of files the agent opened.

Run each condition at least twice and report every run. The map helps only if it cuts tokens without lowering the score.

## Limits

- Ten questions per repo, chosen by one person. They cover a project's first questions, not deep behaviour.
- An answer is scored by patterns (`need` in `questions.json`): it checks that the right facts are present, not that the explanation around them is right. Read the answers too.
- Three repositories, all web or HTTP projects in JavaScript, TypeScript or Python.
