import type { GreenhouseMap } from '../greenhouse-map/model'
export type DiagnosticMetric = {
  sectionId: string; name: string; metric: string; unit: string; minimum: number|null; maximum: number|null; mean: number|null;
  observedMinutes: number; expectedMinutes: number; belowMinutes: number; aboveMinutes: number; unknownMinutes: number;
  coveragePct: number; outsideObservedPct: number|null; estimatedContextPct: number; peerDelta: number|null; peerMinutes: number;
  peerOutsidePct: number|null; recurringDays: number; medianSpread: number|null; maxSpread: number|null;
  dayMean: number|null; nightMean: number|null; daylightExposurePpmHours: number|null; lightAccumulationLuxHours: number|null;
  nodeId?: string; nodeName?: string; hourly: {hour: number; observedMinutes:number;outsideMinutes:number;recurringDays:number}[];
}
export type Episode = {id:string;section_id:string;node_id:string;metric:string;kind:string;severity:string;started_at:string;ended_at:string|null;last_observed_at:string;resolution_reason:string|null;evidence:Record<string,unknown>}
export type DiagnosticTrace = {nodeId:string;nodeName:string;sectionId:string;metric:string;points:{at:string;min:number;max:number;mean:number;target:[number,number]|null;count:number}[]}
export type DiagnosticExplanation = {
 nodeId:string;nodeName:string;sectionId:string;metric:string;observedMinutes:number;estimatedPct:number;
 directions:Partial<Record<'below'|'above',{minutes:number;meanDeparture?:number;matchedRelated?:{metric:string;during:number;baseline:number;matchedMinutes:number;hourContextGroups:number}[];eventCount:number;longestMinutes:number;days:number;peak:{at:string;value:number;limit:number;departure:number};peakHours:{hour:number;minutes:number}[];longestEvents:{from:string;to:string;minutes:number}[];scope:string;peersAtPeak:{count:number;configuredCount:number;sameDirectionCount:number;median:number|null}}>>;
 halves:{coveragePct:number;outsidePct:number|null}[];trend:string;related:{metric:string;during:number;otherwise:number;duringMinutes:number;otherwiseMinutes:number}[];
}
export type DiagnosticReport = {
  explanations?:DiagnosticExplanation[];
  traces?:DiagnosticTrace[];tracesTruncated?:boolean;diagnosticMap?:GreenhouseMap|null;mapValidFrom?:string|null;mapSource?:string|null;
  area:{id:string;name:string};from:string;to:string;days:number;generatedAt:string;methodVersion:string;timeZone:string;
  daily:{nodeId:string;nodeName:string;sectionId:string;metric:string;day:string;mean:number;minimum:number;maximum:number;completeCalendarDay:boolean;coveragePct:number;dliObserved:number|null}[];
  metrics:DiagnosticMetric[];nodes:DiagnosticMetric[];ranking:DiagnosticMetric[];
  insights:(DiagnosticMetric&{kind:string;severity:string;recommendation?:{lt:string;en:string}})[];episodes:Episode[];episodesTruncated:boolean;warnings:string[];
  inputs:{controller:boolean;calibration:boolean;cycle:boolean;ppfd:boolean;energy:boolean;yield:boolean};
  controllerResponses?:{eventId:string;occurredAt:string;source:string;channel:string;zones:{sectionId:string;name:string;metric:string;before:number|null;after:number|null;delta:number|null;beforeCoveragePct:number;afterCoveragePct:number}[]}[];
  controllerResponsesTruncated?:boolean;
  controllerEvents:{id:string;occurred_at:string;source:string;device_id:string;channel:string;state:Record<string,unknown>}[];
  interventions:{id:string;section_id:string;action_type:string;performed_at:string;note:string;outcome_status:string|null}[];
  calibrations:{id:string;node_id:string;port:string;calibrated_at:string;reference:string}[];
  cycles:{id:string;section_id:string;crop:string;stage:string;starts_at:string}[];
}
export type ReportListItem={id:string;area_id:string;area:{id:string;name:string};created_at:string;from:string;to:string;days:string}
