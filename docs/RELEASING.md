# Releasing

This runbook takes merged work to a published GitHub release. Run commands from the repository root.
Publishing needs push access to `dev`, `main` and tags. [Versioning](VERSIONING.md) defines version numbers.
[CI](CI.md#publishing-and-deployment) describes what the workflows check.

## 1. Record changes while you work

Add each user-visible change under `## Unreleased` in `CHANGELOG.md` and `## 未发布` in `CHANGELOG.zh-CN.md`.
Describe changes users can see, operate or hear. Keep the English and Chinese entries consistent.
Use Added, Changed and Fixed sections where they apply. Omit empty sections, build results, dependency details and documentation maintenance.
Use repository history to tell new behavior from existing behavior. Do not copy command transcripts into the changelog.

## 2. Prepare the version

On the branch that will go into `dev`:

```sh
npm run version:prepare -- <version>
node scripts/release-notes.mjs
```

The first command sets `package.json` and `package-lock.json`, renames both Unreleased sections to `## <version> — <date>` and adds new empty ones.
It stops when a section is missing or empty. The second command prints the release notes.
An alpha entry lists the changes since the previous alpha. Before the final version, merge its alpha entries into one entry.

Commit the result as `chore(release): prepare version <version>` and run the [development checks](DEVELOPMENT.md#validation).

## 3. Merge into `dev` and `main`

1. Merge the branch into `dev` through a PR.
2. Open a PR from `dev` to `main` titled `chore(release): promote version <version>`. Merge it with a merge commit of the same subject.

## 4. Tag the merge commit

Tag right after the merge. The release workflow waits for the main build of the tagged commit.

```sh
git fetch origin
git tag -a v<version> origin/main -m "woslicer-dx <version>"
git push origin v<version>
```

The workflow publishes the packages of that build:

| Version | Release | Website |
| --- | --- | --- |
| `2.0.0-alpha.1` and other alphas | Prerelease, never Latest | Unchanged |
| `2.0.0` and other final versions | Release, marked Latest | Deployed |

## 5. Check the release

- The release page lists the packages for every platform and the verification ZIP.
- For a final version, `https://woslicer-dx.pages.dev/build-info.json` shows the new version.

## If a step fails

| Failure | Action |
| --- | --- |
| The main build fails | Fix it through `dev` and `main`. If the release is unpublished, delete the tag (`git push --delete origin v<version>`) and any draft, then tag the new merge commit. For an alpha, preparing the next alpha number also works |
| The release waits longer than 90 minutes | Rerun the release workflow after the main build has finished |
| Release artifacts expired (after 14 days) | Rerun all jobs of the main build at the tagged commit, then rerun the release workflow |
| Publication fails | Rerun the failed jobs. A rerun completes an unpublished draft and only verifies a published release |
| The website deployment fails | Fix the cause, then rerun that job. The release stays published |

Releases are immutable once published. Do not move a published tag or recreate its release.
