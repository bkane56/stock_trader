import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  // Vercel / CI inject VITE_* into process.env; loadEnv only reads .env files.
  // Merge so preview/production builds pick up dashboard env vars.
  const vitePythonAiBaseUrl = (
    env.VITE_PYTHON_AI_BASE_URL ||
    process.env.VITE_PYTHON_AI_BASE_URL ||
    ''
  ).trim();

  if (process.env.VERCEL === '1' && mode === 'production' && !vitePythonAiBaseUrl) {
    throw new Error(
      'Missing VITE_PYTHON_AI_BASE_URL. In Vercel → Settings → Environment Variables, ' +
        'add it for Preview (and Production if you use it). Preview deploys do not use Production-only vars. ' +
        'Save, then Redeploy.'
    );
  }

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
      // Ensure Vercel-injected URL is baked into the client bundle (see merge above).
      'import.meta.env.VITE_PYTHON_AI_BASE_URL': JSON.stringify(vitePythonAiBaseUrl),
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
