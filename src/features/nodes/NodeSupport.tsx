import { useEffect, useState } from 'react'
import { useInterfaceLanguage } from '../../i18n'
import { metricDefinitions } from '../../domain/metricRegistry'
import { neurocropApi } from '../../services/api/neurocropApi'
import '../../styles/node-support.css'

type Support = { code: string; expectedIntervalSec: number; elapsedIntervals: number | null }
type Uplink = { id: string; received_at: string; measured_at: string; frame_counter: number | null;
  firmware_version: string | null; decoder_version: string | null; normalizer_version: string;
  outcome: string; evidence: { timestampSource: string; metrics: Record<string, { value: number | null; reason: string }> } }

export default function NodeSupport({ devEui, support, simulated }: { devEui: string; support?: Support; simulated: boolean }) {
  const { language } = useInterfaceLanguage(), lt = language === 'lt'
  const t = (a: string, b: string) => lt ? a : b
  const [open, setOpen] = useState(false), [attempt, setAttempt] = useState(0)
  const [uplinks, setUplinks] = useState<Uplink[] | null>(null), [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!open) return
    let active = true
    neurocropApi.getNodeUplinks(devEui).then(value => {
      if (active) { setUplinks((value as { uplinks: Uplink[] }).uplinks || []); setFailed(false) }
    }).catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [devEui, open, attempt])
  if (simulated) return null
  const messages: Record<string, [string, string]> = {
    never_received: ['Iš šio mazgo dar negauta pranešimų. Patikrinkite registraciją, maitinimą ir gateway ryšį.', 'No messages received from this node yet. Check registration, power and gateway connectivity.'],
    gateway_unavailable: ['Negauta laukiamų mazgo pranešimų; paskutinių žinomų gateway būsenos pranešimai taip pat pasenę. Pirmiausia patikrinkite gateway maitinimą ir internetą.', 'Expected node messages are missing and the last known gateways have stale heartbeats. Check gateway power and internet first.'],
    node_unavailable: ['Gateway būsenos pranešimas naujas, tačiau mazgo pranešimai vėluoja. Patikrinkite mazgo maitinimą, anteną ir jo vietą.', 'A gateway heartbeat is current, but node messages are late. Check node power, antenna and placement.'],
    connection_unknown: ['Mazgo pranešimai vėluoja. Gateway būklės duomenų nepakanka sutrikimo vietai nustatyti.', 'Node messages are late. Gateway evidence is insufficient to locate the fault.'],
    sensor_unavailable: ['Mazgas siunčia pranešimus, bet praneša apie trūkstamą jutiklį arba pasenusius matavimus. Patikrinkite jutiklio jungtį ir naujų matavimų gavimą.', 'The node is sending messages but reports a missing sensor or stale readings. Check the sensor connection and new measurements.'],
    battery_attention: ['Mazgas praneša apie žemą baterijos įkrovą. Patikrinkite maitinimą ir suplanuokite baterijos priežiūrą.', 'The node reports low battery. Check power and plan battery maintenance.'],
    device_attention: ['Mazgas praneša apie įrenginio klaidą. Peržiūrėkite įrenginio būseną ir paskutinius gautus matavimus.', 'The node reports a device error. Review its status and latest measurements.'],
    reporting: ['Pranešimai gaunami pagal numatytą intervalą. Aktyvių įrenginio klaidų nepranešta.', 'Messages are arriving within the expected interval. No active device faults reported.']
  }
  const message = support && messages[support.code]
  const date = (v: string) => new Date(v).toLocaleString(lt ? 'lt-LT' : 'en-GB')
  return <section className="nc-node-support">
    {support && message ? <><h3>{t('Ką patikrinti', 'What to check')}</h3><p>{t(...message)}</p>
      <small>{t('Numatytas siuntimo intervalas', 'Expected reporting interval')}: {support.expectedIntervalSec % 60 === 0 ? `${support.expectedIntervalSec / 60} min` : `${support.expectedIntervalSec} s`}.
        {support.elapsedIntervals !== null && support.elapsedIntervals > 2 ? ` ${t('Nuo paskutinio pranešimo praėjo intervalų', 'Reporting intervals elapsed since the last message')}: ${support.elapsedIntervals}.` : ''}</small></> : null}
    <details onToggle={e => setOpen(e.currentTarget.open)}>
      <summary>{t('Paskutinių pranešimų atsekamumas', 'Latest message trace')}</summary>
      <p>{t('Rodoma iki 20 paskutinių pranešimų. Pakartotinis pristatymas nesukuria naujo matavimo. Senesniems matavimams atsekamumo įrašų gali nebūti.', 'Shows up to 20 recent messages. Redelivery does not create a new measurement. Older measurements may have no trace records.')}</p>
      {failed ? <p role="alert">{t('Nepavyko gauti pranešimų.', 'Could not load messages.')} <button onClick={() => { setFailed(false); setAttempt(v => v + 1) }}>{t('Bandyti dar kartą', 'Try again')}</button></p>
        : !uplinks ? <p role="status">{t('Įkeliama…', 'Loading…')}</p>
          : !uplinks.length ? <p>{t('Atsekamumo įrašų dar nėra. Jie kaupiami gavus naujus tikrų įrenginių pranešimus.', 'No trace records yet. Records are captured when new physical-device messages arrive.')}</p>
            : uplinks.map(event => <details className="nc-node-uplink" key={event.id}>
              <summary>{date(event.received_at)} · {event.outcome === 'stored' ? t('Matavimas įrašytas', 'Measurement stored') : t('Matavimas jau buvo įrašytas', 'Measurement already recorded')}</summary>
              <dl><dt>{t('Matavimo laikas', 'Measurement time')}</dt><dd>{date(event.measured_at)} · {event.evidence.timestampSource === 'device' ? t('įrenginio laikas', 'device time') : t('tinklo gavimo laikas', 'network reception time')}</dd>
                <dt>{t('Programinė įranga / dekoderis', 'Firmware / decoder')}</dt><dd>{event.firmware_version || t('Nepranešta', 'Not reported')} / {event.decoder_version || t('Nepranešta', 'Not reported')}</dd>
                <dt>{t('Paketo skaitiklis', 'Frame counter')}</dt><dd>{event.frame_counter ?? '—'}</dd>
                <dt>{t('Apdorojimo versija', 'Processing version')}</dt><dd>{event.normalizer_version}</dd></dl>
              <div className="nc-node-uplink-table"><table><thead><tr><th>{t('Rodiklis', 'Metric')}</th><th>{t('Reikšmė', 'Value')}</th><th>{t('Vertinimas', 'Assessment')}</th></tr></thead><tbody>
                {Object.entries(event.evidence.metrics).filter(([, m]) => m.reason !== 'not_reported').map(([key, m]) => {
                  const definition = Object.values(metricDefinitions).find(d => d.telemetryKey === key)
                  return <tr key={key}><th>{definition ? lt ? definition.labelLt : definition.label : key}</th><td>{m.value === null ? '—' : `${m.value} ${definition?.unit || ''}`}</td><td>{m.reason === 'accepted' ? t('Tinkamas naujas matavimas', 'Valid new measurement') : m.reason === 'not_new_measurement' ? t('Jutiklis nepateikė naujo matavimo', 'Sensor did not provide a new measurement') : t('Netinkama reikšmė', 'Invalid value')}</td></tr>
                })}</tbody></table></div>
              <small>{t('Pranešimo ID', 'Message ID')}: {event.id}</small>
            </details>)}
    </details>
  </section>
}
