import { analyzeAgronomy as analyzeHistory } from './history.js';
import { agronomicAdvice } from './advice.js';
import { buildAgronomicInteractionCandidates as buildInteractions } from './live.js';
import { buildTodayActions as buildActions } from './actions.js';
import { buildCropRisks as buildRisks } from './risks.js';

// Version calculations and knowledge independently. Saved reports retain both.
export const AGRONOMY_ENGINE_VERSION = 'agronomy-1.0.0';
export const AGRONOMY_CATALOG_VERSION = 'agronomy-rules-1.0.0';
export const AGRONOMY_SCHEMA_VERSION = 1;

const version = item => ({
  ...item,
  agronomyEngineVersion: AGRONOMY_ENGINE_VERSION,
  agronomyCatalogVersion: AGRONOMY_CATALOG_VERSION
});

export const analyzeAgronomy = (rows, window) => analyzeHistory(rows, window);
export const buildAgronomicInteractionCandidates = snapshot => buildInteractions(snapshot).map(version);
export const buildTodayActions = (snapshots, options) => buildActions(snapshots, options).map(version);
export const buildCropRisks = (...args) => buildRisks(...args).map(version);
export { evaluateActionOutcome, getActionVerificationPolicy, isActionFeedbackTransitionAllowed } from './actions.js';

/** Generate the complete, bilingual decision once on the server, never in the UI. */
export function interpretAgronomicReport(report, origin = 'historical-analysis') {
  return {
    schemaVersion: AGRONOMY_SCHEMA_VERSION,
    engineVersion: AGRONOMY_ENGINE_VERSION,
    catalogVersion: AGRONOMY_CATALOG_VERSION,
    origin,
    lt: agronomicAdvice(report, true),
    en: agronomicAdvice(report, false)
  };
}

/** Upgrade the response for old snapshots without rewriting stored history. */
export function withAgronomicInsights(report, origin = 'legacy-report') {
  if (report.agronomicInsights !== undefined) return report;
  return { ...report, agronomicInsights: interpretAgronomicReport(report, origin) };
}

export function analyzeHistoricalAgronomy(rows, report) {
  const agronomy = analyzeAgronomy(rows, report);
  return {
    agronomy,
    agronomicInsights: interpretAgronomicReport({ ...report, agronomy })
  };
}
