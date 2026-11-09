/**
 * Whether a camera scanner is open. The scanner (camera, barcode reader, recognition model) is the heaviest thing
 * ALQAMI does on a phone, so 3D viewers stop while it is open and start again when it closes.
 */
let open = false;
const listeners = new Set<(open: boolean) => void>();

export function isScannerOpen() {
  return open;
}

export function setScannerOpen(next: boolean) {
  if (next === open) return;
  open = next;
  listeners.forEach((l) => l(open));
}

/** Calls back on every change; returns the unsubscribe function. */
export function onScannerChange(listener: (open: boolean) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
