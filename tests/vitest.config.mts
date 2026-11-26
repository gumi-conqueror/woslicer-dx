import { fileURLToPath } from 'node:url';
import languages from '../src/i18n/languages.json' with { type: 'json' };
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import VueI18n from '@intlify/unplugin-vue-i18n/vite';

export default defineConfig({
  plugins: [
    vue(),
    VueI18n({
      include: languages.languages
        .map((entry) => entry.id)
        .map((language) => fileURLToPath(new URL(`../src/i18n/${language}.json`, import.meta.url))),
      runtimeOnly: true,
      compositionOnly: true,
      dropMessageCompiler: true,
    }),
  ],
  test: {
    restoreMocks: true,
    clearMocks: true,
    projects: [
      {
        extends: true,
        // Pure computations: no DOM, no Pinia, no platform.
        test: { name: 'algorithm', environment: 'node', include: ['tests/algorithm/**/*.test.ts'] },
      },
      {
        extends: true,
        // One user task from input to result, through tests/support/app.ts.
        test: {
          name: 'business',
          environment: 'happy-dom',
          setupFiles: ['tests/support/setup-audio.ts'],
          include: ['tests/business/**/*.test.ts', 'tests/refactor-guard/**/*.test.ts'],
        },
      },
    ],
  },
});
