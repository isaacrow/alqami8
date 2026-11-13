# al-Jawahiri's cloned voice

On `jawahiri.html`, Gemini listens and writes his answers. Those answers can be spoken in a clone of his own voice
instead of a Gemini voice. The clone is made by **Chatterbox Multilingual** (Resemble AI, MIT licence, supports
Arabic), which runs for free on the owner's PC graphics card. The page labels it «صوت معاد بناؤه بالذكاء الاصطناعي»
(AI-recreated voice).

When the PC is off, the page notices within 3 seconds and Gemini's own voice speaks instead.

## How it fits together

```
visitor's phone ──mic──▶ Gemini Live ──text of his answer──▶ voice server (owner's PC, GPU) ──PCM──▶ phone speaker
                         (also returns Gemini audio: used only when the voice server is unreachable)
```

- `src/character/liveVoice.ts` reads Gemini's output transcript, cuts it into sentences (and long sentences at a
  comma), and sends each one to `POST /tts`. It plays the 16-bit PCM it gets back in order, and stops at once when
  the visitor interrupts.
- The voice server's address comes from the repo variable `VOICE_SERVER_URL`, built in as `VITE_VOICE_SERVER`. You
  can also set it per device in the page's key terminal (`jawahiri.html#keys`): `voice https://…` or `voice off`.

## The PC side (`D:\jawahiri-voice`, not in this repo)

| File | What it is |
| --- | --- |
| `venv\` | Python 3.11, torch 2.6 (CUDA 12.4), chatterbox-tts 0.1.7, fastapi, uvicorn |
| `full.wav` | the cleaned recording (24 kHz mono). The recording itself is never committed. |
| `prep.py` | finds his voice in the recording (speaker embeddings, two-speaker grouping), cuts 12 s references to `refs\`, and speaks test lines with each into `samples\` |
| `refs\best.wav` | the reference the server uses (copy the one that sounds most like him) |
| `server.py` | `GET /health`, `POST /tts {text, language}` → raw PCM, rate in `X-Sample-Rate`. CORS: isaacrow.github.io and localhost only. Max 400 characters per request. |
| `start-voice.mjs` | starts the server and a Cloudflare quick tunnel, saves the tunnel address as `VOICE_SERVER_URL`, and rebuilds the site |

The C: drive is full, so every cache (`HF_HOME`, `TMP`, pip) is kept on D:. Hugging Face's xet downloader stalls on
this connection, so `HF_HUB_DISABLE_XET=1` is set.

## Every time you want his voice live

```
node D:/jawahiri-voice/start-voice.mjs
```

Keep that window open. The first start takes about 30 s to load the model. The site then rebuilds with the new
tunnel address, which takes about 5 minutes. A quick tunnel gets a new address every time it starts, which is why
the site rebuilds. A named Cloudflare tunnel on your own domain would keep the address fixed.

To test only on this PC: `node D:/jawahiri-voice/start-voice.mjs --local`, then in the page terminal type
`voice http://localhost:8020`.

## Rights

The clone is made from a recording of a real person. Ask his family's permission before using it publicly, and keep
the AI-recreated label.
