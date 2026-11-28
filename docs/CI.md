# CI and releases

This guide describes the checked-in GitHub Actions workflows. For local commands, see [Development](DEVELOPMENT.md).
For version numbers, see [Versioning](VERSIONING.md). For the release steps, see [Releasing](RELEASING.md).

## Build triggers and outputs

[`build.yml`](../.github/workflows/build.yml) runs on pushes to `main` and `dev`, pull requests, and manual dispatch.
Manual runs offer an `all_platforms` input. Main always builds every target.

| Event or branch | Frontend profile | Native profile | Targets |
| --- | --- | --- | --- |
| Pull request or `dev` push | Release | Debug | Web and Windows x64 |
| `main` push | Release | Release | All targets |
| Manual run | Release | Release on `main`, otherwise debug | Web and Windows x64, plus all desktop targets when selected |

| Target | Runner | Package |
| --- | --- | --- |
| Web | ubuntu-24.04 | Static website ZIP |
| Windows x64 | windows-2025 | Portable ZIP |
| Windows ARM64 | windows-11-arm | Portable ZIP |
| Linux x64 | ubuntu-24.04 | deb and AppImage |
| Linux ARM64 | ubuntu-24.04-arm | deb and AppImage |
| macOS Apple Silicon | macos-15 | DMG |
| macOS Intel | macos-15-intel | DMG |

The Quality job checks version consistency, lint, formatting, types and JavaScript tests.
After Quality succeeds, Web and the selected desktop jobs run in parallel.
The Required release checks job requires every selected target to succeed. Unselected desktop targets are skipped.
PR and manual build runs produce artifacts but do not publish releases or deploy the website.

### Web job

The job uses the Playwright container version recorded in `package-lock.json`, then installs Node 26.x and locked npm dependencies.
It builds production assets, runs both isolated 30-second UI profiles, and archives the tested output without rebuilding.
`scripts/package-web.mjs` compares every uncompressed ZIP entry with the source files.

### Desktop jobs

The shared [desktop action](../.github/actions/build-desktop/action.yml) owns this order:

1. Set the profile and platform environment, then install npm and system dependencies.
2. Install the pinned Rust toolchain and restore compatible Cargo caches.
3. Build the release frontend and generate build identity before Cargo.
4. Run rustfmt, locked tests and Clippy with the selected native profile and `--all-features`.
5. Build the executable or bundles, reusing the prepared frontend.
6. Validate package metadata and record artifact checksums.

Windows ZIPs contain the executable, LICENSE, NOTICE, decoder notices and build identity.
The packager checks each entry by SHA-256. The application requires an installed WebView2 runtime.
Linux jobs collect deb and AppImage packages. macOS jobs check version, architecture and DMG integrity.
The workflow does not sign Windows binaries or perform Apple Developer ID signing and notarization.
Hosted package checks do not replace physical-controller or native UI testing on each operating system.

## Caches and validation reuse

### Cargo caches

`Swatinem/rust-cache` keys include the OS, architecture, target, profile, compiler, relevant environment and Cargo manifests/lockfiles.
Debug and release dependencies use different caches. A restored cache does not skip tests or guarantee that compilation is unnecessary.
Successful `dev` runs save debug caches. Successful `main` runs save release caches. PR jobs restore caches but do not save shared caches.

GitHub also scopes caches by branch. PR jobs can restore caches from their base branch, including `dev`.
PR merge-reference caches are unavailable to other PRs and branches. Main's release caches do not supply dev's debug builds.
See [GitHub cache access rules](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching#restrictions-for-accessing-a-cache).

Use a manual `dev` run to populate debug caches for additional platforms. Select `all_platforms` when those targets are needed.
Toolchain changes, dependency changes and cache eviction can require compilation again.
In logs, `Restored from cache key` indicates a restore. `cache-hit` indicates an exact key match only.

On macOS, the action sets `MACOSX_DEPLOYMENT_TARGET` before cache restoration and all Cargo commands.
The value comes from `bundle.macOS.minimumSystemVersion` in `src-tauri/tauri.conf.json`.
Use the same value for direct Cargo checks and Tauri packaging. Different values can invalidate native helper dependencies.
Cargo fingerprint logs identify which inputs caused recompilation.

### Reusing checks for dev-to-main PRs

Only a PR from this repository's `dev` to `main` can reuse checks through [`ci-reuse.mjs`](../scripts/ci-reuse.mjs).
It requires all of the following:

- The latest push run at the exact dev head succeeded within 24 hours.
- Quality, Web, Windows x64 and the aggregate check succeeded in that attempt.
- The PR merge tree matches the tested dev tree.
- The saved validation receipt matches the tree, Node version and Ubuntu runner image.

The current version and build identity are always checked. If reuse succeeds, Web and Windows checks are skipped and the aggregate links the source run.
This path creates no packages for the PR merge commit. It does not assert identical runner machines or package bytes.
Missing evidence, changed inputs, pending runs or API errors cause normal validation. Main pushes and manual runs always perform their own checks.

## Artifacts and failure diagnosis

Successful packages are uploaded as Actions artifacts with one-day retention. Tag a release within a day of its main build, or rerun that build first.
Each platform artifact includes a manifest with commit, version, profile, platform, target, run ID, attempt and package checksums.
[`release-artifacts.mjs`](../scripts/release-artifacts.mjs) owns artifact selection and validation.
When changing targets, update its target list and the workflow matrix together.

Start with the first failed step, rather than the aggregate check:

| Failure | Relevant evidence |
| --- | --- |
| Quality | Command output for version, lint, typecheck or the failing test |
| Browser UI | `diagnostics-web-*`: traces, screenshots and `test-artifacts/` |
| Native build | Desktop action logs, Cargo errors, `diagnostics-<platform>-*` |
| Package validation | Package paths, metadata and checksum output |
| Release selection | Exact commit, source run result, artifact expiration and profile |

Diagnostics are retained for one day. Inspect a timeout before rerunning it. Keep both browser profiles within their 30-second deadlines.

## Publishing and deployment

[`release.yml`](../.github/workflows/release.yml) starts on `v*` tags. The tag version must match `package.json`.
Changing a version or opening a PR does not start this workflow.

The resolver selects the latest main push or manual build at the exact tagged commit.
It waits up to 90 minutes for that build to finish, and up to 5 minutes for it to appear.
That run, all selected jobs and all seven release artifacts must be successful and available.
A failed or incomplete latest run stops publication. The resolver does not substitute an older run, a PR build or a debug package.
Publication and website deployment consume the same source run and verified artifact IDs. They do not rebuild the application.

The workflow verifies clean-checkout identity, the run attempt and SHA-256 checksums before publication.
[`release-notes.mjs`](../scripts/release-notes.mjs) extracts the matching English and Chinese changelog entries.
Missing, duplicate or empty entries fail preparation. Preview the text with `node scripts/release-notes.mjs`.

Assets are uploaded to a draft. The workflow compares the draft's asset list, sizes and SHA-256 digests with the verified packages, then publishes it.
A version with a prerelease part (`2.0.0-alpha.1`) becomes a prerelease and never Latest. Other versions become a release marked Latest.
[`publish-release.sh`](../.github/scripts/publish-release.sh) reads the draft with `gh release view`: the REST endpoint for a release by tag does not return drafts.
Downloads contain application packages and an optional verification ZIP with manifests and `SHA256SUMS`.
GitHub adds source archives separately. Application packages retain their license notices.

Published immutable releases lock their assets and tag. Do not move a published tag or recreate its release to change artifacts.
A rerun completes an unpublished draft, or checks that a published release already contains identical bytes.
A rerun leaves a published release's flags and notes unchanged. Mismatched bytes stop publication.

If source artifacts expire, rerun all jobs in the original main build at the tagged commit, then rerun the release workflow.
A new manual main run also works when main still points to that commit.

### Cloudflare Pages

After publication, the workflow uploads the verified Web ZIP to a Cloudflare Pages Direct Upload project.
Prerelease tags (`v2.0.0-alpha.1` and similar) skip this job. The website keeps the latest release, and the prerelease Web ZIP stays on the release page.
A prerelease cannot share the site under a path such as `/next`: each Direct Upload deployment replaces the whole site, and both copies would share one origin and its local storage.
It requires the repository variable `CLOUDFLARE_PROJECT_NAME` and secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
The workflow reads the existing Pages production branch from the API and deploys through Wrangler.
It does not modify Pages settings or require repository integration.
The job requires a production deployment and compares its `build-info.json` with the tested archive.
If deployment fails, the release remains published. Rerun the deployment job after correcting the cause.

## Dependency updates

[`.github/dependabot.yml`](../.github/dependabot.yml) schedules weekly PRs against `dev` for npm, Cargo, Rust toolchains and GitHub Actions.
Minor and patch updates are grouped per ecosystem. Major and compiler updates remain separate.
npm and Cargo updates use a seven-day cooldown. The repository does not configure automatic merging.
Skill submodule pins are maintained separately through [Project skills](SKILLS.md).

Dependabot alerts and security updates are separate repository settings. The version-update file does not enable them.
Security-update PRs target the default branch. Use the branch routes in [Contributing](../CONTRIBUTING.md) when releasing a validated fix.
