import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Local-only responsive QA harness. Never included in web/ or Vercel routes.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
const serveRoot = process.argv.includes('--built') ? 'dist' : 'web';
app.get('/__qa/social', (_req, res) => {
  const html = fs.readFileSync(path.join(root, serveRoot, 'research/isrg/index.html'), 'utf8');
  res.type('html').send(html.replace('</head>', `<style>.wrap{max-width:none;padding:0 42px}.header{min-height:56px}.header nav{display:none}.hero{padding:15px 0 10px}.hero-row{margin-top:12px;gap:45px}h1{font-size:38px;letter-spacing:-1.8px}.hero-copy{font-size:13px;max-width:480px}.date-line{margin-top:12px}.metrics{padding:15px 25px}.metric-value{font-size:30px}.chart-head{padding:15px 25px 0}.chart{height:245px}.chart-foot{padding:0 25px 14px}.chart-foot p{max-width:880px;font-size:10px}.chart-foot a{display:none}main>:not(.hero):not(.chart-panel){display:none}.footer{padding:12px 0;border:0;grid-template-columns:1fr}.footer>.brand{display:none}.footer p{font-size:9px;max-width:1160px}</style></head>`));
});
app.get('/__qa/mobile', (req, res) => {
  const width = req.query.width === '320' ? 320 : 390;
  const target = req.query.page === 'login' ? '/' + (req.query.lang === 'zh' ? '?lang=zh' : '') : '/research/isrg/';
  res.type('html').send(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Responsive verification</title><style>html,body{margin:0;background:#202732;color:white;font:13px sans-serif}main{padding:16px;display:flex;gap:24px;align-items:start}iframe{width:${width}px;height:844px;border:0;flex-shrink:0}p,pre{max-width:420px;white-space:pre-wrap}</style><main><iframe title="Research at ${width} by 844" src="${target}"></iframe><div><p>Real embedded browser viewport: ${width} × 844 CSS pixels. Local QA wrapper; not shipped.</p><pre id="qa-result">Loading…</pre><p><a style="color:white" href="/research/isrg/">Open full page</a></p></div></main><script>document.querySelector('iframe').addEventListener('load', function(){const d=this.contentDocument;document.getElementById('qa-result').textContent=JSON.stringify({width:this.contentWindow.innerWidth,height:this.contentWindow.innerHeight,documentWidth:d.documentElement.scrollWidth,overflow:[...d.querySelectorAll('main *, header *')].filter(e=>e.getBoundingClientRect().width>0 && e.getBoundingClientRect().right>this.contentWindow.innerWidth+1).map(e=>e.tagName+'.'+e.className).slice(0,15)},null,2)});</script></html>`);
});
app.use(express.static(path.join(root, serveRoot)));
app.listen(8766, '127.0.0.1', () => console.log(`Public research QA: http://127.0.0.1:8766/research/isrg/ (${serveRoot}); /__qa/mobile`));
