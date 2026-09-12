import test from 'node:test';
import assert from 'node:assert/strict';
import { researchGuidanceReview } from './investmentGuidance.js';

function event(overrides={}) {
  return {ticker:'TEST',source_database:'official_issuer_sec_filing',source_id:'r1',
    fiscal_period:'Q22026',observed_at:'2026-07-23',metric_name:'revenue_guidance',
    source_url:'https://example.test/results',quality_status:'clear',amount:null,
    growth_yoy:10,growth_qoq:null,margin_pct:null,currency:null,
    evidence_excerpt:'For full-year 2027 we expect total revenue growth of 10%.',
    actual_or_guidance:'guidance',guidance_subject:'company_total',guidance_scope:'full_year',
    guidance_target_year:2027,...overrides};
}
function review(rows,node={}) {
  return researchGuidanceReview({rows,financialRows:[],ticker:'TEST',node:{
    period:'2026-Q2',availableAt:'2026-07-23',guidance:{},input:{guidance:{}},...node}});
}

test('target fiscal year is separate from reporting quarter and explicit zero is retained',()=>{
  for(const growth of [0,10,-10]) {
    const r=review([event({growth_yoy:growth,evidence_excerpt:`For full-year 2027 we expect total revenue growth of ${growth}%.`})]);
    assert.equal(r.evidence[0].disposition,'quantified_evidence',JSON.stringify(r));
    assert.equal(r.evidence[0].growthYoy,growth);
    assert.equal(r.evidence[0].targetYear,2027);
    assert.equal(r.evidence[0].fiscalPeriod,'Q22026');
    assert.equal(r.audit.annualRevenueCount,1);
  }
});
test('missing guidance is not a zero estimate; actual and segment quotes retain context, not accepted scalars',()=>{
  assert.equal(review([]).audit.status,'no_stored_evidence');
  for(const change of [
    {growth_yoy:null,evidence_excerpt:'We see a strong outlook for the business.'},
    {actual_or_guidance:'actual',evidence_excerpt:'Total revenue grew by 10% in the second quarter.'},
    {guidance_subject:'segment_or_subset',evidence_excerpt:'For full-year 2027 we expect cloud segment revenue growth of 10%.'},
  ]) {
    const r=review([event(change)]); assert.equal(r.evidence[0].disposition,'research_only');
    assert.equal(r.evidence[0].growthYoy,null);assert.equal(r.evidence[0].amount,null);
    assert.equal(r.evidence[0].excerpt,change.evidence_excerpt);assert.equal(r.audit.annualRevenueCount,0);
  }
});
test('quarterly target stays quarterly, later evidence and different reporting periods cannot leak in',()=>{
  const r=review([event({guidance_scope:'quarter',evidence_excerpt:'For the third quarter of 2026 we expect total revenue growth of 10%.',guidance_target_year:2026}),
    event({source_id:'later',observed_at:'2026-07-24'}),event({source_id:'other',fiscal_period:'Q32026'})]);
  assert.equal(r.audit.rawCount,1);assert.equal(r.audit.annualRevenueCount,0);
  assert.equal(r.evidence[0].scope,'quarter');assert.equal(r.evidence[0].disposition,'quantified_evidence');
});
test('identical evidence deduplicates without losing source IDs, distinct targets stay visible',()=>{
  const r=review([event(),event({source_id:'same'}),event({source_id:'different',growth_yoy:12,evidence_excerpt:'For full-year 2027 we expect total revenue growth of 12%.'})]);
  assert.equal(r.audit.rawCount,3);assert.equal(r.audit.displayCount,2);
  assert.deepEqual(r.evidence[0].sourceIds,['r1','same']);
});
test('missing year metadata can display an explicit annual label, but never borrow another year or invent next year',()=>{
  const r=review([event({guidance_target_year:null})]);
  assert.equal(r.evidence[0].targetYear,2027);
  assert.equal(r.evidence[0].targetYearBasis,'explicit_unambiguous_annual_label_in_stored_excerpt');
  for(const evidence_excerpt of ['For full-year 2027 we expect total revenue growth of 10%, compared with 2026.',
    'For the full year we expect total revenue growth of 10%.']) {
    assert.equal(review([event({guidance_target_year:null,evidence_excerpt})]).evidence[0].targetYear,null);
  }
});
test('a rejected original referenced by the stored model is visibly flagged, not silently recertified',()=>{
  const guidance={guidanceSelection:{revenue:{acceptedEvidenceIds:['r1']}}};
  const r=review([event({actual_or_guidance:'actual',evidence_excerpt:'Total revenue grew by 10% in the second quarter.'})],{guidance,input:{guidance}});
  assert.equal(r.audit.status,'review_required');assert.equal(r.evidence[0].selectedInStoredModel,true);
  assert.ok(r.audit.issueCounts.research_only_guidance_selected>0);
});
