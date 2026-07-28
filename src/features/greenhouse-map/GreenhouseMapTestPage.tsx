import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { neurocropApi } from '../../services/api/neurocropApi'
import GreenhouseCanvas from './components/GreenhouseCanvas'
import GreenhouseMapToolbar from './components/GreenhouseMapToolbar'
import GreenhouseSettingsPanel from './components/GreenhouseSettingsPanel'
import LayersPanel from './components/LayersPanel'
import MapSetupGuide from './components/MapSetupGuide'
import NumericInput from './components/NumericInput'
import ObjectLibraryPanel from './components/ObjectLibraryPanel'
import ObjectPropertiesPanel from './components/ObjectPropertiesPanel'
import { METRICS, type MapMode, type MetricKey } from './model'
import { areaMapRepository, createAreaMap, mergeAreaMapContext, type AreaMapContext, type AreaSummary } from './services/areaMapRepository'
import { validateMap } from './services/mapRepository'
import { useMapEditor } from './useMapEditor'
import { getInterfaceLanguage, setInterfaceLanguage } from '../../i18n'

export default function GreenhouseMapTestPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const integrated = location.pathname === '/area-map'
  const betaEnabled = window.NEUROCROP_CONFIG?.greenhouseMapBeta === true
  const editor = useMapEditor()
  const [mode, setMode] = useState<MapMode>('layout')
  const [editing, setEditing] = useState(!integrated)
  const [showSetupGuide, setShowSetupGuide] = useState(false)
  const [dailyView, setDailyView] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<'none' | 'left' | 'right'>('none')
  const [language, setLanguage] = useState<'en' | 'lt'>(getInterfaceLanguage)
  const [newArea, setNewArea] = useState({ name: '', kind: 'Greenhouse', location: '' })
  const [creatingArea, setCreatingArea] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [areas, setAreas] = useState<AreaSummary[]>([])
  const [activeAreaId, setActiveAreaId] = useState('')
  const [syncState, setSyncState] = useState<'local' | 'initializing' | 'loading' | 'saved' | 'saving' | 'error' | 'conflict' | 'readonly'>(integrated ? 'initializing' : 'local')
  const [syncMessage, setSyncMessage] = useState('')
  const [canEdit, setCanEdit] = useState(!integrated)
  const [areaContext, setAreaContext] = useState<AreaMapContext | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const areaContextRef = useRef<AreaMapContext | null>(null)
  const revisionRef = useRef(0)
  const lastSyncedRef = useRef('')
  const remoteSaveTimerRef = useRef<number | undefined>(undefined)
  const savingRef = useRef(false)
  const tr = useCallback((english: string, lithuanian: string) => language === 'lt' ? lithuanian : english, [language])
  const toggleLanguage = () => {
    const next = language === 'en' ? 'lt' : 'en'
    setLanguage(next)
    setInterfaceLanguage(next)
  }

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
        const requested = searchParams.get('area')
        const requestedArea = nextAreas.find((area) => area.id === requested)
        if (requestedArea && !requestedArea.mapEnabled) {
          navigate('/areas', { replace: true })
          return
        }
        const enabledAreas = nextAreas.filter((area) => area.mapEnabled)
        setAreas(enabledAreas)
        const selected = enabledAreas.find((area) => area.id === requested)?.id || enabledAreas[0]?.id || ''
        setActiveAreaId(selected)
        if (!selected) {
          setSyncState('error')
          setSyncMessage(tr('Enable Area Map for an Area before opening it.', 'Prieš atidarydami žemėlapį įjunkite jį pasirinktai erdvei.'))
        }
      })
      .catch((error) => {
        if (cancelled) return
        if (error instanceof Error && error.message.includes('session')) navigate('/', { replace: true })
        else {
          setSyncState('error')
          setSyncMessage(error instanceof Error ? error.message : tr('Areas could not be loaded.', 'Erdvių įkelti nepavyko.'))
        }
      })
    return () => { cancelled = true }
  }, [betaEnabled, integrated, navigate, searchParams, setSearchParams, tr])

  useEffect(() => {
    if (!integrated || !activeAreaId) return
    let cancelled = false
    areaMapRepository.load(activeAreaId)
      .then((context) => {
        if (cancelled) return
        if (!context.mapEnabled) {
          navigate('/areas', { replace: true })
          return
        }
        areaContextRef.current = context
        setAreaContext(context)
        revisionRef.current = context.revision
        const next = context.map
          ? mergeAreaMapContext(context.map, context.area, context.nodes, context.sections)
          : createAreaMap(context.area, context.nodes, context.sections)
        editor.hydrate(next)
        setEditing(!integrated || !context.map)
        setShowSetupGuide(!context.map)
        lastSyncedRef.current = JSON.stringify(next)
        setCanEdit(context.permissions.canEdit)
        setSyncState(context.permissions.canEdit ? 'saved' : 'readonly')
        setSyncMessage(context.map ? `${tr('Revision', 'Versija')} ${context.revision}` : tr('New Area map · not saved yet', 'Naujas erdvės žemėlapis · dar neišsaugotas'))
      })
      .catch((error) => {
        if (cancelled) return
        if (error instanceof Error && error.message.includes('session')) navigate('/', { replace: true })
        else {
          setSyncState('error')
          setSyncMessage(error instanceof Error ? error.message : tr('Area map could not be loaded.', 'Erdvės žemėlapio įkelti nepavyko.'))
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
    setSyncMessage(tr('Saving to NeuroCrop…', 'Saugoma „NeuroCrop“…'))
    try {
      const result = await areaMapRepository.save(activeAreaId, editor.map, revisionRef.current)
      revisionRef.current = result.revision
      lastSyncedRef.current = serialized
      setSyncState('saved')
        setSyncMessage(`${tr('Revision', 'Versija')} ${result.revision} · ${tr('saved', 'išsaugota')}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : tr('Area map could not be saved.', 'Erdvės žemėlapio išsaugoti nepavyko.')
      const conflict = message.toLowerCase().includes('another session') || message.toLowerCase().includes('reload')
      setSyncState(conflict ? 'conflict' : 'error')
      setSyncMessage(message)
      setNotice({ tone: 'error', text: message })
    } finally {
      savingRef.current = false
    }
  }, [activeAreaId, canEdit, editor.map, integrated, tr])

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
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') { event.preventDefault(); editor.copySelected() }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') { event.preventDefault(); editor.pasteCopied() }
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
    setNotice({ tone: 'success', text: tr('Plan exported as validated JSON.', 'Planas eksportuotas kaip patikrintas JSON failas.') })
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
      setNotice({ tone: 'success', text: tr('Plan imported successfully.', 'Planas sėkmingai importuotas.') })
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : tr('The selected file is not valid NeuroCrop map JSON.', 'Pasirinktas failas nėra tinkamas „NeuroCrop“ žemėlapio JSON failas.') })
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const resetMap = () => {
    const prompt = integrated
      ? tr('Reset this Area map? Infrastructure placement will be replaced and assigned nodes will be placed automatically.', 'Atkurti šį erdvės žemėlapį? Infrastruktūros išdėstymas bus pakeistas, o priskirti mazgai išdėstyti automatiškai.')
      : tr('Reset this plan to the NeuroCrop demo? Your local changes will be replaced.', 'Atkurti „NeuroCrop“ demonstracinį planą? Vietiniai pakeitimai bus pakeisti.')
    if (!window.confirm(prompt)) return
    if (integrated && areaContextRef.current) {
      editor.hydrate(createAreaMap(areaContextRef.current.area, areaContextRef.current.nodes, areaContextRef.current.sections))
      setNotice({ tone: 'success', text: tr('Area map reset. The new layout will be saved automatically.', 'Erdvės žemėlapis atkurtas. Naujas išdėstymas bus išsaugotas automatiškai.') })
    } else {
      editor.reset()
      setNotice({ tone: 'success', text: tr('Demo plan restored.', 'Demonstracinis planas atkurtas.') })
    }
  }

  const createFirstArea = () => {
    if (!newArea.name.trim() || creatingArea) return
    setCreatingArea(true)
    void neurocropApi.createArea(newArea)
      .then(async (payload) => {
        const record = payload as { area?: Record<string, unknown> }
        const area = {
          id: String(record.area?.id || ''),
          name: String(record.area?.name || newArea.name),
          kind: String(record.area?.kind || newArea.kind),
          location: String(record.area?.location || newArea.location),
        }
        if (!area.id) throw new Error(tr('Area was created without an id.', 'Erdvė sukurta be ID.'))
        await neurocropApi.setAreaMapEnabled(area.id, true)
        setAreas([area])
        setActiveAreaId(area.id)
        setSearchParams({ area: area.id }, { replace: true })
        setSyncState('loading')
        setSyncMessage('')
      })
      .catch((error) => setSyncMessage(error instanceof Error ? error.message : tr('Area could not be created.', 'Erdvės sukurti nepavyko.')))
      .finally(() => setCreatingArea(false))
  }

  const moveOnCanvas = (positions: Array<{ id: string; xM: number; yM: number }>, record = true) => {
    editor.moveObjects(positions, record)
  }
  const leaveMap = async () => {
    if (!integrated) {
      navigate('/')
      return
    }
    window.clearTimeout(remoteSaveTimerRef.current)
    const serialized = JSON.stringify(editor.map)
    const needsSave = serialized !== lastSyncedRef.current || revisionRef.current <= 0
    if (canEdit && needsSave) {
      await saveRemote()
      if (lastSyncedRef.current !== serialized || revisionRef.current <= 0) return
    }
    // Area Map and the approved dashboard use separate page shells. A document
    // navigation guarantees the dashboard runtime starts from a clean DOM.
    window.location.assign('/areas')
  }

  if (integrated && ['initializing', 'loading'].includes(syncState)) {
    return <div className="gh-app gh-integrated-loading"><div><i className="fa-solid fa-spinner fa-spin" /><strong>{tr('Loading Area Map Beta', 'Įkeliamas erdvės žemėlapis')}</strong><span>{tr('Connecting the plan with Areas, Nodes and latest sensor readings…', 'Planas susiejamas su erdvėmis, mazgais ir naujausiais sensorių rodmenimis…')}</span></div></div>
  }

  if (integrated && syncState === 'error' && !activeAreaId) {
    return <div className="gh-app gh-integrated-loading"><div className="gh-create-area"><i className="fa-solid fa-seedling" /><strong>{tr('Create your first greenhouse', 'Sukurkite pirmąjį šiltnamį')}</strong><span>{tr('Start here, then add Sections and connect nodes without leaving the map.', 'Pradėkite čia, tada pridėkite sekcijų ir prijunkite mazgų neišeidami iš žemėlapio.')}</span><input value={newArea.name} onChange={(event) => setNewArea({ ...newArea, name: event.target.value })} placeholder={tr('Greenhouse name', 'Šiltnamio pavadinimas')} /><input value={newArea.location} onChange={(event) => setNewArea({ ...newArea, location: event.target.value })} placeholder={tr('Location (optional)', 'Vieta (nebūtina)')} /><button disabled={!newArea.name.trim() || creatingArea} onClick={createFirstArea}>{creatingArea ? tr('Creating…', 'Kuriama…') : tr('Create greenhouse', 'Sukurti šiltnamį')}</button>{syncMessage ? <small>{syncMessage}</small> : null}</div></div>
  }

  const permissionReadOnly = integrated && !canEdit
  const canvasReadOnly = permissionReadOnly || !editing
  return <div className={`gh-app ${integrated ? 'gh-integrated' : ''} ${canvasReadOnly ? 'gh-readonly' : ''} gh-mobile-${mobilePanel}`}>
    <GreenhouseMapToolbar mode={mode} metric={editor.map.heatmapSettings.metric} snap={editor.snap} editing={editing && !permissionReadOnly} language={language} canUndo={editing && !permissionReadOnly && editor.canUndo} canRedo={editing && !permissionReadOnly && editor.canRedo} selectedCount={editing && !permissionReadOnly ? editor.selected.length : 0} duplicableSelectedCount={editing && !permissionReadOnly ? editor.duplicableSelectedCount : 0} canPaste={editing && !permissionReadOnly && editor.canPaste}
      onMode={setMode} onMetric={updateMetric} onSnap={editor.setSnap} onUndo={permissionReadOnly ? () => undefined : editor.undo} onRedo={permissionReadOnly ? () => undefined : editor.redo} onCopy={canvasReadOnly ? () => undefined : editor.copySelected} onPaste={canvasReadOnly ? () => undefined : editor.pasteCopied} onDelete={canvasReadOnly ? () => undefined : editor.deleteSelected}
    />
    <div className="gh-action-strip">
      <button onClick={() => void leaveMap()}><i className="fa-solid fa-arrow-left" /> {integrated ? tr('Back to Areas', 'Grįžti į erdves') : tr('Exit test lab', 'Uždaryti testą')}</button>
      <span />
      {integrated ? <label className="gh-area-selector"><span>{tr('Area', 'Erdvė')}</span><select value={activeAreaId} onChange={(event) => { setSyncState('loading'); setSyncMessage(''); setActiveAreaId(event.target.value); setSearchParams({ area: event.target.value }, { replace: true }) }}>{areas.map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}</select></label> : null}
      <small className={`gh-sync-state ${syncState}`}><i className={`fa-solid ${integrated ? syncState === 'saving' ? 'fa-arrows-rotate fa-spin' : syncState === 'conflict' || syncState === 'error' ? 'fa-triangle-exclamation' : permissionReadOnly ? 'fa-eye' : 'fa-cloud' : 'fa-flask'}`} /> {integrated ? permissionReadOnly ? tr('Read only · live API data', 'Tik skaitymui · dabartiniai API duomenys') : syncMessage || tr('Backend autosave ready', 'Automatinis išsaugojimas serveryje paruoštas') : tr('Local prototype · API disconnected', 'Vietinis prototipas · API neprijungta')}</small>
      {integrated && !permissionReadOnly ? <button className={editing ? 'gh-edit-active' : ''} onClick={() => { setEditing((current) => !current); if (!editing) setMode('layout') }}><i className={`fa-solid ${editing ? 'fa-eye' : 'fa-pen-ruler'}`} /> {editing ? tr('Finish editing', 'Baigti redagavimą') : tr('Edit map', 'Redaguoti žemėlapį')}</button> : null}
      {integrated ? <button className={dailyView ? 'gh-edit-active' : ''} onClick={() => { setDailyView((current) => !current); setEditing(false); setMode('environment') }}><i className="fa-solid fa-list-check" /> {tr('Daily view', 'Dienos vaizdas')}</button> : null}
      {integrated ? <button onClick={() => setShowSetupGuide(true)}><i className="fa-regular fa-circle-question" /> {tr('Setup guide', 'Paruošimo vedlys')}</button> : null}
      <button className="gh-mobile-only" onClick={() => setMobilePanel((current) => current === 'left' ? 'none' : 'left')}><i className="fa-solid fa-sliders" /></button>
      <button className="gh-mobile-only" onClick={() => setMobilePanel((current) => current === 'right' ? 'none' : 'right')}><i className="fa-solid fa-circle-info" /></button>
      <button onClick={toggleLanguage}>{language.toUpperCase()}</button>
      <button disabled={permissionReadOnly || syncState === 'saving'} onClick={() => { if (integrated) void saveRemote(); else { editor.save(); setNotice({ tone: 'success', text: tr('Plan saved in this browser.', 'Planas išsaugotas šioje naršyklėje.') }) } }}><i className="fa-regular fa-floppy-disk" /> {syncState === 'saving' ? tr('Saving…', 'Saugoma…') : tr('Save', 'Išsaugoti')}</button>
      <button onClick={exportMap}><i className="fa-solid fa-arrow-up-from-bracket" /> {tr('Export JSON', 'Eksportuoti JSON')}</button>
      <button onClick={() => inputRef.current?.click()}><i className="fa-solid fa-arrow-down-to-bracket" /> {tr('Import JSON', 'Importuoti JSON')}</button>
      <input ref={inputRef} hidden type="file" accept="application/json,.json" onChange={(event) => void importFile(event.target.files?.[0])} />
      <button className="danger" disabled={canvasReadOnly} onClick={resetMap}><i className="fa-solid fa-arrow-rotate-left" /> {tr('Reset map', 'Atkurti žemėlapį')}</button>
    </div>
    <div className="gh-workspace">
      <aside className="gh-left-panel">
        {!canvasReadOnly ? <GreenhouseSettingsPanel map={editor.map} language={language} onChange={(next) => editor.commit(() => next)} /> : null}
        {!canvasReadOnly ? <ObjectLibraryPanel language={language} onAdd={editor.addObject} /> : null}
        <section className="gh-panel-section gh-view-settings">
          <header><div><small>{tr('INTERPOLATION', 'INTERPOLIACIJA')}</small><h2>{tr('View settings', 'Vaizdo nustatymai')}</h2></div><i className="fa-solid fa-sliders" /></header>
          <label className="gh-field wide"><span>{tr('Environment metric', 'Aplinkos rodiklis')}</span><select value={editor.map.heatmapSettings.metric} onChange={(event) => updateMetric(event.target.value as MetricKey)}>{(Object.keys(METRICS) as MetricKey[]).map((metric) => <option value={metric} key={metric}>{language === 'lt' ? ({ 'air-temperature': 'Oro temperatūra', 'relative-humidity': 'Santykinė drėgmė', co2: 'CO₂', vpd: 'VPD', 'root-temperature': 'Šaknų zonos temperatūra' } as Record<string, string>)[metric] : METRICS[metric].label}</option>)}</select></label>
          <div className="gh-field-row"><label className="gh-field"><span>{tr('IDW power', 'IDW laipsnis')}</span><NumericInput min=".1" max="10" step=".1" value={editor.map.heatmapSettings.idwPower} onCommit={(value) => editor.commit((map) => ({ ...map, heatmapSettings: { ...map.heatmapSettings, idwPower: value ?? map.heatmapSettings.idwPower } }))} /></label><label className="gh-field"><span>{tr('Heatmap opacity', 'Šilumos žemėlapio neskaidrumas')}</span><NumericInput min="0" max="1" step=".05" value={editor.map.heatmapSettings.opacity} onCommit={(value) => editor.commit((map) => ({ ...map, heatmapSettings: { ...map.heatmapSettings, opacity: value ?? map.heatmapSettings.opacity } }))} /></label></div>
          <div className="gh-toggle-row"><label><input type="checkbox" checked={editor.map.heatmapSettings.showConfidence} onChange={(event) => editor.commit((map) => ({ ...map, heatmapSettings: { ...map.heatmapSettings, showConfidence: event.target.checked } }))} /><span>{tr('Confidence fade', 'Patikimumo išblukimas')}</span></label></div>
          <div className="gh-scale-toggle"><button className={editor.map.heatmapSettings.scaleMode === 'auto' ? 'active' : ''} onClick={() => editor.commit((map) => ({ ...map, heatmapSettings: { ...map.heatmapSettings, scaleMode: 'auto' } }))}>{tr('Auto scale', 'Automatinis mastelis')}</button><button className={editor.map.heatmapSettings.scaleMode === 'manual' ? 'active' : ''} onClick={() => editor.commit((map) => ({ ...map, heatmapSettings: { ...map.heatmapSettings, scaleMode: 'manual', manualMin: map.heatmapSettings.manualMin ?? METRICS[map.heatmapSettings.metric].bounds[0], manualMax: map.heatmapSettings.manualMax ?? METRICS[map.heatmapSettings.metric].bounds[1] } }))}>{tr('Manual', 'Rankinis')}</button></div>
          {editor.map.heatmapSettings.scaleMode === 'manual' ? <div className="gh-field-row"><label className="gh-field"><span>{tr('Minimum', 'Mažiausia')}</span><NumericInput allowEmpty value={editor.map.heatmapSettings.manualMin} onCommit={(value) => editor.commit((map) => ({ ...map, heatmapSettings: { ...map.heatmapSettings, manualMin: value } }))} /></label><label className="gh-field"><span>{tr('Maximum', 'Didžiausia')}</span><NumericInput allowEmpty value={editor.map.heatmapSettings.manualMax} onCommit={(value) => editor.commit((map) => ({ ...map, heatmapSettings: { ...map.heatmapSettings, manualMax: value } }))} /></label></div> : null}
        </section>
        <LayersPanel layers={editor.map.layers} language={language} onChange={(layers) => editor.commit((map) => ({ ...map, layers }))} />
      </aside>
      <GreenhouseCanvas map={editor.map} mode={mode} readOnly={canvasReadOnly} dailyView={dailyView} language={language} actions={areaContext?.actions ?? []} selectedIds={editor.selectedIds} snap={editor.snap} onSelect={(ids) => { editor.setSelectedIds(ids); if (ids.length) setMobilePanel('right') }} onMove={moveOnCanvas} onUpdate={canvasReadOnly ? () => undefined : editor.updateObject} onAdd={canvasReadOnly ? () => undefined : editor.addObject} />
      <ObjectPropertiesPanel map={editor.map} selected={editor.selected} language={language} onUpdate={canvasReadOnly ? () => undefined : editor.updateObject} onAlign={canvasReadOnly ? () => undefined : align} onCopy={canvasReadOnly ? () => undefined : editor.copySelected} onPaste={canvasReadOnly ? () => undefined : editor.pasteCopied} canPaste={!canvasReadOnly && editor.canPaste} />
    </div>
    {showSetupGuide && areaContext ? <MapSetupGuide area={areaContext.area} map={editor.map} nodes={areaContext.nodes} language={language} onMapChange={(map) => editor.commit(() => map)} onOpenNodes={() => navigate('/nodes')} onClose={() => { setShowSetupGuide(false); if (!permissionReadOnly) { setEditing(true); setMode('layout') } }} /> : null}
    {notice ? <button className={`gh-notice ${notice.tone}`} onClick={() => setNotice(null)}><i className={`fa-solid ${notice.tone === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation'}`} />{notice.text}<i className="fa-solid fa-xmark" /></button> : null}
  </div>
}
