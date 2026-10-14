import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // The /api function, its routes and the database tests run on Node (#105).
    files: ['api/**/*.ts', 'server/**/*.ts', 'supabase/tests/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // Game logic stays pure: no rendering libraries in src/game/.
    files: ['src/game/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*', 'three', 'three/*', 'three-stdlib', '@react-three/*'],
              message: 'src/game/ must stay free of React and Three.js. Put rendering code in src/board/.',
            },
          ],
        },
      ],
    },
  },
  {
    // Seeded world (ADR 0007): the same seed gives the same world on every
    // client, so game and render code never call Math.random. Seeds are
    // picked only at the seed-picking call sites, each with a disable comment
    // naming why; tests may still pass Math.random where a stream is wanted.
    files: ['src/board/**/*.{ts,tsx}', 'src/game/**/*.{ts,tsx}', 'src/mapWorker/**/*.{ts,tsx}', 'src/loadGameClient.ts'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'No Math.random in game or render code (ADR 0007): derive a stream with stream(subSeed(G.mapSeed, feature, ...ids)), or use boardgame.io\'s random in moves and setup.',
        },
      ],
    },
  },
])
