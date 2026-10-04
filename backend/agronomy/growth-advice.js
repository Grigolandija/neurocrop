import { METRIC_DEFINITIONS } from '../metric-registry.js';
import { growthAdviceRules, SOURCES as sources } from './catalog.js';
import { decisionKey, decisionEvidence } from './evidence.js';

export function growthAdvice(report, lt) {
    const t = (p) => p[lt ? 0 : 1], n = (v) => v.toLocaleString(lt ? 'lt-LT' : 'en-GB', { maximumFractionDigits: 2 });
    const all = (report.agronomy || []).filter((r) => 'primaryMetric' in r);
    const selected = new Map();
    for (const r of all) {
        const key = decisionKey(r);
        if (!selected.has(key) || selected.get(key).minutes < r.minutes)
            selected.set(key, r);
    }
    return [...selected.values()].filter(r => growthAdviceRules[r.kind]).sort((a, b) => growthAdviceRules[b.kind].priority - growthAdviceRules[a.kind].priority || b.minutes - a.minutes).map(r => {
        const rule = growthAdviceRules[r.kind];
        const readings = r.support.map(s => { const def = METRIC_DEFINITIONS[s.metric]; return `${def ? (lt ? def.labelLt : def.label) : s.metric}: ${n(s.minimum)}–${n(s.maximum)} ${s.unit}${s.target ? ` (${t(['profilis', 'profile'])} ${s.target.map(n).join('–')})` : ''}`; }).join('; ');
        const evidence = `${r.nodeName}: ${readings}. ${t(['Sąlyga užfiksuota', 'Condition recorded for'])} ${n(r.minutes / 60)} h; ${t(['ilgiausiai be pertraukos', 'longest continuous period'])} ${n(r.longestMinutes / 60)} h.`;
        const context = [...r.crops, r.stage].filter(Boolean).join(' · ');
        let limits = context ? `${t(['Auginimo kontekstas', 'Growing context'])}: ${context}. ` : t(['Kultūra ar stadija nepatvirtinta; tai bendras fiziologinis vertinimas. ', 'Crop or stage is unconfirmed; this is a general physiological interpretation. ']);
        if (r.estimated)
            limits += t(['Istorinės ribos nepatvirtintos; prieš korekciją patikrinkite profilį. ', 'Historical targets are unverified; confirm the profile before adjustment. ']);
        if (r.support.some(s => s.metric === 'lux'))
            limits += t(['Liuksai yra apšviestumo indikatorius, ne augalui tenkančių fotonų ar DLI matavimas. ', 'Lux is an illuminance indicator, not a measurement of plant photons or DLI. ']);
        if (['ph', 'ec', 'soilEc', 'soilMoisture', 'soilTemp', 'waterTemp'].includes(r.primaryMetric))
            limits += t(['Išvada taikoma zondo vietai; tyrimo metodas ir terpė turi atitikti pasirinktas ribas. ', 'This applies at the probe location; sampling method and medium must match the configured limits. ']);
        return { priority: rule.priority, id: decisionKey(r), ruleId: r.kind, place: r.sectionName, title: t(rule.title), meaning: t(rule.meaning), action: t(rule.action), verify: t(rule.verify), evidence, limits, source: sources[rule.source], evidenceDetails: decisionEvidence(r) };
    });
}
