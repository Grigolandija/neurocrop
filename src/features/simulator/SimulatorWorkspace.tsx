import { translateInterfaceText as tx } from '../../i18n'
import { useEffect, useMemo, useState } from 'react'
import { neurocropApi } from '../../services/api/neurocropApi'
import '../../styles/simulator-workspace.css'

type JsonRecord = Record<string, unknown>
type ScenarioParameter = { metricId: string; value: number }

const METRIC_LABELS: Record<string, string> = {
  airTemp: 'Air temperature',
  humidity: 'Relative humidity',
  vpd: 'VPD',
  co2: 'CO2',
  lux: 'Light',
  leafTemp: 'Leaf temperature',
  soilMoisture: 'Soil moisture',
  soilTemp: 'Soil temperature',
  ec: 'EC',
  ph: 'pH',
  soilEc: 'Soil EC',
  waterTemp: 'Water temperature',
}

const METRIC_UNITS: Record<string, string> = {
  airTemp: '°C',
  humidity: '%',
  vpd: 'kPa',
  co2: 'ppm',
  lux: 'lx',
  leafTemp: '°C',
  soilMoisture: '%',
  soilTemp: '°C',
  ec: 'mS/cm',
  ph: 'pH',
  soilEc: 'mS/cm',
  waterTemp: '°C',
}

const PREFERRED_METRICS = ['airTemp', 'humidity', 'co2', 'soilMoisture', 'leafTemp']

function records(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is JsonRecord => Boolean(item) && typeof item === 'object') : []
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : []
}

function metricRange(profile: JsonRecord, metricId: string): [number, number] | null {
  const metrics = profile.metrics as JsonRecord | undefined
  const metric = metrics?.[metricId] as JsonRecord | undefined
  const optimal = metric?.optimal
  if (!Array.isArray(optimal) || optimal.length !== 2) return null
  const low = Number(optimal[0])
  const high = Number(optimal[1])
  return Number.isFinite(low) && Number.isFinite(high) ? [low, high] : null
}

function availableMetricIds(profile: JsonRecord) {
  const metrics = profile.metrics as JsonRecord | undefined
  return Object.keys(metrics || {})
    .filter((metricId) => METRIC_LABELS[metricId] && metricRange(profile, metricId))
    .sort((left, right) => {
      const leftRank = PREFERRED_METRICS.indexOf(left)
      const rightRank = PREFERRED_METRICS.indexOf(right)
      return (leftRank < 0 ? 99 : leftRank) - (rightRank < 0 ? 99 : rightRank)
    })
}

function defaultValue(profile: JsonRecord, metricId: string) {
  const range = metricRange(profile, metricId)
  return range ? Number(((range[0] + range[1]) / 2).toFixed(2)) : 0
}

function defaultParameters(profile: JsonRecord) {
  return availableMetricIds(profile)
    .slice(0, 3)
    .map((metricId) => ({ metricId, value: defaultValue(profile, metricId) }))
}

function sliderBounds(profile: JsonRecord, metricId: string) {
  const range = metricRange(profile, metricId) || [0, 100]
  const span = Math.max(range[1] - range[0], Math.abs(range[1]) * .15, 1)
  let minimum = range[0] - span * 2
  let maximum = range[1] + span * 2
  if (metricId === 'humidity' || metricId === 'soilMoisture') {
    minimum = Math.max(0, minimum)
    maximum = Math.min(100, maximum)
  }
  if (metricId === 'ph') {
    minimum = Math.max(0, minimum)
    maximum = Math.min(14, maximum)
  }
  return {
    min: Number(minimum.toFixed(2)),
    max: Number(maximum.toFixed(2)),
    step: ['ph', 'vpd', 'ec', 'soilEc'].includes(metricId) ? .1 : 1,
  }
}

function resultTone(result: JsonRecord | null) {
  const diagnosis = result?.diagnosis as JsonRecord | undefined
  return String(diagnosis?.status || 'unknown')
}

function calculatedVpd(parameters: ScenarioParameter[]) {
  const temperature = parameters.find((item) => item.metricId === 'airTemp')?.value
  const humidity = parameters.find((item) => item.metricId === 'humidity')?.value
  if (!Number.isFinite(temperature) || !Number.isFinite(humidity) || Number(humidity) <= 0 || Number(humidity) > 100) return null
  const saturation = .6108 * Math.exp((17.27 * Number(temperature)) / (Number(temperature) + 237.3))
  return Number((saturation * (1 - Number(humidity) / 100)).toFixed(2))
}

export default function SimulatorWorkspace() {
  const [profiles, setProfiles] = useState<JsonRecord[]>([])
  const [profileId, setProfileId] = useState('')
  const [parameters, setParameters] = useState<ScenarioParameter[]>([])
  const [durationMinutes, setDurationMinutes] = useState(10)
  const [status, setStatus] = useState<'loading' | 'ready' | 'running' | 'error'>('loading')
  const [error, setError] = useState('')
  const [result, setResult] = useState<JsonRecord | null>(null)

  const profile = useMemo(
    () => profiles.find((item) => String(item.id) === profileId) || profiles[0] || null,
    [profileId, profiles],
  )
  const availableMetrics = useMemo(() => {
    return profile ? availableMetricIds(profile) : []
  }, [profile])

  useEffect(() => {
    document.body.dataset.reactSimulatorActive = 'true'
    let active = true
    neurocropApi.getCropProfiles()
      .then((payload) => {
        if (!active) return
        const nextProfiles = records((payload as JsonRecord)?.profiles)
        setProfiles(nextProfiles)
        setProfileId(String(nextProfiles[0]?.id || ''))
        setParameters(nextProfiles[0] ? defaultParameters(nextProfiles[0]) : [])
        setStatus('ready')
      })
      .catch((reason) => {
        if (!active) return
        setError(reason instanceof Error ? reason.message : 'Crop profiles could not be loaded.')
        setStatus('error')
      })
    return () => {
      active = false
      delete document.body.dataset.reactSimulatorActive
    }
  }, [])

  function updateMetric(index: number, metricId: string) {
    if (!profile) return
    setParameters((current) => current.map((item, itemIndex) =>
      itemIndex === index ? { metricId, value: defaultValue(profile, metricId) } : item
    ))
    setResult(null)
  }

  function selectProfile(nextProfileId: string) {
    const nextProfile = profiles.find((item) => String(item.id) === nextProfileId)
    setProfileId(nextProfileId)
    setParameters(nextProfile ? defaultParameters(nextProfile) : [])
    setResult(null)
  }

  function updateValue(index: number, value: number) {
    setParameters((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, value } : item))
    setResult(null)
  }

  function addParameter() {
    if (!profile || parameters.length >= 3) return
    const metricId = availableMetrics.find((candidate) => !parameters.some((item) => item.metricId === candidate))
    if (!metricId) return
    setParameters((current) => [...current, { metricId, value: defaultValue(profile, metricId) }])
  }

  function removeParameter(index: number) {
    if (parameters.length <= 2) return
    setParameters((current) => current.filter((_, itemIndex) => itemIndex !== index))
    setResult(null)
  }

  async function runSimulation() {
    if (!profile || parameters.length < 2) return
    setStatus('running')
    setError('')
    try {
      const payload = await neurocropApi.simulateAgronomicScenario({
        profileId: String(profile.id),
        durationMinutes,
        values: Object.fromEntries(parameters.map((item) => [item.metricId, item.value])),
      })
      setResult(payload as JsonRecord)
      setStatus('ready')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The scenario could not be simulated.')
      setStatus('error')
    }
  }

  const diagnosis = result?.diagnosis as JsonRecord | undefined
  const action = result?.action as JsonRecord | undefined
  const limitations = Array.isArray(result?.limitations) ? result.limitations.map(String) : []
  const evidence = diagnosis?.evidence as JsonRecord | undefined
  const verifyNext = strings(diagnosis?.verifyNext)
  const evidenceRules = strings(evidence?.ruleIds)
  const evidenceCodes = strings(evidence?.codes)
  const selectedMetricIds = new Set(parameters.map((item) => item.metricId))
  const derivedVpd = calculatedVpd(parameters)

  return <main className="nc-simulator" aria-busy={status === 'loading'}>
    <header className="nc-simulator-header">
      <div><p>{tx("Decision support")}</p><h1>{tx("Scenario Simulator")}</h1><span>{tx("Explore how 2–3 conditions interact without changing live data or equipment.")}</span></div>
      <div className="nc-simulator-model"><i className="fa-solid fa-flask" /><span><strong>{tx("Rule model 0.1")}</strong>{tx("Uses the same crop-profile targets as Overview")}</span></div>
    </header>

    {error ? <div className="nc-simulator-error" role="alert"><i className="fa-solid fa-triangle-exclamation" />{error}</div> : null}

    <section className="nc-simulator-layout">
      <form className="nc-simulator-controls" onSubmit={(event) => { event.preventDefault(); void runSimulation() }}>
        <header><span>{tx("Scenario inputs")}</span><strong>{tx("Choose conditions to test")}</strong></header>
        <label className="nc-simulator-profile"><span>{tx("Crop profile")}</span><select value={profileId} onChange={(event) => selectProfile(event.target.value)} disabled={status === 'loading'}>{profiles.map((item) => <option value={String(item.id)} key={String(item.id)}>{String(item.name || 'Unnamed profile')}</option>)}</select></label>

        <div className="nc-simulator-parameters">
          {parameters.map((parameter, index) => {
            const bounds = profile ? sliderBounds(profile, parameter.metricId) : { min: 0, max: 100, step: 1 }
            const range = profile ? metricRange(profile, parameter.metricId) : null
            return <article key={`${index}-${parameter.metricId}`}>
              <header>
                <select value={parameter.metricId} onChange={(event) => updateMetric(index, event.target.value)}>
                  {availableMetrics.map((metricId) => <option value={metricId} disabled={selectedMetricIds.has(metricId) && metricId !== parameter.metricId} key={metricId}>{METRIC_LABELS[metricId]}</option>)}
                </select>
                {parameters.length > 2 ? <button type="button" onClick={() => removeParameter(index)} aria-label={`Remove ${METRIC_LABELS[parameter.metricId]}`}><i className="fa-solid fa-xmark" /></button> : null}
              </header>
              <div className="nc-simulator-value"><input type="number" min={bounds.min} max={bounds.max} step={bounds.step} value={parameter.value} onChange={(event) => updateValue(index, Number(event.target.value))} /><span>{METRIC_UNITS[parameter.metricId]}</span></div>
              <input type="range" min={bounds.min} max={bounds.max} step={bounds.step} value={parameter.value} onChange={(event) => updateValue(index, Number(event.target.value))} />
              <footer><span>{bounds.min}</span><strong>{range ? `Target ${range[0]}–${range[1]} ${METRIC_UNITS[parameter.metricId]}` :tx("No target")}</strong><span>{bounds.max}</span></footer>
            </article>
          })}
        </div>

        {derivedVpd !== null
          ? <div className="nc-simulator-derived"><div><span>{tx("Derived parameter")}</span><strong>VPD</strong></div><b>{derivedVpd} kPa</b><p>{tx("Automatically calculated from air temperature and relative humidity.")}</p></div>
          : <div className="nc-simulator-derived muted"><i className="fa-solid fa-calculator" /><p>{tx("Select both Air temperature and Relative humidity to calculate VPD automatically.")}</p></div>}

        {parameters.length < 3 && availableMetrics.length > parameters.length ? <button className="nc-simulator-add" type="button" onClick={addParameter}><i className="fa-solid fa-plus" />{tx("Add third parameter")}</button> : null}

        <fieldset className="nc-simulator-duration"><legend>{tx("Assumed duration")}</legend><div>{[1, 10, 30, 60].map((minutes) => <button type="button" data-active={durationMinutes === minutes} onClick={() => { setDurationMinutes(minutes); setResult(null) }} key={minutes}>{minutes === 1 ?tx("Snapshot") : `${minutes} min`}</button>)}</div><p>{tx("The model does not infer duration from the latest sensor timestamp.")}</p></fieldset>

        <button className="nc-simulator-run" type="submit" disabled={!profile || parameters.length < 2 || status === 'running'}>{status === 'running' ? <><i className="fa-solid fa-spinner fa-spin" />{tx("Running scenario")}</> : <><i className="fa-solid fa-play" />{tx("Run simulation")}</>}</button>
      </form>

      <section className="nc-simulator-result" data-tone={resultTone(result)}>
        {result && diagnosis
          ? <>
              <header><div><span>{tx("Expected result")}</span><h2>{String(diagnosis.title || 'Scenario result')}</h2></div><strong>{String(diagnosis.label || 'Result')}</strong></header>
              <p className="nc-simulator-summary">{String(diagnosis.summary || '')}</p>
              {diagnosis.mechanism || diagnosis.likelyImpact || diagnosis.decision
                ? <div className="nc-simulator-reasoning">
                    {diagnosis.mechanism ? <article><span>{tx("Physiological mechanism")}</span><p>{String(diagnosis.mechanism)}</p></article> : null}
                    {diagnosis.likelyImpact ? <article><span>{tx("Likely crop consequence")}</span><p>{String(diagnosis.likelyImpact)}</p></article> : null}
                    {diagnosis.decision ? <article className="priority"><span>{tx("Decision priority")}</span><p>{String(diagnosis.decision)}</p></article> : null}
                  </div>
                : null}
              {verifyNext.length || diagnosis.avoid
                ? <div className="nc-simulator-guardrails">
                    {verifyNext.length ? <article><span>{tx("Verify next")}</span><ul>{verifyNext.map((item) => <li key={item}>{item}</li>)}</ul></article> : null}
                    {diagnosis.avoid ? <article className="avoid"><span>{tx("Avoid")}</span><p>{String(diagnosis.avoid)}</p></article> : null}
                  </div>
                : null}
              {evidenceRules.length || evidenceCodes.length
                ? <p className="nc-simulator-evidence"><i className="fa-solid fa-book-open" />{tx("Catalog")} {evidenceRules.join(' + ')} {tx("· Evidence")} {String(evidence?.level || '—')} {tx("· Sources")} {evidenceCodes.join(', ')}</p>
                : null}
              <div className="nc-simulator-score"><span>{tx("Simulated Growing Score")}</span><strong>{result.score === null || result.score === undefined ? '—' : `${result.score} / 100`}</strong><small>{result.mainDriver ? `Main driver: ${METRIC_LABELS[String(result.mainDriver)] || result.mainDriver}` :tx("No limiting driver")}</small></div>
              {action ? <article className="nc-simulator-action"><span>{tx("Recommended response")}</span><strong>{String(action.recommendedAction || 'Review the selected conditions.')}</strong><p>{String(action.expectedEffect || '')}</p></article> : <article className="nc-simulator-action stable"><i className="fa-solid fa-circle-check" /><strong>{tx("No corrective action is indicated by the selected values.")}</strong></article>}
              <aside className="nc-simulator-limitations"><span>{tx("Model boundaries")}</span>{limitations.map((item) => <p key={item}><i className="fa-solid fa-circle-info" />{item}</p>)}</aside>
            </>
          : <div className="nc-simulator-empty"><i className="fa-solid fa-seedling" /><h2>{tx("Build a scenario")}</h2><p>{tx("Move the parameter values outside or within their crop-profile targets, choose a duration, and run the model.")}</p><div><span>1</span>{tx("Select a real crop profile")}</div><div><span>2</span>{tx("Adjust 2–3 parameters")}</div><div><span>3</span>{tx("Compare the expected response")}</div></div>}
      </section>
    </section>
  </main>
}
