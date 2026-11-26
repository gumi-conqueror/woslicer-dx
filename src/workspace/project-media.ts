import { currentTrack, parseProject, ProjectFormatError } from '../project/codec';
import type { MediaAsset, ProjectDocument, ProjectFile, ProjectTrack } from '../project/schema';
import type { OpenedFile } from '../platform/contracts';
import type { DecodedAudio } from '../audio/audio-jobs';
import { audioFileFormat } from '../core/audio-formats';
import { defaultBaseName } from '../core/slices';
import { portableStem } from '../platform/file-names';

/** Portable metadata includes media identity but never a host grant. */
export async function identifyAudio(file: OpenedFile) {
  const format = audioFileFormat(file.name);
  if (!format) throw new ProjectFormatError('Unsupported audio extension');
  const byteLength = file.bytes.byteLength;
  // Hash before transferring the original buffer to the decoding worker.
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(file.bytes));
  const integrity: NonNullable<MediaAsset['integrity']> = {
    algorithm: 'sha256',
    digest: Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, '0')).join(
      '',
    ),
  };
  return { format, byteLength, integrity };
}
/** The audio file of the track being edited, or null before audio is chosen. */
export function matchesProjectAudio(
  asset: NonNullable<ProjectDocument['tracks'][number]['media']>,
  identity: Awaited<ReturnType<typeof identifyAudio>>,
  decoded: DecodedAudio,
): boolean {
  const { source } = decoded;
  return (
    asset.format === identity.format &&
    (asset.byteLength === null || asset.byteLength === identity.byteLength) &&
    (asset.sampleRateHz === null || asset.sampleRateHz === source.sampleRate) &&
    (asset.channels === null || asset.channels === source.channels) &&
    (asset.framesPerChannel === null || asset.framesPerChannel === source.length) &&
    (asset.integrity === null || asset.integrity.digest === identity.integrity.digest)
  );
}
type Identity = Awaited<ReturnType<typeof identifyAudio>>;

function mediaAsset(
  mediaId: string,
  file: OpenedFile,
  identity: Identity,
  decoded: DecodedAudio,
): MediaAsset {
  const { source } = decoded;
  return {
    mediaId,
    name: file.name,
    ...identity,
    sampleRateHz: source.sampleRate,
    channels: source.channels,
    framesPerChannel: source.length,
    originHint: file.absolutePath ? { kind: 'desktop', pathHint: file.absolutePath } : null,
  };
}

/** The document with new audio on its track. A new name also renames the project and its slices. */
export function projectWithAudio(
  document: ProjectDocument,
  file: OpenedFile,
  identity: Identity,
  decoded: DecodedAudio,
  preserveBaseName: boolean,
  trackId: string | null = null,
): ProjectFile {
  const parsed = parseProject(document);
  if (parsed.kind !== 'supported') throw new ProjectFormatError('Unsupported project version');
  const { project } = parsed;
  const track = currentTrack(project, trackId);
  if (preserveBaseName) track.media = mediaAsset(crypto.randomUUID(), file, identity, decoded);
  else {
    setTrackAudio(track, file, identity, decoded);
    project.name = track.name;
  }
  return project;
}

/** New audio on a track: the track and its slices take the file's name. */
export function setTrackAudio(
  track: ProjectTrack,
  file: OpenedFile,
  identity: Identity,
  decoded: DecodedAudio,
): void {
  const name = file.name.replace(/\.[^.]+$/, '');
  track.media = mediaAsset(crypto.randomUUID(), file, identity, decoded);
  track.name = name;
  track.output.baseName = defaultBaseName(name);
}

/**
 * Records a relinked file on its track: the new path always, and the new
 * file identity when the user accepted a different file.
 */
export function relinkMedia(
  track: ProjectTrack,
  file: OpenedFile,
  identity: Identity,
  decoded: DecodedAudio,
  different: boolean,
): void {
  const { media } = track;
  if (!media) return;
  if (different) track.media = mediaAsset(media.mediaId, file, identity, decoded);
  else
    media.originHint = file.absolutePath ? { kind: 'desktop', pathHint: file.absolutePath } : null;
}

export function projectFileName(name: string): string {
  return `${portableStem(name.replace(/\.wosdx$/i, ''), 'project', 60)}.wosdx`;
}
