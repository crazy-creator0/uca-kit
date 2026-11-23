# Workflow: audit ("uca-audit")

A read-only review of the user's own project that looks for what could go wrong before users find it: security holes, data leaks, slow or costly code, and gaps before production. This file is the only place in the kit where the attacker mindset below applies. Outside an audit, build normally.

## Limits (always, before anything else)
- **Read-only.** Do not edit, delete or create project files during the audit, apart from the report if the user asks for one. Fixes come afterwards, one at a time, through the normal Safe Vibe Loop and only with the user's approval.
- **Only the user's own project, on their machine.** Never probe, scan or send requests to a live site, server, API or account, theirs or anyone else's. If asked to, decline and offer a code review instead.
- **Never write working exploits.** Describe how a problem could be abused in one plain sentence; no attack code, payload lists or step-by-step instructions.
- **Never print secret values.** Name the file, line and setting only. Never open `.env` or key files.

## Mindset (audit only)
Think like an attacker and like an unhappy operations engineer at 3 a.m.: what would someone who wants this app to fail try first, and what will break or cost money when traffic grows? Assume nothing is safe because it looks safe; trust only what the code shows.

Then put on three more hats, one at a time:
- **Every kind of user.** A first-time visitor, someone on an old phone with a slow connection, someone using only a keyboard or a screen reader, someone who reads another language or right to left, someone who makes every mistake a form allows, and the person who runs this app on a server at night. Where does each one get stuck, lose data or give up?
- **The careful spender.** For each request, page and job: what does it cost to run (database work, paid APIs and models, bandwidth, storage, servers left running), what grows with users, and what is the cheapest change that keeps the same result? Give the saving and its trade-off, never a saving that weakens security or correctness.
- **The breaker.** Assume the project is already rated 10/10 and look for what the first nine reviewers missed: the second step of a flow, the empty and the full state, the rename that broke a link, the default nobody changed, the error message nobody reads, the thing that only fails on the 1,000th user or the 31st of the month.

Look harder, never invent. Every finding must point to a file and line you read, or to a step you ran. When a lens finds nothing, say what you looked at, so "nothing found" means something.

## Steps
1. Say what you will audit (folders, stack) and that it is read-only.
2. Run `node scripts/uca-readiness.cjs .` (it runs the Senior Bar, the audit check and the wiring check). For the finding lists, `node scripts/uca-audit-check.cjs . --json` and `node scripts/uca-wiring-check.cjs . --json` (links and routes that lead nowhere, pages with no way in or out).
3. For every finding marked "needs a human", open the file and decide: real, not real (say why), or cannot tell. Do the same for any "certain" finding that looks wrong in context.
4. Read for what a static check cannot see, starting with the files under "Key files" in PROJECT.md:
   - **Who may do what:** for each route that takes an id, can user A read or change user B's data? Is the check on the server?
   - **Input edges:** empty, huge, negative, wrong type, unicode, duplicate submits. What happens to price, quantity and totals sent by the client?
   - **Money and cost:** endpoints that call paid APIs or models per request, unbounded pages, large uploads, background jobs with no limit.
   - **Secrets and logs:** secrets or personal data written to logs, error messages or the client.
   - **Outbound and files:** user-supplied URLs fetched by the server, uploaded file names and types, paths built from input.
   - **Concurrency:** two requests at once on the same balance, stock or counter.
   - **Problems through helper functions:** a query in a loop or an unsafe call one function away from the route.
   - **Wiring the check cannot follow:** links built at run time, buttons that navigate in code, the way back from each step of a flow (A to B and back to A), and pages that are slow to open. Say plainly that lag was not measured unless you ran the page in a browser.
   - **Links that say one thing and go to another:** the wiring check lists links whose words do not match the page they open (a "Pricing" link that opens the About page). Ask the user to confirm each one. If the project was changed since a saved link map (`node scripts/uca-wiring-check.cjs . --compare .uca/wiring.json`), list every link whose target moved and ask whether each move was meant.
5. Report, sorted by severity:

   | Severity | Where (file:line) | What could happen | Fix | How checked |
   | --- | --- | --- | --- | --- |

   Then the readiness level and checks passed (from step 2), the items you could not decide, and what the audit did not cover. Say "no finding" only for what you actually read.
6. **Plan the fixes; do not fix yet.** Quick fixes made one after another, each with a generic idea, are how a cleaned-up project turns into a new mess. Write a fix plan and wait for the user to approve it. The plan aims at the readiness target (Silver and at least 80% of checks, from step 2) plus every Critical and High finding; if it cannot get there, say which items stand in the way:
   - Group findings that share a cause (one missing auth helper behind five routes is one fix, not five).
   - Order: what blocks other fixes first, then Critical, High, Medium, Low. Put fixes that touch the same files next to each other.
   - For each fix: the files it changes, the test that shows the problem before the fix, what could break, and how it will be checked afterwards (the same test, plus `node scripts/uca-readiness.cjs .` and the link check when pages change).
   - Mark what needs the user's decision (a feature to remove, a cost to accept, a link that may have been moved on purpose).
   - Before any page or link change, save the link map: `node scripts/uca-wiring-check.cjs . --save .uca/wiring.json`.
7. After approval, fix one item at a time through the Safe Vibe Loop. After each fix, run its test and the checks again, and compare the links (`--compare .uca/wiring.json`). Stop and tell the user if a fix breaks something else; do not patch over it. When the plan is done, run the audit's checks once more and report the before and after.

## Severity
- **Critical:** anyone can read or change other users' data, run code, or use a secret.
- **High:** a logged-in user can do the above, or a likely outage or large cost.
- **Medium:** a leak of internals, a missing limit, or a slow path that grows with data.
- **Low:** hardening and hygiene.
