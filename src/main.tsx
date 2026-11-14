import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/visionos.css';

// ?camera=<id>: this phone is the camera of ALQAMI on a PC (src/remoteCam); nothing else of the app is loaded.
const cameraFor = new URLSearchParams(location.search).get('camera');
const PhoneCameraPage = lazy(() => import('./remoteCam/PhoneCameraPage'));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {cameraFor ? (
      <Suspense fallback={null}>
        <PhoneCameraPage hostId={cameraFor} />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>
);

// Offline support (public/sw.js): the app, Moon records, covers and the recognition model stay usable without signal.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
