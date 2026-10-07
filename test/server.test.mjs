import test from 'node:test';
import assert from 'node:assert/strict';
import { createStaticServer } from '../app/server.js';
import { once } from 'node:events';

async function withServer(fn) {
  const server = createStaticServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

test('/health and /version respond; static allowlist serves the lab', async () => {
  await withServer(async base => {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.equal(await health.text(), 'ok');

    const version = await fetch(`${base}/version`);
    assert.equal(version.status, 200);
    assert.equal((await version.json()).name, 'ai-will-keep-getting-better-the-question-is-demo');

    const index = await fetch(`${base}/`);
    assert.equal(index.status, 200);
    const html = await index.text();
    assert.match(html, /Launch Window/);
    assert.match(html, /<nav aria-label="Primary"><a aria-current="page" href="\/">Lab<\/a><a href="\/guide\.html">Guide<\/a>/);

    const guide = await fetch(`${base}/guide.html`);
    assert.equal(guide.status, 200);
    assert.match(await guide.text(), /aria-current="page" href="\/guide\.html"/);

    for (const path of ['/app.js', '/lab.mjs', '/styles.css', '/guide.html', '/pb-shell.css', '/pb-back.css']) {
      const res = await fetch(`${base}${path}`);
      assert.equal(res.status, 200, path);
    }
  });
});

test('/api/simulate runs the real race and reports the failure mode', async () => {
  await withServer(async base => {
    const res = await fetch(`${base}/api/simulate`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.weeks, 52);
    assert.equal(body.lanes.length, 3);
    assert.equal(body.summary.winner, 'ship-weekly');
    assert.equal(body.catchUpWeek, null);
    assert.equal(body.stallReport.shipsDuringWait, 0);
    assert.ok(body.stallReport.idleWeeks > 0);

    const tuned = await fetch(`${base}/api/simulate?wait=24&gain=0.05&learn=0.2`);
    const tunedBody = await tuned.json();
    assert.equal(tunedBody.stallReport.idleWeeks, 24);
  });
});

test('unknown paths and traversal return 404; HEAD works', async () => {
  await withServer(async base => {
    assert.equal((await fetch(`${base}/../package.json`)).status, 404);
    assert.equal((await fetch(`${base}/nope`)).status, 404);
    assert.equal((await fetch(`${base}/app/server.js`)).status, 404);
    const head = await fetch(`${base}/`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  });
});
