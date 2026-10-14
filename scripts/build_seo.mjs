import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(process.cwd(), 'dist');
const overview = JSON.parse(await readFile(resolve(root, 'data/overview.json'), 'utf8'));
const origin = 'https://quembancou.com';
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const titleCase = value => String(value).toLocaleLowerCase('pt-BR').replace(/(^|[\s/-])([\p{L}\d])/gu, (_, space, letter) => space + letter.toLocaleUpperCase('pt-BR')).replace(/\b(De|Da|Do|Das|Dos|E)\b/g, word => word.toLowerCase());
const office = { federal_deputy: 'Deputado federal', senator: 'Senador', president: 'Presidência da República' };
const date = overview.snapshot.generated_date;
function tags({ title, description, url, image, imageAlt, prefix = '', noindex = false }) {
  const schema = { '@context': 'https://schema.org', '@type': 'WebPage', name: title, description, url, inLanguage: 'pt-BR', dateModified: date, isPartOf: { '@type': 'WebSite', name: 'Quem Bancou', url: origin + '/' } };
  return `<!-- Quem Bancou: SEO -->
  <meta name="robots" content="${noindex ? 'noindex,follow' : 'index,follow,max-image-preview:large'}">
  <link rel="canonical" href="${escape(url)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Quem Bancou">
  <meta property="og:locale" content="pt_BR">
  <meta property="og:title" content="${escape(title)}">
  <meta property="og:description" content="${escape(description)}">
  <meta property="og:url" content="${escape(url)}">
  <meta property="og:image" content="${escape(image)}">
  <meta property="og:image:secure_url" content="${escape(image)}">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escape(imageAlt)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escape(title)}">
  <meta name="twitter:description" content="${escape(description)}">
  <meta name="twitter:image" content="${escape(image)}">
  <meta name="twitter:image:alt" content="${escape(imageAlt)}">
  <meta name="application-name" content="Quem Bancou">
  <meta name="apple-mobile-web-app-title" content="Quem Bancou">
  <link rel="icon" type="image/svg+xml" href="${prefix}assets/favicon.svg">
  <link rel="icon" type="image/png" sizes="32x32" href="${prefix}assets/favicon-32.png">
  <link rel="shortcut icon" href="${prefix}favicon.ico">
  <link rel="apple-touch-icon" sizes="180x180" href="${prefix}assets/apple-touch-icon.png">
  <link rel="manifest" href="${prefix}site.webmanifest">
  <script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>
  <!-- /Quem Bancou: SEO -->`;
}
const removeTags = html => html.replace(/<!-- Quem Bancou: SEO -->[\s\S]*?<!-- \/Quem Bancou: SEO -->\s*/g, '');
function withTags(html, metadata) {
  return removeTags(html).replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(metadata.title)}</title>`).replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${escape(metadata.description)}">`).replace('</head>', tags(metadata) + '\n</head>');
}
const homeMetadata = { title: 'Quem Bancou — Eleições 2026', description: 'Descubra quem mais doou, recebeu fundo eleitoral e pagou impulsionamento. Contas dos 50 deputados federais, 50 candidatos ao Senado e 5 presidenciáveis mais votados, com dados públicos do TSE.', url: origin + '/', image: origin + '/assets/og/home.jpg', imageAlt: 'Quem Bancou: transparência do financiamento de 105 candidaturas nas Eleições 2026.' };
const home = await readFile(resolve(root, 'index.html'), 'utf8');
await writeFile(resolve(root, 'index.html'), withTags(home, homeMetadata));
let template = removeTags(await readFile(resolve(root, 'candidato.html'), 'utf8'));
const generic = withTags(template, { ...homeMetadata, title: 'Contas da candidatura — Quem Bancou', description: 'Origem dos recursos, despesas, fornecedores e doações declarados ao TSE, com fontes e período.', url: origin + '/candidato.html', noindex: true });
await writeFile(resolve(root, 'candidato.html'), generic);
for (const candidate of overview.candidates) {
  if (!/^\d{8,20}$/.test(candidate.id)) throw new Error('Invalid candidate identifier');
  const name = titleCase(candidate.ballot_name);
  const directory = resolve(root, 'candidatos', candidate.id);
  await mkdir(directory, { recursive: true });
  const metadata = { title: `${name} — Quem Bancou · Eleições 2026`, description: `Contas da campanha de ${name}: ${office[candidate.group]}, ${candidate.party}${candidate.state === 'BR' ? '' : ' · ' + candidate.state}. Veja fundo eleitoral, doações, impulsionamento e fornecedores declarados ao TSE.`, url: `${origin}/candidatos/${candidate.id}/`, image: `${origin}/assets/og/candidates/${candidate.id}.jpg`, imageAlt: `${name}: recursos e impulsionamento declarados ao TSE em 2026.`, prefix: '../../' };
  let html = template.replace('<html lang="pt-BR">', `<html lang="pt-BR" data-candidate-id="${candidate.id}">`).replace(/href="styles.css"/g, 'href="../../styles.css"').replace(/href="dashboard.css"/g, 'href="../../dashboard.css"').replace(/src="candidate.js"/g, 'src="../../candidate.js"').replace(/href="\.\/"/g, 'href="../../"');
  html = html.replace(/<h1 id="candidate-name">[\s\S]*?<\/h1>/, `<h1 id="candidate-name">${escape(name)}<span class="title-dot">.</span></h1>`).replace(/<p class="full-name">[\s\S]*?<\/p>/, `<p class="full-name">${escape(titleCase(candidate.name))}</p>`);
  await writeFile(resolve(directory, 'index.html'), withTags(html, metadata));
}
const sitemapUrls = [origin + '/', ...overview.candidates.map(candidate => `${origin}/candidatos/${candidate.id}/`)];
await writeFile(resolve(root, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + sitemapUrls.map(url => `  <url><loc>${url}</loc><lastmod>${date}</lastmod></url>`).join('\n') + '\n</urlset>\n');
await writeFile(resolve(root, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
await writeFile(resolve(root, 'site.webmanifest'), JSON.stringify({ name: 'Quem Bancou — Eleições 2026', short_name: 'Quem Bancou', description: 'O dinheiro da eleição, explicado. Dados públicos do TSE.', lang: 'pt-BR', start_url: './', scope: './', display: 'standalone', background_color: '#f7f8f4', theme_color: '#182d28', icons: [{ src: 'assets/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: 'assets/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }] }, null, 2) + '\n');
await writeFile(resolve(root, '.nojekyll'), '');
await writeFile(resolve(root, 'CNAME'), 'quembancou.com\n');
console.log(JSON.stringify({ generated: 105, canonical_origin: origin, sitemap_urls: sitemapUrls.length, twitter_card: 'summary_large_image', og_dimensions: '1200x630' }));
