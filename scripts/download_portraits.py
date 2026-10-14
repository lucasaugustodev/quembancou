"""Download original TSE 2026 candidate photos for the exact selected IDs.

Writes only photo archives, photo evidence and original JPG assets. Existing
archives are reused after ZIP integrity checks; no generated or edited imagery.
"""
from __future__ import annotations

import concurrent.futures
import hashlib
import json
import re
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / "research"
OUTPUT = ROOT / "dist" / "assets" / "candidates"
PREFIX = "https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2026/fotos/"
RESOURCE_URL = "https://dadosabertos.tse.jus.br/dataset/candidatos-2026/resource/e8f0a648-b438-4117-814a-f32f4c4977c8"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def get_archive(uf: str) -> dict:
    url = f"{PREFIX}foto_cand2026_{uf}_div.zip"
    legacy = RESEARCH / f"fotos-candidatos-{uf.lower()}-2026.zip"
    path = legacy if legacy.is_file() else RESEARCH / f"photo-candidates-{uf}-2026.zip"
    reused = path.is_file()
    headers = {}
    if not reused:
        request = urllib.request.Request(url, headers={"User-Agent": "QuemBancou/1.0 (public TSE data)"})
        with urllib.request.urlopen(request, timeout=120) as response:
            data = response.read()
            headers = {"last_modified": response.headers.get("Last-Modified"), "content_type": response.headers.get("Content-Type")}
        # Validate before committing to a ZIP path. Downloads are at most 4 concurrent.
        import io
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            bad = archive.testzip()
            if bad:
                raise ValueError(f"Corrupted member in {uf}: {bad}")
        path.write_bytes(data)
    data = path.read_bytes()
    with zipfile.ZipFile(path) as archive:
        bad = archive.testzip()
        if bad:
            raise ValueError(f"Corrupted member in reused {uf} archive: {bad}")
    return {"uf": uf, "zip_url": url, "archive": path.name, "archive_size_bytes": len(data), "archive_sha256": digest(data), "reused": reused, **headers}


def main() -> None:
    selection = json.loads((RESEARCH / "selection.json").read_text(encoding="utf-8"))
    candidates = selection["candidates"]
    OUTPUT.mkdir(parents=True, exist_ok=True)
    required_ufs = sorted({candidate["state"] for candidate in candidates})
    archives = {}
    failures = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(get_archive, uf): uf for uf in required_ufs}
        for future in concurrent.futures.as_completed(futures):
            uf = futures[future]
            try:
                archives[uf] = future.result()
                print(f"{uf}: archive ready ({archives[uf]['archive_size_bytes']} bytes)", flush=True)
            except Exception as exc:
                failures[uf] = f"{type(exc).__name__}: {exc}"
                print(f"{uf}: {failures[uf]}", flush=True)

    evidence = []
    for uf in required_ufs:
        subset = [candidate for candidate in candidates if candidate["state"] == uf]
        if uf not in archives:
            for candidate in subset:
                evidence.append({"candidate_id": candidate["candidate_id"], "name": candidate["ballot_name"], "state": uf, "status": "missing", "reason": failures[uf]})
            continue
        source = archives[uf]
        with zipfile.ZipFile(RESEARCH / source["archive"]) as archive:
            # Candidate IDs are exact TSE SQ_CANDIDATO IDs. Do not resolve by name.
            lookup = {}
            for member in archive.namelist():
                matched = re.fullmatch(r"F([A-Z]{2})(\d+)_div\.jpg", Path(member).name, flags=re.IGNORECASE)
                if matched and matched.group(1).upper() == uf:
                    lookup.setdefault(matched.group(2), []).append(member)
            for candidate in subset:
                candidate_id = candidate["candidate_id"]
                record = {"candidate_id": candidate_id, "name": candidate["ballot_name"], "office": candidate["office"], "rank_in_office": candidate["rank_in_office"], "state": uf, "source_zip_url": source["zip_url"], "source_resource_url": RESOURCE_URL, "archive_sha256": source["archive_sha256"]}
                matches = lookup.get(candidate_id, [])
                if len(matches) != 1:
                    record.update(status="missing", reason=f"Expected exactly one exact-ID photo; found {len(matches)}", matched_members=matches)
                else:
                    member = matches[0]
                    data = archive.read(member)
                    if not data.startswith(b"\xff\xd8"):
                        record.update(status="missing", reason="Exact-ID member is not JPEG", original_filename=member)
                    else:
                        file = OUTPUT / f"{candidate_id}.jpg"
                        if not file.is_file() or file.read_bytes() != data:
                            file.write_bytes(data)
                        record.update(status="available", original_filename=member, file=file.relative_to(ROOT).as_posix(), asset_url=f"/assets/candidates/{candidate_id}.jpg", size_bytes=len(data), sha256=digest(data))
                evidence.append(record)

    evidence.sort(key=lambda record: (record.get("office", ""), record.get("rank_in_office", 999), record["candidate_id"]))
    result = {"election_year": 2026, "source": "TSE official candidate photos, original unmodified JPEGs", "identity_match": "Exact UF and SQ_CANDIDATO filename match only; no fuzzy names", "extracted_at_utc": datetime.now(timezone.utc).isoformat(), "selection_size": len(candidates), "available_count": sum(record["status"] == "available" for record in evidence), "missing_count": sum(record["status"] == "missing" for record in evidence), "archives": [archives[uf] for uf in sorted(archives)], "download_failures": failures, "candidates": evidence}
    destination = RESEARCH / "photo-evidence-2026.json"
    destination.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"evidence": str(destination), "available_count": result["available_count"], "missing_count": result["missing_count"]}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
