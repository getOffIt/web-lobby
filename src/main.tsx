import React from 'react';
import { createRoot } from 'react-dom/client';
import BlockRush from '../BlockRushPage';
import '../block-rush.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BlockRush />
  </React.StrictMode>,
);
