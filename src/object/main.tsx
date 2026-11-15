import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/ibm-plex-sans-arabic/arabic-400.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-600.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-700.css';
import './object.css';
import { ObjectPage } from './ObjectPage';
import { LabelSheet } from './LabelSheet';

// object.html: one object's page (opened by its QR label). labels.html: every object's label, to print.
const page = document.body.dataset.page;
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{page === 'labels' ? <LabelSheet /> : <ObjectPage />}</React.StrictMode>);
