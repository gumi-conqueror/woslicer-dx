import type { MidiSequence } from '@gumi-conqueror/bmh-file';
import { pairNotes, type TrackEvent } from '../notes/pairing.js';

/** Chunk identifiers "MThd" and "MTrk" as big-endian u32 values. */
const MTHD = 0x4d546864;
const MTRK = 0x4d54726b;
/** Delta 0, meta event FF 2F with length 0. */
const END_OF_TRACK = [0, 0xff, 0x2f, 0];

export interface SmfTrackInfo {
  index: number;
  name: string;
  noteCount: number;
}

export class SmfFormatError extends Error {}

interface ChannelEvent {
  tick: number;
  status: number;
  d0: number;
  d1: number;
}

interface ParsedTrack {
  name: string;
  events: ChannelEvent[];
}

interface ParsedFile {
  division: number;
  format: number;
  tracks: ParsedTrack[];
}

class ByteReader {
  private pos = 0;

  constructor(private readonly bytes: Uint8Array) {}

  get position(): number {
    return this.pos;
  }

  get remaining(): number {
    return this.bytes.length - this.pos;
  }

  u8(): number {
    if (this.pos >= this.bytes.length) throw new SmfFormatError('unexpected end of MIDI data');
    return this.bytes[this.pos++];
  }

  u16(): number {
    if (this.pos + 2 > this.bytes.length) throw new SmfFormatError('unexpected end of MIDI data');
    const value = (this.bytes[this.pos] << 8) | this.bytes[this.pos + 1];
    this.pos += 2;
    return value;
  }

  u32(): number {
    if (this.pos + 4 > this.bytes.length) throw new SmfFormatError('unexpected end of MIDI data');
    const value =
      this.bytes[this.pos] * 0x1000000 +
      (this.bytes[this.pos + 1] << 16) +
      (this.bytes[this.pos + 2] << 8) +
      this.bytes[this.pos + 3];
    this.pos += 4;
    return value;
  }

  varlen(): number {
    let value = 0;
    for (;;) {
      const byte = this.u8();
      value = (value << 7) | (byte & 0x7f);
      if ((byte & 0x80) === 0) return value;
    }
  }

  raw(length: number): Uint8Array {
    if (this.pos + length > this.bytes.length)
      throw new SmfFormatError('unexpected end of MIDI data');
    const out = this.bytes.subarray(this.pos, this.pos + length);
    this.pos += length;
    return out;
  }

  skip(length: number): void {
    if (this.pos + length > this.bytes.length)
      throw new SmfFormatError('unexpected end of MIDI data');
    this.pos += length;
  }
}

function parseTrack(reader: ByteReader, end: number): ParsedTrack {
  let tick = 0;
  let running = 0;
  let name = '';
  const events: ChannelEvent[] = [];
  while (reader.position < end) {
    tick += reader.varlen();
    let status = reader.u8();
    if (status < 0x80) {
      if (running === 0) throw new SmfFormatError('running status without a status byte');
      // Re-use the running status: the byte just read is the first data byte,
      // so step back and re-read it through the normal path.
      reader.skip(-1);
      status = running;
    } else if (status < 0xf0) {
      running = status;
    }
    if (status === 0xff) {
      const type = reader.u8();
      const length = reader.varlen();
      const data = reader.raw(length);
      if (type === 0x03 && name === '') {
        name = new TextDecoder('utf-8').decode(data).replace(/\0+$/, '');
      } else if (type === 0x2f) {
        break; // end of track
      }
      continue;
    }
    if (status === 0xf0 || status === 0xf7) {
      reader.skip(reader.varlen()); // sysex: parsed away
      continue;
    }
    const kind = status & 0xf0;
    let d0: number;
    let d1 = 0;
    if (kind === 0xc0 || kind === 0xd0) {
      d0 = reader.u8();
    } else {
      d0 = reader.u8();
      d1 = reader.u8();
    }
    events.push({ tick, status, d0, d1 });
  }
  return { name, events };
}

/** Normalizes channel events, pairs notes and projects them to BMHelper sequence fields. */
function trackSequence(events: ChannelEvent[]) {
  const normalized: TrackEvent[] = [];
  for (const event of events) {
    const kind = event.status & 0xf0;
    const channel = event.status & 0x0f;
    if (kind === 0x80 || kind === 0x90) {
      normalized.push({
        kind: kind === 0x80 ? 'off' : 'on',
        tick: event.tick,
        channel,
        pitch: event.d0,
        velocity: event.d1,
      });
    } else if (kind === 0xe0) {
      normalized.push({
        kind: 'bend',
        tick: event.tick,
        channel,
        value: event.d0 | (event.d1 << 7),
      });
    } else if (kind === 0xb0) {
      normalized.push({
        kind: 'controller',
        tick: event.tick,
        channel,
        value: event.d1,
        controller: event.d0,
      });
    }
  }
  const paired = pairNotes(normalized);
  return {
    notes: paired.notes.map((note) => ({
      position: note.onset,
      gate: note.duration,
      nn: note.pitch,
      vel: note.velocity,
      channel: note.channel,
    })),
    pitches: paired.auxiliary
      .filter((event) => event.kind === 'bend')
      .map((event) => ({ position: event.tick, value: event.value })),
    controls: paired.auxiliary
      .filter((event) => event.kind === 'controller')
      .map((event) => ({ position: event.tick, value: event.value, cc: event.controller ?? 0 })),
  };
}

function parseSmf(bytes: Uint8Array): ParsedFile {
  const reader = new ByteReader(bytes);
  if (reader.u32() !== MTHD) throw new SmfFormatError('not a Standard MIDI File (missing MThd)');
  const headerSize = reader.u32();
  if (headerSize < 6) throw new SmfFormatError('malformed MIDI header');
  const format = reader.u16();
  if (format !== 0 && format !== 1) {
    throw new SmfFormatError(`unsupported MIDI format ${format} (only 0 and 1)`);
  }
  const trackCount = reader.u16();
  const division = reader.u16();
  if ((division & 0x8000) !== 0) {
    throw new SmfFormatError('SMPTE-time-coded MIDI files are not supported');
  }
  reader.skip(headerSize - 6);
  const tracks: ParsedTrack[] = [];
  for (let index = 0; index < trackCount && reader.remaining >= 8; index++) {
    if (reader.u32() !== MTRK) throw new SmfFormatError('missing MTrk chunk');
    const size = reader.u32();
    const end = reader.position + size;
    tracks.push(parseTrack(reader, end));
    reader.skip(end - reader.position);
  }
  return { division, format, tracks };
}

/** Lists the tracks of an SMF file for the import dialog. */
export function inspectSmf(bytes: Uint8Array): {
  division: number;
  format: number;
  tracks: SmfTrackInfo[];
} {
  const parsed = parseSmf(bytes);
  return {
    division: parsed.division,
    format: parsed.format,
    tracks: parsed.tracks.map((track, index) => ({
      index,
      name: track.name,
      noteCount: trackSequence(track.events).notes.length,
    })),
  };
}

/** Extracts one track's notes (filtered by channel) as a sequence. */
export function readSmfSequence(
  bytes: Uint8Array,
  trackIndex: number,
  channels: ReadonlySet<number>,
): MidiSequence {
  const parsed = parseSmf(bytes);
  if (trackIndex < 0 || trackIndex >= parsed.tracks.length) {
    throw new SmfFormatError(`no such MIDI track: ${trackIndex}`);
  }
  const paired = trackSequence(parsed.tracks[trackIndex].events);
  const notes = paired.notes
    .filter((note) => channels.has(note.channel))
    .map(({ channel: _channel, ...note }) => note);
  return { quantize: parsed.division, notes, pitches: paired.pitches, controls: paired.controls };
}

function vlq(value: number): number[] {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0x0fffffff)
    throw new RangeError('SMF delta exceeds supported range');
  const bytes = [value % 128];
  while ((value = Math.floor(value / 128)) > 0) bytes.unshift((value % 128) + 128);
  return bytes;
}

function u32(value: number): number[] {
  return [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

/**
 * Writes a format-1 SMF: an empty conductor track, then one track with the
 * notes on channel 1. Positions and lengths are truncated to whole ticks.
 */
export function writeSmfSequence(sequence: MidiSequence): Uint8Array {
  const resolution = sequence.quantize;
  if (!Number.isInteger(resolution) || resolution <= 0 || resolution > 32767)
    throw new RangeError('Unsupported MIDI resolution');
  const events: { time: number; order: number; bytes: number[] }[] = [];
  sequence.notes.forEach((note, i) => {
    if (![note.position, note.gate, note.nn, note.vel].every(Number.isFinite))
      throw new RangeError('Nonfinite note');
    const onset = Math.max(0, Math.trunc(note.position));
    const end = onset + Math.max(0, Math.trunc(note.gate));
    const pitch = Math.max(0, Math.min(127, Math.trunc(note.nn)));
    const velocity = Math.max(1, Math.min(127, Math.trunc(note.vel)));
    events.push(
      { time: onset, order: i * 2, bytes: [0x90, pitch, velocity] },
      { time: end, order: i * 2 + 1, bytes: [0x80, pitch, 0] },
    );
  });
  events.sort((a, b) => a.time - b.time || a.order - b.order);
  const track: number[] = [];
  let previous = 0;
  for (const event of events) {
    track.push(...vlq(event.time - previous), ...event.bytes);
    previous = event.time;
  }
  track.push(...END_OF_TRACK);
  if (track.length > 0xffffffff) throw new RangeError('Track too large');
  return Uint8Array.from([
    ...u32(MTHD),
    ...u32(6),
    ...[0, 1], // format 1
    ...[0, 2], // two tracks
    resolution >> 8,
    resolution & 255,
    ...u32(MTRK),
    ...u32(END_OF_TRACK.length),
    ...END_OF_TRACK,
    ...u32(MTRK),
    ...u32(track.length),
    ...track,
  ]);
}
