# T06: Broken API endpoint

Source: improvement review

## Fault or starting state the snapshot must contain
A user record with `profile: null` makes `GET /users/:id` return 500 because `getUserHandler` reads `user.profile.displayName`.

## Prompt (paste unchanged)
`GET /users/2` returns a 500 error for a user that exists. Find out why and fix it. A user without a profile should still be returned.

## Pass check
`node benchmarks/checks/T06.cjs <working-copy>` exits 0. The check loads the working copy and tests it with assertions the agent cannot see; it does not read the agent's own summary. It fails on the untouched snapshot and passes with the reference fix in `benchmarks/reference/T06/`.

## Expected skill (kit runs)
debugging
