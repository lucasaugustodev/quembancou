/** Deterministic brand/icon and sharing assets using native HTML/CSS/SVG. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'dist', 'assets');
const started = performance.now();
const overview = JSON.parse(await readFile(path.join(root, 'dist', 'data', 'overview.json'), 'utf8'));
const ink = '#182d28';
const lime = '#d8efab';
const cream = '#f6f5f0';
const money = cents => Number.isSafeInteger(cents) ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100) : 'Sem dados';
const date = input => input ? input.split('-').reverse().join('/') : 'não informada';
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><circle cx="256" cy="256" r="256" fill="${ink}"/><path d="M164 348 346 166M172 166h174v174" fill="none" stroke="${lime}" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const brand = `<div class="brand">${mark}<span>quem<b>bancou</b><i>.</i></span></div>`;

const styles = `
*{box-sizing:border-box}html,body{margin:0;width:1200px;height:630px;overflow:hidden}body{background:${cream};color:${ink};font-family:'DM Sans',sans-serif;-webkit-font-smoothing:antialiased}.frame{position:relative;width:1200px;height:630px;padding:48px 64px}.brand{display:flex;align-items:center;gap:13px;font-family:Manrope,sans-serif;font-size:34px;font-weight:500;letter-spacing:-1.7px;line-height:1}.brand svg{width:49px;height:49px;flex-shrink:0}.brand b{font-weight:800}.brand i{font-style:normal;color:#3c7456}.topline{display:flex;align-items:center;justify-content:space-between}.edition{border:1px solid #dce4d1;border-radius:30px;background:#edf2e5;padding:12px 18px;font-size:15px;font-weight:650;letter-spacing:1px;color:#5c7550}.edition:before{content:'';display:inline-block;height:7px;width:7px;border-radius:50%;background:#65874b;margin-right:9px;vertical-align:2px}.eyebrow{font-size:15px;letter-spacing:2px;text-transform:uppercase;font-weight:650;color:#6f8760}.footer{position:absolute;bottom:39px;left:64px;right:64px;border-top:1px solid #dfe4d7;padding-top:21px;display:flex;justify-content:space-between;align-items:center;font-size:16px;color:#708267}.footer strong{font-size:19px;letter-spacing:-.5px;font-weight:700;color:${ink}}.source{display:flex;align-items:center;gap:10px}.source svg{width:21px;height:21px}.home-title{font-family:Manrope,sans-serif;font-size:69px;letter-spacing:-3.2px;line-height:1.11;font-weight:750;max-width:720px;margin:21px 0 25px}.home-title span{color:#437452;position:relative}.home-title span:after{content:'';height:8px;background:${lime};left:0;right:0;bottom:4px;position:absolute;z-index:-1;border-radius:10px}.home-copy{position:absolute;top:161px;width:710px}.scope-label{font-size:21px;color:#738665;font-weight:500}.home-art{position:absolute;right:64px;top:146px;width:280px;height:358px;border-radius:22px;background:${ink};padding:31px;overflow:hidden}.home-art:after{content:'';position:absolute;width:265px;height:265px;border-radius:50%;border:1px solid #3d5741;right:-180px;top:45px}.art-title{font-size:13px;letter-spacing:1.9px;color:#b2c59d;margin-bottom:28px}.scope-row{display:flex;align-items:center;gap:18px;padding:17px 0;border-top:1px solid #395142}.scope-row strong{font-family:Manrope,sans-serif;font-size:43px;line-height:1;font-weight:700;letter-spacing:-1.5px;color:${lime};width:58px}.scope-row span{font-size:17px;line-height:1.45;color:#d3dfc3}.candidate-copy{position:absolute;left:64px;top:160px;width:783px}.candidate-name{font-family:Manrope,sans-serif;font-size:62px;letter-spacing:-2.3px;line-height:1.07;font-weight:800;margin:17px 0 15px;max-width:790px}.candidate-name.medium{font-size:54px}.candidate-name.long{font-size:47px;letter-spacing:-1.7px}.candidate-meta{font-size:21px;font-weight:500;color:#75856c}.candidate-photo{position:absolute;top:157px;right:64px;width:228px;height:320px;border-radius:18px;object-fit:cover;object-position:center 22%;border:1px solid #e0e5d8;background:#e9eddf}.photo-credit{position:absolute;right:68px;top:487px;font-size:10px;letter-spacing:.4px;color:#7f8c74}.metrics{position:absolute;left:64px;top:355px;display:grid;grid-template-columns:365px 365px;gap:20px}.metric{height:142px;background:white;border:1px solid #e1e6da;border-radius:15px;padding:22px 23px}.metric.primary{background:${ink};border-color:${ink}}.metric-label{display:block;font-size:16px;color:#7b8b6e;font-weight:500;margin-bottom:14px;white-space:nowrap}.metric.primary .metric-label{color:#bdd0aa}.metric-value{display:block;font-family:Manrope,sans-serif;font-size:31px;letter-spacing:-1px;font-weight:750;line-height:1.3;white-space:nowrap}.metric.primary .metric-value{color:${lime}}.date{font-size:14px;color:#6d7e62;position:absolute;left:65px;top:512px}.footer.candidate-footer{font-size:15px}.footer.candidate-footer strong{font-size:18px}
`;

function document(body, width = 1200, height = 630) {
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;650;700&family=Manrope:wght@500;650;700;750;800&display=swap" rel="stylesheet"><style>${styles}${width === 1200 ? '' : `html,body{width:${width}px;height:${height}px;background:transparent}body>svg{display:block;width:${width}px;height:${height}px}`}</style></head><body>${body}</body></html>`;
}

function homeHtml() {
  return document(`<div class="frame"><div class="topline">${brand}<div class="edition">ELEIÇÕES 2026</div></div><div class="home-copy"><div class="eyebrow">O DINHEIRO DA ELEIÇÃO, EXPLICADO</div><h1 class="home-title">Quem banca a<br><span>política brasileira?</span></h1><div class="scope-label">105 candidaturas · Eleições 2026</div></div><div class="home-art"><div class="art-title">EXPLORE AS CAMPANHAS</div><div class="scope-row"><strong>50</strong><span>Deputados<br>federais</span></div><div class="scope-row"><strong>50</strong><span>Candidaturas<br>ao Senado</span></div><div class="scope-row"><strong>5</strong><span>Candidaturas<br>à Presidência</span></div></div><div class="footer"><div class="source"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m12 3 8 4v5c0 5-8 9-8 9s-8-4-8-9V7l8-4Z"/><path d="m8 12 3 3 5-6"/></svg>Dados públicos do TSE</div><strong>quembancou.com</strong></div></div>`);
}

async function candidateHtml(candidate) {
  const jpeg = await readFile(path.join(assets, 'candidates', `${candidate.id}.jpg`));
  const title = candidate.ballot_name;
  const className = title.length > 30 ? 'long' : title.length > 22 ? 'medium' : '';
  const state = candidate.state === 'BR' ? 'Brasil' : candidate.state;
  return document(`<div class="frame"><div class="topline">${brand}<div class="edition">ELEIÇÕES 2026</div></div><div class="candidate-copy"><div class="eyebrow">QUEM BANCOU ESTA CAMPANHA?</div><h1 class="candidate-name ${className}">${escape(title)}</h1><div class="candidate-meta">${escape(candidate.office)} · ${escape(candidate.party)} / ${escape(state)}</div></div><img class="candidate-photo" src="data:image/jpeg;base64,${jpeg.toString('base64')}" alt=""><div class="photo-credit">FOTO OFICIAL · TSE</div><div class="metrics"><div class="metric primary"><span class="metric-label">Fundo eleitoral recebido · FEFC</span><strong class="metric-value">${escape(money(candidate.totals?.fefc_received_financial_cents))}</strong></div><div class="metric"><span class="metric-label">Impulsionamento pago</span><strong class="metric-value">${escape(money(candidate.totals?.boost_paid_cents))}</strong></div></div><div class="date">Declaração: ${escape(date(candidate.snapshot?.submitted_date))} · Extração: ${escape(date(candidate.snapshot?.generated_date))}</div><div class="footer candidate-footer"><div class="source">Valores declarados ao TSE</div><strong>quembancou.com</strong></div></div>`);
}

const target = await fetch('http://127.0.0.1:9334/json/new?about:blank', { method: 'PUT' }).then(response => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let sequence = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error))); else resolve(message.result);
  }
});
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
}
async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function render(html, outputPath, width, height, format = 'jpeg') {
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const { frameTree } = await cdp('Page.getFrameTree');
  await cdp('Page.setDocumentContent', { frameId: frameTree.frame.id, html });
  await evaluate(`(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(img=>img.decode()));await new Promise(requestAnimationFrame);return true})()`);
  if (width === 1200) await evaluate(`(()=>{const name=document.querySelector('.candidate-name');if(name){let size=parseFloat(getComputedStyle(name).fontSize);while(name.getBoundingClientRect().bottom>304&&size>38){size-=2;name.style.fontSize=size+'px';}}return true})()`);
  if (width === 1200) {
    const failure = await evaluate(`(()=>{const fail=[];for(const el of document.querySelectorAll('.candidate-name,.candidate-meta,.metric-value')){if(el.scrollWidth>el.clientWidth+1)fail.push(el.className);if(el.getBoundingClientRect().right>865)fail.push('photo overlap '+el.className);}const name=document.querySelector('.candidate-name');if(name&&name.getBoundingClientRect().bottom>304)fail.push('name height');return fail})()`);
    if (failure.length) throw new Error(`Sharing layout overflow: ${outputPath}: ${failure.join(', ')}`);
  }
  const shot = await cdp('Page.captureScreenshot', { format, ...(format === 'jpeg' ? { quality: 85 } : {}), captureBeyondViewport: false, clip: { x: 0, y: 0, width, height, scale: 1 } });
  const bytes = Buffer.from(shot.data, 'base64');
  await writeFile(outputPath, bytes);
  return bytes;
}

try {
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await mkdir(path.join(assets, 'og', 'candidates'), { recursive: true });
  await writeFile(path.join(assets, 'favicon.svg'), `${mark}\n`);
  await cdp('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  const iconFiles = [[32, 'favicon-32.png'], [180, 'apple-touch-icon.png'], [192, 'icon-192.png'], [512, 'icon-512.png']];
  let png32;
  for (const [size, name] of iconFiles) {
    const iconMark = size === 32 ? mark : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${cream}"/><g transform="translate(36 36) scale(.859375)">${mark}</g></svg>`;
    const bytes = await render(document(iconMark, size, size), path.join(assets, name), size, size, 'png');
    if (size === 32) png32 = bytes;
  }
  const icoHeader = Buffer.alloc(22);
  icoHeader.writeUInt16LE(1, 2); icoHeader.writeUInt16LE(1, 4);
  icoHeader[6] = 32; icoHeader[7] = 32;
  icoHeader.writeUInt16LE(1, 10); icoHeader.writeUInt16LE(32, 12);
  icoHeader.writeUInt32LE(png32.length, 14); icoHeader.writeUInt32LE(22, 18);
  await writeFile(path.join(root, 'dist', 'favicon.ico'), Buffer.concat([icoHeader, png32]));
  await cdp('Emulation.setDefaultBackgroundColorOverride', { color: { r: 246, g: 245, b: 240, a: 1 } });
  await render(homeHtml(), path.join(assets, 'og', 'home.jpg'), 1200, 630);
  console.log('Home OG and 6 icon assets generated.');
  let count = 0;
  for (const candidate of overview.candidates) {
    if (!/^\d+$/.test(candidate.id)) throw new Error(`Invalid candidate ID: ${candidate.id}`);
    await render(await candidateHtml(candidate), path.join(assets, 'og', 'candidates', `${candidate.id}.jpg`), 1200, 630);
    count++;
    if (count % 20 === 0) console.log(`${count}/${overview.candidates.length} candidate OGs generated.`);
  }
  console.log(JSON.stringify({ home_og: 1, candidate_ogs: count, og_dimensions: [1200, 630], jpeg_quality: 85, icon_sizes: [32, 180, 192, 512], elapsed_seconds: Number(((performance.now() - started) / 1000).toFixed(2)) }));
} finally {
  const closed = new Promise(resolve => socket.addEventListener('close', resolve, { once: true }));
  socket.close();
  await closed;
  // Only this script's target is closed. The shared Chrome browser stays alive.
  await fetch(`http://127.0.0.1:9334/json/close/${target.id}`).catch(() => {});
}
