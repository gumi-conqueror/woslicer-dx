# Contributing

Start with the [development guide](docs/DEVELOPMENT.md) to run a checkout and execute checks.
The [architecture map](docs/ARCHITECTURE.md) identifies feature owners and shared code.
The [documentation index](docs/README.md) links the file-format and CI references.

## Compatibility and scope

- Preserve the fixed `.wos` and original BMHelper beta 4′ `.bmh` formats.
- Keep audio and project data local. Bundle runtime assets and preserve the browser CSP and Tauri permission boundaries.
- Use the existing command and editing paths so changes retain undo, recovery and input behavior.
- Describe the user-visible result and validation in the PR. State any platform or hardware checks that were not run.

[AGENTS.md](AGENTS.md) contains the full repository constraints. The same compatibility rules apply to human and agent-assisted changes.

## Branches and pull requests

`dev` is the default integration branch. `main` supplies release builds.
External contributors start from `dev` and target `dev`, using any source branch name.

| Maintainer work | Start from | Route |
| --- | --- | --- |
| Feature or routine fix | `dev` | `feature/*` → `dev` → `main` |
| Urgent release fix | `main` | `hotfix/*` → `main`, then `main` → `dev` |

Open a separate release PR from `dev` to `main` when the changes are ready for release.
For a hotfix, first target `main`, then synchronize `dev` through a separate PR.
Check the PR base when using an older fork or compare URL. Maintainers correct external PR targets manually.

Use concise Conventional Commit messages: `genre(module): imperative summary`.
Before requesting review, run `npm run check`, `npm test` and the relevant UI or native checks in the development guide.
CI checks Quality, Web and Windows x64 by default. Additional desktop targets require an all-platform run.
Opening a PR does not publish packages or deploy the website.

## Documentation

Update instructions and behavior references affected by the change. Keep setup steps reproducible from a new checkout.
Use repository paths and public links instead of local machine paths or conversation references.
Root READMEs use English, Chinese, Japanese and Korean. Technical documents use English. Changelogs use English and Chinese.

For agent-assisted contributions, [Project skills](docs/SKILLS.md) describes the optional instructions.
Agents need explicit authorization before pushing, merging or publishing.
