import type { ReactNode } from 'react'
import { translateInterfaceText as tx } from '../i18n'
import '../styles/structure-workspace.css'

export function StructureHeader({ className, title, description, action, eyebrow = tx('Workspace structure') }: {
  className: string; title: string; description: string; action: ReactNode; eyebrow?: string
}) {
  return <header className={`nc-structure-head ${className}`}>
    <div><p>{eyebrow}</p><h1>{title}</h1><span>{description}</span></div>
    <div className="nc-structure-head-action">{action}</div>
  </header>
}

type SummaryItem = { label: string; value: number; active?: boolean; tone?: 'attention'; onClick?: () => void }

export function StructureSummary({ className, label, items, loading }: {
  className: string; label: string; items: SummaryItem[]; loading: boolean
}) {
  return <section className={`nc-structure-summary ${className}`} aria-label={label} aria-busy={loading}>
    {items.map(item => {
      const content = <><strong>{loading ? '—' : item.value}</strong><span>{item.label}</span></>
      const className = `${item.active ? 'active' : ''} ${item.tone || ''}`
      return item.onClick
        ? <button type="button" key={item.label} className={className} aria-pressed={Boolean(item.active)}
          disabled={loading} onClick={item.onClick}>{content}</button>
        : <div key={item.label} className={className}>{content}</div>
    })}
  </section>
}

export function StructureFooter({ visible, total, noun, onReset }: {
  visible: number; total: number; noun: string; onReset?: () => void
}) {
  return <footer className="nc-structure-footer">
    <span>{tx('Showing')} <strong>{visible}</strong> {tx('of')} {total} {noun}</span>
    {onReset ? <button type="button" onClick={onReset}><i className="fa-solid fa-filter-circle-xmark" aria-hidden="true" />{tx('Clear filters')}</button> : null}
  </footer>
}
