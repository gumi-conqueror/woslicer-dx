import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeAudio } from '../../src/audio/decode';
import { renderSlice } from '../../src/core/audio/slice';
import { encodePcm16 } from '../../src/core/formats/wave';
import { wavFile } from '../support/audio';
import { readPcm16Wav } from '../support/wav-reader';
import { buildPeakCache, peakRange } from '../../src/core/peaks';
import { wavBytesDepth, writeWavHeader } from '../fixtures';

const fixture = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/audio/${name}`));

describe('published Symphonia decoder', () => {
  it('uses the same Float32 pipeline for WAV and other lossless containers', async () => {
    const reference = await decodeAudio(fixture('tone.wav'));
    expect(reference.data[0]).toBeInstanceOf(Float32Array);
    expect(reference.length).toBe(6000);
    for (const name of ['tone.flac', 'tone-alac.m4a', 'tone.aiff', 'tone.mka']) {
      const result = await decodeAudio(fixture(name));
      expect(result.sampleRate).toBe(48000);
      expect(result.channels).toBe(2);
      expect(result.data).toEqual(reference.data);
    }
  });

  it('retains sub-16-bit PCM samples and floating-point headroom until export', async () => {
    for (const bits of [24, 32] as const) {
      const result = await decodeAudio(wavBytesDepth([1, -1, 256], 48000, bits));
      expect(result.sourceFormat).toEqual({ kind: 'pcm', bits });
      expect(result.data[0][0]).toBe(2 ** (16 - bits));
      expect(result.data[0][1]).toBe(-(2 ** (16 - bits)));
    }
    const bytes = new Uint8Array(44 + 12);
    const view = new DataView(bytes.buffer);
    writeWavHeader(view, 12, 3, 1, 48000, 32);
    [0.25 / 32768, 1.25, -1.5].forEach((sample, index) =>
      view.setFloat32(44 + index * 4, sample, true),
    );
    const result = await decodeAudio(bytes);
    expect(result.sourceFormat).toEqual({ kind: 'float', bits: 32 });
    expect([...result.data[0]]).toEqual([0.25, 40960, -49152]);
    const peaks = buildPeakCache([Float32Array.of(40000, 41000)], 1);
    expect(peakRange(peaks, 2, 0, 2)).toMatchObject({ min: 40000, max: 41000 });
    const slice = renderSlice(result, { start: 0, end: 3, fadeoutMs: 0, noisegateDb: 0 });
    // Export clips the float headroom to PCM16.
    // 40960 clips to 32767; the attack gain at frame 1 of 3 is 0.25.
    expect([...readPcm16Wav(encodePcm16(slice.channels, slice.sampleRate)).channels[0]]).toEqual([
      0, 8191,
    ]);
  });

  it('decodes compressed formats and includes the final Vorbis page', async () => {
    for (const name of ['tone.mp3', 'tone.ogg', 'tone.aac', 'tone-aac.m4a', 'tone.mkv']) {
      const result = await decodeAudio(fixture(name));
      expect(result.sampleRate).toBe(48000);
      expect(result.channels).toBe(2);
      expect(result.length).toBeGreaterThanOrEqual(6000);
      expect(result.length).toBeLessThanOrEqual(9000);
      expect(result.data[0].some((sample) => Math.abs(sample) > 1000)).toBe(true);
    }
    const ogg = await decodeAudio(fixture('generated-tone.ogg'));
    expect(ogg.length).toBe(13230);
    expect(ogg.channels).toBe(1);
    expect(ogg.sampleRate).toBe(44100);
  });

  it('rejects unsupported audio while keeping later decodes usable', async () => {
    await expect(decodeAudio(new Uint8Array([1, 2, 3]))).rejects.toThrow();
    await expect(decodeAudio(fixture('tone-opus.mka'))).rejects.toThrow();
    await expect(
      decodeAudio(wavFile([new Int16Array(10), new Int16Array(10), new Int16Array(10)], 48000)),
    ).rejects.toThrow(/channel count/);
    expect((await decodeAudio(fixture('tone.flac'))).length).toBe(6000);
  });
});
