(function (root) {
  "use strict";

  const STATUS_RANK = Object.freeze({
    live: 0,
    delayed: 1,
    stale: 2,
    offline: 3
  });

  const CONDITION_RANK = Object.freeze({
    optimal: 0,
    warning: 1,
    critical: 2,
    unknown: 3
  });

  function toEpoch(value) {
    const epoch = typeof value === "number" ? value : Date.parse(value || "");
    return Number.isFinite(epoch) ? epoch : null;
  }

  function iso(value) {
    const epoch = toEpoch(value);
    return epoch === null ? null : new Date(epoch).toISOString();
  }

  function ageSeconds(timestamp, now) {
    const epoch = toEpoch(timestamp);
    return epoch === null ? Number.POSITIVE_INFINITY : Math.max(0, (now - epoch) / 1000);
  }

  function rawFreshnessStatus(ageSec, expectedIntervalSec, options) {
    const interval = Math.max(1, Number(expectedIntervalSec) || 60);
    const grace = Math.max(0, Number(options.graceSec) || 0);
    if (ageSec <= interval * 1.5 + grace) return "live";
    if (ageSec <= interval * 3 + grace) return "delayed";
    if (ageSec <= interval * (Number(options.offlineMultiplier) || 10) + grace) return "stale";
    return "offline";
  }

  function applyRecoveryHysteresis(rawStatus, previousState, options) {
    if (!previousState?.status) {
      return { status: rawStatus, recoveryStreak: 0 };
    }

    const previousRank = STATUS_RANK[previousState.status] ?? STATUS_RANK.offline;
    const rawRank = STATUS_RANK[rawStatus] ?? STATUS_RANK.offline;
    if (rawRank >= previousRank) {
      return { status: rawStatus, recoveryStreak: 0 };
    }

    const nextStreak = (Number(previousState.recoveryStreak) || 0) + 1;
    const requiredSamples = Math.max(1, Number(options.recoverySamples) || 2);
    return {
      status: nextStreak >= requiredSamples ? rawStatus : previousState.status,
      recoveryStreak: nextStreak >= requiredSamples ? 0 : nextStreak
    };
  }

  function computeObservationFreshness(observation, now, previousObservation, options) {
    const expectedIntervalSec = Math.max(1, Number(observation?.expectedIntervalSec) || 600);
    const observationAgeSec = ageSeconds(observation?.lastObservedAt, now);
    const rawStatus = rawFreshnessStatus(observationAgeSec, expectedIntervalSec, {
      ...options,
      offlineMultiplier: Number(options.observationOfflineMultiplier) || Number(options.offlineMultiplier) || 10
    });
    const stable = applyRecoveryHysteresis(rawStatus, previousObservation, options);
    const rawTransitionCount = (Number(previousObservation?.rawTransitionCount) || 0)
      + (previousObservation?.rawStatus && previousObservation.rawStatus !== rawStatus ? 1 : 0);

    return {
      status: stable.status === "offline" ? "stale" : stable.status,
      rawStatus,
      lastObservedAt: iso(observation?.lastObservedAt),
      expectedIntervalSec,
      ageSec: Number.isFinite(observationAgeSec) ? Math.round(observationAgeSec) : null,
      recoveryStreak: stable.recoveryStreak,
      rawTransitionCount
    };
  }

  function computeNodeFreshness(node, nowInput, previousState, config) {
    const now = toEpoch(nowInput) ?? Date.now();
    const options = {
      graceSec: 15,
      offlineMultiplier: 10,
      observationOfflineMultiplier: 10,
      recoverySamples: 2,
      ...(config || {})
    };
    const expectedUplinkIntervalSec = Math.max(1, Number(node?.expectedUplinkIntervalSec) || 600);
    const transportAgeSec = ageSeconds(node?.lastReceivedAt, now);
    const rawTransportStatus = rawFreshnessStatus(transportAgeSec, expectedUplinkIntervalSec, options);
    const stableTransport = applyRecoveryHysteresis(rawTransportStatus, previousState, options);
    const rawTransitionCount = (Number(previousState?.rawTransitionCount) || 0)
      + (previousState?.rawStatus && previousState.rawStatus !== rawTransportStatus ? 1 : 0);
    const observations = {};

    Object.entries(node?.observations || {}).forEach(([metricId, observation]) => {
      observations[metricId] = computeObservationFreshness(
        observation,
        now,
        previousState?.observations?.[metricId],
        options
      );
    });

    const reasons = [];
    if (stableTransport.status !== "live") {
      reasons.push({
        code: `TRANSPORT_${stableTransport.status.toUpperCase()}`,
        nodeId: node?.id || null,
        ageSec: Number.isFinite(transportAgeSec) ? Math.round(transportAgeSec) : null
      });
    }
    Object.entries(observations).forEach(([metricId, observation]) => {
      if (observation.status !== "live") {
        reasons.push({
          code: `OBSERVATION_${observation.status.toUpperCase()}`,
          nodeId: node?.id || null,
          metricId,
          ageSec: observation.ageSec
        });
      }
    });
    if (rawTransitionCount >= 4) {
      reasons.push({
        code: "TRANSPORT_FLAPPING",
        nodeId: node?.id || null,
        count: rawTransitionCount
      });
    }

    return {
      nodeId: node?.id || null,
      status: stableTransport.status,
      transportStatus: stableTransport.status,
      rawStatus: rawTransportStatus,
      lastReceivedAt: iso(node?.lastReceivedAt),
      expectedUplinkIntervalSec,
      ageSec: Number.isFinite(transportAgeSec) ? Math.round(transportAgeSec) : null,
      recoveryStreak: stableTransport.recoveryStreak,
      rawTransitionCount,
      observations,
      reasons
    };
  }

  function isBackfill(reading, allowedLatenessSec) {
    const observedAt = toEpoch(reading?.observedAt);
    const receivedAt = toEpoch(reading?.receivedAt);
    if (observedAt === null || receivedAt === null) return false;
    return (receivedAt - observedAt) / 1000 > Math.max(0, Number(allowedLatenessSec) || 120);
  }

  function computeConditionStatus(readings, profile, nowInput, config) {
    const now = toEpoch(nowInput) ?? Date.now();
    const options = { allowedLatenessSec: 120, ...(config || {}) };
    const reasons = [];
    const lateEvents = [];
    let status = "optimal";
    let currentCount = 0;

    (Array.isArray(readings) ? readings : []).forEach((reading) => {
      const metric = profile?.[reading.metricId];
      if (!metric) return;
      const late = isBackfill(reading, options.allowedLatenessSec);
      const observationAgeSec = ageSeconds(reading.observedAt, now);
      const expectedIntervalSec = Number(reading.expectedIntervalSec) || 600;
      if (late) {
        lateEvents.push({
          code: "OUT_OF_RANGE_DETECTED_LATE",
          metricId: reading.metricId,
          observedAt: iso(reading.observedAt),
          receivedAt: iso(reading.receivedAt),
          value: reading.value
        });
        return;
      }
      if (observationAgeSec > expectedIntervalSec * 3) return;
      currentCount += 1;
      const value = Number(reading.value);
      let metricStatus = "optimal";
      if (Array.isArray(metric.critical) && (value < metric.critical[0] || value > metric.critical[1])) {
        metricStatus = "critical";
      } else if (Array.isArray(metric.warning) && (value < metric.warning[0] || value > metric.warning[1])) {
        metricStatus = "warning";
      } else if (Array.isArray(metric.optimal) && (value < metric.optimal[0] || value > metric.optimal[1])) {
        metricStatus = "warning";
      }
      if (CONDITION_RANK[metricStatus] > CONDITION_RANK[status]) status = metricStatus;
      if (metricStatus !== "optimal") {
        reasons.push({
          code: `CONDITION_${metricStatus.toUpperCase()}`,
          metricId: reading.metricId,
          value
        });
      }
    });

    if (currentCount === 0) status = "unknown";
    return { status, reasons, lateEvents, currentCount };
  }

  function worstStatus(states, key, rank, fallback) {
    return states.reduce((worst, state) => {
      const value = state?.[key] || fallback;
      return (rank[value] ?? 0) > (rank[worst] ?? 0) ? value : worst;
    }, fallback);
  }

  function deriveFarmState(input, nowInput) {
    const now = toEpoch(nowInput) ?? Date.now();
    const nodes = Array.isArray(input?.nodes) ? input.nodes : [];
    const nodeStates = nodes.map((node) => node.freshness || computeNodeFreshness(node, now));
    const reportingNodes = nodeStates.filter((state) => state.transportStatus === "live").length;
    const delayedNodes = nodeStates.filter((state) => state.transportStatus === "delayed").length;
    const staleNodes = nodeStates.filter((state) => state.transportStatus === "stale").length;
    const offlineNodes = nodeStates.filter((state) => state.transportStatus === "offline").length;
    const dataStatus = nodes.length === 0
      ? "offline"
      : reportingNodes === nodes.length
        ? "live"
        : reportingNodes > 0
          ? "delayed"
          : delayedNodes > 0
            ? "delayed"
            : staleNodes > 0
              ? "stale"
              : "offline";
    const currentCondition = input?.condition || { status: "unknown", reasons: [] };
    const previousKnown = input?.previousState?.lastKnownCondition || null;
    const lastKnownCondition = currentCondition.status !== "unknown"
      ? {
          status: currentCondition.status,
          asOf: iso(input?.conditionAsOf || now),
          reasons: currentCondition.reasons || []
        }
      : previousKnown;
    const reasons = nodeStates.flatMap((state) => state.reasons || []);
    const conditionStatus = currentCondition.status || "unknown";
    const affectedIds = Array.isArray(input?.affectedScopeIds) ? input.affectedScopeIds : [];

    return {
      schemaVersion: "1.0.0",
      scope: input?.scope || { type: "section", id: "unknown", name: "Unknown" },
      conditionStatus,
      dataStatus,
      lastKnownCondition,
      coverage: {
        liveMetrics: Number(input?.coverage?.liveMetrics) || 0,
        expectedMetrics: Number(input?.coverage?.expectedMetrics) || 0,
        reportingNodes,
        registeredNodes: nodes.length
      },
      nodeSummary: { live: reportingNodes, delayed: delayedNodes, stale: staleNodes, offline: offlineNodes },
      extent: {
        affected: affectedIds.length,
        total: Number(input?.totalChildScopes) || 0,
        ids: affectedIds
      },
      reasons,
      priorityAction: input?.priorityAction || null,
      nextTask: input?.nextTask || null,
      computedAt: new Date(now).toISOString(),
      validUntil: new Date(now + Math.max(30, Number(input?.stateTtlSec) || 120) * 1000).toISOString()
    };
  }

  function getClientLeaseStatus(farmState, nowInput) {
    const now = toEpoch(nowInput) ?? Date.now();
    const validUntil = toEpoch(farmState?.validUntil);
    return {
      connected: validUntil !== null && now <= validUntil,
      computedAt: iso(farmState?.computedAt),
      expiredBySec: validUntil === null ? null : Math.max(0, Math.round((now - validUntil) / 1000))
    };
  }

  root.NeuroCropStateEngine = Object.freeze({
    STATUS_RANK,
    computeNodeFreshness,
    computeConditionStatus,
    deriveFarmState,
    getClientLeaseStatus,
    isBackfill
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
