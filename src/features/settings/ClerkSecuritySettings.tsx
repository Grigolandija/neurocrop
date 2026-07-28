import { useClerk } from '@clerk/react'

export default function ClerkSecuritySettings() {
  const { openUserProfile } = useClerk()

  return (
    <div className="nc-settings-flow">
      <div className="nc-settings-security-grid">
        <section className="nc-settings-card">
          <header>
            <div>
              <h3>Account security</h3>
              <p>Password recovery, verified email addresses and sign-in methods are protected by Clerk.</p>
            </div>
          </header>
          <button className="nc-settings-button primary" type="button" onClick={() => openUserProfile()}>
            Manage account security
          </button>
        </section>
        <section className="nc-settings-card">
          <header>
            <div>
              <h3>Active sessions</h3>
              <p>Review devices and sign out sessions you no longer recognize in the secure account portal.</p>
            </div>
          </header>
          <button className="nc-settings-button" type="button" onClick={() => openUserProfile()}>
            Review active sessions
          </button>
        </section>
      </div>
    </div>
  )
}
