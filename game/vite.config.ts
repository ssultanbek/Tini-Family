import { defineConfig } from 'vite';
export default defineConfig({
  server: { port: 5173, fs: { allow: ['..'] } },
  // framer-motion ships "use client" directives meant for Next.js; they are harmless here.
  build: { rollupOptions: { onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning); } } },
});
