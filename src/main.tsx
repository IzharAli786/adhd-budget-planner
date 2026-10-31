import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter/wght.css'
import './styles/app.css'
import { App } from './app/App'
import { applyCachedAppearance } from './app/theme'
import { captureInstallPrompt, isStandalone } from './lib/install'
import { requestPersist } from './lib/storage'
import { installUpdateGuards } from './lib/sw'

// Before React: paint in the user's theme, and catch beforeinstallprompt, which can
// fire before the first render.
applyCachedAppearance()
captureInstallPrompt()
installUpdateGuards()
// Installed apps are usually granted persistence silently; in a tab we ask from Settings.
if (isStandalone()) void requestPersist()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
