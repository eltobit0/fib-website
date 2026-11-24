import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Side-effect import that must run before React mounts: it stamps `data-saver` on <html> before the first frame.
import './config/power.js'
import App from './App.jsx'
import unicodeItems from '@resources/unicodeItems.json'
import { IMAGE_BASE_URL } from './config/constants'

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('[SW] Registered'))
        .catch(err => console.error('[SW] Registration failed:', err));
}

const mainItems = unicodeItems
    .filter(item => !item.material.endsWith('_tabChat'))
    .map(item => item.material.toLowerCase());

const randomItem = mainItems[Math.floor(Math.random() * mainItems.length)];
const faviconUrl = `${IMAGE_BASE_URL}/${randomItem}.png`;

const link = document.querySelector("link[rel~='icon']") || document.createElement('link');
link.rel = 'icon';
link.href = faviconUrl;
document.head.appendChild(link);

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <App />
    </StrictMode>,
)