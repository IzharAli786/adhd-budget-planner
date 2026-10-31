import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter/wght.css'
// Display face for hero numbers and page titles only. The opsz build carries the optical
// size axis, so the same file looks crisp at 28px titles and refined at 76px numbers.
import '@fontsource-variable/fraunces/opsz.css'
import './styles/app.css'
import { App } from './app/App'
import { applyCachedAppearance } from './app/theme'
import { IS_DEMO } from './lib/demo'
import { captureInstallPrompt } from './lib/install'
import { installUpdateGuards } from './lib/sw'

// Before React: paint in the user's theme, and catch beforeinstallprompt, which can
// fire before the first render.
applyCachedAppearance()
// The demo never asks to be installed (PLAN §7).
if (!IS_DEMO) captureInstallPrompt()
installUpdateGuards()
// Storage persistence is requested by the app shell once setup is done (PLAN §6).

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
