const appRoot = new URL('.', document.currentScript.src);
const appUrl = path => new URL(path, appRoot).href;
const $ = (id) => document.getElementById(id);
const money = (cents) => Number.isFinite(cents) ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100) : 'Sem dados';
const number = (value) => Number.isFinite(value) ? new Intl.NumberFormat('pt-BR').format(value) : '—';
const percentage = (value, digits = 1) => Number.isFinite(value) ? new Intl.NumberFormat('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value) + '%' : '—';
const shortMoney = (cents) => {
  if (!Number.isFinite(cents)) return 'Sem dados';
  const reais = cents / 100;
  if (Math.abs(reais) >= 1e6) return 'R$ ' + new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(reais / 1e6) + ' mi';
  if (Math.abs(reais) >= 1e3) return 'R$ ' + new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(reais / 1e3) + ' mil';
  return money(cents);
};
const date = (value) => value ? value.slice(0, 10).split('-').reverse().join('/') : 'Data não informada';
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const normalize = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const titleCase = (value) => String(value).toLocaleLowerCase('pt-BR').replace(/(^|[\s/-])([\p{L}\d])/gu, (_, space, letter) => space + letter.toLocaleUpperCase('pt-BR')).replace(/\b(De|Da|Do|Das|Dos|E)\b/g, (word) => word.toLowerCase()).replace(/\bLtda\b/g, 'Ltda.');
const toast = (message) => {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toast.timeout);
  toast.timeout = setTimeout(() => { $('toast').hidden = true; }, 3500);
};
const state = { data: null, dataUrl: null, mode: 'suppliers', query: '', sort: 'desc', limit: 10 };
const donorKinds = { party: 'Repasse partidário', person: 'Pessoa física', crowdfunding_intermediary: 'Intermediário de financiamento coletivo', investment_income: 'Rendimento financeiro', own_resources: 'Recursos próprios', candidate_transfer: 'Repasse de candidatura', other: 'Outra origem' };
const officeLabels = { federal_deputy: 'Deputado federal', senator: 'Senador', president: 'Presidente da República' };

function setMetric(id, cents) {
  $(id).textContent = shortMoney(cents);
  $(id).title = money(cents);
  $(id).setAttribute('aria-label', money(cents));
}

function renderOverview(data) {
  const { candidate, snapshot, totals } = data;
  document.querySelectorAll('[data-year]').forEach((node) => { node.textContent = candidate.election_year; });
  document.title = `${candidate.ballot_name} · Eleições ${candidate.election_year} — Quem Bancou`;
  document.querySelector('meta[name="description"]').content = `Contas da campanha de ${titleCase(candidate.ballot_name)} em ${candidate.election_year}. Recursos, despesas e doações declarados ao TSE, com fontes e período.`;
  $('candidate-name').innerHTML = escape(titleCase(candidate.ballot_name)) + '<span class="title-dot">.</span>';
  document.querySelector('.full-name').textContent = titleCase(candidate.name);
  document.querySelector('.candidate-tags').innerHTML = `<span>${escape(candidate.party)}</span><span>${escape(officeLabels[candidate.group] || candidate.office)}</span><span>Nº ${escape(candidate.number)}</span>${candidate.state !== 'BR' ? `<span>${escape(candidate.state)}</span>` : ''}`;
  document.querySelector('.breadcrumb').innerHTML = `<a class="profile-back" href="./">← Dashboard</a><span aria-hidden="true">/</span><span>${escape(officeLabels[candidate.group] || candidate.office)}</span><span aria-hidden="true">/</span><strong>${escape(titleCase(candidate.ballot_name))}</strong>`;
  const context = document.createElement('div');
  context.className = 'profile-context';
  context.innerHTML = `<span>${number(candidate.votes)} votos · 1º turno</span><span>${number(candidate.rank)}º por votos no cargo · Brasil</span>${candidate.election_status ? `<span>${escape(titleCase(candidate.election_status))}</span>` : ''}`;
  document.querySelector('.candidate-info').append(context);
  document.querySelectorAll('.site-footer .brand, .site-header .brand, .profile-back').forEach(link => { link.href = appRoot.href; });
  const photo = document.createElement('img');
  photo.src = appUrl(`assets/candidates/${candidate.id}.jpg`);
  photo.alt = titleCase(candidate.name);
  photo.width = 142;
  photo.height = 158;
  photo.addEventListener('error', () => { photo.remove(); }, { once: true });
  $('candidate-photo').append(photo);
  const photoMonogram = $('candidate-photo').querySelector('span');
  if (photoMonogram) photoMonogram.textContent = candidate.ballot_name.slice(0, 1);
  photo.addEventListener('load', () => { if (photoMonogram) photoMonogram.hidden = true; }, { once: true });
  const source = data.sources.find((source) => source.kind === 'consultation');
  if (source) { $('tse-link').href = source.url; $('dialog-source').href = source.url; }
  $('data-status').querySelector('strong').textContent = `${snapshot.statement_type} · ${date(snapshot.submitted_date)}`;
  $('data-status').querySelector(':scope > div > span').textContent = `Base extraída em ${date(snapshot.generated_date)}. ${snapshot.is_final ? 'Prestação final enviada.' : 'Contas em andamento.'}`;
  setMetric('received-value', totals.revenue_total_cents);
  setMetric('contracted-value', totals.expense_contracted_cents);
  setMetric('paid-value', totals.expense_paid_cents);
  $('received-note').innerHTML = `<span class="exact-amount">${escape(money(totals.revenue_total_cents))}</span><br>Financeiro + bens e serviços estimáveis`;
  $('received-footer').textContent = `${shortMoney(totals.revenue_estimated_cents)} em bens e serviços`;
  $('contracted-value').nextElementSibling.innerHTML = `<span class="exact-amount">${escape(money(totals.expense_contracted_cents))}</span><br>Compromissos assumidos pela campanha`;
  $('paid-note').innerHTML = `<span class="exact-amount">${escape(money(totals.expense_paid_cents))}</span><br>Pagamentos informados nesta declaração`;
  $('paid-footer').textContent = totals.expense_contracted_cents > 0 && Number.isFinite(totals.expense_paid_cents) ? `${percentage(totals.expense_paid_cents / totals.expense_contracted_cents * 100)} do valor contratado` : 'Conforme a declaração disponível';
  $('suppliers-value').textContent = number(totals.supplier_count);
  $('suppliers-tab-count').textContent = number(data.suppliers.length);
  $('donors-tab-count').textContent = 'recorte';
  $('download-button').disabled = false;
  $('period-method').innerHTML = `Eleição de <strong>${candidate.election_year}</strong>, candidatura de <strong>${escape(titleCase(candidate.name))}</strong> a ${escape((officeLabels[candidate.group] || candidate.office).toLowerCase())}. O recorte corresponde ao <strong>${escape((snapshot.statement_type || 'Declaração não disponível').toLowerCase())}${snapshot.submitted_date ? ' enviado em ' + date(snapshot.submitted_date) : ''}</strong>, com arquivos gerados pelo TSE em ${date(snapshot.generated_date)}.<br><br>${snapshot.receipt_date_range?.from ? `Há receitas entre ${date(snapshot.receipt_date_range.from)} e ${date(snapshot.receipt_date_range.to)}.` : 'O arquivo de receitas não contém registros para este recorte.'} ${snapshot.expense_date_range?.from ? `Despesas entre ${date(snapshot.expense_date_range.from)} e ${date(snapshot.expense_date_range.to)}.` : 'O arquivo de despesas não contém registros para este recorte.'} Os valores acumulam registros da campanha; o campo de turno não restringe os registros àquele turno. As contas ainda podem receber atualizações.`;
  $('grouping-method').innerHTML = `Os <strong>${number(totals.expense_item_count)} itens de despesa</strong> foram agrupados em <strong>${number(totals.expense_document_count)} documentos</strong> e <strong>${number(totals.supplier_count)} fornecedores ou destinatários</strong>. As ${number(totals.payment_count)} parcelas pagas foram contadas uma vez e associadas aos documentos correspondentes.<br><br>O ranking de financiamento mostra os repasses partidários, o intermediário de financiamento coletivo, rendimentos e os <strong>${data.donor_summary.person_ranking_limit} maiores doadores financeiros diretos</strong>. A base registra ${number(data.donor_summary.direct_person_count)} pessoas físicas doadoras diretas; os demais nomes não aparecem neste ranking.<br><br>As fontes financeiras seguem a classificação do TSE. “Outros recursos” inclui doações e financiamento coletivo. As despesas incluem transferências a outros candidatos ou partidos, identificadas nos detalhes.`;
  $('source-links').replaceChildren();
  for (const source of data.sources) {
    const a = document.createElement('a');
    a.href = source.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = source.name + ' ↗';
    $('source-links').append(a);
  }
  const jsonLink = document.createElement('a');
  jsonLink.href = state.dataUrl;
  jsonLink.download = `${normalize(candidate.ballot_name).replace(/[^a-z0-9]+/g,'-')}-${candidate.election_year}-dados.json`;
  jsonLink.textContent = 'Baixar o recorte desta página (JSON) ↓';
  $('source-links').append(jsonLink);
  const extraction = document.createElement('p');
  extraction.textContent = `Arquivos consultados: ${snapshot.files.map((file) => file.file).join(', ')}. Extração: ${date(snapshot.generated_date)}.`;
  extraction.style.marginTop = '12px';
  $('source-links').append(extraction);
  const photoCredit = document.createElement('a');
  photoCredit.href = 'https://dadosabertos.tse.jus.br/dataset/candidatos-2026';
  photoCredit.target = '_blank';
  photoCredit.rel = 'noopener noreferrer';
  photoCredit.textContent = 'Fotografia oficial de candidatura: TSE ↗';
  photoCredit.id = 'photo-credit';
  $('source-links').append(photoCredit);
}

function renderOrigins(data) {
  const colors = ['#315b42', '#a9c986', '#d8e8c0', '#6d8e58', '#d0d7b4'];
  const sources = [...data.funding_sources].sort((a, b) => b.financial_cents - a.financial_cents);
  const total = data.totals.revenue_financial_cents;
  if (!(total > 0)) {
    $('origin-legend').textContent = Number.isFinite(total) ? 'Não há valor financeiro declarado nesta entrega.' : 'Receitas financeiras indisponíveis nesta consulta.';
    $('public-percentage').textContent = '—';
    $('donut-label').textContent = 'sem distribuição disponível';
    $('origin-note').textContent = `Receitas financeiras: ${money(total)}. Bens e serviços estimáveis: ${money(data.totals.revenue_estimated_cents)}.`;
    return;
  }
  let cursor = 0;
  const slices = sources.filter((source) => source.financial_cents > 0).map((source, i) => {
    const start = cursor;
    cursor += source.financial_cents / total * 100;
    return `${colors[i % colors.length]} ${start}% ${cursor}%`;
  });
  $('origin-donut').style.background = `conic-gradient(${slices.join(', ')})`;
  $('origin-donut').setAttribute('aria-label', sources.map((source) => `${source.name}: ${money(source.financial_cents)}, ${percentage(source.financial_cents / total * 100)}`).join('. '));
  $('public-percentage').textContent = percentage(data.totals.public_financial_share_percent);
  $('donut-label').textContent = 'dos recursos financeiros são públicos';
  $('origin-legend').innerHTML = sources.map((source, i) => `<div class="legend-item"><span class="legend-swatch" style="background:${colors[i % colors.length]}" aria-hidden="true"></span><div><div class="legend-name">${escape(source.name)}</div><div class="legend-value">${escape(money(source.financial_cents))}</div></div><span class="legend-percent">${percentage(source.financial_cents / total * 100)}</span></div>`).join('');
  $('origin-note').textContent = `Gráfico: ${money(total)} em receitas financeiras. Bens e serviços estimáveis: ${money(data.totals.revenue_estimated_cents)}, fora do gráfico. Recursos públicos = FEFC + fundo partidário.`;
}

function renderCategories(data) {
  const categories = [...data.expense_categories].sort((a, b) => b.total_cents - a.total_cents);
  if (!categories.length) { $('category-bars').textContent = 'Não há categorias de despesa disponíveis nesta declaração.'; return; }
  const top = categories.slice(0, 6);
  const max = top[0]?.total_cents || 1;
  $('category-bars').innerHTML = top.map((category) => `<div class="category-item" title="${escape(category.name + ': ' + money(category.total_cents) + ' (' + percentage(category.total_cents / data.totals.expense_contracted_cents * 100) + ')')}"><div class="category-top"><span class="category-name">${escape(category.name)}</span><span class="category-amount">${escape(shortMoney(category.total_cents))}</span></div><div class="bar-track" role="img" aria-label="${escape(category.name)}: ${escape(money(category.total_cents))}"><div class="bar-fill" style="width:${category.total_cents / max * 100}%"></div></div></div>`).join('');
  $('categories-note').textContent = `As 6 maiores de ${number(categories.length)} categorias. Barras proporcionais à maior categoria; valores contratados, incluindo compromissos ainda não pagos.`;
}

function rowAmount(row) { return state.mode === 'suppliers' ? row.total_cents : row.financial_cents; }
function rowCategory(row) { return state.mode === 'suppliers' ? row.categories.join(' · ') : (donorKinds[row.type] || row.origins.join(' · ')); }
function filteredRows() {
  const rows = state.data[state.mode].filter((row) => normalize(row.name + ' ' + rowCategory(row)).includes(normalize(state.query)));
  return rows.sort((a, b) => state.sort === 'name' ? a.name.localeCompare(b.name, 'pt-BR') : (state.sort === 'asc' ? 1 : -1) * (rowAmount(a) - rowAmount(b)) || a.name.localeCompare(b.name, 'pt-BR'));
}

function renderTable() {
  if (!state.data) return;
  const rows = filteredRows();
  const visible = rows.slice(0, state.limit);
  const isSupplier = state.mode === 'suppliers';
  const denominator = isSupplier ? state.data.totals.expense_contracted_cents : state.data.totals.revenue_financial_cents;
  $('name-column').textContent = isSupplier ? 'Fornecedor / destinatário' : 'Origem / financiador';
  $('category-column').textContent = isSupplier ? 'Categoria' : 'Tipo de registro';
  document.querySelector('th.number-cell').textContent = isSupplier ? 'Valor contratado' : 'Receita financeira';
  $('records-body').innerHTML = visible.length ? visible.map((row, i) => {
    const share = denominator > 0 ? rowAmount(row) / denominator * 100 : 0;
    const category = rowCategory(row);
    const subtext = isSupplier ? `${number(row.transaction_count)} ${row.transaction_count === 1 ? 'documento declarado' : 'documentos declarados'}` : (row.type === 'crowdfunding_intermediary' ? 'Repasse de doações arrecadadas pela plataforma' : `${number(row.transaction_count)} ${row.transaction_count === 1 ? 'registro de receita' : 'registros de receita'}`);
    return `<tr><td class="rank-cell">${i + 1}</td><td class="name-cell">${escape(titleCase(row.name))}<small>${escape(subtext)}</small></td><td class="category-cell"><span class="category-tag" title="${escape(category)}">${escape(category)}</span></td><td class="number-cell">${escape(money(rowAmount(row)))}${isSupplier ? `<small class="paid-subtext">Pago: ${escape(money(row.paid_cents))}</small>` : ''}</td><td class="share-cell"><span class="mini-share">${share > 0 && share < .1 ? '&lt; 0,1%' : percentage(share)}<span class="mini-track" aria-hidden="true"><span class="mini-fill" style="display:block;width:${share}%"></span></span></span></td><td><button class="row-details" type="button" data-record-id="${escape(row.id)}" aria-label="Ver detalhes de ${escape(row.name)}">↗</button></td></tr>`;
  }).join('') : '<tr><td colspan="6" class="empty-state">Nenhum registro encontrado. Tente outro nome ou categoria.</td></tr>';
  const suffix = isSupplier ? 'Valores contratados; pagamentos nos detalhes.' : `Recorte: ${state.data.donor_summary.person_ranking_limit} maiores doadores diretos, repasses e rendimentos.`;
  $('records-summary').textContent = `${number(visible.length)} de ${number(rows.length)} registros${state.query ? ' encontrados' : ''}. ${suffix}`;
  $('load-more').hidden = visible.length >= rows.length;
}

function openRecord(id) {
  const row = state.data[state.mode].find((item) => item.id === id);
  if (!row) return;
  const isSupplier = state.mode === 'suppliers';
  $('dialog-title').textContent = titleCase(row.name);
  $('dialog-description').textContent = rowCategory(row);
  const figures = isSupplier ? [{ label: 'Valor contratado', cents: row.total_cents }, { label: 'Valor pago', cents: row.paid_cents }] : [{ label: 'Receita financeira', cents: row.financial_cents }, { label: 'Bens e serviços estimáveis', cents: row.estimated_cents }];
  const records = [...row.records].sort((a, b) => b.date.localeCompare(a.date));
  const list = records.slice(0, 30).map((record) => {
    const description = isSupplier ? record.items.map((item) => item.description || item.category).join(' · ') : (record.description || record.source);
    return `<div class="dialog-record"><div>${escape(description)}<small>${date(record.date)} · ${escape(isSupplier ? `${record.document_type} · ${record.item_count} ${record.item_count === 1 ? 'item' : 'itens'}` : record.nature + ' · ' + record.source)}</small>${isSupplier ? `<small>Pago: ${escape(money(record.paid_cents))}${record.payments.length ? ' · ' + record.payments.map((payment) => `${date(payment.date)}: ${escape(money(payment.paid_cents))}`).join('; ') : ''}</small>` : ''}</div><strong>${escape(money(record.total_cents))}</strong></div>`;
  }).join('');
  $('dialog-content').innerHTML = `<div class="dialog-metrics">${figures.map((figure) => `<div><small>${figure.label}</small><strong>${escape(money(figure.cents))}</strong></div>`).join('')}</div><p class="dialog-record-count">${number(records.length)} ${records.length === 1 ? 'registro' : 'registros'} nesta declaração${records.length > 30 ? '. Exibindo os 30 mais recentes; o arquivo JSON contém todos os registros deste nome.' : '.'}</p>${list}`;
  $('record-dialog').showModal();
}

function changeMode(mode) {
  state.mode = mode;
  state.limit = 10;
  state.query = '';
  $('records-search').value = '';
  document.querySelectorAll('[data-mode]').forEach((tab) => {
    const selected = tab.dataset.mode === mode;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  $('records-region').setAttribute('aria-labelledby', mode === 'suppliers' ? 'suppliers-tab' : 'donors-tab');
  renderTable();
}

function exportCsv() {
  const rows = filteredRows();
  const isSupplier = state.mode === 'suppliers';
  const field = (value) => '"' + String(value ?? '').replace(/"/g, '""') + '"';
  const headers = isSupplier ? ['Nome', 'Categorias', 'Valor contratado (R$)', 'Valor pago (R$)', 'Documentos'] : ['Nome', 'Tipo', 'Receita financeira (R$)', 'Receita estimável (R$)', 'Registros'];
  const lines = rows.map((row) => [row.name, rowCategory(row), (rowAmount(row) / 100).toFixed(2).replace('.', ','), ((isSupplier ? row.paid_cents : row.estimated_cents) / 100).toFixed(2).replace('.', ','), row.transaction_count]);
  const meta = [['Candidatura', state.data.candidate.name], ['Eleição', state.data.candidate.election_year], ['Declaração', state.data.snapshot.statement_type], ['Envio', date(state.data.snapshot.submitted_date)], ['Extração TSE', date(state.data.snapshot.generated_date)], ['Recorte', isSupplier ? 'Despesas contratadas e pagamentos da declaração selecionada' : 'Repasses, intermediários, rendimentos e 20 maiores doadores financeiros diretos'], ['Fonte', state.data.sources.find((source) => source.kind === 'dataset').url], []];
  const csv = '\uFEFF' + [...meta, headers, ...lines].map((row) => row.map(field).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `quem-bancou-${normalize(state.data.candidate.ballot_name).replace(/[^a-z0-9]+/g,'-')}-${state.data.candidate.election_year}-${state.mode}-${state.data.snapshot.generated_date}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Dados desta consulta exportados com fonte e período.');
}

$('records-search').addEventListener('input', (event) => { state.query = event.target.value; state.limit = 10; renderTable(); });
$('records-sort').addEventListener('change', (event) => { state.sort = event.target.value; renderTable(); });
$('load-more').addEventListener('click', () => { state.limit += 10; renderTable(); });
$('records-body').addEventListener('click', (event) => { const button = event.target.closest('[data-record-id]'); if (button) openRecord(button.dataset.recordId); });
document.querySelectorAll('[data-mode]').forEach((tab) => {
  tab.addEventListener('click', () => changeMode(tab.dataset.mode));
  tab.addEventListener('keydown', (event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const next = state.mode === 'suppliers' ? 'donors' : 'suppliers'; changeMode(next); document.querySelector(`[data-mode="${next}"]`).focus(); } });
});
$('close-dialog').addEventListener('click', () => $('record-dialog').close());
$('record-dialog').addEventListener('click', (event) => { if (event.target === $('record-dialog')) { const rect = $('record-dialog').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('record-dialog').close(); } });
$('download-button').addEventListener('click', exportCsv);
$('share-button').addEventListener('click', async () => {
  try {
    const share = { title: document.title, text: `Veja a origem dos recursos e as despesas declaradas da campanha de ${titleCase(state.data?.candidate.ballot_name || 'esta candidatura')} (${state.data?.candidate.election_year || 2026}) no Quem Bancou.`, url: state.data ? `https://quembancou.com/candidatos/${state.data.candidate.id}/` : location.href.split('#')[0] };
    if (navigator.share) await navigator.share(share);
    else { await navigator.clipboard.writeText(share.url); toast('Link copiado.'); }
  } catch (error) { if (error.name !== 'AbortError') toast('Não foi possível compartilhar. Copie o endereço desta página.'); }
});

async function initialize() {
  try {
    const id = document.documentElement.dataset.candidateId || new URLSearchParams(location.search).get('id') || '280002542548';
    if (!/^\d{8,20}$/.test(id)) throw new Error('Identificador de candidatura inválido');
    state.dataUrl = appUrl(`data/candidates/${id}.json`);
    const response = await fetch(state.dataUrl);
    if (!response.ok) throw new Error('Dados indisponíveis');
    const data = await response.json();
    if (data.candidate.id !== id || data.candidate.election_year !== 2026 || (data.totals.revenue_total_cents !== null && !Number.isSafeInteger(data.totals.revenue_total_cents))) throw new Error('Recorte inválido');
    state.data = data;
    renderOverview(data);
    renderOrigins(data);
    renderCategories(data);
    renderTable();
    document.documentElement.dataset.ready = 'true';
  } catch (error) {
    $('data-status').classList.add('error-status');
    $('data-status').querySelector('strong').textContent = 'Não foi possível carregar o recorte';
    $('data-status').querySelector(':scope > div > span').textContent = 'Recarregue a página ou consulte os arquivos oficiais do TSE.';
    $('records-body').innerHTML = '<tr><td colspan="6" class="empty-state">Dados indisponíveis nesta consulta. Consulte a fonte oficial.</td></tr>';
    $('origin-legend').textContent = 'Dados indisponíveis.';
    $('category-bars').textContent = 'Dados indisponíveis.';
    console.error('Falha ao carregar os dados da página:', error.message);
    document.documentElement.dataset.ready = 'error';
  }
}
initialize();
