#!/usr/bin/env node
import { backfillTsmValuationRuns } from "../apps/api/src/services/tsmValuationService.mjs";

const result = await backfillTsmValuationRuns({ scenarios: ["Base"], replace: true });
console.log("TSM backend historical valuation backfill complete");
console.log(JSON.stringify(result, null, 2));
