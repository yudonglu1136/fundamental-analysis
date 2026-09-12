import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import { portfolioResponsePrivacy, respondPortfolioBusy } from './portfolioHttp.js';
import { installJsonTransport } from './jsonTransport.js';
import { requireAuth } from './auth/requireAuth.js';

test('saturation is retryable, not an invalid broker key or a cacheable error', () => {
  const headers = {};
  const response = { setHeader(k, v) { headers[k] = v; }, status(s) { this.code = s; return this; }, json(body) { this.body = body; } };
  assert.equal(respondPortfolioBusy({ code: 'portfolio_sync_busy', message: 'Retry shortly.' }, response), true);
  assert.equal(response.code, 503);
  assert.equal(headers['Retry-After'], '5');
  assert.equal(headers['Cache-Control'], 'no-store');
  assert.equal(response.body.error, 'portfolio_sync_busy');
  assert.equal(respondPortfolioBusy(new Error('different error'), {}), false);
});

test('sync-only route coalesces work while connection changes still invalidate it', () => {
  const source = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  const sync = source.split('app.post("/api/portfolio/sync"')[1].split('app.delete("/api/portfolio/connection"')[0];
  assert.doesNotMatch(sync, /clearPortfolioCache\(/);
  assert.match(sync, /forceRefresh: true/);
  const connection = source.split('app.post("/api/portfolio/connection"')[1].split('app.post("/api/portfolio/accounts"')[0];
  assert.match(connection, /clearPortfolioCache\(request.user\)/);
});

test('portfolio namespace privacy precedes CORS, parsing and authentication', () => {
  const source = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  const privacy = source.indexOf('app.use("/api/portfolio", portfolioResponsePrivacy)');
  assert.ok(privacy >= 0);
  for (const marker of ['app.use(cors(', 'app.use(express.json())', 'app.use("/api", requireAuth)']) {
    assert.ok(source.indexOf(marker) > privacy, marker);
  }
});

test('portfolio transport keeps every owner, account subroute and error non-cacheable', async t => {
  const keys = ['SUPABASE_JWT_SECRET', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const secret = 'synthetic-portfolio-privacy-test-only';
  process.env.SUPABASE_JWT_SECRET = secret;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const sign = sub => {
    const body = [Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url'),
      Buffer.from(JSON.stringify({sub, email:`${sub}@example.test`, exp:Date.now()/1000+300})).toString('base64url')].join('.');
    return `${body}.${crypto.createHmac('sha256',secret).update(body).digest('base64url')}`;
  };
  const app = express();
  app.use('/api/portfolio', portfolioResponsePrivacy);
  installJsonTransport(app);
  app.use(express.json());
  app.use('/api', requireAuth);
  app.use('/api/portfolio', (request,response) => {
    response.vary('Origin');
    if (request.query.denied) return response.status(403).json({error:'forbidden'});
    if (request.query.failed) throw new Error('synthetic failure');
    if (request.path === '/unknown') return response.status(404).json({error:'not_found'});
    return response.json({owner:request.user.id, report:'private-synthetic-report'});
  });
  app.use((error,_request,response,_next) => response.status(error.status || 500).json({error:'request_failed'}));
  const server = app.listen(0,'127.0.0.1');
  await new Promise(resolve => server.once('listening',resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, {method='GET', token=sign('owner-a'), headers={}, body}={}) => {
    const result = await fetch(origin+path,{method,headers:{...(token?{authorization:`Bearer ${token}`} : {}),...headers},...(body===undefined?{}:{body})});
    assert.equal(result.headers.get('cache-control'),'no-store', `${method} ${path}`);
    assert.match(result.headers.get('vary') || '', /(?:^|,\s*)Authorization(?:,|$)/i);
    assert.match(result.headers.get('vary') || '', /Accept-Encoding/i);
    return result;
  };
  for (const [method,path] of [
    ['GET','/api/portfolio'],['GET','/api/portfolio/connection'],
    ['POST','/api/portfolio/accounts'],['POST','/api/portfolio/sync'],
    ['DELETE','/api/portfolio/connection'],['POST','/api/portfolio/connection/restore']
  ]) {
    assert.equal((await request(path,{method,token:null})).status,401);
    assert.equal((await request(path,{method,token:'invalid'})).status,401);
    const success = await request(path,{method});
    assert.equal(success.status,200);
    assert.match(success.headers.get('vary'),/Origin/);
  }
  const first = await request('/api/portfolio');
  const firstBody = await first.json();
  const other = await request('/api/portfolio',{token:sign('owner-b'),headers:{'if-none-match':first.headers.get('etag')}});
  assert.equal(other.status,200);
  assert.notEqual((await other.json()).owner,firstBody.owner);
  assert.equal((await request('/api/portfolio?denied=1')).status,403);
  assert.equal((await request('/api/portfolio?failed=1')).status,500);
  assert.equal((await request('/api/portfolio/unknown')).status,404);
  assert.equal((await request('/api/portfolio/accounts',{method:'POST',headers:{'content-type':'application/json'},body:'{'})).status,400);
});
