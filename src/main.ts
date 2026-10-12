import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/600.css';
import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { detectDevice } from './core/device';
import { Game } from './game';

/** El service worker sólo se registra fuera de iframes (en itch.io el juego va embebido). */
function registerServiceWorker(game: Game): void {
  const inIframe = window.self !== window.top;
  if (inIframe || !('serviceWorker' in navigator) || !window.isSecureContext) return;
  try {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh: () => game.notifyUpdate(() => void updateSW(true)),
    });
  } catch {
    // Sin service worker el juego funciona igual; sólo se pierde el modo sin conexión.
  }
}

function boot(): void {
  const root = document.getElementById('app');
  if (!root) throw new Error('Falta el contenedor #app');
  const game = new Game(root, detectDevice());
  game.start();
  registerServiceWorker(game);
}

boot();
