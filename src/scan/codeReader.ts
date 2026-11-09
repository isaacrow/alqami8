import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

/**
 * Reads QR codes and book barcodes (EAN-13 / ISBN) from the camera.
 *
 * iPhone Safari keeps the built-in BarcodeDetector switched off, so ZXing runs as WebAssembly instead. The
 * .wasm file is served from this site (not a CDN), so scanning works wherever the app loads.
 */

export interface ReadCode {
  text: string;
  format: string;
}

let ready: Promise<unknown> | null = null;

function prepare() {
  ready ??= Promise.resolve(
    prepareZXingModule({
      overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
      fireImmediately: true,
    })
  );
  return ready;
}

export class CodeReader {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d', { willReadFrequently: true });

  /** The first QR code or book barcode in the current video frame, or null. */
  async read(video: HTMLVideoElement): Promise<ReadCode | null> {
    if (!this.ctx || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) return null;
    await prepare();
    // A barcode's bars need resolution; 960 px wide keeps EAN-13 readable at arm's length and the frame cheap.
    const scale = Math.min(1, 960 / video.videoWidth);
    this.canvas.width = Math.round(video.videoWidth * scale);
    this.canvas.height = Math.round(video.videoHeight * scale);
    this.ctx.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);
    const frame = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const [hit] = await readBarcodes(frame, {
      formats: ['QRCode', 'EAN13', 'ISBN'],
      tryHarder: true,
      maxNumberOfSymbols: 1,
    });
    return hit?.isValid ? { text: hit.text.trim(), format: hit.format } : null;
  }

  dispose() {
    this.canvas.width = 0;
    this.canvas.height = 0;
  }
}
