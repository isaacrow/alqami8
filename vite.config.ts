import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

/**
 * alqami3's picture-tracking mode (src/alqami3/classic) runs on MindAR 1.2.5, built for three.js r150 (it imports
 * sRGBEncoding, gone since r162). That mode, and MindAR itself, get three r150 (installed as "three150"); everything
 * else keeps the site's three.js. One three per page, so MindAR's scene and the mode's cards share it.
 */
const threeForMindAR: Plugin = {
  name: 'three-r150-for-mindar',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    if (!importer || !(source === 'three' || source.startsWith('three/'))) return null;
    const imp = importer.replace(/\\/g, '/');
    if (!imp.includes('/node_modules/mind-ar/')) return null;
    const mapped = source === 'three' ? 'three150' : source.replace(/^three\/addons\//, 'three150/examples/jsm/').replace(/^three\//, 'three150/');
    return this.resolve(mapped, importer, { ...options, skipSelf: true });
  },
};

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
          // ort-wasm*.wasm (2 x ~27 MB) are only used by bench.html's lip-model test: recognition loads its ONNX engine
          // through Transformers.js (from jsDelivr, kept in its own cache), so "Save for offline" leaves them out.
        // alqami3's two scan modes (about 10 MB) need the camera and live models, so they are not saved for offline.
        } else if (!path.endsWith('.map') && !/\/ort-wasm[^/]*\.wasm$/.test(path) && !/(^|\/)alqami3(-|\/|Scan|Sweep)/.test(path) && !/-lectures.json$/.test(path) && path !== 'offline-manifest.json' && path !== 'CNAME') {
          files.push({ path, bytes: (await stat(resolve(dir, entry.name))).size });
        }
      }
    };
    await walk(dist, '');
    await writeFile(resolve(dist, 'offline-manifest.json'), JSON.stringify({ builtAt: new Date().toISOString(), files }));
  },
};

/**
 * Every page gets the page-change animations in its <head> (src/styles/pageTransitions.css and .js), inline, so both the
 * old page and the new one have them before they draw — what cross-page View Transitions need.
 */
const alqamiTransitions: Plugin = {
  name: 'alqami-transitions',
  async transformIndexHtml() {
    const css = await readFile(resolve(__dirname, 'src/styles/pageTransitions.css'), 'utf8');
    const js = await readFile(resolve(__dirname, 'src/styles/pageTransitions.js'), 'utf8');
    return [
      { tag: 'style', attrs: { id: 'alqami-transitions' }, children: css, injectTo: 'head' },
      { tag: 'script', children: js, injectTo: 'head' },
    ];
  },
};

export default defineConfig({
  base: './',
  plugins: [threeForMindAR, react(), usdzContentType, basicSsl(), offlineManifest, alqamiTransitions],
  build: {
    rollupOptions: {
      // jawahiri.html is the talking character (src/character). object.html is an object's own page, opened by its QR
      // label in any phone camera; labels.html prints every object's label (src/object). bench.html measures recognition by sight on a phone (see src/bench/sightBench.ts).
      input: { main: resolve(__dirname, 'index.html'), bench: resolve(__dirname, 'bench.html'), jawahiri: resolve(__dirname, 'jawahiri.html'), mutanabbi: resolve(__dirname, 'mutanabbi.html'), waili: resolve(__dirname, 'waili.html'), object: resolve(__dirname, 'object.html'), labels: resolve(__dirname, 'labels.html'), alqami3Scan: resolve(__dirname, 'alqami3-scan.html'), alqami3Sweep: resolve(__dirname, 'alqami3-360.html'), kafeelScan: resolve(__dirname, 'kafeel-scan.html') },
    },
  },
  optimizeDeps: {
    entries: ['index.html', 'jawahiri.html', 'object.html', 'labels.html', 'kafeel-scan.html'],
    include: ['three', 'three/examples/jsm/loaders/GLTFLoader.js', 'three/examples/jsm/environments/RoomEnvironment.js'],
    exclude: ['mind-ar', 'three150'],
  },
  server: {
    port: 5173,
    host: true,
    allowedHosts: true
  }
});
