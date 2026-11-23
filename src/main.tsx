import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource/oswald/latin-500.css';
import '@fontsource/oswald/latin-600.css';
import '@fontsource/oswald/latin-700.css';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { GameProvider } from './lib/store';

// In der Android-App (Capacitor) liegen alle Dateien schon auf dem Handy. Der Offline-Speicher (Service Worker)
// bremst dort nur den Start und zeigt nach einem Update kurz die alte Version. Darum nur im Browser.
const native = !!(window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
if (native) {
  // Android-Zurück-Taste: erst in der App zurück (siehe lib/back.ts), auf Home die App schließen
  void import('@capacitor/app').then(({ App }) => App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back(); else void App.exitApp();
  }));
  void navigator.serviceWorker?.getRegistrations().then((rs) => rs.forEach((r) => void r.unregister()));
  void caches?.keys().then((ks) => ks.forEach((k) => void caches.delete(k)));
} else {
  registerSW({ immediate: true });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GameProvider>
      <App />
    </GameProvider>
  </React.StrictMode>,
);
