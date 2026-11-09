import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/visionos.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Offline support (public/sw.js): the app, Moon records, covers and the recognition model stay usable without signal.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
