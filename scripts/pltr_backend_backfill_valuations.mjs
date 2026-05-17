#!/usr/bin/env node
import { backfillPltrValuationRuns } from "../apps/api/src/services/pltrValuationService.mjs";

const result = await backfillPltrValuationRuns({ scenarios: ["Base"], replace: true });
console.log("PLTR backend valuation price-anchor backfill complete");
console.log(JSON.stringify(result, null, 2));
