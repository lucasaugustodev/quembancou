"""Select the most-voted 2026 candidates from official TSE municipal/zonal CSVs.

The single BRASIL member is used. It already combines the state and BR members,
so reading them alongside BRASIL would double-count votes. No election-result
filter is applied. The primary ranking is QT_VOTOS_NOMINAIS (raw nominal votes);
QT_VOTOS_NOMINAIS_VALIDOS is retained separately.
"""
from __future__ import annotations

import argparse
import collections
import csv
import datetime as dt
import hashlib
import io
import json
import pathlib
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = "https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_2026.zip"
DATASET = "https://dadosabertos.tse.jus.br/dataset/resultados-2026"
RESOURCE = DATASET + "/resource/c807b826-21ff-4bcf-97ca-d86482656320"
MEMBER = "votacao_candidato_munzona_2026_BRASIL.csv"
WANTED = {"1": 5, "5": 50, "6": 50}
PARSED = {"1", "5", "6", "7", "8"}


def sha256(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(8 * 1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def write_json(path: pathlib.Path, data: dict | list) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def verify(archive: pathlib.Path) -> None:
    """Independently rescan original UF/BR members for leaders and ranking cuts."""
    selection = json.loads((ROOT / "research/selection.json").read_text(encoding="utf-8"))
    all_rankings = json.loads((ROOT / "research/votes-rankings-2026.json").read_text(encoding="utf-8"))["rankings"]
    targets = {}
    cuts = {}
    for office, limit in WANTED.items():
        ranked = all_rankings[office]
        cuts[office] = {"last_votes": ranked[limit - 1]["votes"], "next_votes": ranked[limit]["votes"], "has_boundary_tie": ranked[limit - 1]["votes"] == ranked[limit]["votes"]}
        for item in [ranked[0], ranked[limit - 1]]:
            targets[item["candidate_id"]] = item
    for item in selection["candidates"]:
        if item["office_code"] == 1:
            targets[item["candidate_id"]] = item
    checks = {key: {"votes": 0, "votes_valid": 0, "rows": 0} for key in targets}
    seen_keys = set()
    members = sorted({f"votacao_candidato_munzona_2026_{item['state']}.csv" for item in targets.values()})
    with zipfile.ZipFile(archive) as z:
        for member in members:
            print("Verifying " + member, flush=True)
            with io.TextIOWrapper(z.open(member), encoding="latin1", newline="") as f:
                rows = csv.reader(f, delimiter=";")
                headers = next(rows)
                idx = {name: i for i, name in enumerate(headers)}
                for row in rows:
                    if not row or row[idx["NR_TURNO"]] != "1":
                        continue
                    key = row[idx["SQ_CANDIDATO"]]
                    if key not in targets:
                        continue
                    row_key = tuple(row[idx[name]] for name in ["CD_ELEICAO", "NR_TURNO", "SQ_CANDIDATO", "SG_UF", "CD_MUNICIPIO", "NR_ZONA", "ST_VOTO_EM_TRANSITO", "NM_TIPO_DESTINACAO_VOTOS"])
                    if row_key in seen_keys:
                        raise ValueError(f"Duplicate physical row key in UF/BR validation: {row_key}")
                    seen_keys.add(row_key)
                    check = checks[key]
                    check["votes"] += int(row[idx["QT_VOTOS_NOMINAIS"]])
                    check["votes_valid"] += int(row[idx["QT_VOTOS_NOMINAIS_VALIDOS"]])
                    check["rows"] += 1
    for key, check in checks.items():
        target = targets[key]
        assert check["votes"] == target["votes"], (key, check, target)
        assert check["votes_valid"] == target["votes_valid"], (key, check, target)
        assert check["rows"] == target["source_rows"], (key, check, target)
        check.update({"candidate_id": key, "name": target["ballot_name"], "office_code": target["office_code"], "rank_in_office": target["rank_in_office"], "member": f"votacao_candidato_munzona_2026_{target['state']}.csv", "matches_BRASIL": True})
    # The national PDF is independently downloaded from the TSE totalization resource.
    # Check its first national result table, before repeated UF result tables.
    national_pdf = ROOT / "research/votes-totalization/6257_BR_BRASIL_2026_T1_PRESIDENTE.pdf"
    pdf_checks = []
    if national_pdf.exists():
        from pypdf import PdfReader
        reader = PdfReader(national_pdf)
        text = reader.pages[3].extract_text()
        for item in selection["candidates"]:
            if item["office_code"] == 1:
                formatted_votes = f"{item['votes']:,}".replace(",", ".")
                assert item["name"] in text, item["name"]
                assert formatted_votes in text, formatted_votes
                pdf_checks.append({"candidate_id": item["candidate_id"], "name": item["name"], "votes": item["votes"], "printed_vote_value": formatted_votes, "pdf_page": 4, "matched": True})
    result = {"verified_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(), "source_archive_sha256": sha256(archive), "checked_original_members": members, "leader_cut_and_president_checks": list(checks.values()), "ranking_boundaries": cuts, "presidential_totalization_pdf": {"download_url": "https://cdn.tse.jus.br/estatistica/sead/odsele/relatorio_resultado_totalizacao/Relatorio_Resultado_Totalizacao_2026_BR.zip", "pdf_member": national_pdf.name, "pdf_sha256": sha256(national_pdf) if national_pdf.exists() else None, "all_five_matched": len(pdf_checks) == 5, "checks": pdf_checks}}
    write_json(ROOT / "research/votes-verification-2026.json", result)
    print(json.dumps(result, ensure_ascii=False), flush=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", type=pathlib.Path, default=ROOT / "research/votes-munzona-2026.zip")
    parser.add_argument("--verify", action="store_true", help="Validate existing selection against independent original members and PDF")
    args = parser.parse_args()
    if args.verify:
        verify(args.archive)
        return
    candidates = {}
    generation = collections.Counter()
    uffices = collections.Counter()
    destinations = collections.Counter()
    elections = collections.Counter()
    row_count = 0
    kept_count = 0
    with zipfile.ZipFile(args.archive) as z:
        info = z.getinfo(MEMBER)
        member_size = info.file_size
        member_crc = f"{info.CRC:08x}"
        with io.TextIOWrapper(z.open(MEMBER), encoding="latin1", newline="") as f:
            reader = csv.reader(f, delimiter=";")
            headers = next(reader)
            index = {name: i for i, name in enumerate(headers)}
            for row in reader:
                if not row:
                    continue
                row_count += 1
                if len(row) != len(headers):
                    raise ValueError(f"Row {row_count}: {len(row)} fields instead of {len(headers)}")
                turn = row[index["NR_TURNO"]]
                office = row[index["CD_CARGO"]]
                year = row[index["ANO_ELEICAO"]]
                if year != "2026" or turn != "1" or row[index["CD_TIPO_ELEICAO"]] != "2" or office not in PARSED:
                    continue
                kept_count += 1
                if kept_count % 1_000_000 == 0:
                    print(f"Parsed {row_count:,} rows; kept {kept_count:,}; candidates {len(candidates):,}", flush=True)
                candidate_id = row[index["SQ_CANDIDATO"]]
                if candidate_id in {"-1", "-3", "#NULO", "#NE"}:
                    raise ValueError("A ranked candidate has no TSE ID")
                uf = row[index["SG_UF"]]
                unit = row[index["SG_UE"]]
                state = "BR" if office == "1" else unit
                status = row[index["DS_SIT_TOT_TURNO"]]
                status_code = row[index["CD_SIT_TOT_TURNO"]]
                generation[row[index["DT_GERACAO"]] + " " + row[index["HH_GERACAO"]]] += 1
                uffices[(uf, office)] += 1
                destinations[row[index["NM_TIPO_DESTINACAO_VOTOS"]]] += 1
                elections[(row[index["CD_ELEICAO"]], row[index["DT_ELEICAO"]])] += 1
                identity = {
                    "id": candidate_id,
                    "candidate_id": candidate_id,
                    "name": row[index["NM_CANDIDATO"]],
                    "ballot_name": row[index["NM_URNA_CANDIDATO"]],
                    "party": row[index["SG_PARTIDO"]],
                    "party_number": int(row[index["NR_PARTIDO"]]),
                    "candidate_number": row[index["NR_CANDIDATO"]],
                    "office": row[index["DS_CARGO"]],
                    "office_code": int(office),
                    "state": state,
                    "status": status,
                    "status_code": int(status_code),
                    "registration_status": row[index["DS_SITUACAO_JULGAMENTO"]],
                    "elected": True if status_code in {"1", "2", "3"} else (False if status_code in {"4", "5"} else None),
                    "source_url": SOURCE,
                }
                item = candidates.get(candidate_id)
                if item is None:
                    item = identity | {"votes": 0, "votes_valid": 0, "source_rows": 0, "votes_by_state": {}}
                    candidates[candidate_id] = item
                elif any(item[k] != v for k, v in identity.items()):
                    raise ValueError(f"Inconsistent candidate attributes for {candidate_id}")
                votes = int(row[index["QT_VOTOS_NOMINAIS"]])
                valid = int(row[index["QT_VOTOS_NOMINAIS_VALIDOS"]])
                if votes < 0 or valid < 0:
                    raise ValueError(f"Negative votes for {candidate_id}")
                item["votes"] += votes
                item["votes_valid"] += valid
                item["source_rows"] += 1
                item["votes_by_state"][uf] = item["votes_by_state"].get(uf, 0) + votes

    rankings = {}
    for office in PARSED:
        items = [x for x in candidates.values() if x["office_code"] == int(office)]
        items.sort(key=lambda x: (-x["votes"], x["candidate_id"]))
        for rank, item in enumerate(items, 1):
            item["rank_in_office"] = rank
        rankings[office] = items
    selected = []
    for office in ("6", "5", "1"):
        items = rankings[office][:WANTED[office]]
        if len(items) != WANTED[office]:
            raise ValueError(f"Cannot select requested count for office {office}")
        selected.extend(items)
    assert len(selected) == 105
    assert len({x["candidate_id"] for x in selected}) == 105

    metadata = {
        "election_year": 2026,
        "turn": 1,
        "selection": {"Deputado Federal": 50, "Senador": 50, "Presidente": 5},
        "requested_count": 105,
        "actual_count": len(selected),
        "ranking_metric": "sum(QT_VOTOS_NOMINAIS) by SQ_CANDIDATO",
        "ranking_metric_label": "Votos nominais absolutos no primeiro turno",
        "valid_votes_field": "QT_VOTOS_NOMINAIS_VALIDOS, retained separately; not substituted for nominal votes",
        "eligibility": "All candidacies, regardless of elected/suplente/nao eleito result",
        "ranking_tie_break": "SQ_CANDIDATO ascending; no boundary tie at selected cuts is verified separately",
        "senator_comparison_note": "Ranking nacional por votos absolutos entre UFs. Não ajusta população/eleitorado e não é ranking por percentual. Em 2026 há duas vagas/votos para senador por UF.",
        "deputy_assumption": "Deputados federais; deputados estaduais/distritais are available in the optional rankings file",
        "source": {"dataset_url": DATASET, "resource_url": RESOURCE, "download_url": SOURCE, "archive": args.archive.name, "archive_sha256": sha256(args.archive), "archive_size_bytes": args.archive.stat().st_size, "csv_member": MEMBER, "csv_member_size_bytes": member_size, "csv_member_crc32": member_crc, "download_last_modified_utc": "2026-10-14T12:28:01Z"},
        "source_generated_at_brasilia": sorted(generation),
        "extracted_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "source_row_count": row_count,
        "included_row_count": kept_count,
        "duplicates_policy": "Use only BRASIL aggregate member. Never sum BRASIL alongside individual UF or BR CSVs. Preserve separate ST_VOTO_EM_TRANSITO/destination rows as declared by TSE. Include exterior ZZ for president.",
        "elections": [{"code": code, "date": date, "rows": rows} for (code, date), rows in sorted(elections.items())],
        "destination_rows": dict(destinations),
        "uf_office_rows": [{"uf": uf, "office_code": int(office), "rows": rows} for (uf, office), rows in sorted(uffices.items())],
    }
    write_json(ROOT / "research/selection.json", {"metadata": metadata, "candidates": selected})
    write_json(ROOT / "research/votes-rankings-2026.json", {"metadata": metadata, "rankings": rankings})
    optional = rankings["7"][:50]
    write_json(ROOT / "research/votes-optional-deputados-estaduais-2026.json", {"metadata": metadata, "candidates": optional, "distrital_candidates": rankings["8"][:50]})
    print(json.dumps({"selected": len(selected), "all_candidates": len(candidates), "rows": row_count, "leaders_and_cuts": {k: {"leader": rankings[k][0], "last": rankings[k][v - 1], "next": rankings[k][v]} for k, v in WANTED.items()}}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
