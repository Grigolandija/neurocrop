// Different crop stages and historical targets must remain distinct decisions.
// Multiple probes in the same context select the strongest observed location;
// their durations are never added together as elapsed greenhouse time.
export function decisionKey(risk) {
  return JSON.stringify([
    risk.sectionId, risk.kind, risk.profileId ?? null, risk.stage ?? null,
    risk.crops ?? [], risk.target ?? risk.support?.map(s => [s.metric, s.target]) ?? null
  ]);
}

export function decisionEvidence(risk, summaryOnly = false) {
  return {
    ruleId: risk.kind,
    nodeId: risk.nodeId,
    contextId: risk.contextId ?? null,
    profileId: risk.profileId ?? null,
    stage: risk.stage ?? null,
    crops: [...(risk.crops || [])],
    contextQuality: summaryOnly ? 'summary-only' : risk.estimated ? 'estimated' : 'captured',
    from: risk.firstAt,
    to: risk.lastAt,
    observedMinutes: risk.minutes,
    longestMinutes: summaryOnly ? null : risk.longestMinutes,
    target: risk.target ?? null,
    support: risk.support?.map(s => ({ ...s, target: s.target ? [...s.target] : null })) ?? [],
    rootObservedMinutes: summaryOnly ? null : risk.rootObservedMinutes ?? null,
    rootDryMinutes: summaryOnly ? null : risk.rootDryMinutes ?? null
  };
}
