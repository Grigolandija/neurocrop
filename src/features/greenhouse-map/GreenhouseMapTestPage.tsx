import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import GreenhouseCanvas from './components/GreenhouseCanvas'
import GreenhouseMapToolbar from './components/GreenhouseMapToolbar'
import GreenhouseSettingsPanel from './components/GreenhouseSettingsPanel'
import LayersPanel from './components/LayersPanel'
import ObjectLibraryPanel from './components/ObjectLibraryPanel'
import ObjectPropertiesPanel from './components/ObjectPropertiesPanel'
import { METRICS, type MapMode, type MetricKey } from './model'
import { areaMapRepository, createAreaMap, mergeAreaMapContext, type AreaMapContext, type AreaSummary } from './services/areaMapRepository'
import { validateMap } from './services/mapRepository'
import { useMapEditor } from './useMapEditor'

export default function GreenhouseMapTestPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const integrated = location.pathname === '/area-map'
  const betaEnabled = window.NEUROCROP_CONFIG?.greenhouseMapBeta === true
  const editor = useMapEditor()
  const [mode, setMode] = useState<MapMode>('layout')
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [areas, setAreas] = useState<AreaSummary[]>([])
  const [activeAreaId, setActiveAreaId] = useState('')
  const [syncState, setSyncState] = useState<'local' | 'initializing' | 'loading' | 'saved' | 'saving' | 'error' | 'conflict' | 'readonly'>(integrated ? 'initializing' : 'local')
  const [syncMessage, setSyncMessage] = useState('')
  const [canEdit, setCanEdit] = useState(!integrated)
  const inputRef = useRef<HTMLInputElement>(null)
  const areaContextRef = useRef<AreaMapContext | null>(null)
  const revisionRef = useRef(0)
  const lastSyncedRef = useRef('')
  const remoteSaveTimerRef = useRef<number | undefined>(undefined)
  const savingRef = useRef(false)

  const updateMetric = (metric: MetricKey) => editor.commit((map) => ({ ...map, heatmapSettings: { ...map.heatmapSettings, metric } }))
  const align = (edge: 'left' | 'center' | 'right' | 'bottom' | 'middle' | 'top') => {
    if (editor.selected.length < 2) return
    const minX = Math.min(...editor.selected.map((object) => object.xM))
    const maxX = Math.max(...editor.selected.map((object) => object.xM + object.widthM))
    const minY = Math.min(...editor.selected.map((object) => object.yM))
    const maxY = Math.max(...editor.selected.map((object) => object.yM + object.lengthM))
    editor.moveObjects(editor.selected.map((object) => ({
      id: object.id,
      xM: edge === 'left' ? minX : edge === 'right' ? maxX - object.widthM : edge === 'center' ? (minX + maxX - object.widthM) / 2 : object.xM,
      yM: edge === 'bottom' ? minY : edge === 'top' ? maxY - object.lengthM : edge === 'middle' ? (minY + maxY - object.lengthM) / 2 : object.yM,
    })))
  }

  useEffect(() => {
    document.body.classList.add('gh-map-active')
    return () => document.body.classList.remove('gh-map-active')
  }, [])
  useEffect(() => {
    if (!integrated) return
    if (!betaEnabled) {
      navigate('/areas', { replace: true })
      return
    }
    let cancelled = false
    Promise.all([areaMapRepository.listAreas()])
      .then(([nextAreas]) => {
        if (cancelled) return
        setAreas(nextAreas)
        const requested = searchParams.get('area')
        const selected = nextAreas.find((area) => area.id === requested)?.id || nextAreas[0]?.id || ''
        setActiveAreaId(selected)
        if (!selected) {
          setSyncState('error')
          setSyncMessage('Create an Area before opening Area Map Beta.')
        }
      })
      .catch((error) => {
        if (cancelled) return
        if (error instanceof Error && error.message.includes('session')) navigate('/', { replace: true })
        else {
          setSyncState('error')
          setSyncMessage(error instanceof Error ? error.message : 'Areas could not be loaded.')
        }
      })
    return () => { cancelled = true }
  }, [betaEnabled, integrated, navigate, searchParams, setSearchParams])

  useEffect(() => {
    if (!integrated || !activeAreaId) return
    let cancelled = false
    areaMapRepository.load(activeAreaId)
      .then((context) => {
        if (cancelled) return
        areaContextRef.current = context
        revisionRef.current = context.revision
        const next = context.map
          ? mergeAreaMapContext(context.map, context.area, context.nodes, context.sections)
          : createAreaMap(context.area, context.nodes, context.sections)
        editor.hydrate(next)
        lastSyncedRef.current = JSON.stringify(next)
        setCanEdit(context.permissions.canEdit)
        setSyncState(context.permissions.canEdit ? 'saved' : 'readonly')
        setSyncMessage(context.map ? `Revision ${context.revision}` : 'New Area map · not saved yet')
      })
      .catch((error) => {
        if (cancelled) return
        if (error instanceof Error && error.message.includes('session')) navigate('/', { replace: true })
        else {
          setSyncState('error')
          setSyncMessage(error instanceof Error ? error.message : 'Area map could not be loaded.')
        }
      })
    return () => { cancelled = true }
  // editor.hydrate is stable; depending on the complete editor object would reload after every edit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAreaId, integrated, navigate])

  const saveRemote = useCallback(async () => {
    if (!integrated || !activeAreaId || !canEdit || savingRef.current) return
    const serialized = JSON.stringify(editor.map)
    if (serialized === lastSyncedRef.current && revisionRef.current > 0) {
      setSyncState('saved')
      return
    }
    savingRef.current = true
    setSyncState('saving')
    setSyncMessage('Saving to NeuroCrop…')
    try {
      const result = await areaMapRepository.save(activeAreaId, editor.map, revisionRef.current)
      revisionRef.current = result.revision
      lastSyncedRef.current = serialized
      setSyncState('saved')
      setSyncMessage(`Revision ${result.revision} · saved`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Area map could not be saved.'
      const conflict = message.toLowerCase().includes('another session') || message.toLowerCase().includes('reload')
      setSyncState(conflict ? 'conflict' : 'error')
      setSyncMessage(message)
      setNotice({ tone: 'error', text: message })
    } finally {
      savingRef.current = false
    }
  }, [activeAreaId, canEdit, editor.map, integrated])

  useEffect(() => {
    if (!integrated || !activeAreaId || !canEdit || !lastSyncedRef.current || ['initializing', 'loading', 'saving', 'conflict'].includes(syncState)) return
    const serialized = JSON.stringify(editor.map)
    if (serialized === lastSyncedRef.current) return
    window.clearTimeout(remoteSaveTimerRef.current)
    remoteSaveTimerRef.current = window.setTimeout(() => void saveRemote(), 1200)
    return () => window.clearTimeout(remoteSaveTimerRef.current)
  }, [activeAreaId, canEdit, editor.map, integrated, saveRemote, syncState])
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const editing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement
      if (editing) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) editor.redo()
        else editor.undo()
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); editor.duplicateSelected() }
      if (event.key === 'Delete' || event.key === 'Backspace') editor.deleteSelected()
      if (event.key === 'Escape') editor.setSelectedIds([])
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [editor])

  const exportMap = () => {
    const blob = new Blob([JSON.stringify(editor.map, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${editor.map.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'greenhouse-map'}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setNotice({ tone: 'success', text: 'Plan exported as validated JSON.' })
  }
  const importFile = async (file?: File) => {
    if (!file) return
    try {
      const result = validateMap(JSON.parse(await file.text()))
      if (!result.ok) throw new Error(result.error)
      const imported = integrated && areaContextRef.current
        ? mergeAreaMapContext({ ...result.map, areaId: activeAreaId }, areaContextRef.current.area, areaContextRef.current.nodes, areaContextRef.current.sections)
        : result.map
      editor.replace(imported)
      setNotice({ tone: 'success', text: 'Plan imported successfully.' })
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'The selected file is not valid NeuroCrop map JSON.' })
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const resetMap = () => {
    const prompt = integrated ? 'Reset this Area map? Infrastructure placement will be replaced and assigned nodes will be placed automatically.' : 'Reset this plan to the NeuroCrop demo? Your local changes will be replaced.'
    if (!window.confirm(prompt)) return
    if (integrated && areaContextRef.current) {
      editor.hydrate(createAreaMap(areaContextRef.current.area, areaContextRef.current.nodes, areaContextRef.current.sections))
      setNotice({ tone: 'success', text: 'Area map reset. The new layout will be saved automatically.' })
    } else {
      editor.reset()
      setNotice({ tone: 'success', text: 'Demo plan restored.' })
    }
  }

  if (integrated && ['initializing', 'loading'].includes(syncState)) {
    return <div className="gh-app gh-integrated-loading"><div><i className="fa-solid fa-spinner fa-spin" /><strong>Loading Area Map Beta</strong><span>Connecting the plan with Areas, Nodes and latest sensor readings…</span></div></div>
  }

  if (integrated && syncState === 'error' && !activeAreaId) {
    return <div className="gh-app gh-integrated-loading"><div><i className="fa-solid fa-triangle-exclamation" /><strong>Area Map is not available</strong><span>{syncMessage}</span><button onClick={() => navigate('/areas')}>Back to Areas</button></div></div>
  }

  const readOnly = integrated && !canEdit
  return <div className={`gh-app ${integrated ? 'gh-integrated' : ''} ${readOnly ? 'gh-readonly' : ''}`}>
    <GreenhouseMapToolbar mode={mode} metric={editor.map.heatmapSettings.metric} snap={editor.snap} canUndo={!readOnly && editor.canUndo} canRedo={!readOnly && editor.canRedo} selectedCount={readOnly ? 0 : editor.selected.length}
      onMode={setMode} onMetric={updateMetric} onSnap={editor.setSnap} onUndo={readOnly ? () => undefined : editor.undo} onRedo={readOnly ? () => undefined : editor.redo} onDuplicate={readOnly ? () => undefined : editor.duplicateSelected} onDelete={readOnly ? () => undefined : editor.deleteSelected}
    />
    <div className="gh-action-strip">
      <button onClick={() => navigate(integrated ? '/areas' : '/')}><i className="fa-solid fa-arrow-left" /> {integrated ? 'Back to Areas' : 'Exit test lab'}</button>
      <span />
      {integrated ? <label className="gh-area-selector"><span>Area</span><select value={activeAreaId} onChange={(event) => { setSyncState('loading'); setSyncMessage(''); setActiveAreaId(event.target.value); setSearchParams({ area: event.target.value }, { replace: true }) }}>{areas.map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}</select></label> : null}
      <small className={`gh-sync-state ${syncState}`}><i className={`fa-solid ${integrated ? syncState === 'saving' ? 'fa-arrows-rotate fa-spin' : syncState === 'conflict' || syncState === 'error' ? 'fa-triangle-exclamation' : readOnly ? 'fa-eye' : 'fa-cloud' : 'fa-flask'}`} /> {integrated ? readOnly ? 'Read only · live API data' : syncMessage || 'Backend autosave ready' : 'Local prototype · API disconnected'}</small>
      <button disabled={readOnly || syncState === 'saving'} onClick={() => { if (integrated) void saveRemote(); else { editor.save(); setNotice({ tone: 'success', text: 'Plan saved in this browser.' }) } }}><i className="fa-regular fa-floppy-disk" /> {syncState === 'saving' ? 'Saving…' : 'Save'}</button>
      <button onClick={exportMap}><i className="fa-solid fa-arrow-up-from-bracket" /> Export JSON</button>
      <button onClick={() => inputRef.current?.click()}><i className="fa-solid fa-arrow-down-to-bracket" /> Import JSON</button>
      <input ref={inputRef} hidden type="file" accept="application/json,.json" onChange={(event) => void importFile(event.target.files?.[0])} />
      <button className="danger" disabled={readOnly} onClick={resetMap}><i className="fa-solid fa-arrow-rotate-left" /> Reset map</button>
    </div>
    <div className="gh-workspace">
      <aside className="gh-left-panel">
        {!readOnly ? <GreenhouseSettingsPanel map={editor.map} onChange={(next) => editor.commit(() => next)} /> : null}
        {!readOnly ? <ObjectLibraryPanel onAdd={editor.addObject} /> : null}
        <section className="gh-panel-section gh-view-settings">
          <header><div><small>INTERPOLATION</small><h2>View settings</h2></div><i className="fa-solid fa-sliders" /></header>
          <label className="gh-field wide"><span>Environment metric</span><select value={editor.map.heatmapSettings.metric} onChange={(event) => updateMetric(event.target.value as MetricKey)}>{(Object.keys(METRICS) as MetricKey[]).map((metric) => <option value={metric} key={metric}>{METRICS[metric].label}</option>)}</select></label>
          <div className="gh-field-row"><label className="gh-field"><span>IDW power</span><input type="number" min=".1" max="10" step=".1" value={editor.map.heatmapSettings.idwPower} onChange={(event) => editor.commit((map) => ({ ...map, heatmapSettings: { ...map.heatmapSettings, idwPower: Math.max(.1, Number(event.target.value) || 2) } }))} /></label><label className="gh-field"><span>Heatmap opacity</span><input type="number" min="0" max="1" step=".05" value={editor.map.heatmapSettings.opacity} onChange={(event) => editor.commit((map) => ({ ...map, heatmapSettings: { ...map.heatmapSettings, opacity: Math.max(0, Math.min(1, Number(event.target.value))) } }))} /></label></div>
          <div className="gh-toggle-row"><label><input type="checkbox" checked={editor.map.heatmapSettings.showConfidence} onChange={(event) => editor.commit((map) => ({ ...map, heatmapSettings: { ...map.heatmapSettings, showConfidence: event.target.checked } }))} /><span>Confidence fade</span></label></div>
          <div className="gh-scale-toggle"><button className={editor.map.heatmapSettings.scaleMode === 'auto' ? 'active' : ''} onClick={() => editor.commit((map) => ({ ...map, heatmapSettings: { ...map.heatmapSettings, scaleMode: 'auto' } }))}>Auto scale</button><button className={editor.map.heatmapSettings.scaleMode === 'manual' ? 'active' : ''} onClick={() => editor.commit((map) => ({ ...map, heatmapSettings: { ...map.heatmapSettings, scaleMode: 'manual', manualMin: map.heatmapSettings.manualMin ?? METRICS[map.heatmapSettings.metric].bounds[0], manualMax: map.heatmapSettings.manualMax ?? METRICS[map.heatmapSettings.metric].bounds[1] } }))}>Manual</button></div>
          {editor.map.heatmapSettings.scaleMode === 'manual' ? <div className="gh-field-row"><label className="gh-field"><span>Minimum</span><input type="number" value={editor.map.heatmapSettings.manualMin ?? ''} onChange={(event) => editor.commit((map) => ({ ...map, heatmapSettings: { ...map.heatmapSettings, manualMin: Number(event.target.value) } }))} /></label><label className="gh-field"><span>Maximum</span><input type="number" value={editor.map.heatmapSettings.manualMax ?? ''} onChange={(event) => editor.commit((map) => ({ ...map, heatmapSettings: { ...map.heatmapSettings, manualMax: Number(event.target.value) } }))} /></label></div> : null}
        </section>
        <LayersPanel layers={editor.map.layers} onChange={(layers) => editor.commit((map) => ({ ...map, layers }))} />
      </aside>
      <GreenhouseCanvas map={editor.map} mode={mode} readOnly={readOnly} selectedIds={editor.selectedIds} snap={editor.snap} onSelect={editor.setSelectedIds} onMove={editor.moveObjects} onUpdate={readOnly ? () => undefined : editor.updateObject} onAdd={readOnly ? () => undefined : editor.addObject} />
      <ObjectPropertiesPanel map={editor.map} selected={editor.selected} onUpdate={readOnly ? () => undefined : editor.updateObject} onAlign={readOnly ? () => undefined : align} />
    </div>
    {notice ? <button className={`gh-notice ${notice.tone}`} onClick={() => setNotice(null)}><i className={`fa-solid ${notice.tone === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation'}`} />{notice.text}<i className="fa-solid fa-xmark" /></button> : null}
  </div>
}
