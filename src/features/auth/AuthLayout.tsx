import type { ReactNode } from 'react'

type AuthLayoutProps = {
  eyebrow: string
  title: string
  description: string
  panelTitleId: string
  panelTitle: string
  panelDescription: string
  children: ReactNode
}

export function AuthLayout(props: AuthLayoutProps) {
  return (
    <main className="login-screen">
      <div className="login-layout">
        <aside className="login-aside">
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-white/12 text-xl text-[#f5c26b] ring-1 ring-white/16">NC</div>
          <p className="mt-10 text-xs font-bold uppercase tracking-[0.30em] text-white/58">NeuroCrop</p>
          <h1 className="mt-3 max-w-sm font-display text-4xl font-bold leading-tight">{props.title}</h1>
          <p className="mt-5 max-w-sm text-sm leading-7 text-white/70">{props.description}</p>
        </aside>
        <section className="login-form-panel" aria-labelledby={props.panelTitleId}>
          <p className="text-xs font-bold uppercase tracking-[0.26em] text-pine/52">{props.eyebrow}</p>
          <h1 id={props.panelTitleId} className="mt-3 font-display text-3xl font-bold text-ink">{props.panelTitle}</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-ink/60">{props.panelDescription}</p>
          {props.children}
        </section>
      </div>
    </main>
  )
}

export function BackToSignIn() {
  return <button type="button" className="mt-6 text-sm font-semibold text-pine underline underline-offset-4" onClick={() => window.location.assign('/')}>Back to sign in</button>
}
