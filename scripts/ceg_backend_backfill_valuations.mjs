#!/usr/bin/env node
import { backfillCegValuationRuns } from "../apps/api/src/services/cegValuationService.mjs";

const scenarios = process.argv.includes("--all-scenarios") ? ["Bear", "Base", "Bull"] : ["Base"];
const result = await backfillCegValuationRuns({ scenarios, replace: true });
console.log(JSON.stringify(result, null, 2));
if (result.failed?.length) process.exitCode = 1;
