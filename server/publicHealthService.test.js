import assert from 'node:assert/strict';
import test from 'node:test';
import { createPublicHealthService } from './publicHealthService.js';

function buildFixture({ now }, ok=true) {
  return {ok,status:ok?'healthy':'failed',generatedAt:new Date(now).toISOString()};
}

test('coalesces a 16-request public health burst into one full current-product audit', async () => {
  let calls=0,release;
  const gate=new Promise(resolve=>{release=resolve;});
  const service=createPublicHealthService({
    buildHealth:async options=>{calls++;assert.deepEqual(Object.keys(options),['now']);await gate;return buildFixture(options);},
    now:()=>Date.parse('2026-09-03T20:00:00Z')
  });
  const requests=[...Array.from({length:15},()=>service.read()),service.read({force:true})];
  await Promise.resolve();
  assert.equal(calls,1);
  release();
  const results=await Promise.all(requests);
  assert.ok(results.every(result=>result===results[0]));
});

test('health no longer invokes the retired module even when stale caller configuration supplies it', async () => {
  const service=createPublicHealthService({
    get resolveOntology(){assert.fail('Retired dependency was accessed');},
    buildHealth:buildFixture,now:()=>1_000
  });
  const result=await service.read();
  assert.equal(result.ok,true);
  assert.equal(Object.hasOwn(result,'ontology'),false);
});

test('reuses a verified aggregate only within the bounded success TTL', async () => {
  let time=1_000,calls=0;
  const service=createPublicHealthService({buildHealth:options=>{calls++;return buildFixture(options);},now:()=>time,successTtlMs:100,failureTtlMs:10});
  const first=await service.read();
  assert.equal(first,await service.read());
  time=1_099;await service.read();assert.equal(calls,1);
  time=1_100;const refreshed=await service.read();assert.equal(calls,2);
  assert.equal(first.generatedAt,new Date(1_000).toISOString());
  assert.equal(refreshed.generatedAt,new Date(1_100).toISOString());
  await service.read({force:true});assert.equal(calls,3);
});

test('failed current-product revalidation replaces stale healthy results', async () => {
  let time=5_000,calls=0;
  const service=createPublicHealthService({buildHealth:options=>buildFixture(options,++calls===1),now:()=>time,successTtlMs:100,failureTtlMs:10});
  assert.equal((await service.read()).ok,true);
  time=5_100;assert.equal((await service.read()).ok,false);assert.equal(calls,2);
  time=5_109;assert.equal((await service.read()).ok,false);assert.equal(calls,2);
  time=5_110;assert.equal((await service.read()).ok,false);assert.equal(calls,3);
});

test('clears a rejected asynchronous audit and permits the next verification', async () => {
  let calls=0;
  const service=createPublicHealthService({buildHealth:async options=>{if(++calls===1)throw Error('audit failed');return buildFixture(options);},now:()=>10_000});
  await assert.rejects(service.read(),/audit failed/);
  assert.equal((await service.read()).ok,true);assert.equal(calls,2);
});

test('clears a synchronously thrown audit and permits the next verification', async () => {
  let calls=0;
  const service=createPublicHealthService({buildHealth:options=>{if(++calls===1)throw Error('audit failed');return buildFixture(options);},now:()=>20_000});
  await assert.rejects(service.read(),/audit failed/);
  assert.equal((await service.read()).ok,true);assert.equal(calls,2);
});

test('supports zero TTL and bounds configured success and failure TTLs', async () => {
  for(const {ok,ttl,maximum} of [{ok:true,ttl:'successTtlMs',maximum:30_000},{ok:false,ttl:'failureTtlMs',maximum:5_000}]) {
    let time=40_000,calls=0;
    const uncached=createPublicHealthService({buildHealth:options=>{calls++;return buildFixture(options,ok);},now:()=>time,[ttl]:0});
    await uncached.read();await uncached.read();assert.equal(calls,2);
    calls=0;
    const bounded=createPublicHealthService({buildHealth:options=>{calls++;return buildFixture(options,ok);},now:()=>time,[ttl]:999_999});
    await bounded.read();time+=maximum-1;await bounded.read();assert.equal(calls,1);
    time++;await bounded.read();assert.equal(calls,2);
  }
});

test('starts failure TTL only after the full audit completes', async () => {
  let time=80_000,calls=0;
  const service=createPublicHealthService({buildHealth:options=>{calls++;time+=4_000;return buildFixture(options,false);},now:()=>time,failureTtlMs:1_000});
  assert.equal((await service.read()).ok,false);assert.equal(calls,1);
  time=84_999;assert.equal((await service.read()).ok,false);assert.equal(calls,1);
  time=85_000;assert.equal((await service.read()).ok,false);assert.equal(calls,2);
});

test('requires a current-product health builder', () => {
  assert.throws(()=>createPublicHealthService(),/buildHealth must be a function/);
});
