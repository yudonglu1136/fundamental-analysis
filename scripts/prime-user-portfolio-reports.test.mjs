import test from 'node:test';
import assert from 'node:assert/strict';
import {primeUserPortfolioReports} from './prime-user-portfolio-reports.mjs';

const fixture=()=>{
  const users=[1,2].map(n=>({userId:`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,
    userHash:String(n).repeat(40),provider:'google',connection:{configured:true,status:'linked'}}));
  let active=0,maxActive=0;const loaded=[],saved=new Map();
  const deps={listUsers:async()=>({users}),userInfo:async u=>({exists:true,userHash:users.find(r=>r.userId===u.id)?.userHash}),
    ownerHash:id=>users.find(r=>r.userId===id)?.userHash,
    readConnection:async()=>({configured:true,config:{provider:'ibkr_flex'},revision:'fixture-revision'}),
    clearCache:()=>{},readReport:async u=>saved.get(u.id),loadDashboard:async ({user,forceRefresh,captureNav})=>{
      assert.deepEqual(Object.keys(user),['id']);assert.equal(forceRefresh,true);loaded.push(user.id);
      assert.equal(captureNav,false);
      maxActive=Math.max(maxActive,++active);await Promise.resolve();active--;
      const record={reportAsOf:'2026-09-09',retrievedAt:'2026-09-12T12:00:00Z',payload:{source:{asOf:'2026-09-09'}}};
      saved.set(user.id,record);return {source:{mode:'live'},freshness:{status:'current_report',reportAsOf:record.reportAsOf,retrievedAt:record.retrievedAt}};
    }};
  return {users,deps,loaded,saved,maxActive:()=>maxActive};
};
const options={expectedConnected:2,expectedUsers:2};
test('connected owners prime serially; aggregate receipt has no identity or financial values',async()=>{
  const f=fixture(),r=await primeUserPortfolioReports(f.deps,options);
  assert.equal(r.status,'complete');assert.equal(r.persisted,2);assert.equal(f.maxActive(),1);
  assert.deepEqual(r.reportDates,['2026-09-09']);
  for(const u of f.users){assert.ok(!JSON.stringify(r).includes(u.userId));assert.ok(!JSON.stringify(r).includes(u.userHash));}
});
test('all ownership and inventory checks complete before any broker request',async()=>{
  for(const mutate of [f=>f.users[1].userId='local-dev-user',f=>f.users[1].userId='admin-portfolio-fallback',
    f=>f.users[1].userId='',f=>f.users[1].provider='local-dev',f=>f.users[1].isAnonymous=true,
    f=>f.deps.ownerHash=()=> 'f'.repeat(40),f=>f.deps.userInfo=()=>({exists:false}),
    f=>f.users[1]={...f.users[0]},f=>f.users[1].connection.status='decrypt_error',
    f=>f.users[1].connection.configured=false]){
    const f=fixture();mutate(f);await assert.rejects(primeUserPortfolioReports(f.deps,options));assert.equal(f.loaded.length,0);
  }
});
test('saved stale reports and absent durable writes are not called a successful sync',async()=>{
  for(const mutate of [f=>f.deps.loadDashboard=async()=>({source:{mode:'saved_broker_report'},freshness:{status:'stale'}}),
    f=>f.deps.readReport=async()=>null,f=>f.deps.readReport=async()=>({reportAsOf:'2026-09-08'})]){
    const f=fixture();mutate(f);const r=await primeUserPortfolioReports(f.deps,options);
    assert.equal(r.status,'incomplete');assert.equal(r.persisted,0);assert.equal(r.failed,2);
  }
});
test('broker errors remain private and do not prevent the next connected user being attempted',async()=>{
  const f=fixture(),load=f.deps.loadDashboard;
  f.deps.loadDashboard=async args=>{if(args.user.id===f.users[0].userId)throw new Error('PRIVATE_TOKEN_AND_ACCOUNT');return load(args);};
  const r=await primeUserPortfolioReports(f.deps,options);
  assert.equal(r.failed,1);assert.equal(r.persisted,1);assert.equal(r.failures.broker_or_storage_failure,1);
  assert.ok(!JSON.stringify(r).includes('PRIVATE_TOKEN'));
});
test('connection changes after preflight cannot publish a successful prime receipt',async()=>{
  const f=fixture();let reads=0;f.deps.readConnection=async()=>({configured:true,config:{provider:'ibkr_flex'},revision:++reads<=2?'old':'new'});
  const r=await primeUserPortfolioReports(f.deps,options);
  assert.equal(r.failures.connection_changed,2);assert.equal(f.loaded.length,0);
});
test('explicit nonzero expected connection count is required',async()=>{
  for(const expectedConnected of [undefined,0,-1,1.5]){
    const f=fixture();await assert.rejects(primeUserPortfolioReports(f.deps,{expectedConnected}));assert.equal(f.loaded.length,0);
  }
});
