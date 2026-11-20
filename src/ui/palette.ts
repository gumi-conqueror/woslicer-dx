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
  app: '#1c1f20',
  panel: '#2c2f32',
  surface1: '#25282b',
  surface2: '#303634',
  surface3: '#3b4140',
  text1: '#e4e8e5',
  text2: '#c7cfca',
  text3: '#9da9a1',
  accent: '#afcc83',
  selection: '#7fb3ff',
  playhead: '#f5f7fa',
  cue: '#58c7e8',
  danger: '#ff6b6b',
  wave: '#5fa79d',
  waveBright: '#8fe3d6',
  waveRms: '#2e5450',
  waveRmsBright: '#456e68',
  waveDim: 'rgba(95, 167, 157, 0.35)',
  waveBrightDim: 'rgba(143, 227, 214, 0.35)',
  waveRmsDim: 'rgba(46, 84, 80, 0.4)',
  waveRmsBrightDim: 'rgba(69, 110, 104, 0.4)',
  selectionFill: 'rgba(127, 179, 255, 0.12)',
  ghost: 'rgba(143, 227, 214, 0.25)',
  viewportFill: 'rgba(175, 204, 131, 0.18)',
  bandLow: 'rgba(177, 140, 255, 0.85)',
  bandMid: 'rgba(0, 191, 146, 0.75)',
  bandHigh: 'rgba(240, 143, 180, 0.85)',
  hatch: '#343b39',
};

const LIGHT: Palette = {
  app: '#f7f9f6',
  panel: '#edf0ed',
  surface1: '#f7f9f6',
  surface2: '#eaf0e9',
  surface3: '#c6cec7',
  text1: '#242c27',
  text2: '#414c44',
  text3: '#627066',
  accent: '#527c35',
  selection: '#2f6fdb',
  playhead: '#14171b',
  cue: '#0e86b0',
  danger: '#d94848',
  wave: '#2e7d74',
  waveBright: '#14655c',
  waveRms: '#b9d9d3',
  waveRmsBright: '#93c6be',
  waveDim: 'rgba(46, 125, 116, 0.35)',
  waveBrightDim: 'rgba(20, 101, 92, 0.35)',
  waveRmsDim: 'rgba(185, 217, 211, 0.5)',
  waveRmsBrightDim: 'rgba(147, 198, 190, 0.5)',
  selectionFill: 'rgba(47, 111, 219, 0.1)',
  ghost: 'rgba(20, 101, 92, 0.22)',
  viewportFill: 'rgba(82, 124, 53, 0.18)',
  bandLow: 'rgba(109, 64, 199, 0.85)',
  bandMid: 'rgba(0, 131, 101, 0.8)',
  bandHigh: 'rgba(178, 68, 122, 0.85)',
  hatch: '#b7bdc6',
};

export function paletteFor(theme: 'light' | 'dark'): Readonly<Palette> {
  return theme === 'light' ? LIGHT : DARK;
}
