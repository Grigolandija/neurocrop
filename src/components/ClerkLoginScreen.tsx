import { SignIn } from '@clerk/react'
import { useInterfaceLanguage } from '../i18n'

export default function ClerkLoginScreen() {
  const { language, setLanguage, t } = useInterfaceLanguage()

  return (
    <main className="login-screen">
      <div className="login-layout">
        <aside className="login-aside">
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-white/12 text-xl text-[#f5c26b] ring-1 ring-white/16"><i className="fa-solid fa-seedling" /></div>
          <p className="mt-10 text-xs font-bold uppercase tracking-[0.30em] text-white/58">NeuroCrop</p>
          <h1 className="mt-3 max-w-sm font-display text-4xl font-bold leading-tight">{t('Know what your crop needs next.')}</h1>
          <p className="mt-5 max-w-sm text-sm leading-7 text-white/70">{t('A single workspace for live growing conditions, section history, alerts, and sensor health.')}</p>
          <div className="relative mt-12 flex items-center gap-3 text-sm font-semibold text-white/76"><span className="h-2.5 w-2.5 rounded-full bg-[#88c69f]" />{t('Workspace access')}</div>
        </aside>
        <section className="login-form-panel clerk-login-panel" aria-label={t('Sign in to NeuroCrop')}>
          <div className="language-switch login-language-switch" role="group" aria-label={t('Language')}>
            <button type="button" data-language-option="lt" data-active={language === 'lt'} aria-pressed={language === 'lt'} onClick={() => setLanguage('lt')}>LT</button>
            <button type="button" data-language-option="en" data-active={language === 'en'} aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button>
          </div>
          <SignIn
            routing="hash"
            appearance={{
              variables: {
                colorPrimary: '#1f6b54',
                borderRadius: '0.9rem',
                fontFamily: 'inherit',
              },
              elements: {
                rootBox: 'clerk-login-root',
                cardBox: 'clerk-login-card-box',
                card: 'clerk-login-card',
                footer: 'clerk-login-footer',
                formButtonPrimary: 'clerk-login-primary-button',
              },
            }}
          />
        </section>
      </div>
    </main>
  )
}
