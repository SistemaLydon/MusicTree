// Prueba de extremo a extremo con datos reales de MusicBrainz capturados en
// test/fixtures.json. Intercepta las peticiones a musicbrainz.org y las sirve
// desde los fixtures, carga la lista de prueba y hace capturas del grafo.
// Uso: node test/e2e.mjs  (necesita dist-single/index.html)
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';

const fx = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url)));
// fase 2: respuestas reales de Wikidata y Discogs (capturadas el 5-11-2026) y Spotify simulado
const fx2 = JSON.parse(readFileSync(new URL('./fixtures2.json', import.meta.url)));
const SP = JSON.parse(readFileSync(new URL('./spotify-mock.json', import.meta.url)));
const html = readFileSync(new URL('../dist-single/index.html', import.meta.url));
const outDir = new URL('./out/', import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

const byName = new Map(Object.entries(fx).map(([k, v]) => [k.toLowerCase(), v]));
const lookups = new Map();
for (const v of Object.values(fx)) {
  if (v.lookup) lookups.set(v.lookup.id, v);
  for (const [id, l] of Object.entries(v.lookups ?? {})) lookups.set(id, { lookup: l });
}

function unescapeLucene(s) {
  return s.replace(/\\(.)/g, '$1');
}

function synthReleases(rec) {
  const r = rec.releases ?? { years: [], labels: [] };
  const years = r.years.length ? r.years : [2000];
  const releases = [];
  let i = 0;
  for (const l of r.labels) {
    for (let k = 0; k < l.n; k++) {
      releases.push({ id: `r${i}`, status: 'Official', date: String(years[i % years.length]), 'label-info': [{ label: { id: l.id, name: l.name } }] });
      i++;
    }
  }
  // asegura que el primer y último año existen
  releases.push({ id: 'first', date: String(years[0]), 'label-info': [] });
  releases.push({ id: 'last', date: String(years[years.length - 1]), 'label-info': [] });
  return { releases, 'release-count': releases.length };
}

let calls = 0;
function respond(url) {
  calls++;
  const u = new URL(url);
  const p = u.pathname.replace('/ws/2/', '');
  const q = u.searchParams.get('query');
  if (p === 'artist' && q) {
    const m = q.match(/artist:"((?:[^"\\]|\\.)*)"/);
    const rec = m && byName.get(unescapeLucene(m[1]).toLowerCase());
    return { artists: rec ? rec.artists : [] };
  }
  if (p === 'label' && q) {
    const m = q.match(/label:"((?:[^"\\]|\\.)*)"/);
    const rec = m && byName.get(unescapeLucene(m[1]).toLowerCase());
    return { labels: rec ? rec.labels : [] };
  }
  if (p === 'release') return synthReleases(lookups.get(u.searchParams.get('artist')) ?? {});
  const [kind, id] = p.split('/');
  const rec = lookups.get(id);
  if (rec && (kind === 'artist' || kind === 'label')) return rec.lookup;
  return null;
}

// ─── Wikidata ───
function wikidata(url) {
  const q = new URL(url).searchParams.get('query');
  const mb = q.match(/wdt:P434 "([^"]+)" \}/)?.[1];
  const sp = q.match(/wdt:P1902 "([^"]+)" \}/)?.[1];
  const rec = Object.values(fx2).find((v) => v.wd.some((r) => r.mb === mb || (sp && r.sp === sp)));
  const full = (v) => v.replace(/^wd:/, 'http://www.wikidata.org/entity/').replace(/^wdt:/, 'http://www.wikidata.org/prop/direct/');
  const qid = rec ? `Q${900000 + Object.values(fx2).indexOf(rec)}` : '';
  const bindings = (rec?.wd ?? []).map((r) => Object.fromEntries([['item', { value: `http://www.wikidata.org/entity/${qid}` }], ...Object.entries(r).map(([k, v]) => [k, { value: full(v) }])]));
  return { results: { bindings } };
}
// ─── Discogs ───
const dgByName = new Map(Object.values(fx2).map((v) => [v.dg.name.replace(/\s\(\d+\)$/, '').toLowerCase(), v]));
const dgById = new Map(Object.values(fx2).map((v) => [String(v.dg.id), v]));
// perfiles de nombre real a los que enlaza MusicBrainz (Alice McLeod, William Bevan)
for (const v of Object.values(fx2)) if (v.real) dgById.set(String(v.real.id), { dg: { ...v.real, urls: [], members: [], groups: [] } });
function discogs(url) {
  const u = new URL(url);
  if (!u.searchParams.get('token')) return { status: 401, body: { message: 'You must authenticate' } };
  const p = u.pathname;
  if (p === '/database/search') {
    const type = u.searchParams.get('type');
    if (type === 'artist') {
      const q = (u.searchParams.get('q') ?? '').toLowerCase();
      const rec = dgByName.get(q);
      return { body: { results: rec ? [{ id: rec.dg.id, type: 'artist', title: rec.dg.name, thumb: '' }] : [] } };
    }
    const rec = dgByName.get((u.searchParams.get('artist') ?? '').toLowerCase());
    if (type === 'master' && rec) return { body: { pagination: { items: rec.worksTotal }, results: rec.works.map((w, i) => ({ id: i, type: 'master', title: w.t, year: w.y, label: w.l, style: w.s, genre: w.g })) } };
    return { body: { pagination: { items: 0 }, results: [] } };
  }
  const m = p.match(/^\/artists\/(\d+)$/);
  if (m && dgById.has(m[1])) {
    const d = dgById.get(m[1]).dg;
    return { body: { id: d.id, name: d.name, urls: d.urls, members: d.members.map(([id, name]) => ({ id, name, active: true })), groups: d.groups.map(([id, name]) => ({ id, name, active: true })), aliases: d.aliases.map(([id, name]) => ({ id, name })), images: [] } };
  }
  return { status: 404, body: { message: 'not found' } };
}
// ─── Spotify (simulado según la documentación de la Web API) ───
function spotify(url, req) {
  const u = new URL(url);
  if (u.hostname === 'accounts.spotify.com') {
    const body = new URLSearchParams(req.postData() ?? '');
    if (body.get('client_secret') !== 'test-secret') return { status: 400, body: { error: 'invalid_client' } };
    return { body: { access_token: 'tok', token_type: 'Bearer', expires_in: 3600 } };
  }
  if (req.headers()['authorization'] !== 'Bearer tok') return { status: 401, body: { error: { status: 401 } } };
  const p = u.pathname.replace('/v1', '');
  if (p === '/search') {
    const limit = Number(u.searchParams.get('limit'));
    if (limit > 10) return { status: 400, body: { error: { status: 400, message: 'Invalid limit' } } };
    const q = (u.searchParams.get('q') ?? '').toLowerCase();
    return { body: { artists: { items: SP.artists.filter((a) => a.name.toLowerCase().includes(q)).slice(0, limit) } } };
  }
  let m = p.match(/^\/artists\/([^/]+)$/);
  if (m) {
    const a = SP.artists.find((x) => x.id === m[1]);
    return a ? { body: a } : { status: 404, body: { error: { status: 404 } } };
  }
  m = p.match(/^\/artists\/([^/]+)\/albums$/);
  if (m) {
    const albums = SP.albums[m[1]] ?? [];
    const off = Number(u.searchParams.get('offset') ?? 0);
    const lim = Number(u.searchParams.get('limit') ?? 20);
    if (lim > 10) return { status: 400, body: { error: { status: 400, message: 'Invalid limit' } } };
    return { body: { total: albums.length, items: albums.slice(off, off + lim).map(({ copyrights, ...a }) => a) } };
  }
  m = p.match(/^\/albums\/([^/]+)$/);
  if (m) {
    const al = Object.values(SP.albums).flat().find((x) => x.id === m[1]);
    return al ? { body: al } : { status: 404, body: { error: { status: 404 } } };
  }
  return { status: 404, body: { error: { status: 404 } } };
}

const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.route('https://musicbrainz.org/**', async (route) => {
  const body = respond(route.request().url());
  if (!body) return route.fulfill({ status: 404, body: JSON.stringify({ error: 'Not Found' }), headers: { 'access-control-allow-origin': '*' } });
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } });
});

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
const serve = (route, r) =>
  route.request().method() === 'OPTIONS'
    ? route.fulfill({ status: 204, headers: cors })
    : route.fulfill({ status: r.status ?? 200, contentType: 'application/json', body: JSON.stringify(r.body), headers: cors });
await page.route('https://query.wikidata.org/**', (route) => serve(route, { body: wikidata(route.request().url()) }));
await page.route('https://api.discogs.com/**', (route) => serve(route, discogs(route.request().url())));
await page.route(/https:\/\/(api|accounts)\.spotify\.com\/.*/, (route) => serve(route, spotify(route.request().url(), route.request())));
await page.route('https://ws.audioscrobbler.com/**', (route) => serve(route, { status: 500, body: {} }));
await page.route(/https:\/\/(i\.scdn\.co|i\.discogs\.com|open\.spotify\.com)\/.*/, (route) =>
  route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#3a4a52"/></svg>' }),
);

await page.goto(`http://localhost:${port}/`);
// claves de prueba desde el panel de ajustes
await page.getByRole('button', { name: 'Fuentes' }).click();
await page.fill('#sp-id', 'test-client');
await page.fill('#sp-secret', 'test-secret');
await page.fill('#dg-token', 'test-token');
await page.getByRole('button', { name: 'Guardar' }).click();
await page.waitForSelector('.check-ok');
await page.waitForTimeout(2500);
console.log('ajustes:', (await page.$$eval('.check', (els) => els.map((e) => e.innerText.replace(/\n/g, ': ')))).join(' | '));
await page.screenshot({ path: outDir + 'ajustes.png' });
await page.getByRole('button', { name: 'Cerrar' }).click();
await page.getByText('Cargar lista de prueba').click();

// espera a que no quede nada pendiente
const t0 = Date.now();
for (;;) {
  await page.waitForTimeout(3000);
  const st = await page.$$eval('.mine .status', (els) => els.map((e) => e.textContent));
  const pend = st.filter((s) => s === 'pendiente').length;
  const seeding = await page.$('.progress');
  process.stdout.write(`\r${((Date.now() - t0) / 1000).toFixed(0)}s · entradas ${st.length} · pendientes ${pend}   `);
  if (!seeding && st.length > 0 && pend === 0) break;
  if (Date.now() - t0 > 240000) break;
}
console.log('\npeticiones servidas:', calls);
await page.waitForTimeout(7000); // deja terminar el layout
await page.screenshot({ path: outDir + 'grafo.png' });

const summary = await page.$$eval('.mine li', (els) => els.map((e) => e.innerText.replace(/\n/g, ' | ')));
console.log(summary.join('\n'));
console.log(await page.$eval('.toolbar .stat', (e) => e.textContent));

// seleccionar New Order para ver el panel
await page.getByRole('button', { name: /New Order/ }).first().click();
await page.waitForTimeout(1200);
await page.screenshot({ path: outDir + 'panel-new-order.png' });
console.log('\n--- panel New Order ---\n' + (await page.$eval('.panel', (e) => e.innerText)));

await page.getByRole('button', { name: /Massive Attack/ }).first().click();
await page.waitForTimeout(1200);
console.log('\n--- panel Massive Attack ---\n' + (await page.$eval('.panel', (e) => e.innerText)));
await page.screenshot({ path: outDir + 'panel-massive.png' });

// artista pequeño que solo está en Spotify
await page.fill('#search', 'Sierra Kontrol');
await page.waitForSelector('.search-results li button');
await page.waitForTimeout(2500);
console.log('\n--- buscador ---\n' + (await page.$eval('.search-results', (e) => e.innerText)));
await page.screenshot({ path: outDir + 'buscador.png' });
await page.locator('.search-results section', { hasText: 'Spotify' }).locator('button').first().click();
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(1000);
  const st = await page.$$eval('.mine .status', (els) => els.map((e) => e.textContent));
  if (!st.includes('pendiente')) break;
}
await page.waitForTimeout(4000);
console.log('\n--- panel Sierra Kontrol ---\n' + (await page.$eval('.panel', (e) => e.innerText)));
await page.screenshot({ path: outDir + 'panel-pequeno.png' });
await page.getByRole('button', { name: /Los Planetas/ }).first().click();
await page.waitForTimeout(1200);
console.log('\n--- panel Los Planetas ---\n' + (await page.$eval('.panel', (e) => e.innerText)));
await page.getByRole('button', { name: 'Cerrar' }).click();
await page.getByRole('button', { name: 'Ver todo' }).click();
await page.waitForTimeout(900);
await page.screenshot({ path: outDir + 'grafo-final.png' });
const ids = await page.evaluate(async () => {
  const req = indexedDB.open('arbol-musical');
  const dbx = await new Promise((r) => (req.onsuccess = () => r(req.result)));
  const all = await new Promise((r) => {
    const q = dbx.transaction('entities').objectStore('entities').getAll();
    q.onsuccess = () => r(q.result);
  });
  return all.map((e) => `${e.name}: ${JSON.stringify(e.ids)} · ${e.data.image?.source ?? '-'} · ${Object.entries(e.data.sourceStatus ?? {}).map(([k, v]) => k + '=' + v).join(' ')}`);
});
console.log('\n--- ids ---\n' + ids.join('\n'));
console.log('\n' + (await page.$eval('.toolbar .stat', (e) => e.textContent)));

console.log('\nerrores:', errors.length ? errors : 'ninguno');
await browser.close();
server.close();
