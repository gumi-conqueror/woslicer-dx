import type { MidiSequence } from '@gumi-conqueror/bmh-file';
import { pairTrack as pairEvents, type TrackEvent } from './notes/pairing.js';
import { recordingSmf } from './notes/recording-smf.js';

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
    // Same truncation boundary and big-endian assembly as bmh.ts's ByteReader;
    // the two format readers must stay in step.
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

function pairTrack(events: ChannelEvent[]) {
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
  const paired = pairEvents(normalized);
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
  if (reader.u32() !== 0x4d546864)
    throw new SmfFormatError('not a Standard MIDI File (missing MThd)');
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
    if (reader.u32() !== 0x4d54726b) throw new SmfFormatError('missing MTrk chunk');
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
      noteCount: pairTrack(track.events).notes.length,
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
  const paired = pairTrack(parsed.tracks[trackIndex].events);
  const notes = paired.notes
    .filter((note) => channels.has(note.channel))
    .map(({ channel: _channel, ...note }) => note);
  return { quantize: parsed.division, notes, pitches: paired.pitches, controls: paired.controls };
}

export function writeSmfSequence(sequence: MidiSequence): Uint8Array {
  return recordingSmf(
    sequence.notes.map((note) => ({
      onset: note.position,
      duration: note.gate,
      pitch: note.nn,
      velocity: note.vel,
    })),
    sequence.quantize,
  );
}
