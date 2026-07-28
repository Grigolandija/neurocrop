import { useClerk } from '@clerk/react'
import { useInterfaceLanguage } from '../../i18n'

export default function ClerkSecuritySettings() {
  const { openUserProfile } = useClerk()
  const { language } = useInterfaceLanguage()
  const lt = language === 'lt'

  return (
    <div className="nc-settings-flow">
      <div className="nc-settings-security-grid">
        <section className="nc-settings-card">
          <header>
            <div>
              <h3>{lt ? 'Keisti slaptažodį' : 'Change password'}</h3>
              <p>{lt ? 'Atidarykite saugius paskyros nustatymus ir pasirinkite Security → Password.' : 'Open secure account settings and choose Security → Password.'}</p>
            </div>
          </header>
          <button className="nc-settings-button primary" type="button" onClick={() => openUserProfile()}>
            <i className="fa-solid fa-key" />{lt ? 'Atidaryti slaptažodžio nustatymus' : 'Open password settings'}
          </button>
        </section>
        <section className="nc-settings-card">
          <header>
            <div>
              <h3>{lt ? 'Aktyvios sesijos' : 'Active sessions'}</h3>
              <p>{lt ? 'Peržiūrėkite įrenginius ir atsijunkite nuo sesijų, kurių neatpažįstate.' : 'Review devices and sign out sessions you no longer recognize.'}</p>
            </div>
          </header>
          <button className="nc-settings-button" type="button" onClick={() => openUserProfile()}>
            <i className="fa-solid fa-display" />{lt ? 'Tvarkyti aktyvias sesijas' : 'Manage active sessions'}
          </button>
        </section>
      </div>
    </div>
  )
}
