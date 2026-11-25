# Synthetic audio fixtures

All audio in this directory is synthetic. The checked-in files run without FFmpeg.
FFmpeg is required only to regenerate them.

## Short Vorbis stream

`generated-tone.ogg` is a generated 440 Hz sine wave. It has one channel, 44100 Hz and a 0.3-second duration.
The test checks complete-file parsing, including the final buffered Ogg page.

Generate it with FFmpeg and the libvorbis encoder:

```sh
ffmpeg -f lavfi -i sine=frequency=440:duration=0.3 -c:a libvorbis generated-tone.ogg
```

## Decoder format fixtures

The `tone*` files come from [audio-decode v0.1.0](https://github.com/gumi-conqueror/audio-decode/tree/v0.1.0/tests/fixtures), under MIT.
That repository's fixture generator creates 6,000 stereo frames at 48 kHz and transcodes them with FFmpeg.
Its fixture README contains the regeneration command. Compressed streams can include codec delay or padding.
Matroska fixtures cover FLAC and AAC input and rejection of unsupported Opus.
[`audio-decode.test.ts`](../../app/audio-decode.test.ts) checks the published decoder against these inputs.
