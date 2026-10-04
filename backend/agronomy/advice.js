import { growthAdvice } from './growth-advice.js';
import { waterInterpretation, HISTORICAL_INCLUSION_MINUTES, LEGACY_MIN_COVERAGE_PCT } from './catalog.js';
import { decisionKey, decisionEvidence } from './evidence.js';

export function agronomicAdvice(report, lt) {
    const t = (a, b) => lt ? a : b;
    const n = (v) => v.toLocaleString(lt ? 'lt-LT' : 'en-GB', { maximumFractionDigits: 1 });
    // Older reports can support an interpretation of VPD exposure, but cannot support
    // claims about simultaneous root moisture, condensation, crop stage or episode length.
    const candidates = report.agronomy !== undefined
        ? report.agronomy.filter((risk) => !('primaryMetric' in risk)).map(risk => ({ risk, summaryOnly: false }))
        : (report.nodes || []).filter(m => m.metric === 'vpd' && m.observedMinutes > 0 && m.coveragePct >= LEGACY_MIN_COVERAGE_PCT).flatMap(m => ['high-vpd', 'low-vpd'].flatMap(kind => {
            const minutes = kind === 'high-vpd' ? m.aboveMinutes : m.belowMinutes;
            return minutes >= HISTORICAL_INCLUSION_MINUTES ? [{ summaryOnly: true, risk: { kind, nodeId: m.nodeId || '', nodeName: m.nodeName || m.nodeId || m.name, sectionId: m.sectionId, sectionName: m.name, profileId: null, stage: null, crops: [], estimated: m.estimatedContextPct > 0, minutes, longestMinutes: 0, rootDryMinutes: 0, rootObservedMinutes: 0, vpdMin: m.minimum ?? 0, vpdMax: m.maximum ?? 0, target: null, firstAt: report.from, lastAt: report.to, dewPoint: null, leafTemperature: null } }] : [];
        }));
    const selected = new Map();
    for (const c of candidates) {
        const key = decisionKey(c.risk);
        if (!selected.has(key) || selected.get(key).risk.minutes < c.risk.minutes)
            selected.set(key, c);
    }
    const ranked = [...selected.values()].sort((a, b) => {
        const priority = (r) => waterInterpretation(r, false).priority;
        return priority(b.risk) - priority(a.risk) || b.risk.minutes - a.risk.minutes;
    });
    const waterAdvice = ranked.map(({ risk: r, summaryOnly }) => {
        const high = r.kind === 'high-vpd', dew = r.kind === 'leaf-condensation', dry = r.rootDryMinutes >= 30;
        const {title,meaning,action,verify,priority,source} = waterInterpretation(r,lt);
        let evidence = dew ? t(`${r.nodeName}: lapo temperatūra ${n(r.leafTemperature)} °C, rasos taškas ${n(r.dewPoint)} °C vienu metu. Sąlyga užfiksuota ${n(r.minutes / 60)} h.`, `${r.nodeName}: leaf temperature ${n(r.leafTemperature)} °C and dew point ${n(r.dewPoint)} °C at the same time. Condition recorded for ${n(r.minutes / 60)} h.`)
            : t(`${r.nodeName}: VPD ${high ? 'virš' : 'žemiau'} profilio ribos ${n(r.minutes / 60)} h.`, `${r.nodeName}: VPD ${high ? 'above' : 'below'} the profile target for ${n(r.minutes / 60)} h.`);
        if (!summaryOnly)
            evidence += t(` Ilgiausias nenutrūkstamas laikotarpis ${n(r.longestMinutes / 60)} h.`, ` Longest continuous period ${n(r.longestMinutes / 60)} h.`);
        if (dry)
            evidence += t(` Sausa šaknų zona tuo pat metu: ${n(r.rootDryMinutes / 60)} h.`, ` Concurrent root-zone readings below target: ${n(r.rootDryMinutes / 60)} h.`);
        const context = [...r.crops, r.stage].filter(Boolean).join(' · ');
        let limits = context ? t(`Auginimo kontekstas: ${context}. `, `Growing context: ${context}. `) : t('Kultūra ar stadija šiuose matavimuose nepatvirtinta; taikomas bendras fiziologinis vertinimas. ', 'Crop or stage is not confirmed in these readings; this is a general physiological interpretation. ');
        if (r.estimated && !dew)
            limits += t('Istorinės ribos dalinai nepatvirtintos — prieš korekciją patikrinkite jų tinkamumą. ', 'Historical targets are partly unverified — confirm their suitability before adjusting. ');
        if (summaryOnly)
            limits += t('Tai atskirų VPD matavimų vertinimas; sutapimas su šaknų drėgme ir nenutrūkstamos trukmės nežinomi.', 'This uses VPD summaries; simultaneous root moisture and continuous durations are unknown.');
        else if (high && !r.rootObservedMinutes)
            limits += t('Nėra tinkamų vienalaikių šaknų zonos drėgmės duomenų — vandens trūkumas substrate nepatvirtintas.', 'No suitable simultaneous root-zone moisture evidence — substrate water deficit is not established.');
        return { priority, id: decisionKey(r), ruleId: r.kind, place: r.sectionName, title, meaning, action, verify, evidence, limits, source, evidenceDetails: decisionEvidence(r, summaryOnly) };
    });
    return [...growthAdvice(report, lt), ...waterAdvice].sort((a, b) => b.priority - a.priority);
}
