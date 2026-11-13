import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { GEMINI_VOICES, LIVE_MODEL, VoiceSettings } from './liveVoice';

/**
 * A small terminal for pasting keys: paste one or several lines and each is recognised by its shape
 * (AIza… = Google, sk_… = ElevenLabs key, a 20-character ID = ElevenLabs voice), or typed as a command.
 * Keys are saved on this device only and never shown in full again.
 */
type Line = { kind: 'in' | 'ok' | 'err' | 'info'; text: string };

const HELP = [
  'Paste a key and press Enter. Several lines at once work too.',
  '  AIza… or AQ.…         Google Gemini key',
  '  sk_…                  ElevenLabs key',
  '  voice <https://… URL>  his cloned-voice server (voice off = stop using it)',
  '  voice <ElevenLabs voice ID>',
  '  gvoice <name>         Gemini voice: ' + GEMINI_VOICES.map((v) => v.id).join(', '),
  '  status                what is saved (masked)',
  '  test                  check the keys really work',
  '  forget gemini | eleven | all',
  '  clear · help · exit',
];

const mask = (k: string) => (k ? `${k.slice(0, 4)}…${k.slice(-4)} (${k.length} chars)` : '—');

/** Opens a real Live session with the key and waits for the server to accept it. */
function testGemini(key: string, voice: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(key)}`);
    const timer = window.setTimeout(() => (ws.close(), reject(new Error('no answer in 10 s'))), 10000);
    ws.onopen = () =>
      ws.send(JSON.stringify({ setup: { model: LIVE_MODEL, generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } } }));
    ws.onmessage = async (e) => {
      const text = typeof e.data === 'string' ? e.data : await (e.data as Blob).text();
      if (text.includes('setupComplete')) {
        window.clearTimeout(timer);
        ws.close();
        resolve(`Gemini OK: ${LIVE_MODEL.replace('models/', '')} with voice ${voice}`);
      }
    };
    ws.onclose = (e) => {
      window.clearTimeout(timer);
      reject(new Error(e.reason || `closed (${e.code})`));
    };
  });
}

async function testEleven(key: string, voiceId: string): Promise<string> {
  const r = await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`, { headers: { 'xi-api-key': key } });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const v = await r.json();
  return `ElevenLabs OK: voice “${v.name ?? voiceId}”`;
}

export const KeyTerminal: React.FC<{ settings: VoiceSettings; onSave: (s: VoiceSettings) => void; onClose: () => void }> = ({ settings, onSave, onClose }) => {
  const [lines, setLines] = useState<Line[]>([{ kind: 'info', text: 'ALQAMI key terminal. Type help.' }]);
  const [input, setInput] = useState('');
  const current = useRef(settings);
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    box.current?.scrollTo(0, box.current.scrollHeight);
  }, [lines]);
  useEffect(() => field.current?.focus(), []);

  const print = (...l: Line[]) => setLines((prev) => [...prev, ...l].slice(-200));
  const save = (patch: Partial<VoiceSettings>) => {
    current.current = { ...current.current, ...patch };
    onSave(current.current);
  };

  const run = async (raw: string) => {
    const cmd = raw.trim();
    if (!cmd) return;
    const shown = /^(AIza|AQ.|sk_)/.test(cmd) ? mask(cmd) : cmd.replace(/^(\S+\s+)(\S{12,})$/, (_, a, b) => a + mask(b));
    print({ kind: 'in', text: `$ ${shown}` });
    const [word, ...rest] = cmd.split(/\s+/);
    const arg = rest.join(' ');
    const s = current.current;

    if (/^(AIza[0-9A-Za-z_-]{20,}|AQ.[0-9A-Za-z_.-]{20,})$/.test(cmd)) return save({ geminiKey: cmd }), print({ kind: 'ok', text: 'Gemini key saved. Type test to check it.' });
    if (/^sk_[0-9a-f]{20,}$/i.test(cmd)) return save({ elevenKey: cmd }), print({ kind: 'ok', text: 'ElevenLabs key saved. Add the voice: voice <ID>' });
    if (/^[0-9A-Za-z]{20}$/.test(cmd)) return save({ elevenVoiceId: cmd }), print({ kind: 'ok', text: 'ElevenLabs voice ID saved.' });

    switch (word.toLowerCase()) {
      case 'help':
        return print(...HELP.map((text) => ({ kind: 'info' as const, text })));
      case 'clear':
        return setLines([]);
      case 'exit':
      case 'close':
        return onClose();
      case 'gemini':
        return arg ? (save({ geminiKey: arg }), print({ kind: 'ok', text: 'Gemini key saved.' })) : print({ kind: 'err', text: 'usage: gemini <key>' });
      case 'eleven':
      case 'elevenlabs':
        return arg ? (save({ elevenKey: arg }), print({ kind: 'ok', text: 'ElevenLabs key saved.' })) : print({ kind: 'err', text: 'usage: eleven <key>' });
      case 'voice':
        if (/^https?:\/\//i.test(arg)) return save({ voiceServer: arg.replace(/\/+$/, '') }), print({ kind: 'ok', text: 'Cloned-voice server saved. Type test to check it.' });
        if (arg.toLowerCase() === 'off') return save({ voiceServer: '' }), print({ kind: 'ok', text: 'Cloned-voice server off.' });
        return arg ? (save({ elevenVoiceId: arg }), print({ kind: 'ok', text: 'ElevenLabs voice ID saved.' })) : print({ kind: 'err', text: 'usage: voice <server URL> | voice <ElevenLabs voice ID> | voice off' });
      case 'gvoice': {
        const v = GEMINI_VOICES.find((g) => g.id.toLowerCase() === arg.toLowerCase());
        return v ? (save({ geminiVoice: v.id }), print({ kind: 'ok', text: `Gemini voice: ${v.id}` })) : print({ kind: 'err', text: `pick one of: ${GEMINI_VOICES.map((g) => g.id).join(', ')}` });
      }
      case 'status':
        return print(
          { kind: 'info', text: `gemini key   ${mask(s.geminiKey)}` },
          { kind: 'info', text: `gemini voice ${s.geminiVoice}` },
          { kind: 'info', text: `eleven key   ${mask(s.elevenKey)}` },
          { kind: 'info', text: `eleven voice ${s.elevenVoiceId || '—'}` },
          { kind: 'info', text: `voice server ${s.voiceServer || '—'}` },
          { kind: 'info', text: s.voiceServer ? 'He speaks with his cloned voice (Gemini’s voice if the server is down).' : s.elevenKey && s.elevenVoiceId ? 'He speaks with the ElevenLabs voice.' : 'He speaks with the Gemini voice.' }
        );
      case 'forget': {
        const which = arg.toLowerCase();
        if (which === 'gemini' || which === 'all') save({ geminiKey: '' });
        if (which === 'eleven' || which === 'all') save({ elevenKey: '', elevenVoiceId: '' });
        return print(['gemini', 'eleven', 'all'].includes(which) ? { kind: 'ok', text: `Forgot ${which}.` } : { kind: 'err', text: 'usage: forget gemini | eleven | all' });
      }
      case 'test': {
        if (s.voiceServer) {
          print({ kind: 'info', text: 'Testing the voice server…' });
          try {
            const r = await fetch(`${s.voiceServer}/health`, { signal: AbortSignal.timeout(5000) });
            const j = await r.json();
            print({ kind: 'ok', text: `Voice server OK: ${j.ref ?? ''} at ${j.rate ?? '?'} Hz` });
          } catch (e) {
            print({ kind: 'err', text: `Voice server not reachable: ${(e as Error).message}` });
          }
        }
        if (!s.geminiKey) print({ kind: 'err', text: 'No Gemini key yet. Paste it first.' });
        else {
          print({ kind: 'info', text: 'Testing Gemini…' });
          try {
            print({ kind: 'ok', text: await testGemini(s.geminiKey, s.geminiVoice) });
          } catch (e) {
            print({ kind: 'err', text: `Gemini failed: ${(e as Error).message}` });
          }
        }
        if (s.elevenKey && s.elevenVoiceId) {
          print({ kind: 'info', text: 'Testing ElevenLabs…' });
          try {
            print({ kind: 'ok', text: await testEleven(s.elevenKey, s.elevenVoiceId) });
          } catch (e) {
            print({ kind: 'err', text: `ElevenLabs failed: ${(e as Error).message}` });
          }
        }
        return;
      }
      default:
        return print({ kind: 'err', text: `Not a key or command I know: ${word}. Type help.` });
    }
  };

  const submit = async () => {
    const text = input;
    setInput('');
    for (const line of text.split(/\r?\n/)) await run(line);
  };

  const color: Record<Line['kind'], string> = { in: 'text-white', ok: 'text-emerald-400', err: 'text-rose-400', info: 'text-white/60' };

  return (
    <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center" dir="ltr" onClick={onClose}>
      <div className="w-full sm:max-w-xl h-[70vh] sm:h-[460px] flex flex-col rounded-t-2xl sm:rounded-2xl bg-[#0b0b0b] border border-white/15 font-mono text-[12.5px] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-3 h-9 border-b border-white/10 bg-white/5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="flex-1 text-center text-white/50 text-[11px]">keys — saved on this device only</span>
          <button onClick={onClose} aria-label="Close" className="text-white/60">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div ref={box} className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5 select-text" onClick={() => field.current?.focus()}>
          {lines.map((l, i) => (
            <pre key={i} className={`whitespace-pre-wrap break-all ${color[l.kind]}`}>
              {l.text}
            </pre>
          ))}
        </div>
        <form
          className="flex items-start gap-2 px-3 py-2 border-t border-white/10 pb-[calc(env(safe-area-inset-bottom)+8px)]"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <span className="text-emerald-400 leading-6">$</span>
          <textarea
            ref={field}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            placeholder="paste a key, or type help"
            className="flex-1 resize-none bg-transparent text-white outline-none leading-6 text-[16px] sm:text-[12.5px] placeholder:text-white/30"
          />
          <button className="h-7 px-3 rounded-md bg-emerald-500 text-black font-semibold text-[12px]">Enter</button>
        </form>
      </div>
    </div>
  );
};
