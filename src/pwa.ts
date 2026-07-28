import { neurocropApi } from './services/api/neurocropApi'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let installPrompt: InstallPromptEvent | null = null
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

export function initializePwa() {
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    installPrompt = event as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    installPrompt = null
    notify()
  })
  void navigator.serviceWorker.register('/sw.js', { scope: '/' })
}

export function subscribePwaState(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function canInstallPwa() {
  return Boolean(installPrompt)
}

export function isStandalonePwa() {
  return window.matchMedia('(display-mode: standalone)').matches
    || ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
}

export function needsManualIosInstall() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !isStandalonePwa()
}

export async function installPwa() {
  if (!installPrompt) return false
  await installPrompt.prompt()
  const choice = await installPrompt.userChoice
  if (choice.outcome === 'accepted') installPrompt = null
  notify()
  return choice.outcome === 'accepted'
}

function base64UrlToBytes(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const decoded = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0))
}

export async function enablePushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    throw new Error('Push notifications are not supported on this device.')
  }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notification permission was not granted.')
  const config = await neurocropApi.getPushConfig() as { enabled?: boolean; publicKey?: string }
  if (!config.enabled || !config.publicKey) throw new Error('Push notifications are not configured on the server.')
  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToBytes(config.publicKey),
  })
  await neurocropApi.savePushSubscription(subscription.toJSON() as Record<string, unknown>)
  return true
}

export async function disablePushNotifications() {
  if (!('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return
  await neurocropApi.deletePushSubscription(subscription.endpoint)
  await subscription.unsubscribe()
}

export async function pushNotificationState() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported' as const
  const registration = await navigator.serviceWorker.ready
  return await registration.pushManager.getSubscription() ? 'enabled' as const : 'disabled' as const
}
