// Fix for environment/iframe issue where window.fetch has only a getter and cannot be assigned
try {
  let originalFetch = window.fetch;
  Object.defineProperty(window, 'fetch', {
    get() {
      return originalFetch;
    },
    set(value) {
      originalFetch = value;
    },
    configurable: true,
    enumerable: true,
  });
} catch (e) {
  console.warn('Unable to redefine window.fetch:', e);
}

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
