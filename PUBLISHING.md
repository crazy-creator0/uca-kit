# Publishing the UCA Kit CLI

**Written by Crazy Creators**

The CLI source is maintained in [uca-kit](https://github.com/crazy-creator0/uca-kit). GitHub-based npm execution can be used from source; public npm registry publication must be verified separately.

## Package details

- Package name: `create-universal-coding-agent-kit`
- Version in `package.json`: `0.3.7-pre.1`
- License: Apache-2.0, with `NOTICE` (v0.1.0 and v0.1.1 were MIT)
- Binary command: `create-universal-coding-agent-kit`
- Runtime dependencies: none
- Minimum Node.js version: 18
- Repository: https://github.com/crazy-creator0/uca-kit
- Author metadata: Crazy Creators

## Before publishing

1. Confirm availability and ownership of the name with `npm view create-universal-coding-agent-kit name`. If it exists, inspect ownership and select another name rather than overwriting another publisher.
2. Confirm that the repository's original materials are yours to license and that any third-party skills/assets have compatible terms. The repository uses Apache-2.0; verify `LICENSE`, `NOTICE`, `package.json` (`"license": "Apache-2.0"`), README, `CITATION.cff` and the npm tarball all agree (`tests/license.test.cjs` checks most of this). Do not apply the license to third-party material that you do not have permission to relicense.
3. Review the package file allowlist. Keep maintainer planning notes, test source, local-only files, credentials, and private project data out of the published tarball.
4. Run "uca-audit" on this repository (`.agents/workflows/audit.md`: `node scripts/uca-readiness.cjs .`, `node scripts/uca-audit-check.cjs .`, then the hand review), fix what it finds with a test for each, and record what ran, what was found, what was fixed and what was not covered under "Checked before release" in the release's CHANGELOG entry.
5. Use Node.js 18+ and run:

   ```bash
   npm run check
   npm pack --dry-run
   ```

6. Test the tarball in a clean temporary project using the generic and at least one platform-specific profile. Confirm existing project files are preserved by default.
7. Check the final README, author, keywords, repository URLs, version, and license metadata.

## Promotion gate

Publishing a testable early package and promoting the kit widely are separate decisions. Keep every performance or compatibility claim proportional to measured evidence, and say plainly what has not been measured.

## Publish

After name and license review, the package owner can publish from their own trusted terminal:

```bash
npm login
npm whoami
npm publish --access public
```

Complete any authentication or two-factor challenge locally. Never share an npm password, access token, one-time passcode, or `.npmrc`.

After publishing, verify the actual registry version:

```bash
npm view create-universal-coding-agent-kit version
npx create-universal-coding-agent-kit@latest --help
npx create-universal-coding-agent-kit@latest init /tmp/example --platform generic --dry-run
```

Do not advertise the package-name command as available until these checks confirm the public registry entry.

## GitHub release (how UCA Kit is published today)

1. Merge the release branch into `main` with "Rebase and merge", so the author stays Crazy Creators.
2. Wait for CI on `main` to pass.
3. On GitHub, open Releases, choose "Draft a new release", create the tag (for example `v0.2.0`) on `main`, and paste the version's section from `CHANGELOG.md` as the notes.
4. Publish the release, then check the pinned command from a clean folder:

   ```bash
   npx --yes github:crazy-creator0/uca-kit#v0.3.7-pre.1 init /tmp/uca-check --platform generic --dry-run
   ```

Old tags are never deleted or moved.

## Versioning and release checks

- Patch: compatible bug fixes, including the fixes that follow an audit.
- Minor: compatible features, or a license change (v0.2.0 moved from MIT to Apache-2.0).
- Major: breaking CLI or template changes.

Never reuse a published name/version with different contents. Verify that the tarball contains all intended instructions, adapters, skills, and workflows, and excludes maintainer-only files and tests.

---

**Written by Crazy Creators.**
