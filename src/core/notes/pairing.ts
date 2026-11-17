export interface Note {
  readonly onset: number;
  readonly duration: number;
  readonly pitch: number;
  readonly velocity: number;
}
export interface NoteEvent {
  readonly kind: 'on' | 'off';
  readonly tick: number;
  readonly channel: number;
  readonly pitch: number;
  readonly velocity: number;
}
export interface AuxiliaryEvent {
  readonly kind: 'controller' | 'bend';
  readonly tick: number;
  readonly channel: number;
  readonly value: number;
  readonly controller?: number;
}
export type TrackEvent = NoteEvent | AuxiliaryEvent;
export interface PairedNote extends Note {
  readonly channel: number;
}
export function pairTrack(
  events: readonly TrackEvent[],
  channels?: ReadonlySet<number>,
): {
  readonly notes: readonly PairedNote[];
  readonly pairedCount: number;
  readonly auxiliary: readonly AuxiliaryEvent[];
} {
  const active = new Map<number, { event: NoteEvent; order: number }>();
  const paired: { note: PairedNote; order: number }[] = [];
  const auxiliary: AuxiliaryEvent[] = [];
  const ordered = events
    .map((event, order) => ({ event, order }))
    .sort((a, b) => a.event.tick - b.event.tick || a.order - b.order);
  for (const { event, order } of ordered) {
    if (
      !Number.isFinite(event.tick) ||
      event.tick < 0 ||
      !Number.isInteger(event.channel) ||
      event.channel < 0 ||
      event.channel > 15
    )
      throw new RangeError('Invalid MIDI event');
    if (!('pitch' in event)) {
      auxiliary.push({ ...event });
      continue;
    }
    if (
      !Number.isInteger(event.pitch) ||
      event.pitch < 0 ||
      event.pitch > 127 ||
      !Number.isInteger(event.velocity) ||
      event.velocity < 0 ||
      event.velocity > 127
    )
      throw new RangeError('Invalid MIDI note event');
    if (event.kind === 'on' && event.velocity > 0) {
      if (!active.has(event.pitch)) active.set(event.pitch, { event, order });
    } else {
      const start = active.get(event.pitch);
      if (start) {
        paired.push({
          note: {
            onset: start.event.tick,
            duration: event.tick - start.event.tick,
            pitch: event.pitch,
            velocity: start.event.velocity,
            channel: start.event.channel,
          },
          order: start.order,
        });
        active.delete(event.pitch);
      }
    }
  }
  paired.sort((a, b) => a.note.onset - b.note.onset || a.order - b.order);
  return {
    notes: paired.map((x) => x.note).filter((n) => !channels || channels.has(n.channel)),
    pairedCount: paired.length,
    auxiliary,
  };
}
