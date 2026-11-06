import { defineConfig } from 'vite';
// css.postcss: {} → üst klasörlerde postcss yapılandırması aranmaz.
export default defineConfig({
  clearScreen: false,
  css: { postcss: {} },
  server: { port: 1420, strictPort: true, fs: { allow: ['..'] } }
});
