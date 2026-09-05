// Loopback-only, read-only QA adapter. Not imported by the production server.
import express from 'express';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {loadTickerLogo} from '../server/logoClient.js';
const app=express();
const db=new DatabaseSync('server/data/guru-analysis.sqlite',{readOnly:true});
const source=JSON.parse(fs.readFileSync('web/research/isrg/snapshot.json','utf8'));
const inputs=row=>({valuationRevenue:row.forwardRevenueM,valuationFreeCashFlow:row.forwardFcfM});
const ticker={ticker:'ISRG',name:source.company,currency:source.currency,
  latest:{latestPrice:source.price,baseFairValue:source.fairValue,upsideToBase:source.upsideToPrice,latestPriceDate:source.priceDate},
  history:source.history.map(row=>({asOfDate:row.date,fairValue:row.fairValue,currentPrice:row.price,
    ...([source.asOfDate,source.previous.asOfDate].includes(row.date)?{dataSnapshot:{valuationSemantics:{scoreInputs:inputs(row.date===source.asOfDate?source.assumptions:source.previous)}}}:{})})),
  priceHistory:source.prices.map(row=>({date:row.date,close:row.price})),
};
app.get('/api/gurus',(_req,res)=>res.json({gurus:db.prepare('SELECT payload_json FROM guru_snapshots').all().map(r=>JSON.parse(r.payload_json)),source:'local_qa_fixture'}));
app.get('/api/gurus/:id/backtest',(req,res)=>{
  const row=db.prepare('SELECT payload_json FROM guru_backtests WHERE guru_id=? AND years=?').get(req.params.id, req.query.years||'5');
  if(!row)return res.status(404).json({error:'No cached curve in local QA fixture'});
  res.json(JSON.parse(row.payload_json));
});
app.get('/api/valuation/:ticker',(req,res)=>req.params.ticker==='ISRG'?res.json({ticker}):res.status(404).json({error:'Local QA only exposes the reviewed public ISRG case'}));
app.get('/api/logo/:ticker',async(req,res)=>{try{const a=await loadTickerLogo(req.params.ticker);res.type(a.contentType).send(a.body);}catch{res.sendStatus(404);}});
app.use('/api',(_req,res)=>res.status(404).json({error:'Not available in read-only QA adapter'}));
app.use('/stock-logos',express.static('web/stock-logos'));
app.use(express.static('output/stock-research-terminal-qa'));
app.listen(4319,'127.0.0.1',()=>console.log('Full terminal QA: http://127.0.0.1:4319 — local partial fixture, no production writes'));
