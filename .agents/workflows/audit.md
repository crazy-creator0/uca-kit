# Workflow: audit ("uca-audit")

A read-only review of the user's own project that looks for what could go wrong before users find it: security holes, data leaks, slow or costly code, and gaps before production. This file is the only place in the kit where the attacker mindset below applies. Outside an audit, build normally.

## Limits (always, before anything else)
- **Read-only.** Do not edit, delete or create project files during the audit, apart from the report if the user asks for one. Fixes come afterwards, one at a time, through the normal Safe Vibe Loop and only with the user's approval.
- **Only the user's own project, on their machine.** Never probe, scan or send requests to a live site, server, API or account, theirs or anyone else's. If asked to, decline and offer a code review instead.
- **Never write working exploits.** Describe how a problem could be abused in one plain sentence; no attack code, payload lists or step-by-step instructions.
- **Never print secret values.** Name the file, line and setting only. Never open `.env` or key files.

## Mindset (audit only)
Think like an attacker and like an unhappy operations engineer at 3 a.m.: what would someone who wants this app to fail try first, and what will break or cost money when traffic grows? Assume nothing is safe because it looks safe; trust only what the code shows.

## Steps
1. Say what you will audit (folders, stack) and that it is read-only.
2. Run `node scripts/uca-readiness.cjs .` (it runs the Senior Bar and the audit check). For the finding list, `node scripts/uca-audit-check.cjs . --json`.
3. For every finding marked "needs a human", open the file and decide: real, not real (say why), or cannot tell. Do the same for any "certain" finding that looks wrong in context.
4. Read for what a static check cannot see, starting with the files under "Key files" in PROJECT.md:
   - **Who may do what:** for each route that takes an id, can user A read or change user B's data? Is the check on the server?
   - **Input edges:** empty, huge, negative, wrong type, unicode, duplicate submits. What happens to price, quantity and totals sent by the client?
   - **Money and cost:** endpoints that call paid APIs or models per request, unbounded pages, large uploads, background jobs with no limit.
   - **Secrets and logs:** secrets or personal data written to logs, error messages or the client.
   - **Outbound and files:** user-supplied URLs fetched by the server, uploaded file names and types, paths built from input.
   - **Concurrency:** two requests at once on the same balance, stock or counter.
   - **Problems through helper functions:** a query in a loop or an unsafe call one function away from the route.
5. Report, sorted by severity:

   | Severity | Where (file:line) | What could happen | Fix | How checked |
   | --- | --- | --- | --- | --- |

   Then the readiness level and checks passed (from step 2), the items you could not decide, and what the audit did not cover. Say "no finding" only for what you actually read.

## Severity
- **Critical:** anyone can read or change other users' data, run code, or use a secret.
- **High:** a logged-in user can do the above, or a likely outage or large cost.
- **Medium:** a leak of internals, a missing limit, or a slow path that grows with data.
- **Low:** hardening and hygiene.
