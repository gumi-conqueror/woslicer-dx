# Application versioning

The root `package.json` contains the editable application version. Use `major.minor.patch`.
Feature versions increment minor. Fix versions increment patch. Versioning is separate from GitHub release publication.

Before a version is final, collaborators check it through alpha prereleases: `major.minor.patch-alpha.N`.
N starts at 1 and increases by 1 for each published prerelease. No other prerelease form is accepted.

[Releasing](RELEASING.md) describes how to prepare a version, record changes and publish it.

## Version consumers

| Consumer | Version source |
| --- | --- |
| npm lockfile root and root package | Updated by `npm version`, checked against `package.json` |
| Tauri bundle | `src-tauri/tauri.conf.json` references `../package.json` |
| About dialog and native host | Generated build identity |
| Installer and archive names | Package metadata and bundler output |
| English and Chinese changelogs | First numbered entry must match `package.json` |
| CI | Same `check:version` command as local builds |

Build and package commands run the version check automatically. Do not add independent version constants to code, translations or workflows.
The Rust host crate keeps `version = "0.0.0"`. Tauri takes the application version from `package.json`.
Dependency versions and the `.wosdx` schema version are independent of the application version.

## Build identity

[`tauri-build-info.mjs`](../scripts/tauri-build-info.mjs) generates `src-tauri/generated/build-info.json` before the frontend build.
The build embeds the same identity in the frontend and Rust executable, then copies it into the frontend output for deployment checks.
About displays:

- Application version.
- Full Git commit.
- Working-tree modification indicator.
- Build timestamp in UTC.

Local builds use the build time unless `SOURCE_DATE_EPOCH` provides a timestamp in Unix seconds.
CI sets that variable from the checked-out commit time. PR builds identify the checked-out merge commit.
Build identity remains fixed when the application starts.

Git is required during builds. The packaged app reads embedded identity without Git or network access.
CI derives the project URL from GitHub environment values. Local builds use a recognized GitHub origin URL or show a placeholder.
The Rust build script rejects stale identity. Before direct Cargo checks after a commit or version change, run `node scripts/tauri-build-info.mjs`.
