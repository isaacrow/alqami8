// Sheikh al-Waili's lectures as short passages the app can search: YouTube's automatic Arabic captions (SRT, one
// file per lecture) → passages of about a minute, each with its lecture and the second it starts at.
//
//   node scripts/waili-lectures.mjs <folder with srt/ and summary.json> [public/characters/waili-lectures.json]
//
// The captions are machine transcriptions: words are often misheard, above all in verse and Qur'an. The app shows
// every passage with a link to that moment of the recording, which is the authority, not this text.
import fs from 'node:fs';
import path from 'node:path';

const [src, out = 'public/characters/waili-lectures.json'] = process.argv.slice(2);
if (!src) throw new Error('usage: node scripts/waili-lectures.mjs <transcripts folder> [out.json]');
const summary = JSON.parse(fs.readFileSync(path.join(src, 'summary.json'), 'utf8'));
const byIndex = new Map(summary.videos.filter((v) => v.status === 'Success').map((v) => [v.index, v]));

const sec = (t) => { const [h, m, s] = t.replace(',', '.').split(':').map(Number); return h * 3600 + m * 60 + s; };
const arabic = (s) => (s.match(/[؀-ۿ]/g) || []).length > s.length * 0.4;

const lectures = [];
const passages = [];
let skipped = 0;
for (const f of fs.readdirSync(path.join(src, 'srt')).sort()) {
  const index = Number(f.split('_')[0]);
  const meta = byIndex.get(index);
  const txt = fs.readFileSync(path.join(src, 'txt', f.replace(/\.srt$/, '.txt')), 'utf8');
  // A few lectures came back as "English (auto-generated)": Arabic speech heard as English, i.e. noise. Left out.
  if (!/^Language: Arabic/m.test(txt)) { skipped++; continue; }
  const id = meta?.id ?? (txt.match(/^Video ID: (.*)$/m) || [])[1];
  const title = (meta?.title ?? (txt.match(/^Title: (.*)$/m) || [])[1] ?? '').replace(/^\s*(الشيخ\s+احمد\s+الوائلي|Sheikh Ahmed Al-Waeli)\s*[-–]\s*/i, '').trim();
  const cues = fs.readFileSync(path.join(src, 'srt', f), 'utf8').replace(/\r/g, '').split(/\n\n+/).map((b) => {
    const l = b.split('\n');
    const m = (l[1] || '').match(/^(\S+) --> (\S+)/);
    return m ? { s: sec(m[1]), e: sec(m[2]), x: l.slice(2).join(' ').trim() } : null;
  }).filter((c) => c && c.x);
  const text = cues.map((c) => c.x).join(' ');
  if (!id || !arabic(text)) { skipped++; continue; }
  const li = lectures.length;
  lectures.push([id, title]);
  // About a minute each, cut at the end of a sentence when there is one.
  let cur = null;
  let prev = '';
  for (const c of cues) {
    if (c.x === prev) continue; // the captions sometimes repeat a line
    prev = c.x;
    if (!cur) cur = { s: c.s, parts: [] };
    cur.parts.push(c.x);
    const len = c.e - cur.s;
    if ((len >= 50 && /[.!?؟]$/.test(c.x)) || len >= 80) {
      passages.push([li, Math.floor(cur.s), cur.parts.join(' ').replace(/\s+/g, ' ')]);
      cur = null;
    }
  }
  if (cur) passages.push([li, Math.floor(cur.s), cur.parts.join(' ').replace(/\s+/g, ' ')]);
}

const data = {
  about: 'Sheikh Ahmad al-Waili, lectures: YouTube automatic Arabic captions, cut into passages of about a minute. Machine transcription; the recording at the linked second is the authority.',
  source: summary.playlist_url,
  lectures, // [youtube id, title]
  passages, // [lecture index, start second, text]
};
fs.writeFileSync(out, JSON.stringify(data));
const words = passages.reduce((n, p) => n + p[2].split(' ').length, 0);
console.log({ lectures: lectures.length, skipped, passages: passages.length, words, mb: +(fs.statSync(out).size / 1e6).toFixed(2) });
