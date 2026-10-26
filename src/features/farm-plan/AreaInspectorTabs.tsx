export type AreaInspectorSection = 'size' | 'position' | 'cultivation' | 'settings'

const sections: AreaInspectorSection[] = ['size', 'position', 'cultivation', 'settings']

export default function AreaInspectorTabs({ section, idPrefix, lt, onChange }: {
  section: AreaInspectorSection
  idPrefix: string
  lt: boolean
  onChange: (section: AreaInspectorSection) => void
}) {
  const labels = {
    size: lt ? 'Matmenys' : 'Dimensions',
    position: lt ? 'Padėtis' : 'Position',
    cultivation: lt ? 'Auginimas' : 'Cultivation',
    settings: lt ? 'Nustatymai' : 'Settings',
  }

  return <nav className="gh-inspector-tabs" role="tablist" aria-label={lt ? 'Area savybės' : 'Area properties'}>
    {sections.map((item, index) => <button
      type="button" role="tab" key={item}
      id={`${idPrefix}-tab-${item}`} aria-controls={`${idPrefix}-panel-${item}`}
      aria-selected={section === item} tabIndex={section === item ? 0 : -1}
      onClick={() => onChange(item)}
      onKeyDown={event => {
        const next = event.key === 'ArrowRight' ? sections[(index + 1) % sections.length]
          : event.key === 'ArrowLeft' ? sections[(index + sections.length - 1) % sections.length]
          : event.key === 'Home' ? sections[0] : event.key === 'End' ? sections.at(-1) : null
        if (!next) return
        event.preventDefault()
        onChange(next)
        document.getElementById(`${idPrefix}-tab-${next}`)?.focus()
      }}
    >{labels[item]}</button>)}
  </nav>
}
