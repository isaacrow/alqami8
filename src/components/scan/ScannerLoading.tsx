import React from 'react';
import { createPortal } from 'react-dom';

/**
 * While the scanner's code arrives: the camera screen's black with a quiet note, over the whole phone. Drawn on the
 * page itself (a portal): inside a spatial window, whose CSS transform traps "fixed", it would stay in the window.
 */
export const ScannerLoading: React.FC = () =>
  createPortal(
    <div className="fixed inset-0 z-[200] bg-black flex items-center justify-center text-white/75 text-[13px]" role="status">
      <span className="w-5 h-5 me-2 rounded-full border-2 border-white/30 border-t-white animate-spin" />
      يفتح الماسح… · Opening the scanner…
    </div>,
    document.body
  );
