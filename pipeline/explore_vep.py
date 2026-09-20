"""
Step 1: exploration.
Read a few variants from a VCF file, send them to the Ensembl VEP REST API,
save the raw response and print a short summary of what came back.
"""
import json
import sys
from pathlib import Path

import requests

VEP_URL = "https://rest.ensembl.org/vep/homo_sapiens/region"
PROJECT_DIR = Path(__file__).resolve().parent.parent
VCF_PATH = PROJECT_DIR / "data" / "example_GRCh38.vcf"
OUT_PATH = PROJECT_DIR / "data" / "vep_sample.json"


def read_vcf(path, limit=None):
    """Return variants from a VCF file as a list of dicts."""
    variants = []
    with open(path) as f:
        for line in f:
            if line.startswith("#") or not line.strip():
                continue  # skip header lines and empty lines
            chrom, pos, var_id, ref, alt = line.rstrip("\n").split("\t")[:5]
            variants.append(
                {"chrom": chrom, "pos": int(pos), "id": var_id, "ref": ref, "alt": alt}
            )
            if limit and len(variants) >= limit:
                break
    return variants


def to_vep_input(v):
    """VEP accepts VCF-like lines: CHROM POS ID REF ALT QUAL FILTER INFO."""
    return f"{v['chrom']} {v['pos']} {v['id']} {v['ref']} {v['alt']} . . ."


def annotate(variants):
    """Send variants to Ensembl VEP and return the parsed JSON response."""
    payload = {"variants": [to_vep_input(v) for v in variants], "canonical": 1}
    response = requests.post(
        VEP_URL,
        json=payload,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        timeout=60,
    )
    if not response.ok:
        print(f"VEP error {response.status_code}: {response.text[:500]}")
        sys.exit(1)
    return response.json()


def main():
    variants = read_vcf(VCF_PATH, limit=5)
    print(f"Read {len(variants)} variants from {VCF_PATH.name}")

    results = annotate(variants)
    OUT_PATH.write_text(json.dumps(results, indent=2))
    print(f"Saved full VEP response to {OUT_PATH}\n")

    for r in results:
        colocated = r.get("colocated_variants", [])
        freq_keys = set()
        for c in colocated:
            for allele_freqs in c.get("frequencies", {}).values():
                freq_keys.update(allele_freqs.keys())
        print(f"{r.get('id')}  {r.get('seq_region_name')}:{r.get('start')}  {r.get('allele_string')}")
        print(f"   most severe consequence: {r.get('most_severe_consequence')}")
        print(f"   transcript consequences: {len(r.get('transcript_consequences', []))}")
        print(f"   frequency sources: {sorted(freq_keys) or 'none'}")


if __name__ == "__main__":
    main()
