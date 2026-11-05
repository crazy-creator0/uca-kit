# Contributing to UCA Kit

Thanks for helping improve UCA Kit. The goal is focused, reversible, evidence-based engineering guidance across coding-agent hosts.

## Before opening a change

1. Search existing skills, workflows, adapters, tests, and documentation before adding a duplicate.
2. Keep the core always-on instructions concise (target: about 100 lines or fewer). Put detailed procedures in on-demand skills or docs.
3. Prefer one small, reviewable change per pull request.
4. Do not claim that a host loads a file, supports skills/web search, or improves token usage unless a reproducible test supports the claim.
5. For compatibility changes, record the exact tool/version, date, test setup, observed behavior, and limitations.
6. For skill changes, explain what behavior changes and include a representative task or test.
7. Never add secrets, private project data, or unlicensed third-party content.

## Local checks

Use Node.js 18 or newer:

```bash
npm run check
npm pack --dry-run
```

If Python sync scripts or their tests are changed, run their relevant tests too and document the exact command. Do not report checks that were not run.

## Pull request checklist

- [ ] Scope and expected behavior are clear.
- [ ] Existing behavior and user edits are preserved.
- [ ] Relevant tests added/updated and executed.
- [ ] Any compatibility claims include exact product/version/date evidence.
- [ ] Security, privacy, and rollback implications considered.
- [ ] README and roadmap claims match what is actually implemented.
- [ ] New skills have a distinct reason to exist and clear use boundaries.
- [ ] No credentials, private data, or unrelated generated files included.

## Release and publishing

Do not publish from CI or ask contributors to share registry credentials. Package owners should follow the repository's publishing guide from a trusted local environment, verify the tarball, and use protected authentication/2FA. A successful local test is not proof that a registry release exists.
