import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './app';
import './lib/init-translations';
import { HashRouter as Router } from 'react-router-dom';
import './index.css';
import './themes.css';
import { App as CapacitorApp } from '@capacitor/app';
import type { BackButtonListenerEvent } from '@capacitor/app';

// set up libp2pjs as default
// window.defaultPkcOptions = {libp2pJsClientsOptions: [{key: 'libp2pjs'}]}

// #root is declared in index.html, so the non-null assertion is the standard React entry-point idiom
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>,
);

// add back button in android app
CapacitorApp.addListener('backButton', ({ canGoBack }: BackButtonListenerEvent) => {
  if (canGoBack) {
    window.history.back();
  } else {
    CapacitorApp.exitApp();
  }
});
