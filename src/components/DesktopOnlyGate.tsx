import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { useInterfaceLanguage } from '../i18n'
import './DesktopOnlyGate.css'

// Mobile workspaces are retired. Include landscape phones, while retaining
// the desktop workspace on tablets and ordinary computer-sized viewports.
const mobileViewport = window.matchMedia('(max-width: 767px), (max-width: 1023px) and (max-height: 500px) and (pointer: coarse)')
const subscribe = (listener: () => void) => {
  mobileViewport.addEventListener('change', listener)
  return () => mobileViewport.removeEventListener('change', listener)
}
const isMobileViewport = () => mobileViewport.matches

function MobileRetirementNotice() {
  const { language, setLanguage } = useInterfaceLanguage()
  const lt = language === 'lt'

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  return (
    <main className="nc-desktop-notice" aria-labelledby="desktop-notice-title">
      <header>
        <span className="nc-desktop-notice-brand">NeuroCrop</span>
        <div className="nc-desktop-notice-language" role="group" aria-label={lt ? 'Kalba' : 'Language'}>
          <button type="button" aria-pressed={lt} onClick={() => setLanguage('lt')}>LT</button>
          <button type="button" aria-pressed={!lt} onClick={() => setLanguage('en')}>EN</button>
        </div>
      </header>
      <section>
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <rect x="5" y="7" width="38" height="27" rx="3" />
          <path d="M17 42h14M24 34v8" />
        </svg>
        <h1 id="desktop-notice-title">{lt ? 'Naudokite NeuroCrop kompiuteryje' : 'Use NeuroCrop on your computer'}</h1>
        <p>{lt ? 'Mobilioji versija nebepalaikoma. Norėdami naudotis sistema, atidarykite neurocrop.lt kompiuterio naršyklėje.' : 'The mobile version is no longer supported. To use the system, open neurocrop.lt in a desktop browser.'}</p>
        <span className="nc-desktop-notice-address">neurocrop.lt</span>
      </section>
      <footer>
        <a href="/es-finansuojamas-projektas">{lt ? 'ES finansuojamas projektas' : 'EU-funded project'}</a>
      </footer>
    </main>
  )
}

export default function DesktopOnlyGate({ children }: { children: ReactNode }) {
  const mobile = useSyncExternalStore(subscribe, isMobileViewport, () => false)
  // Public funding information must remain accessible on every device.
  if (mobile && window.location.pathname !== '/es-finansuojamas-projektas') return <MobileRetirementNotice />
  return children
}
