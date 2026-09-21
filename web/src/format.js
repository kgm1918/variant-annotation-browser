// Small helpers that turn raw annotation values into text people can read quickly.

export const IMPACT_RANK = { HIGH: 1, MODERATE: 2, LOW: 3, MODIFIER: 4 };

export function impactRank(impact) {
  return IMPACT_RANK[impact] ?? 5;
}

// "missense_variant" -> "missense", "splice_polypyrimidine_tract_variant" -> "splice polypyrimidine tract"
export function consequenceLabel(term) {
  if (!term) return "—";
  return term.replace(/_variant$/, "").replaceAll("_", " ");
}

// Allele frequency as a percentage for common variants, "1 in N" for rare ones.
export function formatFrequency(af) {
  if (af === null || af === undefined) return "not in gnomAD";
  if (af === 0) return "0 (allele not observed)";
  if (af >= 0.001) return `${(af * 100).toFixed(af >= 0.1 ? 0 : 1)}%`;
  const oneIn = Math.round(1 / af);
  return `1 in ${oneIn.toLocaleString("en-GB")}`;
}

// Protein change in short form: "H/R" at 335 -> "H335R"; synonymous "S" at 257 -> "S257="
export function proteinChange(aminoAcids, position) {
  if (!aminoAcids || !position) return "—";
  const [from, to] = aminoAcids.split("/");
  return to ? `${from}${position}${to}` : `${from}${position}=`;
}

export function variantLabel(v) {
  return `${v.chrom}:${v.pos.toLocaleString("en-GB")} ${v.ref}>${v.alt}`;
}

export function clinSigLabel(term) {
  return term.replaceAll("_", " ");
}
