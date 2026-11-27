import { normalizeSelection } from '../core/markers';
import { remapMarkerKeys, type MarkerKeys } from './marker-keys';
import type { ProjectTrack } from './schema';

/*
 * Linked markers. A track lists the ticks of its linked markers in
 * `slicing.links`. All tracks that list the same tick form the link group of
 * that tick, so links only join markers at the same tick. A tick that only one
 * track lists is not a link and is dropped.
 */

/** Whether a track can hold a marker at a tick, for example within its audio. */
export type MarkerAllowed = (trackId: string, tick: number) => boolean;

/** Keeps links on existing markers only and drops ticks that no other track links. */
export function normalizeLinks(tracks: readonly ProjectTrack[]): void {
  const members = new Map<number, number>();
  for (const { slicing } of tracks) {
    const markers = new Set(slicing.markers);
    slicing.links = normalizeSelection(slicing.links ?? []).filter((tick) => markers.has(tick));
    for (const tick of slicing.links) members.set(tick, (members.get(tick) ?? 0) + 1);
  }
  for (const { slicing } of tracks) {
    const links = (slicing.links ?? []).filter((tick) => (members.get(tick) ?? 0) > 1);
    if (links.length) slicing.links = links;
    else delete slicing.links;
  }
}

/** One edit of a track's markers. */
export interface MarkerEdit {
  /** The complete new marker list of the edited track. */
  markers: readonly number[];
  keys: MarkerKeys;
  /** Where the edit moved each previous marker. A removed marker maps to a tick that `markers` does not contain. */
  target: (tick: number) => number;
}

/**
 * Applies a marker edit to one track. When `shared`, every linked marker that
 * the edit moves or removes moves or disappears on all tracks of its link
 * group, and each new marker is added to all other tracks as a linked marker.
 * Without `shared`, only the edited track changes, and its moved or removed
 * markers leave their link groups.
 */
export function applyMarkerEdit(
  tracks: readonly ProjectTrack[],
  trackId: string,
  edit: MarkerEdit,
  shared: boolean,
  allowed: MarkerAllowed,
): void {
  const edited = tracks.find((item) => item.trackId === trackId);
  if (!edited) return;
  const { slicing } = edited;
  const markers = normalizeSelection(edit.markers);
  const kept = new Set(markers);
  const moved = new Set(slicing.markers.map(edit.target).filter((tick) => kept.has(tick)));
  const additions = markers.filter((tick) => !moved.has(tick));
  // The destination of each linked marker, or null when the edit removed it.
  const destinations = new Map<number, number | null>();
  for (const tick of slicing.links ?? []) {
    const to = edit.target(tick);
    destinations.set(tick, kept.has(to) ? to : null);
  }
  slicing.markers = markers;
  slicing.markerKeys = remapMarkerKeys(
    edit.keys.filter((entry) => kept.has(entry.tick)),
    (tick) => tick,
  );
  const others = tracks.filter((item) => item !== edited);
  if (!shared || !others.length) {
    slicing.links = [...destinations].filter(([tick, to]) => to === tick).map(([tick]) => tick);
    return;
  }
  slicing.links = [...destinations.values()].filter((to) => to !== null).concat(additions);
  const addedKeys = slicing.markerKeys.filter((entry) => additions.includes(entry.tick));
  for (const track of others) {
    const own = new Set(track.slicing.links ?? []);
    const follow = (tick: number): number | null =>
      own.has(tick) && destinations.has(tick) ? (destinations.get(tick) ?? null) : tick;
    const added = additions.filter((tick) => allowed(track.trackId, tick));
    const next = normalizeSelection([
      ...track.slicing.markers
        .map(follow)
        .filter((tick): tick is number => tick !== null && allowed(track.trackId, tick)),
      ...added,
    ]);
    const retained = new Set(next);
    const links = [...own].map(follow).filter((tick): tick is number => tick !== null);
    track.slicing.links = [...links, ...added].filter((tick) => retained.has(tick));
    track.slicing.markerKeys = remapMarkerKeys(
      [
        ...(track.slicing.markerKeys ?? []).filter((entry) => follow(entry.tick) !== null),
        ...addedKeys.filter((entry) => added.includes(entry.tick)),
      ],
      (tick) => follow(tick) ?? tick,
    ).filter((entry) => retained.has(entry.tick));
    track.slicing.markers = next;
  }
}

/**
 * Copies markers of one track to other tracks as linked markers, with their
 * key attributes. A target track keeps its own marker at a copied tick and
 * links it. Returns the number of markers that the targets received or linked.
 */
export function linkMarkersTo(
  tracks: readonly ProjectTrack[],
  sourceId: string,
  ticks: readonly number[],
  targetIds: readonly string[],
  allowed: MarkerAllowed,
): number {
  const source = tracks.find((item) => item.trackId === sourceId);
  if (!source) return 0;
  const copied = normalizeSelection(ticks).filter((tick) => source.slicing.markers.includes(tick));
  const keys = (source.slicing.markerKeys ?? []).filter((entry) => copied.includes(entry.tick));
  const linked = new Set<number>();
  let count = 0;
  for (const track of tracks) {
    if (track === source || !targetIds.includes(track.trackId)) continue;
    const placed = copied.filter((tick) => allowed(track.trackId, tick));
    const { slicing } = track;
    slicing.markers = normalizeSelection([...slicing.markers, ...placed]);
    slicing.markerKeys = remapMarkerKeys(
      [...(slicing.markerKeys ?? []), ...keys.filter((entry) => placed.includes(entry.tick))],
      (tick) => tick,
    );
    slicing.links = [...(slicing.links ?? []), ...placed];
    for (const tick of placed) linked.add(tick);
    count += placed.length;
  }
  source.slicing.links = [...(source.slicing.links ?? []), ...linked];
  return count;
}

/** Removes markers of one track from their link groups. Returns how many were linked. */
export function unlinkMarkers(track: ProjectTrack, ticks: readonly number[]): number {
  const links = track.slicing.links ?? [];
  track.slicing.links = links.filter((tick) => !ticks.includes(tick));
  return links.length - track.slicing.links.length;
}

/**
 * Links markers of one track with the markers at exactly the same ticks on all
 * other tracks. Returns the number of ticks that have a marker on another track.
 */
export function relinkMarkers(
  tracks: readonly ProjectTrack[],
  trackId: string,
  ticks: readonly number[],
): number {
  const edited = tracks.find((item) => item.trackId === trackId);
  if (!edited) return 0;
  let count = 0;
  for (const tick of ticks) {
    if (!edited.slicing.markers.includes(tick)) continue;
    const holders = tracks.filter((item) => item.slicing.markers.includes(tick));
    if (holders.length < 2) continue;
    for (const { slicing } of holders) slicing.links = [...(slicing.links ?? []), tick];
    count++;
  }
  return count;
}

/**
 * Links the markers of the given tracks at one tick. A listed track without a
 * marker there gets one when it can hold it. The markers join the link group
 * that other tracks already form at the tick. Returns the number of markers
 * that were linked, or 0 when the group would have fewer than two tracks.
 */
export function linkAt(
  tracks: readonly ProjectTrack[],
  tick: number,
  trackIds: readonly string[],
  allowed: MarkerAllowed,
): number {
  const members = tracks.filter(
    (item) =>
      trackIds.includes(item.trackId) &&
      (item.slicing.markers.includes(tick) || allowed(item.trackId, tick)),
  );
  const linkedElsewhere = tracks.filter(
    (item) => !trackIds.includes(item.trackId) && item.slicing.links?.includes(tick),
  ).length;
  if (members.length + linkedElsewhere < 2) return 0;
  for (const { slicing } of members) {
    slicing.markers = normalizeSelection([...slicing.markers, tick]);
    slicing.links = [...(slicing.links ?? []), tick];
  }
  return members.length;
}
