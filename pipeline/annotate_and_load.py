"""
Annotate all variants from a VCF file with Ensembl VEP and load them into PostgreSQL.

Usage:
    .venv/bin/python pipeline/annotate_and_load.py [path/to/file.vcf]
"""
import sys
import time
from pathlib import Path

import psycopg
import requests
from psycopg.types.json import Jsonb

VEP_URL = "https://rest.ensembl.org/vep/homo_sapiens/region"
BATCH_SIZE = 200          # maximum number of variants per VEP POST request
MAX_RETRIES = 5
DB_DSN = "dbname=variants_db"
PROJECT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_VCF = PROJECT_DIR / "data" / "example_GRCh38.vcf"


# ---------- Reading the VCF ----------

def read_vcf(path):
    """Return variants from a VCF file as a list of dicts (multi-allelic sites are split)."""
    variants = []
    with open(path) as f:
        for line in f:
            if line.startswith("#") or not line.strip():
                continue
            chrom, pos, var_id, ref, alt = line.rstrip("\n").split("\t")[:5]
            for single_alt in alt.split(","):
                variants.append({
                    "chrom": chrom,
                    "pos": int(pos),
                    "rsid": None if var_id == "." else var_id,
                    "ref": ref,
                    "alt": single_alt,
                })
    return variants


def to_vep_input(v):
    return f"{v['chrom']} {v['pos']} {v['rsid'] or '.'} {v['ref']} {v['alt']} . . ."


# ---------- Calling VEP ----------

def call_vep(batch):
    """Send one batch to VEP, retrying politely if Ensembl asks us to slow down."""
    payload = {"variants": [to_vep_input(v) for v in batch], "canonical": 1}
    headers = {"Content-Type": "application/json", "Accept": "application/json"}

    for attempt in range(1, MAX_RETRIES + 1):
        response = requests.post(VEP_URL, json=payload, headers=headers, timeout=120)
        if response.ok:
            return response.json()
        if response.status_code in (429, 500, 502, 503, 504):
            wait = float(response.headers.get("Retry-After", 2 ** attempt))
            print(f"  VEP returned {response.status_code}, retrying in {wait:.0f}s "
                  f"(attempt {attempt}/{MAX_RETRIES})")
            time.sleep(wait)
            continue
        raise RuntimeError(f"VEP error {response.status_code}: {response.text[:500]}")
    raise RuntimeError("VEP request failed after several retries")


# ---------- Extracting the fields we need ----------

def extract_frequencies_and_clinsig(result, alt):
    """Pick gnomAD frequencies for our ALT allele and collect ClinVar significance."""
    gnomade = gnomadg = None
    clin_sig = set()
    for colocated in result.get("colocated_variants", []):
        clin_sig.update(colocated.get("clin_sig", []))
        freqs = colocated.get("frequencies", {})
        allele_freqs = freqs.get(alt)
        if allele_freqs is None and len(freqs) == 1:
            # VEP may write the allele differently (e.g. for indels); use the only one given
            allele_freqs = next(iter(freqs.values()))
        if allele_freqs:
            gnomade = allele_freqs.get("gnomade", gnomade)
            gnomadg = allele_freqs.get("gnomadg", gnomadg)
    return gnomade, gnomadg, sorted(clin_sig) or None


def extract_consequences(result):
    rows = []
    for t in result.get("transcript_consequences", []):
        rows.append((
            t.get("gene_symbol"),
            t.get("gene_id"),
            t["transcript_id"],
            t.get("biotype"),
            bool(t.get("canonical")),
            t.get("consequence_terms"),
            t.get("impact"),
            t.get("amino_acids"),
            t.get("protein_start"),
            t.get("sift_prediction"),
            t.get("sift_score"),
            t.get("polyphen_prediction"),
            t.get("polyphen_score"),
        ))
    return rows


# ---------- Writing to PostgreSQL ----------

UPSERT_VARIANT = """
    INSERT INTO variants (chrom, pos, rsid, ref, alt, most_severe_consequence,
                          gnomade_af, gnomadg_af, clin_sig, raw_vep)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (chrom, pos, ref, alt) DO UPDATE SET
        rsid = EXCLUDED.rsid,
        most_severe_consequence = EXCLUDED.most_severe_consequence,
        gnomade_af = EXCLUDED.gnomade_af,
        gnomadg_af = EXCLUDED.gnomadg_af,
        clin_sig = EXCLUDED.clin_sig,
        raw_vep = EXCLUDED.raw_vep
    RETURNING id
"""

INSERT_CONSEQUENCE = """
    INSERT INTO transcript_consequences (variant_id, gene_symbol, gene_id, transcript_id,
        biotype, is_canonical, consequence_terms, impact, amino_acids, protein_start,
        sift_prediction, sift_score, polyphen_prediction, polyphen_score)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
"""


def save_batch(conn, batch, results):
    """Store one annotated batch. Re-running the script updates rows instead of duplicating."""
    by_input = {r.get("input"): r for r in results}
    # Fallback match by position and alleles (works for SNVs if "input" is formatted differently)
    by_position = {(r.get("seq_region_name"), r.get("start"), r.get("allele_string")): r
                   for r in results}
    saved = 0
    with conn.cursor() as cur:
        for v in batch:
            result = by_input.get(to_vep_input(v)) or by_position.get(
                (v["chrom"], v["pos"], f"{v['ref']}/{v['alt']}"))
            if result is None:
                print(f"  warning: no VEP result for {v['chrom']}:{v['pos']} {v['ref']}>{v['alt']}")
                continue
            gnomade, gnomadg, clin_sig = extract_frequencies_and_clinsig(result, v["alt"])
            cur.execute(UPSERT_VARIANT, (
                v["chrom"], v["pos"], v["rsid"], v["ref"], v["alt"],
                result.get("most_severe_consequence"),
                gnomade, gnomadg, clin_sig, Jsonb(result),
            ))
            variant_id = cur.fetchone()[0]
            cur.execute("DELETE FROM transcript_consequences WHERE variant_id = %s", (variant_id,))
            for row in extract_consequences(result):
                cur.execute(INSERT_CONSEQUENCE, (variant_id, *row))
            saved += 1
    conn.commit()
    return saved


# ---------- Main ----------

def main():
    vcf_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_VCF
    variants = read_vcf(vcf_path)
    print(f"Read {len(variants)} variants from {vcf_path.name}")

    total_saved = 0
    with psycopg.connect(DB_DSN) as conn:
        for start in range(0, len(variants), BATCH_SIZE):
            batch = variants[start:start + BATCH_SIZE]
            print(f"Annotating variants {start + 1}-{start + len(batch)} with VEP...")
            results = call_vep(batch)
            total_saved += save_batch(conn, batch, results)
            time.sleep(1)  # be polite to the public Ensembl server

    print(f"Done: {total_saved} variants saved to the database.")


if __name__ == "__main__":
    main()
