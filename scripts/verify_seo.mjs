import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const root = resolve(process.cwd(), 'dist');
const overview = JSON.parse(await readFile(resolve(root, 'data/overview.json'), 'utf8'));
const home = await readFile(resolve(root, 'index.html'), 'utf8');
function inspect(html, canonical, image) {
  for (const property of ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:width', 'og:image:height']) assert.equal((html.match(new RegExp(`property="${property}"`, 'g')) || []).length, 1, property);
  assert.ok(html.includes(`rel="canonical" href="${canonical}"`));
  assert.ok(html.includes(`property="og:image" content="${image}"`));
  assert.ok(html.includes('name="twitter:card" content="summary_large_image"'));
  assert.ok(html.includes('property="og:image:width" content="1200"'));
  assert.ok(html.includes('property="og:image:height" content="630"'));
}
inspect(home, 'https://quembancou.com/', 'https://quembancou.com/assets/og/home.jpg');
for (const candidate of overview.candidates) {
  const html = await readFile(resolve(root, 'candidatos', candidate.id, 'index.html'), 'utf8');
  inspect(html, `https://quembancou.com/candidatos/${candidate.id}/`, `https://quembancou.com/assets/og/candidates/${candidate.id}.jpg`);
  assert.ok(html.includes(`data-candidate-id="${candidate.id}"`));
  assert.ok(html.includes('../../candidate.js'));
  const image = await readFile(resolve(root, 'assets/og/candidates', candidate.id + '.jpg'));
  assert.equal(image.readUInt16BE(0), 0xffd8);
  assert.ok(image.length > 10000);
}
for (const [filename, size] of [['assets/favicon-32.png', 32], ['assets/apple-touch-icon.png', 180], ['assets/icon-192.png', 192], ['assets/icon-512.png', 512]]) {
  const png = await readFile(resolve(root, filename));
  assert.equal(png.readUInt32BE(16), size);
  assert.equal(png.readUInt32BE(20), size);
}
const ico = await readFile(resolve(root, 'favicon.ico'));
assert.equal(ico.readUInt16LE(0), 0); assert.equal(ico.readUInt16LE(2), 1); assert.equal(ico.readUInt16LE(4), 1);
assert.ok((await stat(resolve(root, 'assets/favicon.svg'))).size > 100);
const sitemap = await readFile(resolve(root, 'sitemap.xml'), 'utf8');
assert.equal((sitemap.match(/<url>/g) || []).length, 106);
assert.equal((await readFile(resolve(root, 'CNAME'), 'utf8')).trim(), 'quembancou.com');
const manifest = JSON.parse(await readFile(resolve(root, 'site.webmanifest'), 'utf8'));
assert.equal(manifest.icons.length, 2);
console.log(JSON.stringify({ passed: true, metadata_pages: 106, social_images: 106, icons: 'SVG, ICO, PNG32, Apple180, PWA192/512', sitemap_urls: 106 }));
