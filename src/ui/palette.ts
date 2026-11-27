export interface Palette {
  app: string;
  panel: string;
  surface1: string;
  surface2: string;
  surface3: string;
  text1: string;
  text2: string;
  text3: string;
  accent: string;
  /** Markers that are linked to markers on other tracks. */
  linked: string;
  selection: string;
  playhead: string;
  cue: string;
  danger: string;
  /* Waveform: light min/max envelope, darker/lighter RMS band inside it. */
  wave: string;
  waveBright: string;
  waveRms: string;
  waveRmsBright: string;
  /* Low-alpha fills derived from the tokens above. */
  waveDim: string;
  waveBrightDim: string;
  waveRmsDim: string;
  waveRmsBrightDim: string;
  selectionFill: string;
  ghost: string;
  viewportFill: string;
  /* Band overlay (frozen hue roles: violet / green / pink). */
  bandLow: string;
  bandMid: string;
  bandHigh: string;
  /* No-audio region hatch. */
  hatch: string;
}

const DARK: Palette = {
  app: '#1c1e26',
  panel: '#2b2d36',
  surface1: '#22242d',
  surface2: '#2b2d36',
  surface3: '#3b3d48',
  text1: '#dcdde3',
  text2: '#b3b4bd',
  text3: '#8f909c',
  accent: '#ffad56',
  linked: '#b4e05a',
  selection: '#b0ddeb',
  playhead: '#f0f1f5',
  cue: '#03c3d5',
  danger: '#ff4d47',
  wave: '#1aa6b4',
  waveBright: '#6fe1ec',
  waveRms: '#0e4d55',
  waveRmsBright: '#166a74',
  waveDim: 'rgba(26, 166, 180, 0.35)',
  waveBrightDim: 'rgba(111, 225, 236, 0.35)',
  waveRmsDim: 'rgba(14, 77, 85, 0.4)',
  waveRmsBrightDim: 'rgba(22, 106, 116, 0.4)',
  selectionFill: 'rgba(176, 221, 235, 0.12)',
  ghost: 'rgba(111, 225, 236, 0.25)',
  viewportFill: 'rgba(255, 173, 86, 0.18)',
  bandLow: 'rgba(177, 140, 255, 0.85)',
  bandMid: 'rgba(0, 191, 146, 0.75)',
  bandHigh: 'rgba(240, 143, 180, 0.85)',
  hatch: '#2b2d36',
};

const LIGHT: Palette = {
  app: '#cdcfd5',
  panel: '#b8bac2',
  surface1: '#cdcfd5',
  surface2: '#c4c6cd',
  surface3: '#a9abb3',
  text1: '#0f121a',
  text2: '#262a33',
  text3: '#4b4f5c',
  accent: '#a85600',
  linked: '#4a7000',
  selection: '#006a79',
  playhead: '#0f121a',
  cue: '#007383',
  danger: '#c42f2a',
  wave: '#00606e',
  waveBright: '#00444e',
  waveRms: '#8fc6ce',
  waveRmsBright: '#6fb3bc',
  waveDim: 'rgba(0, 96, 110, 0.35)',
  waveBrightDim: 'rgba(0, 68, 78, 0.35)',
  waveRmsDim: 'rgba(143, 198, 206, 0.5)',
  waveRmsBrightDim: 'rgba(111, 179, 188, 0.5)',
  selectionFill: 'rgba(0, 106, 121, 0.12)',
  ghost: 'rgba(0, 68, 78, 0.22)',
  viewportFill: 'rgba(168, 86, 0, 0.2)',
  bandLow: 'rgba(109, 64, 199, 0.85)',
  bandMid: 'rgba(0, 131, 101, 0.8)',
  bandHigh: 'rgba(178, 68, 122, 0.85)',
  hatch: '#b3b5bd',
};

export function paletteFor(theme: 'light' | 'dark'): Readonly<Palette> {
  return theme === 'light' ? LIGHT : DARK;
}
