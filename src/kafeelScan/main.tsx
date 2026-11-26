import React from 'react';
import ReactDOM from 'react-dom/client';
import '../styles/visionos.css';
import { KafeelScannerApp } from './KafeelScannerApp';
import { startMuseumMode } from '../utils/museumMode';

startMuseumMode();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <KafeelScannerApp />
  </React.StrictMode>
);
