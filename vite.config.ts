import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const aiProvider = (env.AI_PROVIDER || 'openai').toLowerCase();
  const aiModel = env.AI_MODEL || env.OPENAI_MODEL || 'gpt-4.2';
  const aiApiKey =
    aiProvider === 'anthropic'
      ? env.ANTHROPIC_API_KEY
      : env.OPENAI_API_KEY;

  return {
    plugins: [react(), tailwindcss()],
    define: {
      // Centralize provider/model/key selection via env, not hardcoded constants.
      'process.env.AI_PROVIDER': JSON.stringify(aiProvider),
      'process.env.AI_MODEL': JSON.stringify(aiModel),
      'process.env.AI_API_KEY': JSON.stringify(aiApiKey),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
