import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulate, summarize, catchUpWeek, stallReport, STRATEGY_IDS, FAILURE_STRATEGY, DEFAULT_PARAMS } from '../public/lab.mjs';

const PUBLIC = fileURLToPath(new URL('../public', import.meta.url));
const PACKAGE = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const STATIC_FILES = new Map([
  ['/', ['text/html; charset=utf-8', 'index.html']],
  ['/guide.html', ['text/html; charset=utf-8', 'guide.html']],
  ['/styles.css', ['text/css; charset=utf-8', 'styles.css']],
  ['/app.js', ['text/javascript; charset=utf-8', 'app.js']],
  ['/lab.mjs', ['text/javascript; charset=utf-8', 'lab.mjs']],
  ['/pb-shell.css', ['text/css; charset=utf-8', 'pb-shell.css']],
  ['/pb-back.css', ['text/css; charset=utf-8', 'pb-back.css']],
].map(([path, [type, file]]) => [path, [type, readFileSync(join(PUBLIC, file))]]));
const SECURITY_HEADERS = {
  'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'permissions-policy': 'camera=(), geolocation=(), microphone=()',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
};

// GET /api/simulate?weeks=&wait=&gain=&learn= — runs the same deterministic
// race the browser runs, clamped to sane bounds.
function apiSimulate(url, res) {
  const num = (key, fallback, lo, hi) => {
    const raw = url.searchParams.get(key);
    if (raw === null) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(hi, Math.max(lo, n));
  };
  const sim = simulate({
    weeks: Math.round(num('weeks', DEFAULT_PARAMS.weeks, 4, 104)),
    waitWeeks: Math.round(num('wait', DEFAULT_PARAMS.waitWeeks, 0, 48)),
    modelGainPerWeek: num('gain', DEFAULT_PARAMS.modelGainPerWeek, 0, 0.1),
    learnPerShip: num('learn', DEFAULT_PARAMS.learnPerShip, 0, 0.3),
  });
  const body = JSON.stringify({
    weeks: sim.weeks,
    lanes: sim.lanes.map(l => ({ id: l.id, name: l.name, totals: l.totals })),
    summary: summarize(sim),
    catchUpWeek: catchUpWeek(sim, FAILURE_STRATEGY, 'ship-weekly'),
    stallReport: stallReport(sim),
    strategies: STRATEGY_IDS,
  });
  res.writeHead(200, { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8' }).end(body);
}

export function createStaticServer() {
  return createServer((req, res) => {
    const url = new URL(req.url, 'http://example.invalid');
    if (url.pathname === '/health') {
      res.writeHead(200, { ...SECURITY_HEADERS, 'content-type': 'text/plain; charset=utf-8' }).end('ok');
      return;
    }
    if (url.pathname === '/version') {
      res.writeHead(200, { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8' })
        .end(JSON.stringify({
          name: PACKAGE.name,
          version: PACKAGE.version,
          commit: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || 'local',
        }));
      return;
    }
    if (url.pathname === '/api/simulate' && req.method === 'GET') {
      apiSimulate(url, res);
      return;
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      const asset = STATIC_FILES.get(url.pathname);
      if (asset) {
        res.writeHead(200, {
          ...SECURITY_HEADERS,
          'cache-control': 'public, max-age=300',
          'content-type': asset[0],
        }).end(req.method === 'HEAD' ? undefined : asset[1]);
        return;
      }
    }
    res.writeHead(404, SECURITY_HEADERS).end('not found');
  });
}

export async function startProduction({ port = Number(process.env.PORT) || 3000 } = {}) {
  const server = createStaticServer();
  server.listen(port, '0.0.0.0');
  await once(server, 'listening');
  const close = () => new Promise(resolve => server.close(resolve));
  return { server, close };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { server, close } = await startProduction();
  console.log(`Launch Window listening on ${server.address().port}`);
  const shutdown = async () => { await close(); process.exit(0); };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
