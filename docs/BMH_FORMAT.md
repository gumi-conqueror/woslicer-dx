# Original BMH format

The binary contract is maintained by [bmh-file](https://github.com/gumi-conqueror/bmh-file).
Read the [format contract at the pinned revision](https://github.com/gumi-conqueror/bmh-file/blob/22b1d1caf15524c33b489eb7d181bbc1d90bd892/FORMAT.md).
`package.json` and `package-lock.json` select that dependency revision. Check its format contract when updating the pin.

BMH import and export use the original Windows BMHelper beta 4′ layout and CP932 names. DX projects store Unicode data in UTF-8 JSON independently.

## Working on compatibility

- The `bmh-file` package owns binary fields, chunk validation and CP932 conversion. Its tests cover original-file round trips and malformed input.
- [`tests/bmh-compatibility.test.ts`](../tests/bmh-compatibility.test.ts) checks recording construction and lossy-name export through this application.
- [`tests/fixtures/bmh/README.md`](../tests/fixtures/bmh/README.md) records fixture provenance, hashes and reproduction steps.
- [`src/project/bmhelper.ts`](../src/project/bmhelper.ts) defines the structured DX representation. See [Project format](PROJECT_FORMAT.md#bmhelper-data) for its storage rules.

Run `npm run test:core` for application compatibility tests and `npm run test:components` for editor integration tests.
The checked-in fixtures run without the original executable. Use the identified original executable only when regenerating reference fixtures.
