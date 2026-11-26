import { parseProject, ProjectFormatError, projectCapability } from '../project/codec';
import type { MediaAsset, ProjectDocument, ProjectFileV1 } from '../project/schema';
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
export function activeMedia(document: ProjectDocument): ProjectDocument['media'][number] | null {
  const capability = projectCapability(document);
  return capability.kind === 'single-track'
    ? (document.media.find((media) => media.mediaId === capability.mediaId) ?? null)
    : null;
}
export function matchesProjectAudio(
  asset: ProjectDocument['media'][number],
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
export function projectWithAudio(
  document: ProjectDocument,
  file: OpenedFile,
  identity: Awaited<ReturnType<typeof identifyAudio>>,
  decoded: DecodedAudio,
  preserveBaseName: boolean,
): ProjectFileV1 {
  const parsed = parseProject(document);
  if (parsed.kind !== 'supported' || parsed.capability.kind === 'unsupported-arrangement')
    throw new ProjectFormatError('This arrangement cannot be edited in the single-track workspace');
  const project = parsed.project;
  const track = project.tracks[0];
  if (!track) throw new ProjectFormatError('Missing project track');
  const mediaId = crypto.randomUUID();
  const name = file.name.replace(/\.[^.]+$/, '');
  const { source } = decoded;
  project.media = [
    {
      mediaId,
      name: file.name,
      ...identity,
      sampleRateHz: source.sampleRate,
      channels: source.channels,
      framesPerChannel: source.length,
      originHint: file.absolutePath ? { kind: 'desktop', pathHint: file.absolutePath } : null,
    },
  ];
  track.clips = [
    {
      clipId: crypto.randomUUID(),
      mediaId,
      timelineStartSeconds: 0,
      sourceOffsetFrames: 0,
      frameCount: source.length,
    },
  ];
  if (!preserveBaseName) {
    project.name = name;
    project.output.baseName = defaultBaseName(name);
  }
  return project;
}

export function projectFileName(name: string): string {
  return `${portableStem(name.replace(/\.wosdx$/i, ''), 'project', 60)}.wosdx`;
}
