import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

function serveUsdModels(publicDir: string) {
  return async (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, next: (error?: Error) => void) => {
    const pathname = decodeURIComponent((req.url ?? '').split('?')[0]);
    if (!pathname.toLowerCase().endsWith('.usdz') || !['GET', 'HEAD'].includes(req.method ?? '')) {
      next();
      return;
    }

    const publicRoot = resolve(publicDir);
    const assetPath = resolve(publicRoot, pathname.replace(/^[/\\]+/, ''));
    if (!assetPath.toLowerCase().startsWith(`${publicRoot.toLowerCase()}${sep}`)) {
      next();
      return;
    }

    try {
      const asset = await readFile(assetPath);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'model/vnd.usdz+zip');
      res.setHeader('Content-Length', asset.byteLength);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.end(req.method === 'HEAD' ? undefined : asset);
    } catch {
      next();
    }
  };
}

const usdzContentType: Plugin = {
  name: 'visionos-usdz-content-type',
  configureServer(server) {
    server.middlewares.use(serveUsdModels(server.config.publicDir));
  },
  configurePreviewServer(server) {
    server.middlewares.use(serveUsdModels(server.config.publicDir));
  },
};

export default defineConfig({
  base: './',
  plugins: [react(), usdzContentType, basicSsl()],
  build: {
    rollupOptions: {
      // bench.html measures recognition by sight on a phone (see src/bench/sightBench.ts).
      input: { main: resolve(__dirname, 'index.html'), bench: resolve(__dirname, 'bench.html') },
    },
  },
  server: {
    port: 5173,
    host: true,
    allowedHosts: true
  }
});
