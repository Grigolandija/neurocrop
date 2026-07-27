import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

declare const __BUILD_VERSION__: string

const staleBuildRecoveryKey = 'neurocrop-stale-build-recovery'

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  try {
    if (sessionStorage.getItem(staleBuildRecoveryKey) === __BUILD_VERSION__) return
    sessionStorage.setItem(staleBuildRecoveryKey, __BUILD_VERSION__)
  } catch {
    // Reload recovery remains safe when browser storage is unavailable.
  }
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <App />,
)
