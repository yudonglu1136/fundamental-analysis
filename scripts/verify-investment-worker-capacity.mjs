// Real candidate data, bounded workers, no HTTP/session/portfolio writes.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { storedStrategyCatalog } from '../server/strategyDatabase.js';
import { strategyRules } from '../server/strategyLab.js';
const [research,strategy,composition,output] = process.argv.slice(2);
assert.ok([research,strategy,composition,output].every(v=>v&&path.isAbsolute(v))&&!fs.existsSync(output),'absolute input files and new report required');
process.env.STRATEGY_DATA_DB_PATH=strategy;
process.env.STRATEGY_COMPOSITION_PRICE_DB_PATH=composition;
const cutoff='2026-09-11',catalog=storedStrategyCatalog(strategy,cutoff),rows=[];
const base={managers:[],topN:5,valuationEnabled:false,maxPremium:.3,excludedAllocation:'fully_invested',
  cta:'none',ctaWeight:0,costBps:10,start:'2021-09-11',end:cutoff,asOf:cutoff,leverage:{multiple:1,annualRate:.04,reset:'filing'}};
const cases=[
  {name:'index_cta_leverage',equityMix:{weights:{QQQ:1}},cta:'KMLM',ctaWeight:.3,ctaPolicy:{mode:'scheduled',frequency:'annually'},leverage:{multiple:1.5,annualRate:.04,reset:'filing'}},
  {name:'four_factors_30pct',equityMix:{weights:{factors:1}},valuationEnabled:true},
  {name:'guru_annual_cta',managers:['bill-ackman','chris-hohn','dev-kantesaria'],equityMix:{weights:{guru:1}},valuationEnabled:true,maxPremium:.61,cta:'KMLM',ctaWeight:.3,ctaPolicy:{mode:'scheduled',frequency:'annually'}},
];
const limits={maxOldGenerationSizeMb:512,maxYoungGenerationSizeMb:32,stackSizeMb:4};
for(const {name,...config} of cases) {
  const rules=strategyRules({...base,...config},catalog.managers),start=performance.now();
  let peak=process.memoryUsage().rss,worker;
  const sample=setInterval(()=>{peak=Math.max(peak,process.memoryUsage().rss);},100);
  try {
    const result=await new Promise((resolve,reject)=>{
      worker=new Worker(new URL('../server/strategyLabWorker.js',import.meta.url),{workerData:{file:research,rules},resourceLimits:limits});
      const timer=setTimeout(()=>{void worker.terminate();reject(Error('strategy_timeout'));},90000);
      worker.once('message',message=>{clearTimeout(timer);message.error?reject(Error(message.error)):resolve(message.result);});
      worker.once('error',error=>{clearTimeout(timer);reject(error);});
      worker.once('exit',code=>{clearTimeout(timer);if(code)reject(Error(`worker_exit_${code}`));});
    });
    assert.equal(result.status,'ready');assert.equal(result.sources.generation,catalog.storage.generation);
    assert.equal(result.results.blend.equity.at(-1).date,cutoff);
    assert.equal(result.holdingSnapshots.length,21);
    assert.ok(result.holdingSnapshots.every(s=>s.cashWeight===0));
    rows.push({name,status:'pass',elapsedMs:Math.round(performance.now()-start),peakProcessRssBytes:peak,snapshots:21});
  } catch(error) { rows.push({name,status:'fail',elapsedMs:Math.round(performance.now()-start),peakProcessRssBytes:peak,error:error.message}); }
  finally {clearInterval(sample);if(worker)await worker.terminate();}
  console.log(JSON.stringify(rows.at(-1)));
}
const report={status:rows.every(r=>r.status==='pass')?'pass':'fail',runtime:process.version,cutoff,generation:catalog.storage.generation,
  resourceLimits:limits,timeoutMs:90000,maxActiveWorkers:1,rows,
  scope:'Single-process local smoke using production worker limits, not AWS throughput or latency SLA; peak RSS includes the parent.'};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
if(report.status!=='pass')process.exitCode=1;
