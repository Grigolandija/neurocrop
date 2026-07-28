import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import './index.css'
import App from './App.tsx'
import ClerkSessionBridge from './components/ClerkSessionBridge.tsx'
import { initializePwa } from './pwa.ts'

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

const publishableKey = String(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '').trim()
const application = <App />

initializePwa()

createRoot(document.getElementById('root')!).render(
  publishableKey
    ? (
      <ClerkProvider publishableKey={publishableKey}>
        <ClerkSessionBridge>{application}</ClerkSessionBridge>
      </ClerkProvider>
    )
    : application,
)
