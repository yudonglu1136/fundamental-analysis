import { assessGuidanceReleaseEvent, auditGuidanceCoverageRelease,
  createGuidanceReportingCurrencyResolver } from './guidanceCoverageReleaseAudit.js';

function displayTarget(event) {
  if(event.targetYear!=null) return {targetYear:event.targetYear,targetYearBasis:'stored_source_field'};
  // Recover only an explicit, unambiguous annual label from this excerpt. No
  // reporting-year arithmetic, calendar-year guessing or projection alignment.
  const years=[...event.evidence.matchAll(/\b20\d{2}\b/g)].map(m=>Number(m[0]));
  const target=event.evidence.match(/\b(?:full[- ]year|fiscal\s+year|FY)\s*(20\d{2})\b/i);
  if(['full_year','annual','fiscal_year'].includes(event.scope)&&target&&new Set(years).size===1)
    return {targetYear:Number(target[1]),targetYearBasis:'explicit_unambiguous_annual_label_in_stored_excerpt'};
  return {targetYear:null,targetYearBasis:'unresolved'};
}

// Research display only: independently classify the stored originals, never
// rewrite the published model or claim missing evidence is zero guidance.
export function researchGuidanceReview({ rows, financialRows, node, ticker }) {
  const period=node.period.replace(/^(\d{4})-Q([1-4])$/,'Q$2$1');
  const visible=rows.filter(r=>r.observed_at<=node.availableAt && r.fiscal_period===period);
  const resolver=createGuidanceReportingCurrencyResolver(financialRows);
  const events=visible.map(r=>assessGuidanceReleaseEvent(r,{reportingCurrencyAtOrBefore:resolver}));
  const check=auditGuidanceCoverageRelease({rows:visible,financialRows,
    modelRuns:[{ticker,fiscal_period:node.period,as_of_date:node.availableAt,input_json:JSON.stringify(node.input)}],
    requiredTickers:[ticker],noQuantifiedTickers:events.some(e=>e.usable)?[]:[ticker]});
  const selected=new Set(Object.values(node.guidance?.guidanceSelection??{}).flatMap(s=>[
    ...(s.acceptedEvidenceIds??[]),...(s.quarterEvidenceIds??[]),...(s.unscopedEvidenceIds??[])]));
  for(const ids of Object.values(node.guidance?.scalarEvidenceIds??{})) for(const id of ids) selected.add(id);
  const seen=new Map();
  for(let i=0;i<events.length;i++) {
    const e=events[i],r=visible[i];
    const key=JSON.stringify([e.metricName,e.evidence,e.observedAt,e.sourceUrl,e.scalarValues,e.scope,e.subject,e.targetYear,e.rejectionReasons]);
    const existing=seen.get(key);
    if(existing){existing.sourceIds.push(e.sourceId);existing.selectedInStoredModel ||= selected.has(e.sourceId);continue;}
    seen.set(key,{id:e.sourceId,sourceIds:[e.sourceId],url:e.sourceUrl,excerpt:e.evidence,
      observedAt:e.observedAt,fiscalPeriod:e.period,speaker:r.speaker,metricName:e.metricName,
      scope:e.scope,subject:e.subject,...displayTarget(e),
      disposition:e.usable?'quantified_evidence':'research_only',reasons:e.rejectionReasons,
      // An unresolved scalar must never be displayed as an accepted number.
      amount:e.usable?e.scalarValues.amount:null,currency:e.sourceCurrency||null,
      growthYoy:e.usable?e.scalarValues.growth_yoy:null,
      selectedInStoredModel:selected.has(e.sourceId),
      sourceType:e.sourceDatabase});
  }
  const evidence=[...seen.values()].sort((a,b)=>(a.disposition==='research_only')-(b.disposition==='research_only')||a.metricName.localeCompare(b.metricName));
  const issueCounts={};for(const f of check.failures)issueCounts[f.code]=(issueCounts[f.code]||0)+1;
  return {evidence,audit:{version:'research-guidance-review-v1',status:check.failures.length?'review_required':visible.length?'stored_evidence_checked':'no_stored_evidence',
    modelDate:node.availableAt,rawCount:visible.length,displayCount:evidence.length,
    quantifiedCount:evidence.filter(e=>e.disposition==='quantified_evidence').length,
    researchOnlyCount:evidence.filter(e=>e.disposition==='research_only').length,
    annualRevenueCount:evidence.filter(e=>e.disposition==='quantified_evidence'&&['revenue_guidance','revenue_growth'].includes(e.metricName)&&['annual','full_year','fiscal_year'].includes(e.scope)).length,
    issueCounts,failures:check.failures,
    scope:'Stored original-excerpt and model-reference checks only; not a fresh official-document review. Forecast years are not issuer guidance target years.'}};
}
