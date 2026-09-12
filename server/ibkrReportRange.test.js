import test from 'node:test';
import assert from 'node:assert/strict';
import {ibkrReportRange} from './ibkrReportRange.js';
test('bounded Flex ranges preserve dates and leave the default query unchanged',()=>{
  assert.deepEqual(ibkrReportRange(),{});
  assert.deepEqual(ibkrReportRange({periodDays:365}),{p:'365'});
  for (const p of [0,366,-1,1.5,'30',NaN]) assert.throws(()=>ibkrReportRange({periodDays:p}));
  assert.throws(()=>ibkrReportRange({periodDays:30,fromDate:'2026-01-01'}));
  assert.deepEqual(ibkrReportRange({fromDate:'2025-09-10',toDate:'2026-09-09'}),{fd:'20250910',td:'20260909'});
  assert.deepEqual(ibkrReportRange({fromDate:'2026-09-09',toDate:'2026-09-09'}),{fd:'20260909',td:'20260909'});
});
test('missing, invalid, reversed and oversized date overrides fail before network access',()=>{
  for(const range of [{fromDate:'2026-01-01'},{fromDate:'2026-02-30',toDate:'2026-03-01'},
    {fromDate:'2026-01-02',toDate:'2026-01-01'},{fromDate:'2025-01-01',toDate:'2026-01-01'},
    {fromDate:'20260101',toDate:'2026-01-02'}]) assert.throws(()=>ibkrReportRange(range));
});
