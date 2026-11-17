# Original BMH format

The binary contract is maintained with [bmh-file](https://github.com/gumi-conqueror/bmh-file/blob/main/FORMAT.md). The application locks this dependency to a commit in package.json and package-lock.json.

BMH import and export use the original Windows BMHelper beta 4′ layout and CP932 names. DX projects store Unicode data in UTF-8 JSON independently.

The package tests cover binary fields, original-file round trips and malformed input. This application's tests/bmh-compatibility.test.ts covers recording construction and lossy-name export through BMHelper.
