// Paste the Gemini key once, in a terminal, so visitors never have to.
//
//   node scripts/set-gemini-key.mjs
//
// The key is read hidden (nothing is printed). Choose where it goes:
//   1  the live site: saved as the GitHub secret GEMINI_API_KEY of isaacrow/alqami8, then the site is rebuilt with it
//   2  this computer only: saved in .env.local (not committed) for `npm run dev`
//
// The live site runs in the visitor's browser, so a key built into it can be read by anyone who looks at its code.
// Restrict the key in Google Cloud (Credentials → the key → Website restrictions: isaacrow.github.io, API
// restrictions: Generative Language API) and set a budget alert.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'isaacrow/alqami8';

// Node 20 has WebSocket only behind a flag: run again with it.
if (typeof WebSocket === 'undefined') {
  const again = spawnSync(process.execPath, ['--experimental-websocket', '--no-warnings', ...process.argv.slice(1)], { stdio: 'inherit' });
  process.exit(again.status ?? 1);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function ask(question, hidden = false) {
  return new Promise((done) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    let value = '';
    if (hidden && stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.off('data', onData);
          if (hidden && stdin.isTTY) stdin.setRawMode(false);
          stdin.pause();
          process.stdout.write('\n');
          return done(value.trim());
        }
        if (ch === '\u0003') process.exit(1); // Ctrl+C
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
        if (hidden) process.stdout.write(ch === '\u007f' || ch === '\b' ? '\b \b' : '*');
      }
    };
    stdin.on('data', onData);
  });
}

console.log('\nAlqami · Gemini key for the Jawahiri character\n');
const key = await ask('Paste the Gemini key (it stays hidden) and press Enter: ', true);
if (!/^AIza[0-9A-Za-z_-]{30,}$/.test(key)) {
  console.error('That does not look like a Gemini key (it should start with AIza). Nothing was saved.');
  process.exit(1);
}

// A real check before saving: open a Live session with the key.
process.stdout.write('Checking the key with Google… ');
const ok = await new Promise((done) => {
  const ws = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(key)}`);
  const timer = setTimeout(() => (ws.close(), done('no answer in 10 s')), 10000);
  ws.onopen = () => ws.send(JSON.stringify({ setup: { model: 'models/gemini-3.8-live', generationConfig: { responseModalities: ['AUDIO'] } } }));
  ws.onmessage = async (e) => {
    const text = typeof e.data === 'string' ? e.data : await new Response(e.data).text();
    if (text.includes('setupComplete')) (clearTimeout(timer), ws.close(), done(true));
  };
  ws.onclose = (e) => (clearTimeout(timer), done(e.reason || `closed (${e.code})`));
});
if (ok !== true) {
  console.log('failed.');
  console.error(`Google said: ${ok}\nNothing was saved.`);
  process.exit(1);
}
console.log('it works.');

const where = await ask('\nWhere should it go?\n  1  the live site (isaacrow.github.io/alqami8)\n  2  this computer only (npm run dev)\nChoose 1 or 2: ');

if (where === '2') {
  const envFile = resolve(root, '.env.local');
  const lines = existsSync(envFile) ? readFileSync(envFile, 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('VITE_GEMINI_KEY=')) : [];
  writeFileSync(envFile, [...lines, `VITE_GEMINI_KEY=${key}`, ''].join('\n'));
  console.log('Saved in .env.local (never committed). Restart `npm run dev` to use it.');
} else if (where === '1') {
  const set = spawnSync('gh', ['secret', 'set', 'GEMINI_API_KEY', '--repo', REPO], { input: key, stdio: ['pipe', 'inherit', 'inherit'] });
  if (set.status !== 0) {
    console.error('Could not save the secret. Is the GitHub CLI signed in? (gh auth login)');
    process.exit(1);
  }
  const run = spawnSync('gh', ['workflow', 'run', 'deploy.yml', '--repo', REPO], { stdio: 'inherit' });
  console.log(
    run.status === 0
      ? 'Saved as a GitHub secret, and the site is rebuilding now (about 5 minutes). Visitors can then talk with him without a key.'
      : 'Saved as a GitHub secret. Rebuild the site to use it: gh workflow run deploy.yml --repo ' + REPO
  );
  console.log('Remember: restrict the key to isaacrow.github.io in Google Cloud.');
} else {
  console.log('Nothing was saved.');
}
