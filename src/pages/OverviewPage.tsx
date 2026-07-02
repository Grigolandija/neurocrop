import { metricDefinitions } from '../data/mock'
import type { Block, Location, MetricDefinition, ViewMode } from '../types'

type Props = {
  locations: Location[]
  blocks: Block[]
  activeBlock: Block
  mode: ViewMode
  onMode: (mode: ViewMode) => void
  onBlock: (id: string) => void
}

function formatValue(value: number | undefined, metric: MetricDefinition) {
  if (value === undefined) return '—'
  const decimals = metric.unit === 'ppm' || metric.unit === 'lx' ? 0 : metric.unit === '%' ? 0 : 1
  return `${value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${metric.unit}`
}

export function OverviewPage({ locations, blocks, activeBlock, mode, onMode, onBlock }: Props) {
  const location = locations.find((item) => item.id === activeBlock.locationId)
  const sectionsInArea = blocks.filter((section) => section.locationId === activeBlock.locationId)
  const installed = metricDefinitions.filter((metric) => activeBlock.installedMetrics.includes(metric.key))
  const results = installed.map((metric) => {
    const value = activeBlock.readings[metric.key]
    const state = value !== undefined && value >= metric.target[0] && value <= metric.target[1] ? 'optimal' : 'warning'
    return { metric, value, state }
  })
  const nonOptimal = results.filter((item) => item.state !== 'optimal')
  const score = Math.max(0, 100 - nonOptimal.length * 35)
  const state = score < 55 ? 'critical' : score < 90 ? 'warning' : 'optimal'
  const primary = nonOptimal[0]
  const excluded = metricDefinitions.length - installed.length

  function chooseArea(areaId: string) {
    onBlock(blocks.find((section) => section.locationId === areaId)?.id || activeBlock.id)
  }

  return <section id="heroStatusPanel" data-state={state} className="surface hero-panel section-jump-target rounded-[40px] p-4 md:p-6 lg:p-7">
    <div className="hero-content-grid grid gap-8">
      <div className="hero-main-stack min-w-0">
        <div className="hero-top-row flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="w-full">
            <div className="selection-panel">
              <div className="selection-panel-head">
                <div><p className="selection-panel-kicker">Selected growing space</p><p className="selection-panel-summary">Change the area or section when you want to inspect another place.</p></div>
                <div className="scope-toggle" role="tablist" aria-label="Growth index scope"><button type="button" className="scope-toggle-button" data-active="true">Section</button><button type="button" className="scope-toggle-button" data-active="false">Area</button></div>
              </div>
              <div className="hero-context-bar context-bar">
                <label className="context-card block p-4">
                  <div className="relative z-[1] flex items-start gap-3"><div className="context-card-icon"><i className="fa-solid fa-location-dot" /></div><div className="min-w-0"><div className="context-card-label">Area</div><div className="context-card-value">{location?.name}</div><div className="context-card-meta">{sectionsInArea.length} sections available</div></div></div>
                  <i className="context-card-chevron fa-solid fa-chevron-down" />
                  <select className="context-native-select" aria-label="Area" value={activeBlock.locationId} onChange={(event) => chooseArea(event.target.value)}>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                </label>
                <label className="context-card block p-4">
                  <div className="relative z-[1] flex items-start gap-3"><div className="context-card-icon"><i className="fa-solid fa-vector-square" /></div><div className="min-w-0"><div className="context-card-label">Section</div><div className="context-card-value">{activeBlock.name}</div><div className="context-card-meta">{activeBlock.nodes.length} nodes assigned</div></div></div>
                  <i className="context-card-chevron fa-solid fa-chevron-down" />
                  <select className="context-native-select" aria-label="Section" value={activeBlock.id} onChange={(event) => onBlock(event.target.value)}>{sectionsInArea.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select>
                </label>
                <div className="context-card block p-4"><div className="relative z-[1] flex items-start gap-3"><div className="context-card-icon"><i className="fa-solid fa-seedling" /></div><div className="min-w-0"><div className="context-card-label">Crop profile</div><div className="context-card-value">{activeBlock.cropProfile}</div><div className="context-card-meta">Inherited from section</div></div></div></div>
              </div>
            </div>
          </div>
        </div>

        <div className="hero-control-strip mt-6 flex flex-wrap gap-3">
          <div className="header-view-control" role="group" aria-label="Dashboard view"><span className="header-view-label">View</span><button type="button" className="header-view-choice" data-active={mode === 'simple'} onClick={() => onMode('simple')}>Simple</button><button type="button" className="header-view-choice" data-active={mode === 'detailed'} onClick={() => onMode('detailed')}>Detailed</button></div>
          <span className="control-pill rounded-full px-4 py-2 text-sm font-semibold text-ink/68">Showing: {location?.name} / {activeBlock.name}</span>
          <span className="control-pill rounded-full px-4 py-2 text-sm font-semibold text-ink/68">Updated now</span>
        </div>

        <div className="indicator-stage mt-8 p-5 md:p-7">
          <div className="relative z-[1]">
            <div className="indicator-top-row flex flex-col gap-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-2xl"><p className="text-sm font-semibold uppercase tracking-[0.20em] text-ink/42">Growing Conditions Score</p><p className="mt-3 max-w-2xl text-sm leading-7 text-ink/64">{primary ? `${primary.metric.label} is pulling the score down.` : 'All installed metrics are inside target.'} {excluded} metrics excluded.</p></div>
                <div className="flex items-start lg:justify-end"><span className="state-chip state-chip-outline" data-state={state}>{state === 'optimal' ? 'Green section' : state === 'warning' ? 'Amber section' : 'Red section'}</span></div>
              </div>
              <div className="indicator-command-grid">
                <div className="indicator-score-column"><div className="indicator-score-display" data-state={state}><div className="indicator-score-label">Conditions score</div><div className="text-3xl font-extrabold text-ink">{score}</div><div className="indicator-score-state">{state === 'optimal' ? 'Good' : state === 'warning' ? 'Needs attention' : 'Critical'}</div></div></div>
                <div data-state={state} className="overall-state-card decision-card rounded-[32px] p-6"><p className="decision-card-kicker">Today</p><div className="mt-2 font-display text-4xl font-bold">{primary ? `Check ${primary.metric.label}` : 'Keep the current setup'}</div><h3 className="decision-card-headline">{primary ? `${primary.metric.label} is the main reason this score is low.` : 'Growing conditions are inside target.'}</h3><p>{primary ? 'Review the relevant climate settings, then verify the change with live readings.' : 'Continue monitoring live readings for meaningful changes.'}</p></div>
              </div>
              <div className="hero-sensor-glance-shell">
                <div className="hero-sensor-glance-head"><div><div className="indicator-driver-label">Sensor glance</div><h3 className="hero-sensor-glance-title">Live sensor snapshot</h3><p className="hero-sensor-glance-summary">See the three most important live parameters before opening the full metrics workbench.</p></div></div>
                <div className="hero-sensor-glance-grid">{results.slice(0, 3).map(({ metric, value, state: metricState }) => <article className="hero-sensor-card" data-state={metricState} key={metric.key}><div className="hero-sensor-card-top"><div className="hero-sensor-card-meta">Target {metric.target[0]}–{metric.target[1]} {metric.unit}</div><span className="state-chip state-chip-outline shrink-0" data-state={metricState}>{metricState === 'optimal' ? 'Optimal' : 'Warning'}</span></div><div className="hero-sensor-card-label">{metric.label}</div><div className="hero-sensor-card-value">{formatValue(value, metric)}</div><div className="hero-sensor-card-note">{metricState === 'optimal' ? 'Inside target band' : value !== undefined && value < metric.target[0] ? `Below target by ${formatValue(metric.target[0] - value, metric)}` : 'Above target'}</div></article>)}</div>
              </div>
              <div className="indicator-driver-group"><div className="indicator-driver-label">Growth limiting factors</div><div className="indicator-driver-list">{nonOptimal.map(({ metric }) => <span className="indicator-driver-chip" key={metric.key}>{metric.label}</span>)}</div></div>
              {mode === 'detailed' && <div className="decision-mini-grid"><article className="decision-mini-card"><div className="decision-mini-label">Main issue</div><div className="decision-mini-value">{primary?.metric.label || 'In range'}</div><p className="decision-mini-note">Strongest current growth constraint.</p></article><article className="decision-mini-card"><div className="decision-mini-label">Act by</div><div className="decision-mini-value">{primary ? 'Today' : 'Monitor'}</div><p className="decision-mini-note">Recommended response window.</p></article><article className="decision-mini-card"><div className="decision-mini-label">Data confidence</div><div className="decision-mini-value">{Math.round(installed.length / metricDefinitions.length * 100)}%</div><p className="decision-mini-note">{excluded} configured metrics unavailable.</p></article></div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
}
