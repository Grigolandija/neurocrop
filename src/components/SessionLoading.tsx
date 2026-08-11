import { getInterfaceLanguage } from '../i18n'

export default function SessionLoading() {
  const lithuanian = getInterfaceLanguage() === 'lt'

  return (
    <main className="session-loading" aria-busy="true">
      <section className="session-loading-card" role="status" aria-live="polite" aria-label={lithuanian ? 'Tikrinama prisijungimo sesija' : 'Checking sign-in session'}>
        <span className="session-loading-mark" aria-hidden="true"><i className="fa-solid fa-seedling" /></span>
        <strong>NeuroCrop</strong>
        <span className="session-loading-progress" aria-hidden="true"><span /></span>
      </section>
    </main>
  )
}
