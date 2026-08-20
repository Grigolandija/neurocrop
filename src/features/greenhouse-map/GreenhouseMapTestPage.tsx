import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { neurocropApi } from '../../services/api/neurocropApi'
import GreenhouseCanvas from './components/GreenhouseCanvas'
import GreenhouseMapToolbar from './components/GreenhouseMapToolbar'
import GreenhouseSettingsPanel from './components/GreenhouseSettingsPanel'
import LayersPanel from './components/LayersPanel'
import MapSetupGuide from './components/MapSetupGuide'
import ObjectLibraryPanel from './components/ObjectLibraryPanel'
import ObjectPropertiesPanel from './components/ObjectPropertiesPanel'
import { type GreenhouseMap, type MapMode, type MetricKey } from './model'
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
  const editor = useMapEditor({ persistLocal: !integrated, protectSensorNodes: integrated })
  const [mode, setMode] = useState<MapMode>('layout')
  const [editing, setEditing] = useState(!integrated)
  const [showSetupGuide, setShowSetupGuide] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<'none' | 'left' | 'right'>('none')
  const [language, setLanguage] = useState<'en' | 'lt'>(getInterfaceLanguage)
  const [newArea, setNewArea] = useState({ name: '', kind: 'Greenhouse', location: '' })
  const [creatingArea, setCreatingArea] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [areas, setAreas] = useState<AreaSummary[]>([])
  const [activeAreaId, setActiveAreaId] = useState('')
  const [areaMenuOpen, setAreaMenuOpen] = useState(false)
  const [syncState, setSyncState] = useState<'local' | 'initializing' | 'loading' | 'saved' | 'saving' | 'error' | 'conflict' | 'readonly'>(integrated ? 'initializing' : 'local')
  const [syncMessage, setSyncMessage] = useState('')
  const [canEdit, setCanEdit] = useState(!integrated)
  const [areaContext, setAreaContext] = useState<AreaMapContext | null>(null)
  const [loadVersion, setLoadVersion] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const moreMenuRef = useRef<HTMLDetailsElement>(null)
  const areaMenuRef = useRef<HTMLDivElement>(null)
  const areaContextRef = useRef<AreaMapContext | null>(null)
  const revisionRef = useRef(0)
  const lastSyncedRef = useRef('')
  const remoteSaveTimerRef = useRef<number | undefined>(undefined)
  const savingRef = useRef(false)
  const activeAreaIdRef = useRef('')
  const tr = useCallback((english: string, lithuanian: string) => language === 'lt' ? lithuanian : english, [language])
  const workspaceEditable = !integrated || canEdit
  const layoutEditable = workspaceEditable && editing && mode === 'layout'
  const toggleLanguage = () => {
    const next = language === 'en' ? 'lt' : 'en'
    setLanguage(next)
    setInterfaceLanguage(next)
  }

  const updateMetric = (metric: MetricKey) => editor.commit((map) => ({ ...map, heatmapSettings: { ...map.heatmapSettings, metric } }))
  const align = (edge: 'left' | 'center' | 'right' | 'bottom' | 'middle' | 'top') => {
    const movable = editor.selected.filter((object) => !object.locked && !editor.map.layers.find((layer) => layer.id === object.layerId)?.locked)
    if (movable.length < 2) return
    const minX = Math.min(...movable.map((object) => object.xM))
    const maxX = Math.max(...movable.map((object) => object.xM + object.widthM))
    const minY = Math.min(...movable.map((object) => object.yM))
    const maxY = Math.max(...movable.map((object) => object.yM + object.lengthM))
    editor.moveObjects(movable.map((object) => ({
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
    const closeMenu = (event: PointerEvent) => {
      const menu = moreMenuRef.current
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) menu.removeAttribute('open')
      const areaMenu = areaMenuRef.current
      if (areaMenu && event.target instanceof Node && !areaMenu.contains(event.target)) setAreaMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeMenu)
    return () => document.removeEventListener('pointerdown', closeMenu)
  }, [])
  useEffect(() => {
    activeAreaIdRef.current = activeAreaId
  }, [activeAreaId])
  useEffect(() => {
    if (!integrated) return
    if (!betaEnabled) {
      navigate('/areas', { replace: true })
      return
    }
    let cancelled = false
    areaMapRepository.listAreas()
      .then((nextAreas) => {
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
        if (activeAreaIdRef.current && selected && selected !== activeAreaIdRef.current) {
          setSearchParams({ area: activeAreaIdRef.current }, { replace: true })
          return
        }
        activeAreaIdRef.current = selected
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
        setEditing(context.permissions.canEdit && !context.map)
        setShowSetupGuide(context.permissions.canEdit && !context.map)
        lastSyncedRef.current = JSON.stringify(next)
        setCanEdit(context.permissions.canEdit)
        setSyncState(context.permissions.canEdit ? 'saved' : 'readonly')
        setSyncMessage(context.map ? tr('Saved', 'Išsaugota') : tr('New Area map · not saved yet', 'Naujas erdvės žemėlapis · dar neišsaugotas'))
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
  }, [activeAreaId, integrated, loadVersion, navigate])

  const saveRemote = useCallback(async () => {
    if (!integrated || !activeAreaId || !canEdit) return true
    if (savingRef.current) return false
    const areaId = activeAreaId
    const mapToSave = editor.map
    const serialized = JSON.stringify(editor.map)
    if (serialized === lastSyncedRef.current && revisionRef.current > 0) {
      setSyncState('saved')
      return true
    }
    savingRef.current = true
    setSyncState('saving')
    setSyncMessage(tr('Saving to NeuroCrop…', 'Saugoma „NeuroCrop“…'))
    try {
      const result = await areaMapRepository.save(areaId, mapToSave, revisionRef.current)
      if (activeAreaIdRef.current !== areaId) return true
      revisionRef.current = result.revision
      lastSyncedRef.current = serialized
      setSyncState('saved')
      setSyncMessage(tr('Saved', 'Išsaugota'))
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : tr('Area map could not be saved.', 'Erdvės žemėlapio išsaugoti nepavyko.')
      const conflict = message.toLowerCase().includes('another session') || message.toLowerCase().includes('reload')
      setSyncState(conflict ? 'conflict' : 'error')
      setSyncMessage(message)
      setNotice({ tone: 'error', text: message })
      return false
    } finally {
      savingRef.current = false
    }
  }, [activeAreaId, canEdit, editor.map, integrated, tr])

  useEffect(() => {
    if (!integrated || !activeAreaId || !canEdit || !lastSyncedRef.current || ['initializing', 'loading', 'saving', 'conflict'].includes(syncState)) return
    const serialized = JSON.stringify(editor.map)
    if (serialized === lastSyncedRef.current && revisionRef.current > 0) return
    window.clearTimeout(remoteSaveTimerRef.current)
    remoteSaveTimerRef.current = window.setTimeout(() => void saveRemote(), 1200)
    return () => window.clearTimeout(remoteSaveTimerRef.current)
  }, [activeAreaId, canEdit, editor.map, integrated, saveRemote, syncState])

  const flushRemoteChanges = useCallback(async () => {
    window.clearTimeout(remoteSaveTimerRef.current)
    if (!integrated || !canEdit) return true
    const serialized = JSON.stringify(editor.map)
    if (serialized === lastSyncedRef.current && revisionRef.current > 0) return true
    if (savingRef.current) {
      const completed = await new Promise<boolean>((resolve) => {
        const startedAt = Date.now()
        const timer = window.setInterval(() => {
          if (!savingRef.current || Date.now() - startedAt > 10_000) {
            window.clearInterval(timer)
            resolve(!savingRef.current)
          }
        }, 50)
      })
      if (!completed) return false
      if (serialized === lastSyncedRef.current && revisionRef.current > 0) return true
    }
    const saved = await saveRemote()
    return saved && lastSyncedRef.current === serialized && revisionRef.current > 0
  }, [canEdit, editor.map, integrated, saveRemote])

  const switchArea = async (nextAreaId: string) => {
    if (!nextAreaId || nextAreaId === activeAreaId) return
    if (syncState === 'conflict') {
      setNotice({ tone: 'error', text: tr('Reload the latest map before switching Areas.', 'Prieš keičiant erdvę įkelkite naujausią žemėlapį.') })
      return
    }
    if (!await flushRemoteChanges()) return
    setAreaContext(null)
    areaContextRef.current = null
    setSyncState('loading')
    setSyncMessage('')
    activeAreaIdRef.current = nextAreaId
    setActiveAreaId(nextAreaId)
    setSearchParams({ area: nextAreaId }, { replace: true })
  }

  const reloadLatest = () => {
    if (!window.confirm(tr('Reload the latest saved map? Unsaved local changes will be discarded.', 'Įkelti naujausią išsaugotą žemėlapį? Neišsaugoti vietiniai pakeitimai bus prarasti.'))) return
    window.clearTimeout(remoteSaveTimerRef.current)
    setSyncState('loading')
    setSyncMessage('')
    setLoadVersion((current) => current + 1)
  }

  const retrySync = () => {
    if (areaContextRef.current && canEdit) {
      void saveRemote()
      return
    }
    setSyncState('loading')
    setSyncMessage('')
    setLoadVersion((current) => current + 1)
  }

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const inputFocused = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement
      if (inputFocused) return
      if (event.key === 'Escape') {
        moreMenuRef.current?.removeAttribute('open')
        setAreaMenuOpen(false)
        editor.setSelectedIds([])
        setMobilePanel('none')
        return
      }
      if (!layoutEditable) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) editor.redo()
        else editor.undo()
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') { event.preventDefault(); editor.copySelected() }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') { event.preventDefault(); editor.pasteCopied() }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        editor.deleteSelected()
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [editor, layoutEditable])

  const exportMap = () => {
    const plan = structuredClone(editor.map) as GreenhouseMap
    plan.objects = plan.objects.map((object) => {
      if (!object.metadata.sensor) return object
      const sensor = { ...object.metadata.sensor }
      delete sensor.measurements
      delete sensor.rssi
      delete sensor.snr
      delete sensor.lastSeenAt
      delete sensor.batteryPercent
      return { ...object, metadata: { ...object.metadata, sensor } }
    })
    const validation = validateMap(plan)
    if (!validation.ok) {
      setNotice({ tone: 'error', text: validation.error })
      return
    }
    const blob = new Blob([JSON.stringify(validation.map, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${editor.map.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'greenhouse-map'}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setNotice({ tone: 'success', text: tr('Plan backup downloaded.', 'Plano atsarginė kopija atsisiųsta.') })
  }
  const importFile = async (file?: File) => {
    if (!file || !layoutEditable) return
    try {
      const result = validateMap(JSON.parse(await file.text()))
      if (!result.ok) throw new Error(result.error)
      const imported = integrated && areaContextRef.current
        ? mergeAreaMapContext({ ...result.map, areaId: activeAreaId }, areaContextRef.current.area, areaContextRef.current.nodes, areaContextRef.current.sections)
        : result.map
      const mergedResult = validateMap(imported)
      if (!mergedResult.ok) throw new Error(mergedResult.error)
      if (!window.confirm(tr('Import this plan? The current layout will be replaced.', 'Importuoti šį planą? Dabartinis išdėstymas bus pakeistas.'))) return
      editor.replace(mergedResult.map)
      setNotice({ tone: 'success', text: tr('Plan imported. Changes will save automatically.', 'Planas importuotas. Pakeitimai bus išsaugoti automatiškai.') })
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : tr('The selected file is not valid NeuroCrop map JSON.', 'Pasirinktas failas nėra tinkamas „NeuroCrop“ žemėlapio JSON failas.') })
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const resetMap = () => {
    const prompt = integrated
      ? tr('Clear this layout? Placed equipment will be removed and assigned nodes repositioned automatically. Area dimensions will be kept.', 'Išvalyti šį išdėstymą? Įranga bus pašalinta, o priskirti mazgai išdėstyti automatiškai. Erdvės matmenys išliks.')
      : tr('Reset this plan to the NeuroCrop demo? Your local changes will be replaced.', 'Atkurti „NeuroCrop“ demonstracinį planą? Vietiniai pakeitimai bus pakeisti.')
    if (!window.confirm(prompt)) return
    if (integrated && areaContextRef.current) {
      const fresh = createAreaMap(areaContextRef.current.area, [], areaContextRef.current.sections)
      const base: GreenhouseMap = {
        ...fresh,
        dimensions: { ...editor.map.dimensions },
        gridSizeM: editor.map.gridSizeM,
        orientationDeg: editor.map.orientationDeg,
        heatmapSettings: { ...editor.map.heatmapSettings },
        objects: [],
      }
      editor.replace(mergeAreaMapContext(base, areaContextRef.current.area, areaContextRef.current.nodes, areaContextRef.current.sections))
      setNotice({ tone: 'success', text: tr('Layout cleared. Area dimensions were kept; Undo is available.', 'Išdėstymas išvalytas. Erdvės matmenys išsaugoti; veiksmą galima atšaukti.') })
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
        activeAreaIdRef.current = area.id
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
    if (!await flushRemoteChanges()) return
    // Area Map and the approved dashboard use separate page shells. A document
    // navigation guarantees the dashboard runtime starts from a clean DOM.
    window.location.assign('/areas')
  }

  const openNodes = async () => {
    if (!await flushRemoteChanges()) return
    navigate('/nodes')
  }

  const toggleEditing = async () => {
    if (editing) {
      if (!await flushRemoteChanges()) return
      setEditing(false)
      return
    }
    setMode('layout')
    setEditing(true)
  }

  if (integrated && ['initializing', 'loading'].includes(syncState)) {
    return <div className="gh-app gh-integrated-loading"><div><i className="fa-solid fa-spinner fa-spin" /><strong>{tr('Loading Area Map Beta', 'Įkeliamas erdvės žemėlapis')}</strong><span>{tr('Connecting the plan with the Area, assigned nodes and latest sensor readings…', 'Planas susiejamas su erdve, priskirtais mazgais ir naujausiais sensorių rodmenimis…')}</span></div></div>
  }

  if (integrated && syncState === 'error' && !activeAreaId) {
    return <div className="gh-app gh-integrated-loading"><div className="gh-create-area"><i className="fa-solid fa-seedling" /><strong>{tr('Create your first greenhouse', 'Sukurkite pirmąjį šiltnamį')}</strong><span>{tr('Create the Area first, then assign nodes and arrange their real positions on the plan.', 'Pirmiausia sukurkite erdvę, tada priskirkite mazgus ir plane nurodykite tikrąsias jų vietas.')}</span><input value={newArea.name} onChange={(event) => setNewArea({ ...newArea, name: event.target.value })} placeholder={tr('Greenhouse name', 'Šiltnamio pavadinimas')} /><input value={newArea.location} onChange={(event) => setNewArea({ ...newArea, location: event.target.value })} placeholder={tr('Location (optional)', 'Vieta (nebūtina)')} /><button disabled={!newArea.name.trim() || creatingArea} onClick={createFirstArea}>{creatingArea ? tr('Creating…', 'Kuriama…') : tr('Create greenhouse', 'Sukurti šiltnamį')}</button>{syncMessage ? <small>{syncMessage}</small> : null}</div></div>
  }

  const permissionReadOnly = integrated && !canEdit
  const inspectorReadOnly = !layoutEditable
  const canvasViewReadOnly = permissionReadOnly || !editing
  const showLeftPanel = layoutEditable
  const showRightPanel = editor.selected.length > 0
  const activeArea = areas.find((area) => area.id === activeAreaId)
  const deletableSelectedCount = editor.selected.filter((object) => object.type !== 'sensor-node' && object.type !== 'section-zone' && !object.locked && !editor.map.layers.find((layer) => layer.id === object.layerId)?.locked).length
  return <div className={`gh-app ${integrated ? 'gh-integrated' : ''} ${inspectorReadOnly ? 'gh-readonly' : ''} ${showLeftPanel ? '' : 'gh-without-left-panel'} ${showRightPanel ? '' : 'gh-without-right-panel'} gh-mobile-${mobilePanel}`}>
    <GreenhouseMapToolbar mode={mode} metric={editor.map.heatmapSettings.metric} snap={editor.snap} editing={layoutEditable} language={language} canUndo={layoutEditable && editor.canUndo} canRedo={layoutEditable && editor.canRedo} selectedCount={layoutEditable ? deletableSelectedCount : 0} duplicableSelectedCount={layoutEditable ? editor.duplicableSelectedCount : 0} canPaste={layoutEditable && editor.canPaste}
      onMode={(nextMode) => { setMode(nextMode); setMobilePanel('none') }} onMetric={updateMetric} onSnap={editor.setSnap} onUndo={layoutEditable ? editor.undo : () => undefined} onRedo={layoutEditable ? editor.redo : () => undefined} onCopy={layoutEditable ? editor.copySelected : () => undefined} onPaste={layoutEditable ? editor.pasteCopied : () => undefined} onDelete={layoutEditable ? editor.deleteSelected : () => undefined}
    />
    <div className="gh-action-strip">
      <button onClick={() => void leaveMap()}><i className="fa-solid fa-arrow-left" /> {integrated ? tr('Back to Areas', 'Grįžti į erdves') : tr('Exit test lab', 'Uždaryti testą')}</button>
      <span />
      {integrated ? <div ref={areaMenuRef} className="gh-area-selector"><span>{tr('Area', 'Erdvė')}</span><div className="gh-area-picker">
        <button type="button" className="gh-area-trigger" disabled={syncState === 'saving' || syncState === 'loading'} aria-haspopup="listbox" aria-expanded={areaMenuOpen} onClick={() => { moreMenuRef.current?.removeAttribute('open'); setAreaMenuOpen((current) => !current) }}><strong>{activeArea?.name || tr('Select Area', 'Pasirinkite erdvę')}</strong><i className={`fa-solid fa-chevron-${areaMenuOpen ? 'up' : 'down'}`} /></button>
        {areaMenuOpen ? <div className="gh-area-menu" role="listbox" aria-label={tr('Area', 'Erdvė')}>{areas.map((area) => <button type="button" role="option" aria-selected={area.id === activeAreaId} className={area.id === activeAreaId ? 'active' : ''} key={area.id} onClick={() => { setAreaMenuOpen(false); void switchArea(area.id) }}><i className={`fa-solid ${area.id === activeAreaId ? 'fa-check' : 'fa-location-dot'}`} /><span>{area.name}</span></button>)}</div> : null}
      </div></div> : null}
      <small className={`gh-sync-state ${syncState}`}><i className={`fa-solid ${integrated ? syncState === 'saving' ? 'fa-arrows-rotate fa-spin' : syncState === 'conflict' || syncState === 'error' ? 'fa-triangle-exclamation' : permissionReadOnly ? 'fa-eye' : 'fa-cloud' : 'fa-flask'}`} /> {integrated ? syncState === 'error' || syncState === 'conflict' ? syncMessage : permissionReadOnly ? tr('Read only · live data', 'Tik skaitymui · dabartiniai duomenys') : syncMessage || tr('Changes save automatically', 'Pakeitimai išsaugomi automatiškai') : tr('Local prototype', 'Vietinis prototipas')}</small>
      {syncState === 'conflict' ? <button onClick={reloadLatest}><i className="fa-solid fa-rotate" /> {tr('Reload latest', 'Įkelti naujausią')}</button> : null}
      {syncState === 'error' ? <button onClick={retrySync}><i className="fa-solid fa-rotate" /> {tr('Retry', 'Bandyti dar kartą')}</button> : null}
      {integrated && !permissionReadOnly ? <button className={editing ? 'gh-edit-active' : ''} onClick={() => void toggleEditing()}><i className={`fa-solid ${editing ? 'fa-eye' : 'fa-pen-ruler'}`} /> {editing ? tr('Finish editing', 'Baigti redagavimą') : tr('Edit map', 'Redaguoti žemėlapį')}</button> : null}
      {showLeftPanel ? <button className="gh-mobile-only" onClick={() => setMobilePanel((current) => current === 'left' ? 'none' : 'left')}><i className="fa-solid fa-sliders" /></button> : null}
      {showRightPanel ? <button className="gh-mobile-only" onClick={() => setMobilePanel((current) => current === 'right' ? 'none' : 'right')}><i className="fa-solid fa-circle-info" /></button> : null}
      <button onClick={toggleLanguage}>{language.toUpperCase()}</button>
      {!integrated ? <button onClick={() => { editor.save(); setNotice({ tone: 'success', text: tr('Plan saved in this browser.', 'Planas išsaugotas šioje naršyklėje.') }) }}><i className="fa-regular fa-floppy-disk" /> {tr('Save', 'Išsaugoti')}</button> : null}
      <details ref={moreMenuRef} className="gh-map-more" onToggle={(event) => { if (event.currentTarget.open) setAreaMenuOpen(false) }}><summary><i className="fa-solid fa-ellipsis" /> {tr('More', 'Daugiau')}</summary><div>
        <button onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); exportMap() }}><i className="fa-solid fa-arrow-up-from-bracket" /> {tr('Export plan', 'Eksportuoti planą')}</button>
        {layoutEditable ? <button onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); inputRef.current?.click() }}><i className="fa-solid fa-arrow-down-to-bracket" /> {tr('Import plan', 'Importuoti planą')}</button> : null}
        {layoutEditable ? <button className="danger" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); resetMap() }}><i className="fa-solid fa-arrow-rotate-left" /> {tr('Clear layout', 'Išvalyti išdėstymą')}</button> : null}
      </div></details>
      <input ref={inputRef} hidden type="file" accept="application/json,.json" onChange={(event) => void importFile(event.target.files?.[0])} />
    </div>
    <div className="gh-workspace">
      {mobilePanel !== 'none' ? <button type="button" className="gh-mobile-panel-scrim" aria-label={tr('Close map panel', 'Uždaryti žemėlapio skydelį')} onClick={() => setMobilePanel('none')} /> : null}
      {showLeftPanel ? <aside className="gh-left-panel">
        <GreenhouseSettingsPanel map={editor.map} language={language} onChange={(next) => editor.commit(() => next)} />
        <ObjectLibraryPanel language={language} allowDraftNode={!integrated} onAdd={editor.addObject} />
        <details className="gh-advanced-panel"><summary><i className="fa-solid fa-layer-group" /> {tr('Layer controls', 'Sluoksnių valdymas')}</summary><LayersPanel layers={editor.map.layers} language={language} onChange={(layers) => editor.commit((map) => ({ ...map, layers }))} /></details>
      </aside> : null}
      <GreenhouseCanvas map={editor.map} mode={mode} readOnly={canvasViewReadOnly} language={language} selectedIds={editor.selectedIds} snap={editor.snap} onSelect={(ids) => { editor.setSelectedIds(ids); if (ids.length) setMobilePanel('right'); else setMobilePanel('none') }} onMove={moveOnCanvas} onUpdate={layoutEditable ? editor.updateObject : () => undefined} onAdd={layoutEditable ? editor.addObject : () => undefined} />
      {showRightPanel ? <ObjectPropertiesPanel map={editor.map} selected={editor.selected} language={language} onUpdate={layoutEditable ? editor.updateObject : () => undefined} onAlign={layoutEditable ? align : () => undefined} /> : null}
    </div>
    {showSetupGuide && areaContext ? <MapSetupGuide area={areaContext.area} map={editor.map} nodes={areaContext.nodes} language={language} onMapChange={(map) => editor.commit(() => map)} onOpenNodes={() => void openNodes()} onClose={() => { setShowSetupGuide(false); if (!permissionReadOnly) { setEditing(true); setMode('layout') } }} /> : null}
    {notice ? <button className={`gh-notice ${notice.tone}`} onClick={() => setNotice(null)}><i className={`fa-solid ${notice.tone === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation'}`} />{notice.text}<i className="fa-solid fa-xmark" /></button> : null}
  </div>
}
