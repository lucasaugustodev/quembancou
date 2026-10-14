"""Build the 105-candidate portal from official TSE 2026 declarations.

Tax identifiers are used only for joins in memory and never written to output.
Run after research/selection.json has been produced from first-round vote totals.
"""
from pathlib import Path
from collections import defaultdict, Counter
from datetime import datetime, timezone
from decimal import Decimal
import csv
import hashlib
import io
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / "research"
ZIP = RESEARCH / "candidatos_2026.zip"
OUT = ROOT / "dist" / "data"
ZIP_URL = "https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_2026.zip"
DATASET_URL = "https://dadosabertos.tse.jus.br/dataset/prestacao-de-contas-eleitorais-2026"
VOTES_URL = "https://dadosabertos.tse.jus.br/dataset/resultados-2026"
FUNDING = {"2": "Fundo eleitoral (FEFC)", "0": "Fundo partidário", "1": "Outros recursos", "9": "Fonte não informada"}
KINDS = {"receipts": "receitas", "contracted": "despesas_contratadas", "paid": "despesas_pagas"}
GROUPS = {"1": "president", "5": "senator", "6": "federal_deputy"}
OFFICES = {"1": "Presidente", "5": "Senador", "6": "Deputado Federal"}
NOW = datetime.now(timezone.utc).isoformat()
SOURCES = [
    {"name": "TSE — Prestação de Contas Eleitorais 2026", "url": DATASET_URL, "kind": "dataset"},
    {"name": "TSE — CSVs oficiais de candidatos 2026 (ZIP)", "url": ZIP_URL, "kind": "download"},
    {"name": "TSE — Resultados e votação 2026", "url": VOTES_URL, "kind": "votes"},
    {"name": "TSE — DivulgaCandContas", "url": "https://divulgacandcontas.tse.jus.br/divulga/", "kind": "consultation"},
]
METHODOLOGY = [
    "Recorte dos 50 candidatos a deputado federal, 50 candidatos ao Senado e 5 candidatos à Presidência mais votados no primeiro turno de 2026, por votos absolutos no Brasil. Não se restringe aos eleitos. Deputados estaduais e distritais não integram o recorte.",
    "O universo de 105 candidaturas foi unido às contas pelo SQ_CANDIDATO oficial. Ranking nacional por votos absolutos não compara percentuais entre estados. Na disputa ao Senado, eleitores puderam votar em dois candidatos.",
    "É selecionada uma única entrega por candidatura, por prestador, data, tipo de prestação e último turno. Prestações antigas, parciais e retificações não são somadas entre si. A data declarada pode variar de uma campanha para outra.",
    "ST_TURNO representa o último turno disputado. As contas são registros acumulados da campanha e não um recorte exclusivo desse turno. Relatório Financeiro e Parcial não são contas finais ou aprovação das contas.",
    "Valores em centavos inteiros. Receitas financeiras e bens ou serviços estimáveis são separados. Fonte de recurso e origem de recurso são campos diferentes no TSE.",
    "A fonte de financiamento das despesas está no arquivo de parcelas pagas. O arquivo contratado não discrimina essa fonte, por isso não se infere um total contratado com FEFC a partir dos pagamentos.",
    "Despesas contratadas somam todos os itens do documento: um SQ_DESPESA pode conter vários itens reais. Cada pagamento é contado uma única vez por SQ_PARCELAMENTO_DESPESA e ligado ao documento; não é replicado nos itens.",
    "Impulsionamento segue a categoria oficial CD_ORIGEM_DESPESA 20420000, Despesa com Impulsionamento de Conteúdos. Contratado e pago são mostrados separadamente; produção de vídeos e publicidade geral não entram nessa categoria.",
    "Maiores doadores pessoas físicas somam somente receitas financeiras diretas de origem Recursos de pessoas físicas (10010200), nas 105 campanhas. Recursos próprios, rendimentos e financiamento coletivo não individualizado são excluídos desse ranking.",
    "Financiamento coletivo aparece pelo intermediário de repasse, sem tratá-lo como doação empresarial. Receitas descritas como CDB ou rendimentos são rendimentos de aplicação. CPF e CNPJ não são publicados.",
    "Os rankings agregam as declarações das 105 campanhas, e não todas as campanhas do país. Repasses entre campanhas podem estar contidos em mais de uma declaração; a soma recebida não representa o custo da eleição nem recursos únicos movimentados no país.",
    "Ausência de prestação ou de registros em um arquivo é apresentada como indisponibilidade, sem inferir gasto zero. Um zero em categoria significa que não há valor dessa categoria nos registros disponíveis daquela entrega.",
    "Dados são declarações das campanhas, podem ser atualizados ou retificados e não implicam irregularidade. As páginas exibem os 20 maiores doadores diretos e os demais tipos de receita; todos os fornecedores e documentos contratados disponíveis podem ser consultados.",
]


def cents(value):
    return int(Decimal(value.replace(".", "").replace(",", ".")) * 100)


def iso(value):
    if not value or value.startswith("#"):
        return None
    return datetime.strptime(value, "%d/%m/%Y").date().isoformat()


def clean(value):
    value = str(value or "")
    if value.startswith("#NULO") or value.startswith("#NE") or value in ["-1", "-3", "-4"]:
        return ""
    value = re.sub(r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b", "[identificador omitido]", value)
    value = re.sub(r"\b\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}\b", "[identificador omitido]", value)
    value = re.sub(r"(?<!\d)\d{11}(?!\d)|(?<!\d)\d{14}(?!\d)", "[identificador omitido]", value)
    return re.sub(r"\s+", " ", value).strip()


def official_name(row, kind):
    return clean(row.get(f"NM_{kind}_RFB")) or clean(row.get(f"NM_{kind}")) or "Nome não informado"


def opaque_id(prefix, raw):
    return prefix + "-" + hashlib.sha256(("quembancou2026:" + raw).encode()).hexdigest()[:18]


def percentage(value, total):
    return round(value / total * 100, 6) if total else 0


def nullable_sum(rows, key):
    values = [r[key] for r in rows if r.get(key) is not None]
    return sum(values) if values else None


def statement(row):
    return (row["SQ_PRESTADOR_CONTAS"], iso(row["DT_PRESTACAO_CONTAS"]), row["TP_PRESTACAO_CONTAS"].casefold(), row["ST_TURNO"])


def statement_sort(key):
    kind = key[2]
    priority = 3 if "final" in kind else 2 if "financeiro" in kind else 1
    return (key[1] or "", priority, int(key[3]), key[0])


def real_row(row, kind):
    id_field = {"receipts": "SQ_RECEITA", "contracted": "SQ_DESPESA", "paid": "SQ_PARCELAMENTO_DESPESA"}[kind]
    return row.get(id_field, "-1") not in ["", "-1", "-3", "-4", "#NULO", "#NULO#"]


def dedup_unique(rows, field, label):
    by_id = {}
    count = 0
    for r in rows:
        key = r[field]
        if key in by_id:
            assert by_id[key] == r, (label, "conflicting repeated sequence", field, key)
            count += 1
        else:
            by_id[key] = r
    return list(by_id.values()), count


def donor_type(row):
    origin = row["CD_ORIGEM_RECEITA"]
    description = clean(row["DS_RECEITA"]).upper()
    if description == "CDB" or any(x in description for x in ["RENDIMENTO", "RENDIMENTOS", "REND APLIC", "REND. APLIC", "RENDIMENTO APLIC"]):
        return "investment_income"
    if origin == "10010200":
        return "person"
    if origin == "10020500":
        return "crowdfunding_intermediary"
    if origin == "10010100":
        return "own_resources"
    if origin == "10040000":
        return "candidate_transfer"
    if origin == "10020000" or clean(row.get("SG_PARTIDO_DOADOR")):
        return "party"
    return "other"


def build_candidate(selected, streams, selected_key, evidence):
    candidate_id = str(selected.get("id") or selected["candidate_id"])
    raw = {k: [r for r in streams[k] if statement(r) == selected_key] if selected_key else [] for k in KINDS}
    records = {k: [r for r in raw[k] if real_row(r, k)] for k in KINDS}
    # A receipt may contain several estimable items sharing SQ_RECEITA.
    # Distinct descriptions/values are genuine items, not repeated snapshots.
    receipts = records["receipts"]
    duplicate_receipts = 0
    receipt_item_counts = Counter(r["SQ_RECEITA"] for r in receipts)
    for index, receipt in enumerate(receipts):
        receipt["_item_id"] = "receipt-" + receipt["SQ_RECEITA"] + (f"-item-{index + 1}" if receipt_item_counts[receipt["SQ_RECEITA"]] > 1 else "")
    paid, duplicate_payments = dedup_unique(records["paid"], "SQ_PARCELAMENTO_DESPESA", candidate_id)
    contracted = records["contracted"]
    # There is no unique item identifier in the contracted CSV. Preserve every item.
    exact_contracted_duplicates = len(contracted) - len({tuple(r.items()) for r in contracted})
    data_status = "available" if all(records[k] for k in KINDS) else "partial" if any(records.values()) else "unavailable"
    available = {k: bool(records[k]) for k in KINDS}
    exemplar = next(iter(receipts or contracted), None)
    office_code = str(selected["office_code"])
    group = GROUPS[office_code]
    candidate = {
        "id": candidate_id, "prestador_id": selected_key[0] if selected_key else None,
        "name": clean(selected["name"]), "ballot_name": clean(selected["ballot_name"]),
        "number": int(selected["candidate_number"]), "party": clean(selected["party"]),
        "party_name": clean(exemplar["NM_PARTIDO"]) if exemplar else clean(selected["party"]),
        "office": OFFICES[office_code], "office_code": office_code, "group": group,
        "election_year": 2026, "state": selected["state"], "electoral_unit": "Brasil" if selected["state"] == "BR" else selected["state"],
        "last_turn": int(selected_key[3]) if selected_key else None,
        "votes": int(selected["votes"]), "rank": int(selected["rank_in_office"]),
        "elected": selected.get("elected"), "election_status": clean(selected.get("status")),
        "photo_url": None, "photo_credit": "Tribunal Superior Eleitoral", "data_status": data_status,
    }
    date = selected_key[1] if selected_key else None
    snapshot = {
        "retrieved_at": NOW, "generated_date": max((e["generated_date"] for e in evidence if e["generated_date"]), default=None),
        "submitted_date": date, "statement_type": selected_key[2].title() if selected_key else None,
        "is_final": "final" in selected_key[2] if selected_key else False,
        "label": f"Dados declarados até {datetime.fromisoformat(date).strftime('%d/%m/%Y')}" if date else "Contas não disponíveis no recorte",
        "period_description": "Registros acumulados da campanha. O último turno disputado não restringe as contas a esse turno.",
        "data_status": data_status,
        "coverage": {k: "available" if records[k] else "placeholder" if raw[k] else "unavailable" for k in KINDS},
        "receipt_date_range": {"from": min((iso(r["DT_RECEITA"]) for r in receipts), default=None), "to": max((iso(r["DT_RECEITA"]) for r in receipts), default=None)},
        "expense_date_range": {"from": min((iso(r["DT_DESPESA"]) for r in contracted), default=None), "to": max((iso(r["DT_DESPESA"]) for r in contracted), default=None)},
        "files": evidence,
    }
    financial = sum(cents(r["VR_RECEITA"]) for r in receipts if r["CD_NATUREZA_RECEITA"] == "1") if available["receipts"] else None
    estimated = sum(cents(r["VR_RECEITA"]) for r in receipts if r["CD_NATUREZA_RECEITA"] == "0") if available["receipts"] else None
    contracted_total = sum(cents(r["VR_DESPESA_CONTRATADA"]) for r in contracted) if available["contracted"] else None
    paid_total = sum(cents(r["VR_PAGTO_DESPESA"]) for r in paid) if available["paid"] else None
    funding = []
    for code in sorted({r["CD_FONTE_RECEITA"] for r in receipts}):
        rows = [r for r in receipts if r["CD_FONTE_RECEITA"] == code]
        f = sum(cents(r["VR_RECEITA"]) for r in rows if r["CD_NATUREZA_RECEITA"] == "1")
        e = sum(cents(r["VR_RECEITA"]) for r in rows if r["CD_NATUREZA_RECEITA"] == "0")
        funding.append({"id": "source-" + code, "source_code": code, "name": FUNDING.get(code, "Fonte não informada"), "total_cents": f + e, "financial_cents": f, "estimated_cents": e, "share_financial_percent": percentage(f, financial), "share_total_percent": percentage(f + e, (financial or 0) + (estimated or 0)), "transaction_count": len(rows)})
    funding.sort(key=lambda x: -x["total_cents"])
    origins = []
    for code in sorted({r["CD_ORIGEM_RECEITA"] for r in receipts}):
        rows = [r for r in receipts if r["CD_ORIGEM_RECEITA"] == code]
        origins.append({"code": code, "name": clean(rows[0]["DS_ORIGEM_RECEITA"]), "total_cents": sum(cents(r["VR_RECEITA"]) for r in rows), "financial_cents": sum(cents(r["VR_RECEITA"]) for r in rows if r["CD_NATUREZA_RECEITA"] == "1"), "estimated_cents": sum(cents(r["VR_RECEITA"]) for r in rows if r["CD_NATUREZA_RECEITA"] == "0"), "transaction_count": len(rows)})
    origins.sort(key=lambda x: -x["total_cents"])

    expenses_by_id = defaultdict(list)
    payments_by_id = defaultdict(list)
    for r in contracted:
        expenses_by_id[r["SQ_DESPESA"]].append(r)
    for r in paid:
        payments_by_id[r["SQ_DESPESA"]].append(r)
    supplier_documents = defaultdict(list)
    supplier_row = {}
    documents = []
    all_expense_ids = set(expenses_by_id) | set(payments_by_id)
    unmatched = set(payments_by_id) - set(expenses_by_id)
    for expense_id in sorted(all_expense_ids):
        rows = expenses_by_id.get(expense_id, [])
        payments = payments_by_id.get(expense_id, [])
        if rows:
            supplier_key = rows[0]["NR_CPF_CNPJ_FORNECEDOR"]
            assert len({r["NR_CPF_CNPJ_FORNECEDOR"] for r in rows}) == 1, (candidate_id, expense_id, "supplier mismatch")
            supplier_row[supplier_key] = rows[0]
            supplier_name = official_name(rows[0], "FORNECEDOR")
            document_type = clean(rows[0]["DS_TIPO_DOCUMENTO"])
        else:
            supplier_key = "unknown:" + candidate_id
            supplier_name = "Fornecedor não identificado no arquivo contratado"
            document_type = clean(payments[0]["DS_TIPO_DOCUMENTO"])
        supplier_id = opaque_id("supplier", supplier_key)
        items = [{"id": f"expense-{expense_id}-item-{i + 1}", "date": iso(r["DT_DESPESA"]), "category_code": r["CD_ORIGEM_DESPESA"], "category": clean(r["DS_ORIGEM_DESPESA"]), "description": clean(r["DS_DESPESA"]), "total_cents": cents(r["VR_DESPESA_CONTRATADA"])} for i, r in enumerate(rows)]
        document = {
            "id": "expense-" + expense_id, "tse_expense_id": expense_id, "supplier_id": supplier_id,
            "supplier_name": supplier_name, "date": min((i["date"] for i in items), default=min((iso(r["DT_PAGTO_DESPESA"]) for r in payments), default=None)),
            "document_type": document_type, "categories": sorted({i["category"] for i in items} | {clean(r["DS_ORIGEM_DESPESA"]) for r in payments}),
            "total_cents": sum(i["total_cents"] for i in items) if rows else None,
            "paid_cents": sum(cents(r["VR_PAGTO_DESPESA"]) for r in payments) if available["paid"] else None,
            "item_count": len(items), "payment_count": len(payments), "items": items,
            "payments": [{"id": "payment-" + r["SQ_PARCELAMENTO_DESPESA"], "date": iso(r["DT_PAGTO_DESPESA"]), "source_code": r["CD_FONTE_DESPESA"], "source": clean(r["DS_FONTE_DESPESA"]), "method": clean(r["DS_ESPECIE_RECURSO"]), "category_code": r["CD_ORIGEM_DESPESA"], "category": clean(r["DS_ORIGEM_DESPESA"]), "paid_cents": cents(r["VR_PAGTO_DESPESA"])} for r in payments],
        }
        supplier_documents[supplier_key].append(document)
        documents.append(document)
    suppliers = []
    for key, docs in supplier_documents.items():
        r = supplier_row.get(key)
        docs.sort(key=lambda x: (x["date"] or "", x["total_cents"] or 0), reverse=True)
        total = nullable_sum(docs, "total_cents")
        suppliers.append({"id": docs[0]["supplier_id"], "name": docs[0]["supplier_name"], "declared_name": clean(r["NM_FORNECEDOR"]) if r else "", "type": clean(r["DS_TIPO_FORNECEDOR"]) if r else "Não informado", "categories": sorted({c for d in docs for c in d["categories"]}), "total_cents": total, "paid_cents": nullable_sum(docs, "paid_cents"), "transaction_count": len(docs), "item_count": sum(d["item_count"] for d in docs), "share_contracted_percent": percentage(total or 0, contracted_total), "records": docs})
    suppliers.sort(key=lambda x: -(x["total_cents"] or 0))
    documents.sort(key=lambda x: (x["date"] or "", x["total_cents"] or 0), reverse=True)
    categories = []
    for code in sorted({r["CD_ORIGEM_DESPESA"] for r in contracted + paid}):
        rows = [r for r in contracted if r["CD_ORIGEM_DESPESA"] == code]
        payments = [r for r in paid if r["CD_ORIGEM_DESPESA"] == code]
        total = sum(cents(r["VR_DESPESA_CONTRATADA"]) for r in rows) if available["contracted"] else None
        categories.append({"id": "category-" + code, "code": code, "name": clean((rows or payments)[0]["DS_ORIGEM_DESPESA"]), "total_cents": total, "paid_cents": sum(cents(r["VR_PAGTO_DESPESA"]) for r in payments) if available["paid"] else None, "item_count": len(rows), "transaction_count": len({r["SQ_DESPESA"] for r in rows}), "share_contracted_percent": percentage(total or 0, contracted_total)})
    categories.sort(key=lambda x: -(x["total_cents"] or 0))

    donor_groups = defaultdict(list)
    for r in receipts:
        dtype = donor_type(r)
        donor_groups[(dtype, r["NR_CPF_CNPJ_DOADOR"])].append(r)
    donors = []
    people = []
    for (dtype, key), rows in donor_groups.items():
        f = sum(cents(r["VR_RECEITA"]) for r in rows if r["CD_NATUREZA_RECEITA"] == "1")
        e = sum(cents(r["VR_RECEITA"]) for r in rows if r["CD_NATUREZA_RECEITA"] == "0")
        row = {
            "id": opaque_id("donor", dtype + ":" + key), "name": official_name(rows[0], "DOADOR"), "type": dtype,
            "ranking_note": {"person": "Doação financeira direta; apoio estimável separado.", "party": "Repasses partidários separados por fonte e natureza.", "investment_income": "Rendimento de aplicação; não é doação da instituição financeira.", "crowdfunding_intermediary": "Intermediário de financiamento coletivo; não é doação empresarial.", "own_resources": "Recursos próprios da candidatura; excluídos do ranking de pessoas físicas.", "candidate_transfer": "Repasse de outra campanha; pode estar contido em mais de uma declaração."}.get(dtype, "Origem declarada no TSE."),
            "financial_cents": f, "estimated_cents": e, "total_cents": f + e,
            "transaction_count": len(rows), "share_financial_percent": percentage(f, financial),
            "sources": sorted({FUNDING.get(r["CD_FONTE_RECEITA"], "Fonte não informada") for r in rows}),
            "origins": sorted({clean(r["DS_ORIGEM_RECEITA"]) for r in rows}),
            "records": [{"id": r["_item_id"], "date": iso(r["DT_RECEITA"]), "total_cents": cents(r["VR_RECEITA"]), "nature": "Financeiro" if r["CD_NATUREZA_RECEITA"] == "1" else "Estimável", "source": FUNDING.get(r["CD_FONTE_RECEITA"], "Fonte não informada"), "description": clean(r["DS_RECEITA"])} for r in rows],
        }
        donors.append(row)
        if dtype == "person":
            people.append({"id": row["id"], "name": row["name"], "financial_cents": f, "estimated_cents": e, "candidate_id": candidate_id, "candidate_name": candidate["ballot_name"]})
    donors.sort(key=lambda x: -x["financial_cents"])
    top_people = [d for d in donors if d["type"] == "person" and d["financial_cents"] > 0][:20]
    shown_donors = [d for d in donors if d["type"] != "person"] + top_people
    shown_donors.sort(key=lambda x: -x["financial_cents"])
    people_receipts = [r for r in receipts if donor_type(r) == "person"]
    fefc = sum(r["financial_cents"] for r in funding if r["source_code"] == "2") if available["receipts"] else None
    public = sum(r["financial_cents"] for r in funding if r["source_code"] in ["0", "2"]) if available["receipts"] else None
    boost = next((r for r in categories if r["code"] == "20420000"), None)
    totals = {
        "revenue_total_cents": financial + estimated if financial is not None else None,
        "revenue_financial_cents": financial, "revenue_estimated_cents": estimated,
        "expense_contracted_cents": contracted_total, "expense_paid_cents": paid_total,
        "receipt_count": len(receipts), "expense_item_count": len(contracted),
        "expense_document_count": len(expenses_by_id), "payment_count": len(paid), "supplier_count": len(suppliers),
        "public_financial_cents": public, "public_financial_share_percent": percentage(public or 0, financial) if financial is not None else None,
        "fefc_received_financial_cents": fefc,
        "fefc_contracted_cents": None,
        "fefc_paid_cents": sum(cents(r["VR_PAGTO_DESPESA"]) for r in paid if r["CD_FONTE_DESPESA"] == "2") if available["paid"] else None,
        "boost_contracted_cents": (boost["total_cents"] if boost else 0) if available["contracted"] else None,
        "boost_paid_cents": (boost["paid_cents"] if boost else 0) if available["paid"] else None,
        "direct_person_financial_cents": sum(cents(r["VR_RECEITA"]) for r in people_receipts if r["CD_NATUREZA_RECEITA"] == "1") if available["receipts"] else None,
    }
    donor_summary = {
        "direct_person_count": len(people), "direct_person_financial_cents": totals["direct_person_financial_cents"],
        "direct_person_estimated_cents": sum(cents(r["VR_RECEITA"]) for r in people_receipts if r["CD_NATUREZA_RECEITA"] == "0") if available["receipts"] else None,
        "person_ranking_limit": 20, "person_ranking_basis": "Somente doações financeiras diretas. Recursos próprios, rendimentos e financiamento coletivo não individualizado são excluídos.",
        "shown_person_financial_cents": sum(r["financial_cents"] for r in top_people), "total_donor_groups": len(donors), "shown_donor_groups": len(shown_donors),
    }
    if available["receipts"]:
        assert sum(r["total_cents"] for r in funding) == totals["revenue_total_cents"]
        assert sum(r["total_cents"] for r in origins) == totals["revenue_total_cents"]
        assert sum(r["total_cents"] for r in donors) == totals["revenue_total_cents"]
    if available["contracted"]:
        assert sum(r["total_cents"] or 0 for r in suppliers) == contracted_total
        assert sum(r["total_cents"] or 0 for r in categories) == contracted_total
        assert sum(r["total_cents"] or 0 for r in documents) == contracted_total
    if available["paid"]:
        assert sum(r["paid_cents"] or 0 for r in suppliers) == paid_total
        assert sum(r["paid_cents"] or 0 for r in categories) == paid_total
        assert sum(r["paid_cents"] or 0 for r in documents) == paid_total
    audit = {"candidate_id": candidate_id, "snapshot": list(selected_key) if selected_key else None, "raw_selected_rows": {k: len(v) for k, v in raw.items()}, "available_rows": {"receipts": len(receipts), "contracted": len(contracted), "paid": len(paid)}, "exact_contracted_duplicate_rows_preserved": exact_contracted_duplicates, "receipt_sequences_with_multiple_items": sum(n > 1 for n in receipt_item_counts.values()), "duplicate_receipts_removed": duplicate_receipts, "duplicate_payments_removed": duplicate_payments, "payments_without_contracted_document": len(unmatched), "data_status": data_status, "totals": totals}
    profile = {"schema_version": 2, "candidate": candidate, "snapshot": snapshot, "totals": totals, "funding_sources": funding, "revenue_origins": origins, "donors": shown_donors, "donor_summary": donor_summary, "expense_categories": categories, "suppliers": suppliers, "transactions": documents, "sources": SOURCES, "methodology": METHODOLOGY + ([f"Há {len(unmatched)} documentos com pagamentos sem correspondência no arquivo de despesas contratadas desta entrega; contratado é indisponível nesses documentos."] if unmatched else [])}
    return profile, people, audit


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main():
    selection = json.loads((RESEARCH / "selection.json").read_text(encoding="utf-8-sig"))
    candidates = selection["candidates"]
    assert len(candidates) == 105
    ids = {str(c.get("id") or c["candidate_id"]) for c in candidates}
    assert len(ids) == 105
    uf_ids = defaultdict(set)
    for c in candidates:
        uf_ids[c["state"]].add(str(c.get("id") or c["candidate_id"]))
    streams = {cid: {k: [] for k in KINDS} for cid in ids}
    files = {}
    provider_to_candidate = {}
    with zipfile.ZipFile(ZIP) as archive:
        for kind, prefix in KINDS.items():
            for uf, wanted in sorted(uf_ids.items()):
                filename = f"{prefix}_candidatos_2026_{uf}.csv"
                raw_bytes = archive.read(filename)
                file_hash = hashlib.sha256(raw_bytes).hexdigest()
                rows = csv.DictReader(io.StringIO(raw_bytes.decode("latin1")), delimiter=";")
                first = None
                selected_rows = Counter()
                total_rows = 0
                for row in rows:
                    total_rows += 1
                    first = first or row
                    cid = provider_to_candidate.get(row["SQ_PRESTADOR_CONTAS"]) if kind == "paid" else row["SQ_CANDIDATO"]
                    if cid not in wanted:
                        continue
                    assert row["AA_ELEICAO"] == "2026"
                    assert row["SG_UF"] == uf
                    if kind != "paid":
                        assert GROUPS.get(row["CD_CARGO"]) == GROUPS[str(next(c["office_code"] for c in candidates if str(c.get("id") or c["candidate_id"]) == cid))]
                        provider = row["SQ_PRESTADOR_CONTAS"]
                        assert provider not in provider_to_candidate or provider_to_candidate[provider] == cid
                        provider_to_candidate[provider] = cid
                    streams[cid][kind].append(row)
                    selected_rows[cid] += 1
                files[filename] = {"file": filename, "kind": kind, "sha256": file_hash, "generated_date": iso(first["DT_GERACAO"]) if first else None, "generated_time": first["HH_GERACAO"] if first else None, "generated_timezone": "America/Sao_Paulo", "total_rows": total_rows, "selected_rows": dict(selected_rows)}
                print(f"Read {filename}: {total_rows} rows; selected {sum(selected_rows.values())}", flush=True)
    profiles = []
    audit = []
    all_people = []
    for c in candidates:
        cid = str(c.get("id") or c["candidate_id"])
        keys = {statement(r) for kind in KINDS for r in streams[cid][kind]}
        chosen = max(keys, key=statement_sort) if keys else None
        evidence = []
        for kind in KINDS:
            f = files[f"{KINDS[kind]}_candidatos_2026_{c['state']}.csv"]
            evidence.append({k: v for k, v in f.items() if k != "selected_rows"} | {"selected_rows": sum(statement(r) == chosen for r in streams[cid][kind])})
        profile, people, item_audit = build_candidate(c, streams[cid], chosen, evidence)
        item_audit["available_snapshots"] = [list(k) for k in sorted(keys, key=statement_sort)]
        profiles.append(profile)
        all_people.extend(people)
        audit.append(item_audit)
        write_json(OUT / "candidates" / (cid + ".json"), profile)
    summary = [{**p["candidate"], "data_url": "./data/candidates/" + p["candidate"]["id"] + ".json", "snapshot": {k: p["snapshot"][k] for k in ["generated_date", "submitted_date", "statement_type", "is_final", "data_status", "coverage", "label"]}, "totals": p["totals"], "donor_summary": {k: p["donor_summary"][k] for k in ["direct_person_count", "direct_person_financial_cents"]}} for p in profiles]
    donor_aggregate = {}
    for r in all_people:
        if r["financial_cents"] <= 0:
            continue
        d = donor_aggregate.setdefault(r["id"], {"id": r["id"], "name": r["name"], "financial_cents": 0, "campaign_count": 0, "recipients": []})
        d["financial_cents"] += r["financial_cents"]
        d["campaign_count"] += 1
        d["recipients"].append({"candidate_id": r["candidate_id"], "name": r["candidate_name"], "financial_cents": r["financial_cents"]})
    people_ranked = sorted(donor_aggregate.values(), key=lambda x: (-x["financial_cents"], x["name"]))
    for i, donor in enumerate(people_ranked):
        donor["rank"] = i + 1
        donor["recipients"].sort(key=lambda x: -x["financial_cents"])
    total_keys = ["revenue_total_cents", "revenue_financial_cents", "revenue_estimated_cents", "expense_contracted_cents", "expense_paid_cents", "fefc_received_financial_cents", "fefc_contracted_cents", "fefc_paid_cents", "boost_contracted_cents", "boost_paid_cents", "direct_person_financial_cents", "public_financial_cents"]
    totals = {k: nullable_sum([p["totals"] for p in profiles], k) for k in total_keys}
    totals.update({"candidate_count": len(candidates), "individual_donor_count": len(donor_aggregate), "supplier_count_sum": sum(p["totals"]["supplier_count"] for p in profiles)})
    assert sum(x["financial_cents"] for x in people_ranked) == totals["direct_person_financial_cents"]
    ranking_base = lambda c: {k: c[k] for k in ["id", "name", "ballot_name", "party", "state", "office", "group", "votes", "data_url"]} | {"candidate_id": c["id"], "submitted_date": c["snapshot"]["submitted_date"]}
    def candidate_ranking(field, extra):
        ranked = [c for c in summary if c["totals"].get(field) is not None]
        ranked.sort(key=lambda c: (-(c["totals"][field]), c["ballot_name"]))
        return [{**ranking_base(c), "rank": i + 1, **{dest: c["totals"][src] for dest, src in extra.items()}} for i, c in enumerate(ranked)]
    category_aggregate = {}
    for p in profiles:
        for c in p["expense_categories"]:
            x = category_aggregate.setdefault(c["code"], {"code": c["code"], "name": c["name"], "total_cents": 0, "paid_cents": 0, "candidate_count": 0})
            x["total_cents"] += c["total_cents"] or 0
            x["paid_cents"] += c["paid_cents"] or 0
            x["candidate_count"] += 1
    aggregate_categories = sorted(category_aggregate.values(), key=lambda x: -x["total_cents"])
    assert sum(c["total_cents"] for c in aggregate_categories) == totals["expense_contracted_cents"]
    assert sum(c["paid_cents"] for c in aggregate_categories) == totals["expense_paid_cents"]
    def dimension(field):
        rows = []
        for key in sorted({c[field] for c in summary}):
            group = [c for c in summary if c[field] == key]
            rows.append({"id": key, "name": key, "candidate_count": len(group), **{k: nullable_sum([c["totals"] for c in group], k) for k in total_keys}})
        return sorted(rows, key=lambda x: -(x["expense_contracted_cents"] or 0))
    dates = [p["snapshot"]["submitted_date"] for p in profiles if p["snapshot"]["submitted_date"]]
    counts = Counter(p["snapshot"]["data_status"] for p in profiles)
    overview = {
        "schema_version": 2, "election_year": 2026,
        "scope": {"federal_deputy": 50, "senator": 50, "president": 5, "selection_turn": 1, "label": "105 candidaturas mais votadas: 50 deputados federais, 50 ao Senado e 5 à Presidência", "rankings_label": "Rankings entre as 105 candidaturas selecionadas", "selection_basis": "Votos absolutos no primeiro turno, por cargo"},
        "snapshot": {"retrieved_at": NOW, "generated_date": max((p["snapshot"]["generated_date"] for p in profiles if p["snapshot"]["generated_date"]), default=None), "submitted_date_range": {"from": min(dates, default=None), "to": max(dates, default=None)}, "coverage": dict(counts), "is_final": all(p["snapshot"]["is_final"] for p in profiles), "label": "Soma das declarações disponíveis no recorte"},
        "totals": totals, "candidates": summary,
        "rankings": {"individual_donors": people_ranked[:100], "fefc_recipients": candidate_ranking("fefc_received_financial_cents", {"financial_cents": "fefc_received_financial_cents"}), "content_boost": candidate_ranking("boost_contracted_cents", {"contracted_cents": "boost_contracted_cents", "paid_cents": "boost_paid_cents"}), "spenders": candidate_ranking("expense_contracted_cents", {"contracted_cents": "expense_contracted_cents", "paid_cents": "expense_paid_cents"}), "fundraising": candidate_ranking("revenue_financial_cents", {"financial_cents": "revenue_financial_cents"})},
        "donor_summary": {"direct_person_count": len(donor_aggregate), "financial_cents": totals["direct_person_financial_cents"], "ranking_limit": 100, "ranking_basis": "Doações financeiras diretas nas 105 campanhas. Recursos próprios, financiamento coletivo e rendimentos excluídos."},
        "expense_categories": aggregate_categories, "parties": dimension("party"), "states": dimension("state"), "sources": SOURCES,
        "methodology": METHODOLOGY,
    }
    write_json(OUT / "overview.json", overview)
    write_json(RESEARCH / "financial-extraction-evidence.json", {"retrieved_at": NOW, "zip_url": ZIP_URL, "zip_sha256": hashlib.file_digest(ZIP.open("rb"), "sha256").hexdigest(), "files": list(files.values()), "selection_metadata": selection.get("metadata", {}), "candidates": audit, "checks": {"candidate_count": len(profiles), "all_sum_assertions_passed": True, "direct_person_aggregate_matches": True, "tax_identifier_fields_published": False}, "totals": totals, "methodology": METHODOLOGY})
    write_json(RESEARCH / "financial-donor-ranking.json", {"candidate_scope": 105, "individual_donor_count": len(donor_aggregate), "financial_cents": totals["direct_person_financial_cents"], "ranking": people_ranked})
    print(json.dumps({"overview_bytes": (OUT / "overview.json").stat().st_size, "candidate_count": len(profiles), "coverage": dict(counts), "totals": totals, "top_person": people_ranked[0] if people_ranked else None, "top_fefc": overview["rankings"]["fefc_recipients"][0], "top_boost": overview["rankings"]["content_boost"][0], "audit_counts": {"exact_contracted_duplicate_rows_preserved": sum(a["exact_contracted_duplicate_rows_preserved"] for a in audit), "receipt_sequences_with_multiple_items": sum(a["receipt_sequences_with_multiple_items"] for a in audit), "payments_without_contracted_document": sum(a["payments_without_contracted_document"] for a in audit)}}, ensure_ascii=True), flush=True)


if __name__ == "__main__":
    main()
