import { getInterfaceLanguage } from '../i18n'

type WorkspaceLoadingProps = {
  compact?: boolean
}

export default function WorkspaceLoading({ compact = false }: WorkspaceLoadingProps) {
  const lithuanian = getInterfaceLanguage() === 'lt'
  const content = (
    <section className="app-route-loading-card" role="status" aria-live="polite">
      <span className="app-route-loading-logo" aria-hidden="true">
        <svg viewBox="0 0 32 32" focusable="false">
          <path d="M16 26V13" />
          <path d="M16 16C10 16 6 12 6 6c6 0 10 4 10 10Z" />
          <path d="M16 13c0-5 4-8 10-8 0 6-4 10-10 10Z" />
        </svg>
      </span>
      <span className="app-route-loading-brand">NeuroCrop</span>
      <h1>{lithuanian ? 'Ruošiama darbo aplinka' : 'Preparing your workspace'}</h1>
      <p>
        {lithuanian
          ? 'Kraunamas pasirinktas puslapis ir naujausi jo duomenys.'
          : 'Loading the selected page and its latest data.'}
      </p>
      <span
        className="app-route-loading-progress"
        role="progressbar"
        aria-label={lithuanian ? 'Kraunama' : 'Loading'}
      >
        <span />
      </span>
    </section>
  )

  if (compact) {
    return <div className="app-route-loading app-route-loading--compact" aria-busy="true">{content}</div>
  }

  return <main className="app-route-loading" aria-busy="true">{content}</main>
}
