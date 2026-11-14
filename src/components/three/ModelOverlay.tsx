import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

/** <model-viewer> (public/js): the same viewer as the AR page; AR Quick Look on iPhone, Scene Viewer on Android. */
let viewerLoading: Promise<void> | null = null;
export function loadModelViewer() {
  viewerLoading ??= new Promise((resolve, reject) => {
    if (customElements.get('model-viewer')) return resolve();
    const s = document.createElement('script');
    s.type = 'module';
    s.src = new URL('js/model-viewer.min.js', new URL(import.meta.env.BASE_URL || './', location.href)).href;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('model-viewer'));
    document.head.appendChild(s);
  });
  return viewerLoading;
}

/** A 3D object over the whole screen: turn it with a finger, or place it in the room (AR). */
export const ModelOverlay: React.FC<{ model: string; title: string; onClose: () => void }> = ({ model, title, onClose }) => {
  useEffect(() => {
    void loadModelViewer().catch(() => undefined);
  }, []);
  return createPortal(
    <div dir="rtl" className="fixed inset-0 z-[260] bg-[#0c0a09] text-white flex flex-col">
      <div className="flex items-center gap-3 p-4 pt-[calc(env(safe-area-inset-top)+12px)]">
        <p className="flex-1 text-[16px] font-semibold leading-snug" dir="auto">
          {title}
        </p>
        <button onClick={onClose} aria-label="Close" className="w-11 h-11 rounded-full bg-white/12 text-[18px]">
          ✕
        </button>
      </div>
      {React.createElement(
        'model-viewer',
        {
          src: model,
          alt: title,
          'camera-controls': true,
          'touch-action': 'pan-y',
          'auto-rotate': true,
          'shadow-intensity': '1',
          exposure: '1.05',
          'environment-image': 'neutral',
          ar: true,
          'ar-modes': 'quick-look scene-viewer webxr',
          'ar-scale': 'auto',
          style: { flex: 1, width: '100%', background: 'radial-gradient(circle at 50% 40%, #2a2420, #0c0a09)' },
        },
        <button
          slot="ar-button"
          className="absolute bottom-[calc(env(safe-area-inset-bottom)+20px)] inset-x-4 h-14 rounded-full bg-[#FFD60A] text-black text-[16px] font-semibold"
        >
          ضعها في مكانك · View in your space (AR)
        </button>
      )}
    </div>,
    document.body
  );
};
