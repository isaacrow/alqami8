import React from 'react';
import ReactDOM from 'react-dom/client';
import { CharacterApp } from './CharacterApp';
import './character.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CharacterApp />
  </React.StrictMode>
);
