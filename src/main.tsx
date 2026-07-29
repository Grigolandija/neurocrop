import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import './index.css'
import App from './App.tsx'
import ClerkSessionBridge from './components/ClerkSessionBridge.tsx'

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

// Remove registrations and caches left by the retired PWA experiment. This
// keeps the website network-first while existing visitors migrate naturally.
if ('serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations()
    .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
}
if ('caches' in window) {
  void caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('neurocrop-')).map((key) => caches.delete(key))))
}

createRoot(document.getElementById('root')!).render(
  publishableKey
    ? (
      <ClerkProvider publishableKey={publishableKey}>
        <ClerkSessionBridge>{application}</ClerkSessionBridge>
      </ClerkProvider>
    )
    : application,
)
