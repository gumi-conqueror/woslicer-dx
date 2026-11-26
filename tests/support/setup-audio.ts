import { readFileSync } from 'node:fs';
import { initSync } from '@gumi-conqueror/audio-decode';

// Use the actual shipped WASM in Node tests, where browser asset URLs cannot be fetched.
initSync({ module: readFileSync('node_modules/@gumi-conqueror/audio-decode/index_bg.wasm') });
