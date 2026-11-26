import React from 'react';
import ReactDOM from 'react-dom/client';
import '../styles/visionos.css';
import { MuseumLensApp } from './MuseumLensApp';
import { startMuseumMode } from '../utils/museumMode';

startMuseumMode();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MuseumLensApp />
  </React.StrictMode>
);
