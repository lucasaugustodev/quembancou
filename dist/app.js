const $ = id => document.getElementById(id);
const money = cents => Number.isFinite(cents) ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100) : 'Sem dados';
const number = value => new Intl.NumberFormat('pt-BR').format(value);
const shortMoney = cents => {
  if (!Number.isFinite(cents)) return 'Sem dados';
  const reais = cents / 100;
  if (Math.abs(reais) >= 1e9) return 'R$ ' + new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(reais / 1e9) + ' bi';
  if (Math.abs(reais) >= 1e6) return 'R$ ' + new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(reais / 1e6) + ' mi';
  if (Math.abs(reais) >= 1e3) return 'R$ ' + new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(reais / 1e3) + ' mil';
  return money(cents);
};
const date = value => value ? value.slice(0, 10).split('-').reverse().join('/') : 'Data não informada';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const titleCase = value => String(value ?? '').toLocaleLowerCase('pt-BR').replace(/(^|[\s/-])([\p{L}\d])/gu, (_, space, letter) => space + letter.toLocaleUpperCase('pt-BR')).replace(/\b(De|Da|Do|Das|Dos|E)\b/g, word => word.toLowerCase());
const profileUrl = id => `candidatos/${encodeURIComponent(id)}/`;
const officeLabels = { federal_deputy: 'Deputado federal', senator: 'Senado', president: 'Presidência' };
const state = { data: null, office: 'all', uf: 'all', party: 'all', search: '', sort: 'votes', candidateLimit: 12, donorLimit: 5, fefcLimit: 5, boostLimit: 5, spenderLimit: 5, noFundLimit: 5, lowBoostLimit: 5 };
const candidateById = new Map();

function avatar(candidate, cssClass = 'ranking-avatar') {
  const initials = titleCase(candidate.ballot_name || candidate.name).split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('');
  return `<span class="${cssClass}" aria-hidden="true"><img src="assets/candidates/${escape(candidate.id || candidate.candidate_id)}.jpg" alt="" loading="lazy" onerror="this.remove()"><span class="avatar-fallback">${escape(initials)}</span></span>`;
}

function metric(id, value, note) {
  $(id).textContent = shortMoney(value);
  $(id).title = money(value);
  $(id).setAttribute('aria-label', money(value));
  $(id + '-note').textContent = note;
}

function initializeOverview(data) {
  const count = data.candidates.length;
  const coverage = data.snapshot.coverage?.available ?? data.candidates.filter(candidate => candidate.data_status === 'available').length;
  $('scope-total').innerHTML = `${number(count)}<span>candidaturas</span>`;
  $('scope-deputies').textContent = data.scope.federal_deputy;
  $('scope-senators').textContent = data.scope.senator;
  $('scope-presidents').textContent = data.scope.president;
  $('snapshot-label').textContent = `Dados do TSE extraídos em ${date(data.snapshot.generated_date)} · ${coverage}/${count} candidaturas com contas disponíveis.`;
  $('rankings-scope').textContent = `Entre as ${count} candidaturas selecionadas. Declarações de ${date(data.snapshot.submitted_date_range.from)} a ${date(data.snapshot.submitted_date_range.to)}.`;
  metric('total-fefc', data.totals.fefc_received_financial_cents, `${money(data.totals.fefc_received_financial_cents)} · FEFC financeiro`);
  metric('total-donations', data.totals.direct_person_financial_cents, `${number(data.totals.individual_donor_count)} pessoas · ${money(data.totals.direct_person_financial_cents)}`);
  metric('total-contracted', data.totals.expense_contracted_cents, `${money(data.totals.expense_contracted_cents)} · soma das declarações`);
  metric('total-boost', data.totals.boost_paid_cents, `${money(data.totals.boost_paid_cents)} · contratado: ${shortMoney(data.totals.boost_contracted_cents)}`);
  for (const candidate of data.candidates) candidateById.set(candidate.id, candidate);
  const states = [...new Set(data.candidates.map(candidate => candidate.state))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  $('state-filter').innerHTML = '<option value="all">Todos os estados</option>' + states.map(uf => `<option value="${escape(uf)}">${uf === 'BR' ? 'Brasil · Presidência' : escape(uf)}</option>`).join('');
  const parties = [...new Set(data.candidates.map(candidate => candidate.party))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  $('party-filter').innerHTML = '<option value="all">Todos os partidos</option>' + parties.map(party => `<option value="${escape(party)}">${escape(party)}</option>`).join('');
  $('snapshot-method').textContent = `Extração de ${date(data.snapshot.generated_date)}. As entregas das campanhas deste recorte variam de ${date(data.snapshot.submitted_date_range.from)} a ${date(data.snapshot.submitted_date_range.to)}; o período de cada candidatura está na sua página. Relatórios financeiros e contas parciais não são contas finais. Os valores podem ser atualizados ou retificados. Ausência de informação aparece como “sem dados”. Os totais da dashboard somam as declarações disponíveis; repasses entre campanhas podem aparecer em mais de uma conta, e essa soma não representa o custo total das eleições.`;
  $('donors-method').textContent = `O recorte tem ${number(data.totals.individual_donor_count)} pessoas físicas doadoras diretas. Somamos somente doações financeiras diretas de cada pessoa às ${count} candidaturas selecionadas. Recursos próprios, repasses partidários, financiamento coletivo intermediado e rendimentos financeiros ficam fora deste ranking. A lista exibe os ${data.rankings.individual_donors.length} maiores totais da seleção, e não todas as doações do Brasil. Clique em um doador para ver as campanhas que receberam seus recursos.`;
  $('overview-sources').replaceChildren();
  for (const source of data.sources) {
    const a = document.createElement('a');
    a.href = source.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = source.name + ' ↗';
    $('overview-sources').append(a);
  }
  const jsonLink = document.createElement('a');
  jsonLink.href = 'data/overview.json';
  jsonLink.download = 'quem-bancou-panoramas-2026.json';
  jsonLink.textContent = 'Baixar os dados desta dashboard (JSON) ↓';
  $('overview-sources').append(jsonLink);
}

function renderDonorRanking() {
  const donors = state.data.rankings.individual_donors;
  $('donor-ranking').innerHTML = donors.slice(0, state.donorLimit).map((donor, i) => `<li><button class="ranking-row" type="button" data-donor="${escape(donor.id)}" aria-label="Ver doações de ${escape(donor.name)}"><span class="ranking-number">${i + 1}</span><span class="ranking-person"><strong title="${escape(donor.name)}">${escape(titleCase(donor.name))}</strong><small>${number(donor.campaign_count)} ${donor.campaign_count === 1 ? 'campanha nesta seleção' : 'campanhas nesta seleção'}</small></span><span class="ranking-amount"><strong title="${escape(money(donor.financial_cents))}">${escape(shortMoney(donor.financial_cents))}</strong><small>ver doações ↗</small></span></button></li>`).join('') || '<li class="empty-state">Sem doações diretas disponíveis.</li>';
  $('more-donors').hidden = state.donorLimit >= donors.length;
}

function renderCandidateRanking(kind) {
  const isFefc = kind === 'fefc';
  const rows = [...state.data.rankings[isFefc ? 'fefc_recipients' : 'content_boost']];
  const field = isFefc ? 'financial_cents' : 'paid_cents';
  rows.sort((a, b) => (b[field] ?? -1) - (a[field] ?? -1) || a.name.localeCompare(b.name, 'pt-BR'));
  const limit = isFefc ? state.fefcLimit : state.boostLimit;
  $(kind + '-ranking').innerHTML = rows.slice(0, limit).map((row, i) => {
    const candidate = candidateById.get(row.candidate_id) || row;
    return `<li><a class="ranking-row" href="${profileUrl(row.candidate_id)}"><span class="ranking-number">${i + 1}</span>${avatar(candidate)}<span class="ranking-person"><strong>${escape(titleCase(candidate.ballot_name || candidate.name))}</strong><small>${escape(candidate.party)} · ${escape(officeLabels[candidate.group] || candidate.office)}${candidate.state !== 'BR' ? ' · ' + escape(candidate.state) : ''}</small></span><span class="ranking-amount"><strong title="${escape(money(row[field]))}">${escape(shortMoney(row[field]))}</strong><small>${isFefc ? 'recebido' : 'pago'} ↗</small></span></a></li>`;
  }).join('') || '<li class="empty-state">Sem registros disponíveis.</li>';
  $('more-' + kind).hidden = limit >= rows.length;
}

function filteredCandidates() {
  const rows = state.data.candidates.filter(candidate => (state.office === 'all' || candidate.group === state.office) && (state.uf === 'all' || candidate.state === state.uf) && (state.party === 'all' || candidate.party === state.party) && normalize(`${candidate.ballot_name} ${candidate.name} ${candidate.party} ${candidate.state}`).includes(normalize(state.search)));
  const fields = { fefc: 'fefc_received_financial_cents', boost: 'boost_paid_cents', expenses: 'expense_contracted_cents' };
  const officeOrder = { president: 0, federal_deputy: 1, senator: 2 };
  return rows.sort((a, b) => {
    if (state.sort === 'name') return (a.ballot_name || a.name).localeCompare(b.ballot_name || b.name, 'pt-BR');
    if (state.sort === 'votes') return officeOrder[a.group] - officeOrder[b.group] || b.votes - a.votes || a.name.localeCompare(b.name, 'pt-BR');
    const field = fields[state.sort];
    return (b.totals[field] ?? -1) - (a.totals[field] ?? -1) || a.name.localeCompare(b.name, 'pt-BR');
  });
}

function renderSpending() {
  const categories = [...state.data.expense_categories].sort((a, b) => b.total_cents - a.total_cents);
  const top = categories.slice(0, 5);
  const max = top[0]?.total_cents || 1;
  $('dashboard-expense-bars').innerHTML = top.map(category => `<div class="category-item"><div class="category-top"><span class="category-name" title="${escape(category.name)}">${escape(category.name)}</span><span class="category-amount" title="${escape(money(category.total_cents))}">${escape(shortMoney(category.total_cents))}</span></div><div class="bar-track" role="img" aria-label="${escape(category.name)}: ${escape(money(category.total_cents))}"><div class="bar-fill" style="width:${category.total_cents / max * 100}%"></div></div></div>`).join('');
  $('dashboard-expense-note').textContent = `As 5 maiores de ${categories.length} categorias. Despesas contratadas, somadas nas declarações dos 105 candidatos.`;
  const spenders = [...state.data.rankings.spenders].sort((a, b) => b.contracted_cents - a.contracted_cents);
  $('spenders-ranking').innerHTML = spenders.slice(0, state.spenderLimit).map((row, i) => {
    const candidate = candidateById.get(row.candidate_id) || row;
    return `<li><a class="ranking-row" href="${profileUrl(row.candidate_id)}"><span class="ranking-number">${i + 1}</span>${avatar(candidate)}<span class="ranking-person"><strong>${escape(titleCase(candidate.ballot_name || candidate.name))}</strong><small>${escape(candidate.party)} · ${escape(officeLabels[candidate.group] || candidate.office)}</small></span><span class="ranking-amount"><strong title="${escape(money(row.contracted_cents))}">${escape(shortMoney(row.contracted_cents))}</strong><small>contratado ↗</small></span></a></li>`;
  }).join('');
  $('more-spenders').hidden = state.spenderLimit >= spenders.length;
}

function renderVoteRankings() {
  const noFund = state.data.candidates.filter(candidate => candidate.totals.fefc_received_financial_cents === 0 && candidate.totals.fefc_paid_cents === 0 && candidate.votes > 0).sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name, 'pt-BR'));
  const lowBoost = state.data.candidates.filter(candidate => Number.isFinite(candidate.totals.boost_paid_cents) && candidate.votes > 0).sort((a, b) => a.totals.boost_paid_cents / a.votes - b.totals.boost_paid_cents / b.votes || b.votes - a.votes || a.name.localeCompare(b.name, 'pt-BR'));
  const costPerVote = candidate => {
    const reais = candidate.totals.boost_paid_cents / candidate.votes / 100;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: reais > 0 && reais < .01 ? 4 : 2, maximumFractionDigits: reais > 0 && reais < .01 ? 6 : 3 }).format(reais);
  };
  const renderRow = (candidate, i, isNoFund) => {
    const main = isNoFund ? number(candidate.votes) : costPerVote(candidate);
    const sub = isNoFund ? 'votos · 1º turno' : 'por voto · 1º turno';
    const title = isNoFund ? `${number(candidate.votes)} votos; FEFC recebido e pago: ${money(0)}` : `${money(candidate.totals.boost_paid_cents)} pagos em impulsionamento / ${number(candidate.votes)} votos`;
    return `<li><a class="ranking-row" href="${profileUrl(candidate.id)}"><span class="ranking-number">${i + 1}</span>${avatar(candidate)}<span class="ranking-person"><strong>${escape(titleCase(candidate.ballot_name))}</strong><small>${escape(candidate.party)} · ${escape(officeLabels[candidate.group])}${isNoFund ? '' : `<br>${number(candidate.votes)} votos · pago: ${escape(shortMoney(candidate.totals.boost_paid_cents))}`}</small></span><span class="ranking-amount"><strong title="${escape(title)}">${escape(main)}</strong><small>${sub} ↗</small></span></a></li>`;
  };
  $('no-fund-ranking').innerHTML = noFund.slice(0, state.noFundLimit).map((candidate, i) => renderRow(candidate, i, true)).join('') || '<li class="empty-state">Nenhuma candidatura deste recorte atende ao critério.</li>';
  $('low-boost-ranking').innerHTML = lowBoost.slice(0, state.lowBoostLimit).map((candidate, i) => renderRow(candidate, i, false)).join('') || '<li class="empty-state">Sem registros para calcular este indicador.</li>';
  $('more-no-fund').hidden = state.noFundLimit >= noFund.length;
  $('more-low-boost').hidden = state.lowBoostLimit >= lowBoost.length;
}

function renderCandidates() {
  const rows = filteredCandidates();
  const visible = rows.slice(0, state.candidateLimit);
  $('catalog-count').textContent = `${number(rows.length)} ${rows.length === 1 ? 'candidatura' : 'candidaturas'}${rows.length !== state.data.candidates.length ? ' encontradas' : ''}`;
  $('candidate-grid').innerHTML = visible.length ? visible.map(candidate => `<a class="candidate-card" href="${profileUrl(candidate.id)}" data-candidate-id="${escape(candidate.id)}"><div class="candidate-card-top">${avatar(candidate, 'candidate-avatar')}<div class="candidate-card-title"><h3 title="${escape(candidate.ballot_name)}">${escape(titleCase(candidate.ballot_name || candidate.name))}</h3><p>${escape(officeLabels[candidate.group] || candidate.office)} · ${candidate.state === 'BR' ? 'Brasil' : escape(candidate.state)}</p></div><span class="candidate-card-party">${escape(candidate.party)}</span></div><div class="candidate-card-values"><div><small>Fundo eleitoral recebido</small><strong title="${escape(money(candidate.totals.fefc_received_financial_cents))}">${escape(shortMoney(candidate.totals.fefc_received_financial_cents))}</strong></div><div><small>Despesas contratadas</small><strong title="${escape(money(candidate.totals.expense_contracted_cents))}">${escape(shortMoney(candidate.totals.expense_contracted_cents))}</strong></div><div><small>Doações de pessoas físicas</small><strong title="${escape(money(candidate.totals.direct_person_financial_cents))}">${escape(shortMoney(candidate.totals.direct_person_financial_cents))}</strong></div><div><small>Impulsionamento pago</small><strong title="${escape(money(candidate.totals.boost_paid_cents))}">${escape(shortMoney(candidate.totals.boost_paid_cents))}</strong></div></div><div class="candidate-card-bottom"><span class="votes">${number(candidate.votes)} votos · 1º turno<br>Contas: ${candidate.snapshot.submitted_date ? date(candidate.snapshot.submitted_date) : 'sem dados'}</span><span class="open-profile">Abrir as contas <span aria-hidden="true">↗</span></span></div></a>`).join('') : '<div class="catalog-empty">Nenhuma candidatura encontrada com estes filtros.<button class="button button-outline" type="button" id="clear-filters">Limpar filtros</button></div>';
  $('catalog-summary').textContent = `Exibindo ${number(visible.length)} de ${number(rows.length)} candidaturas. ${state.sort === 'votes' ? 'Votos em ordem por cargo.' : 'Valores da declaração de cada campanha.'}`;
  $('more-candidates').hidden = visible.length >= rows.length;
  if ($('clear-filters')) $('clear-filters').addEventListener('click', resetFilters);
}

function resetFilters() {
  state.office = 'all'; state.uf = 'all'; state.party = 'all'; state.search = ''; state.candidateLimit = 12;
  $('state-filter').value = 'all'; $('party-filter').value = 'all'; $('candidate-search').value = '';
  document.querySelectorAll('[data-office]').forEach(button => { const active = button.dataset.office === 'all'; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  renderCandidates();
}

function openDonor(id) {
  const donor = state.data.rankings.individual_donors.find(row => row.id === id);
  if (!donor) return;
  $('donor-dialog-title').textContent = titleCase(donor.name);
  $('donor-dialog-description').textContent = `Doações financeiras diretas a ${number(donor.campaign_count)} ${donor.campaign_count === 1 ? 'candidatura' : 'candidaturas'} desta seleção.`;
  const recipients = [...donor.recipients].sort((a, b) => b.financial_cents - a.financial_cents);
  $('donor-dialog-content').innerHTML = `<div class="dialog-metrics"><div><small>Total doado neste recorte</small><strong>${escape(money(donor.financial_cents))}</strong></div></div>` + recipients.map(recipient => {
    const candidate = candidateById.get(recipient.candidate_id);
    return `<a class="donor-dialog-recipient" href="${profileUrl(recipient.candidate_id)}"><span>${escape(titleCase(candidate?.ballot_name || recipient.name))}${candidate ? `<small style="display:block;color:#91a078;font-size:10px">${escape(candidate.party)} · ${escape(officeLabels[candidate.group])} · ${candidate.state === 'BR' ? 'Brasil' : escape(candidate.state)}</small>` : ''}</span><strong>${escape(money(recipient.financial_cents))} <span aria-hidden="true">↗</span></strong></a>`;
  }).join('');
  $('donor-dialog').showModal();
}

document.querySelectorAll('[data-office]').forEach(button => button.addEventListener('click', () => {
  if (!state.data) return;
  state.office = button.dataset.office; state.candidateLimit = 12;
  document.querySelectorAll('[data-office]').forEach(tab => { const active = tab === button; tab.classList.toggle('active', active); tab.setAttribute('aria-pressed', String(active)); });
  renderCandidates();
}));
for (const [id, field] of [['state-filter', 'uf'], ['party-filter', 'party'], ['candidate-sort', 'sort']]) $(id).addEventListener('change', event => { if (!state.data) return; state[field] = event.target.value; state.candidateLimit = 12; renderCandidates(); });
$('candidate-search').addEventListener('input', event => { if (!state.data) return; state.search = event.target.value; state.candidateLimit = 12; renderCandidates(); });
$('more-candidates').addEventListener('click', () => { state.candidateLimit += 12; renderCandidates(); });
$('more-donors').addEventListener('click', () => { state.donorLimit += 5; renderDonorRanking(); });
$('more-fefc').addEventListener('click', () => { state.fefcLimit += 5; renderCandidateRanking('fefc'); });
$('more-boost').addEventListener('click', () => { state.boostLimit += 5; renderCandidateRanking('boost'); });
$('more-spenders').addEventListener('click', () => { state.spenderLimit += 5; renderSpending(); });
$('more-no-fund').addEventListener('click', () => { state.noFundLimit += 5; renderVoteRankings(); });
$('more-low-boost').addEventListener('click', () => { state.lowBoostLimit += 5; renderVoteRankings(); });
$('donor-ranking').addEventListener('click', event => { const button = event.target.closest('[data-donor]'); if (button) openDonor(button.dataset.donor); });
$('close-donor-dialog').addEventListener('click', () => $('donor-dialog').close());
$('donor-dialog-method').addEventListener('click', () => $('donor-dialog').close());
$('donor-dialog').addEventListener('click', event => { if (event.target === $('donor-dialog')) { const bounds = $('donor-dialog').getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) $('donor-dialog').close(); } });

async function initialize() {
  try {
    const response = await fetch('data/overview.json');
    if (!response.ok) throw new Error('Dados indisponíveis');
    const data = await response.json();
    if (data.election_year !== 2026 || data.candidates.length !== 105 || new Set(data.candidates.map(candidate => candidate.id)).size !== 105) throw new Error('Recorte inválido');
    state.data = data;
    initializeOverview(data); renderDonorRanking(); renderCandidateRanking('fefc'); renderCandidateRanking('boost'); renderVoteRankings(); renderSpending(); renderCandidates();
    document.documentElement.dataset.ready = 'true';
  } catch (error) {
    $('snapshot-label').textContent = 'Não foi possível carregar o recorte. Recarregue a página ou consulte a fonte oficial.';
    $('candidate-grid').innerHTML = '<div class="catalog-empty">Os dados estão indisponíveis nesta consulta. <a href="#metodologia">Consulte as fontes oficiais.</a></div>';
    for (const id of ['donor-ranking', 'fefc-ranking', 'boost-ranking', 'no-fund-ranking', 'low-boost-ranking', 'spenders-ranking']) $(id).innerHTML = '<li class="empty-state">Dados indisponíveis nesta consulta.</li>';
    console.error('Falha ao carregar a dashboard:', error.message);
    document.documentElement.dataset.ready = 'error';
  }
}
initialize();
