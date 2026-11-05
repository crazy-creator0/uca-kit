# Publishing the UCA Kit CLI

**Written by Crazy Creators**

The CLI source is maintained in [uca-kit](https://github.com/crazy-creator0/uca-kit). GitHub-based npm execution can be used from source; public npm registry publication must be verified separately.

## Package details

- Package name: `create-universal-coding-agent-kit`
- Version in `package.json`: `0.1.0`
- Binary command: `create-universal-coding-agent-kit`
- Runtime dependencies: none
- Minimum Node.js version: 18
- Repository: https://github.com/crazy-creator0/uca-kit
- Author metadata: Crazy Creators

## Before publishing

1. Confirm availability and ownership of the name with `npm view create-universal-coding-agent-kit name`. If it exists, inspect ownership and select another name rather than overwriting another publisher.
2. Confirm that the repository's original materials are yours to license and that any third-party skills/assets have compatible terms. The repository uses MIT; verify `LICENSE`, `package.json` (`"license": "MIT"`), README, and the npm tarball all agree. Do not apply the MIT license to third-party material that you do not have permission to relicense.
3. Review the package file allowlist. Keep maintainer planning notes, test source, local-only files, credentials, and private project data out of the published tarball.
4. Use Node.js 18+ and run:

   ```bash
   npm run check
   npm pack --dry-run
   ```

5. Test the tarball in a clean temporary project using the generic and at least one platform-specific profile. Confirm existing project files are preserved by default.
6. Check the final README, author, keywords, repository URLs, version, and license metadata.

## Promotion gate

Publishing a testable early package and promoting the kit widely are separate decisions. Do not broadly promote the product until the Phase 2 benchmark has been run and the results are published. See [the roadmap](docs/ROADMAP.md) and [the demo plan](docs/DEMO.md). Keep every performance or compatibility claim proportional to measured evidence.

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

## Versioning and release checks

- Patch: compatible bug fixes.
- Minor: compatible features.
- Major: breaking CLI or template changes.

Never reuse a published name/version with different contents. Verify that the tarball contains all intended instructions, adapters, skills, and workflows, and excludes maintainer-only files and tests.

---

**Written by Crazy Creators.**
