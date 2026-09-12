import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('AWS proxy waits for the bounded PIT worker without replacing locations', () => {
  const config = fs.readFileSync(new URL('../.platform/nginx/conf.d/elasticbeanstalk/01-bounded-backtest-timeout.conf', import.meta.url), 'utf8');
  const directives = config.split('\n').map(line => line.replace(/#.*/, '').trim()).filter(Boolean);
  assert.deepEqual(directives, ['proxy_read_timeout 120s;']);
  assert.ok(120 > 90, 'Proxy must not cut off the 90-second composition worker');
  const deny = fs.readFileSync(new URL('../.platform/nginx/conf.d/elasticbeanstalk/00-deny-public-internal.conf', import.meta.url), 'utf8');
  assert.match(deny, /location ~\* \^\/api\/internal/);
  assert.match(deny, /return 404;/);
});
