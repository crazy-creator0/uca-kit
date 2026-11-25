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
   - **What was asked against what exists:** list each feature the request named or implied ("like X"), and mark it present (file:line), partly there, or missing. This list is part of every audit, not an optional extra; if no request can be found, ask the user for it in one line, and say in the report that the list was skipped.
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

A feature the user asked for that is missing, or a claim in the README, help text or screens that is false, is at least **Medium**; it is **High** when the claim is about privacy, safety or money.
