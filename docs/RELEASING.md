# Releasing

This runbook takes merged work to a published GitHub release. Run commands from the repository root.
Publishing needs push access to `dev`, `main` and tags. [Versioning](VERSIONING.md) defines version numbers.
[CI](CI.md#publishing-and-deployment) describes what the workflows check.

## 1. Start the version

The first entry of both changelogs is the version in work. `package.json` names the same version.
After a release, start the next version with the first change. On the branch that will go into `dev`:

```sh
npm run version:prepare -- <version>
```

The command sets `package.json` and `package-lock.json`. It adds `## <version> — <date>` above the other entries of `CHANGELOG.md` and `CHANGELOG.zh-CN.md`.

## 2. Record changes while you work

Write each change under that entry in both changelogs. Keep the English and Chinese entries consistent.

- Write only changes that users notice and care about. Omit a change when you are not sure that users care.
- Write one short line for each change. Users read only the summary.
- Use Added, Changed and Fixed sections where they apply. Omit empty sections, build results, dependency details and documentation maintenance.
- Do not write that a version is unreleased or is a prerelease.
- Use repository history to tell new behavior from existing behavior. Do not copy command transcripts into the changelog.

An alpha entry lists the changes since the previous alpha. Before the final version, merge its alpha entries into one entry.

On the release day, run the command of step 1 again. It sets the date of the entry to today. Then print the release notes:

```sh
node scripts/release-notes.mjs
```

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
