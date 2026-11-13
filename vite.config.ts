import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
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

// Lists every file of the built site that a visit can need, so "Save for offline" (src/offline/saveOffline.ts) can
// fetch them ahead of time. Leaves out the separate pre-built mobile app and source maps.
const offlineManifest: Plugin = {
  name: 'alqami-offline-manifest',
  apply: 'build',
  async closeBundle() {
    const dist = resolve(__dirname, 'dist');
    const files: Array<{ path: string; bytes: number }> = [];
    const walk = async (dir: string, rel: string) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          if (path !== 'mobile' && path !== 'records') await walk(resolve(dir, entry.name), path);
        } else if (!path.endsWith('.map') && path !== 'offline-manifest.json' && path !== 'CNAME') {
          files.push({ path, bytes: (await stat(resolve(dir, entry.name))).size });
        }
      }
    };
    await walk(dist, '');
    await writeFile(resolve(dist, 'offline-manifest.json'), JSON.stringify({ builtAt: new Date().toISOString(), files }));
  },
};

export default defineConfig({
  base: './',
  plugins: [react(), usdzContentType, basicSsl(), offlineManifest],
  build: {
    rollupOptions: {
      // jawahiri.html is the talking character (src/character). bench.html measures recognition by sight on a phone (see src/bench/sightBench.ts).
      input: { main: resolve(__dirname, 'index.html'), bench: resolve(__dirname, 'bench.html'), jawahiri: resolve(__dirname, 'jawahiri.html') },
    },
  },
  server: {
    port: 5173,
    host: true,
    allowedHosts: true
  }
});
