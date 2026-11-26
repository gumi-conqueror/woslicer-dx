# YuanCon input fixture

`yuancon-capture.json` contains 1,481 state snapshots from a YuanCon joystick capture, after identical consecutive reports were removed.
It contains relative times and input values. The original archive is identified by `captureSha256` and is not needed to run tests.

Each row follows the `columns` array:

| Field        | Meaning                                                      |
| ------------ | ------------------------------------------------------------ |
| `elapsed_us` | Relative capture time in microseconds                        |
| `keys`       | Seven-bit key mask, with bits 0–6 mapped to logical keys 1–7 |
| `direction`  | Raw turntable axis value: −32767, 0 or 32767                 |

[`recording-input.test.ts`](../../app/recording-input.test.ts) replays the data through the recording input path.
The native tests in [`src-tauri/src/input.rs`](../../../src-tauri/src/input.rs) check report deduplication and transitions.
The dataset contains 795 key presses, 795 releases and 31 turntable runs.
Run `npm run test:components` and the Rust tests in the [development guide](../../../docs/DEVELOPMENT.md#validation).

The recording has no labels for physical key positions or mechanical turntable actions.
It does not establish physical left-to-right key order, contact latency or a tail-noise threshold.
Use physical-device tests when changing those assumptions. The device preview exposes logical key numbers for checking their order.
