import { defineConfig } from 'vite';
import { zoneGenerationPlugin } from './tools/zone-server/server';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte(), zoneGenerationPlugin()]
});
