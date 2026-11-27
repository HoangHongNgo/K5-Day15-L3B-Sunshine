import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource/be-vietnam-pro/vietnamese-400.css'
import '@fontsource/be-vietnam-pro/vietnamese-500.css'
import '@fontsource/be-vietnam-pro/vietnamese-700.css'
import '@fontsource/be-vietnam-pro/latin-400.css'
import '@fontsource/be-vietnam-pro/latin-500.css'
import '@fontsource/be-vietnam-pro/latin-700.css'
import App from './App'
import { FavoritesProvider } from './shared/FavoritesContext'
import { WayfinderProvider } from './features/wayfinder/WayfinderContext'
import { AuthProvider } from './features/events/AuthContext'
import { EventsProvider } from './features/events/EventContext'
import './shared/styles/styles.css'
import './shared/styles/glass.css'
import './features/events/events.css'

// Preserve links shared by the old hash-based prototype and the #thu-thap collector shortcut.
if (window.location.hash === '#thu-thap') {
  window.history.replaceState(null, '', '/thu-thap')
} else if (/^#\/(?!\/)/.test(window.location.hash)) {
  const legacy = new URL(window.location.hash.slice(1), window.location.origin)
  if (legacy.origin === window.location.origin) {
    window.history.replaceState(null, '', legacy.pathname + legacy.search + legacy.hash)
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <WayfinderProvider>
        <AuthProvider>
          <FavoritesProvider>
            <EventsProvider>
              <App />
            </EventsProvider>
          </FavoritesProvider>
        </AuthProvider>
      </WayfinderProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
