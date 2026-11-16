# Synthetic Vorbis fixture

`generated-tone.ogg` is a generated 440 Hz sine wave. It has one channel, 44100 Hz and a 0.3-second duration.
The test checks complete-file parsing, including the final buffered Ogg page.

Generate it with FFmpeg and the libvorbis encoder:

```sh
ffmpeg -f lavfi -i sine=frequency=440:duration=0.3 -c:a libvorbis generated-tone.ogg
```
