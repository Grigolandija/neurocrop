import { useEffect, useState } from 'react'
import { useInterfaceLanguage } from '../i18n'
import {
  canInstallPwa,
  disablePushNotifications,
  enablePushNotifications,
  installPwa,
  isStandalonePwa,
  needsManualIosInstall,
  pushNotificationState,
  subscribePwaState,
} from '../pwa'

type PushState = 'checking' | 'disabled' | 'enabled' | 'unsupported'

export default function PwaControls() {
  const { language } = useInterfaceLanguage()
  const [installable, setInstallable] = useState(canInstallPwa)
  const [pushState, setPushState] = useState<PushState>('checking')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const lt = language === 'lt'

  useEffect(() => subscribePwaState(() => setInstallable(canInstallPwa())), [])
  useEffect(() => {
    let active = true
    void pushNotificationState().then((state) => { if (active) setPushState(state) })
    return () => { active = false }
  }, [])

  async function togglePush() {
    if (busy || pushState === 'unsupported') return
    setBusy(true)
    setMessage('')
    try {
      if (pushState === 'enabled') {
        await disablePushNotifications()
        setPushState('disabled')
        setMessage(lt ? 'Push pranešimai išjungti.' : 'Push notifications disabled.')
      } else {
        await enablePushNotifications()
        setPushState('enabled')
        setMessage(lt ? 'Push pranešimai įjungti.' : 'Push notifications enabled.')
      }
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : (lt ? 'Pranešimų įjungti nepavyko.' : 'Notifications could not be enabled.'))
    } finally {
      setBusy(false)
    }
  }

  async function requestInstall() {
    if (needsManualIosInstall()) {
      setMessage(lt ? 'Safari: spauskite Share, tada „Add to Home Screen“.' : 'Safari: tap Share, then Add to Home Screen.')
      return
    }
    await installPwa()
  }

  return (
    <div className="pwa-controls">
      {(installable || needsManualIosInstall()) && !isStandalonePwa() ? (
        <button type="button" className="pwa-control-button pwa-install-button" onClick={() => void requestInstall()} title={lt ? 'Įdiegti NeuroCrop' : 'Install NeuroCrop'}>
          <i className="fa-solid fa-arrow-down-to-line" />
          <span>{lt ? 'Įdiegti' : 'Install'}</span>
        </button>
      ) : null}
      <button
        type="button"
        className="pwa-control-button"
        data-state={pushState}
        disabled={busy || pushState === 'checking' || pushState === 'unsupported'}
        aria-pressed={pushState === 'enabled'}
        onClick={() => void togglePush()}
        title={pushState === 'enabled' ? (lt ? 'Išjungti push pranešimus' : 'Disable push notifications') : (lt ? 'Įjungti push pranešimus' : 'Enable push notifications')}
      >
        <i className={`fa-solid ${pushState === 'enabled' ? 'fa-bell' : 'fa-bell-slash'}`} />
        <span>{lt ? 'Pranešimai' : 'Notifications'}</span>
      </button>
      {message ? <button type="button" className="pwa-control-message" onClick={() => setMessage('')}>{message}</button> : null}
    </div>
  )
}
