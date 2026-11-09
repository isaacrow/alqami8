import QRCode from 'qrcode';
import { MoonCardData } from '../moon/readRecord';

/**
 * A printable label for a display case or shelf: a QR code holding the record's Moon catalogue link, the title,
 * and the shelf mark. ALQAMI's scanner opens the record's card from it; any phone camera opens it in Moon.
 */
export async function downloadQrLabel(card: MoonCardData) {
  const W = 900;
  const H = 1200;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const qr = document.createElement('canvas');
  await QRCode.toCanvas(qr, card.opacUrl, { width: 720, margin: 0, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' } });
  ctx.drawImage(qr, (W - 720) / 2, 90);

  ctx.fillStyle = '#111111';
  ctx.textAlign = 'center';
  ctx.direction = card.rtl ? 'rtl' : 'ltr';
  ctx.font = '600 44px "Noto Naskh Arabic", "Segoe UI", system-ui, sans-serif';
  wrap(ctx, card.title, W / 2, 900, W - 120, 56, 2);
  ctx.font = '32px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = '#555555';
  ctx.direction = 'ltr';
  const footer = [card.shelfMarks[0], card.date].filter(Boolean).join('  ·  ');
  if (footer) ctx.fillText(footer, W / 2, 1060);
  ctx.font = '26px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('mooon.site', W / 2, 1130);

  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = `moon-label-${card.id}.png`;
  link.click();
}

// Canvas text does not wrap: break the title into at most `maxLines` lines that fit `width`.
function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lineHeight: number, maxLines: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, maxLines);
  if (lines.length > maxLines) shown[maxLines - 1] = `${shown[maxLines - 1]}…`;
  shown.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
}
