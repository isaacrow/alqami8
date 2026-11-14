import React, { useState, useEffect, useRef } from 'react';
import { useMotionValue, animate, motion, AnimatePresence } from 'motion/react';
import { AlqamiArtifact } from '../../data/alqamiArtifacts';
import { assetUrl } from '../../utils/assetUrl';
import { spatialSound } from '../../utils/spatialSound';

interface AlqamiDuoFoldProps {
  currentArtifact: AlqamiArtifact;
  isFolding: boolean;
  foldDirection: 1 | -1; // 1 = next, -1 = prev
  onFoldComplete?: () => void;
  className?: string;
  children: React.ReactNode;
}

/**
 * AlqamiDuoFoldTransition
 * Full-stage dual-panel mechanical hinge door transition inspired by Kareem-AEz/iphone-duo-fold-carousel.
 * 
 * - Seamlessly fills the full viewport.
 * - Colors match the stone-gray museum background (#CBC9C5) to eliminate border seams.
 * - Smooth crossfade between interactive 3D model and crisp 2D folding leaves.
 */
export const AlqamiDuoFoldTransition: React.FC<AlqamiDuoFoldProps> = ({
  currentArtifact,
  isFolding,
  foldDirection,
  onFoldComplete,
  className = '',
  children,
}) => {
  const [outgoingArtifact, setOutgoingArtifact] = useState<AlqamiArtifact>(currentArtifact);
  const [animating, setAnimating] = useState(false);
  const [show3D, setShow3D] = useState(true);

  const prevArtifactIdRef = useRef(currentArtifact.id);

  useEffect(() => {
    if (isFolding && currentArtifact.id !== prevArtifactIdRef.current) {
      setAnimating(true);
      setShow3D(false);
      spatialSound.playSnap();

      const timer = setTimeout(() => {
        setOutgoingArtifact(currentArtifact);
        setAnimating(false);
        prevArtifactIdRef.current = currentArtifact.id;
        onFoldComplete?.();
        // Fade interactive 3D model back in
        setTimeout(() => {
          setShow3D(true);
        }, 60);
      }, 540);

      return () => clearTimeout(timer);
    } else {
      prevArtifactIdRef.current = currentArtifact.id;
      setOutgoingArtifact(currentArtifact);
    }
  }, [isFolding, currentArtifact, onFoldComplete]);

  return (
    <div
      style={{ perspective: '1200px' }}
      className={`relative w-full h-full flex items-center justify-center overflow-hidden select-none ${className}`}
    >
      {/* 1. Full-Stage Mechanical Duo Door Fold Transition */}
      <AnimatePresence mode="wait">
        {animating && (
          <motion.div
            key={`fold-${outgoingArtifact.id}-to-${currentArtifact.id}-${foldDirection}`}
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center p-2"
          >
            {/* The 2-Panel Folding Chassis */}
            <div className="relative w-full h-full flex rounded-2xl overflow-hidden shadow-inner">
              {/* Central Physical Metallic Hinge Hairline */}
              <div className="absolute top-0 bottom-0 left-1/2 w-[1.5px] -translate-x-1/2 z-40 bg-gradient-to-b from-stone-400 via-stone-200 to-stone-400 shadow-[0_0_4px_rgba(0,0,0,0.3)] pointer-events-none" />

              {/* Left Door Leaf */}
              <motion.div
                initial={{
                  rotateY: foldDirection === 1 ? 0 : -88,
                  scale: foldDirection === 1 ? 1 : 0.95,
                  z: foldDirection === 1 ? 0 : -30,
                }}
                animate={{
                  rotateY: foldDirection === 1 ? -88 : 0,
                  scale: foldDirection === 1 ? 0.95 : 1,
                  z: foldDirection === 1 ? -30 : 0,
                }}
                transition={{
                  duration: 0.52,
                  ease: [0.22, 1, 0.36, 1],
                }}
                style={{
                  transformOrigin: 'right center',
                  transformStyle: 'preserve-3d',
                }}
                className="w-1/2 h-full relative overflow-hidden bg-[#CBC9C5]"
              >
                {/* Outgoing or Incoming Left Half Image */}
                <div className="w-[200%] h-full absolute left-0 flex items-center justify-center p-6">
                  <img
                    src={assetUrl(foldDirection === 1 ? outgoingArtifact.image : currentArtifact.image)}
                    alt="Artifact preview"
                    className="max-w-[70%] max-h-[70%] object-contain filter drop-shadow-[0_16px_28px_rgba(0,0,0,0.3)]"
                  />
                </div>
                {/* Crease shadow gradient */}
                <motion.div
                  initial={{ opacity: foldDirection === 1 ? 0 : 0.5 }}
                  animate={{ opacity: foldDirection === 1 ? 0.5 : 0 }}
                  transition={{ duration: 0.5 }}
                  className="absolute inset-0 bg-gradient-to-r from-transparent to-black/40 pointer-events-none"
                />
              </motion.div>

              {/* Right Door Leaf */}
              <motion.div
                initial={{
                  rotateY: foldDirection === 1 ? 88 : 0,
                  scale: foldDirection === 1 ? 0.95 : 1,
                  z: foldDirection === 1 ? -30 : 0,
                }}
                animate={{
                  rotateY: foldDirection === 1 ? 0 : 88,
                  scale: foldDirection === 1 ? 1 : 0.95,
                  z: foldDirection === 1 ? 0 : -30,
                }}
                transition={{
                  duration: 0.52,
                  ease: [0.22, 1, 0.36, 1],
                }}
                style={{
                  transformOrigin: 'left center',
                  transformStyle: 'preserve-3d',
                }}
                className="w-1/2 h-full relative overflow-hidden bg-[#CBC9C5]"
              >
                {/* Incoming or Outgoing Right Half Image */}
                <div className="w-[200%] h-full absolute right-0 flex items-center justify-center p-6">
                  <img
                    src={assetUrl(foldDirection === 1 ? currentArtifact.image : outgoingArtifact.image)}
                    alt="Artifact preview"
                    className="max-w-[70%] max-h-[70%] object-contain filter drop-shadow-[0_16px_28px_rgba(0,0,0,0.3)]"
                  />
                </div>
                {/* Crease shadow gradient */}
                <motion.div
                  initial={{ opacity: foldDirection === 1 ? 0.5 : 0 }}
                  animate={{ opacity: foldDirection === 1 ? 0 : 0.5 }}
                  transition={{ duration: 0.5 }}
                  className="absolute inset-0 bg-gradient-to-l from-transparent to-black/40 pointer-events-none"
                />
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Interactive Real 3D Model Stage */}
      <div
        className={`w-full h-full relative flex items-center justify-center transition-opacity duration-280 ease-out ${
          show3D && !animating ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {children}
      </div>

      {/* 3. Static Picture fallback backdrop under 3D (prevent any flash when 3D unmounts) */}
      {!animating && !show3D && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-6 animate-fadeIn">
          <img
            src={assetUrl(currentArtifact.image)}
            alt={currentArtifact.title.en}
            className="max-w-[70%] max-h-[70%] object-contain filter drop-shadow-[0_16px_28px_rgba(0,0,0,0.3)]"
          />
        </div>
      )}
    </div>
  );
};
