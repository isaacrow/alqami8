import { assetUrl } from '../utils/assetUrl';

/**
 * The page that shows a 3D model in the visitor's room: Apple AR Quick Look on iPhone, iPad and Vision Pro (a USDZ
 * made from the model on the spot), Scene Viewer or WebXR on Android and headsets. <model-viewer> picks the mode.
 */
export function roomViewUrl(modelUrl: string, title: string): string {
  return `${assetUrl('/immersive-ar.html')}?model=${encodeURIComponent(assetUrl(modelUrl))}&title=${encodeURIComponent(title)}`;
}
