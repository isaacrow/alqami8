// Builds image-tracking targets (jsartoolkit NFT markers) for Moon covers into public/nft/, so ALQAMI can pin a
// record's card to its cover while the visitor moves (src/pin/coverTracker.ts).
//
// Each marker takes about 10 s to make and about 390 KB to store, so markers are kept between runs: the deploy
// workflow restores public/nft/ from its cache, this script makes only what is new or whose cover changed (up to
// MAX_NEW per run), and the nightly run fills in the rest. The app downloads one marker, for the record in view.
//
//   node scripts/build-nft-targets.mjs
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const MOON_API = 'https://gfbagczwhvxxstbfrfhu.supabase.co/functions/v1/make-server-49c0e13c';
const MOON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmYmFnY3p3aHZ4eHN0YmZyZmh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3ODg4OTksImV4cCI6MjA4NjM2NDg5OX0.Hrib4UwwVvCu0o7K51UAICoSmd2J-0XlkLegdkIqLJk';
const COVERS = 'https://gfbagczwhvxxstbfrfhu.supabase.co/storage/v1/object/public/covers';
const MAX_NEW = Number(process.env.NFT_MAX_NEW || 60);
const CREATOR = join(process.cwd(), 'node_modules', '@webarkit', 'nft-marker-creator-app', 'src', 'NFTMarkerCreator.js');

const out = join(process.cwd(), 'public', 'nft');
mkdirSync(out, { recursive: true });
const manifestPath = join(out, 'index.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
const fileOf = (id) => id.replace(/[^a-zA-Z0-9_-]/g, '_');

const records = [];
for (let offset = 0; ; offset += 200) {
  const res = await fetch(`${MOON_API}/records/search?view=published&limit=200&offset=${offset}`, { headers: { Authorization: `Bearer ${MOON_KEY}` } });
  if (!res.ok) throw new Error(`Moon search ${res.status}`);
  const page = await res.json();
  records.push(...page.records.map((r) => r.id));
  if (page.records.length < 200) break;
}

const work = join(tmpdir(), 'alqami-nft');
mkdirSync(work, { recursive: true });
let made = 0, kept = 0, failed = 0;
for (const id of records) {
  const img = await fetch(`${COVERS}/${encodeURIComponent(id)}.jpg`);
  if (!img.ok) continue;
  const buf = Buffer.from(await img.arrayBuffer());
  const hash = createHash('sha1').update(buf).digest('hex').slice(0, 16);
  const file = fileOf(id);
  const present = ['iset', 'fset', 'fset3'].every((ext) => existsSync(join(out, `${file}.${ext}`)));
  if (manifest[id]?.hash === hash && present) {
    kept++;
    continue;
  }
  if (made + failed >= MAX_NEW) continue;
  const src = join(work, `${file}.jpg`);
  writeFileSync(src, buf);
  try {
    // The creator must run from its own folder. Its -NoConf flag turns a "continue? (Y/N)" prompt ON for images
    // with few features, so it is left off, and a "Y" on stdin answers the prompt if it appears anyway.
    execFileSync(process.execPath, [CREATOR, '-i', src, '-o', work], {
      cwd: dirname(CREATOR),
      input: 'Y\n',
      stdio: ['pipe', 'ignore', 'ignore'],
      timeout: 120000,
    });
    for (const ext of ['iset', 'fset', 'fset3']) renameSync(join(work, `${file}.${ext}`), join(out, `${file}.${ext}`));
    manifest[id] = { file, hash };
    made++;
  } catch (error) {
    failed++;
    console.warn(`No marker for ${id}: ${error.message.split('\n')[0]}`);
  } finally {
    rmSync(src, { force: true });
  }
}

// Records withdrawn from Moon lose their markers.
for (const id of Object.keys(manifest)) {
  if (!records.includes(id)) {
    for (const ext of ['iset', 'fset', 'fset3']) rmSync(join(out, `${manifest[id].file}.${ext}`), { force: true });
    delete manifest[id];
  }
}
writeFileSync(manifestPath, JSON.stringify(manifest));
console.log(`NFT targets: ${made} made, ${kept} kept, ${failed} failed, ${Object.keys(manifest).length} in total.`);
