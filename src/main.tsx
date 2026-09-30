// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { FurnitureProvider } from './context/FurnitureContext';
import './index.css'; // Direct Tailwind CSS imports handler

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FurnitureProvider>
      <App />
    </FurnitureProvider>
  </React.StrictMode>
);
