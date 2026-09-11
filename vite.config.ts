import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  build:{rollupOptions:{input:{
    main:fileURLToPath(new URL('./index.html',import.meta.url)),
    lab:fileURLToPath(new URL('./lab.html',import.meta.url)),
    progress:fileURLToPath(new URL('./visual-progress.html',import.meta.url)),
  }}},
});
