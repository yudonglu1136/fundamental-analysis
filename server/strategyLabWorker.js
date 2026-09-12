import { parentPort,workerData } from 'node:worker_threads';
import { InvestmentSource } from './investmentSource.js';
import { loadStrategyData } from './strategyLabSource.js';
import { runStrategyLab } from './strategyLab.js';
import {loadCompositionData,runStrategyComposition} from './strategyComposition.js';
const source=new InvestmentSource(workerData.file);
try {parentPort.postMessage({result:workerData.rules.equityMix
 ?runStrategyComposition(loadCompositionData(source,workerData.rules,workerData.etfFile),workerData.rules)
 :runStrategyLab(loadStrategyData(source,workerData.rules,workerData.etfFile),workerData.rules)});}
catch(e){
 const safe=new Set(['invalid_etf_artifact','strategy_database_cutoff_exceeded','strategy_database_incomplete','strategy_database_version_mismatch','composition_requires_structured_database','conflicting_composition_identity']);
 parentPort.postMessage({error:safe.has(e.message)?e.message:'strategy_source_unavailable'});
}
finally{source.close();}
