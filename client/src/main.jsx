import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Mouse-wheel over a focused <input type=number> quietly changes its value —
// scrolling the page down while the cursor sits on an amount field would nudge
// the amount up or down. Blur the field the moment a wheel event reaches it so
// the page scrolls and the number stays put.
document.addEventListener('wheel', (e) => {
  const el = e.target;
  if (el instanceof HTMLInputElement && el.type === 'number' && el === document.activeElement) {
    el.blur();
  }
}, { passive: true });

// Register the PWA service worker so the app can be installed to the home screen
// with the tree logo as its icon.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
