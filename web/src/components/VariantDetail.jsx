import { useEffect, useState } from "react";
import { fetchVariant } from "../api.js";
import {
  clinSigLabel, consequenceLabel, formatFrequency, proteinChange, variantLabel,
} from "../format.js";

// Side panel with every transcript the variant touches, canonical ones first.
export default function VariantDetail({ id, onClose }) {
  const [variant, setVariant] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setVariant(null);
    setError(null);
    fetchVariant(id)
      .then((data) => !cancelled && setVariant(data))
      .catch((err) => !cancelled && setError(err.message));
    return () => { cancelled = true; };
  }, [id]);

  // Close the drawer with the Escape key.
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const gnomadId = variant && `${variant.chrom}-${variant.pos}-${variant.ref}-${variant.alt}`;

  return (
    <aside className="detail" aria-label="Variant details">
      <div className="detail-head">
        <h2>{variant ? variantLabel(variant) : "Loading…"}</h2>
        <button type="button" className="close" onClick={onClose}>Close</button>
      </div>

      {error && <p className="error">Could not load this variant: {error}</p>}

      {variant && (
        <>
          <dl className="facts">
            <dt>rsID</dt><dd>{variant.rsid || "none"}</dd>
            <dt>gnomAD exomes</dt><dd>{formatFrequency(variant.gnomade_af)}</dd>
            <dt>gnomAD genomes</dt><dd>{formatFrequency(variant.gnomadg_af)}</dd>
            <dt>ClinVar</dt>
            <dd>{variant.clin_sig?.length ? variant.clin_sig.map(clinSigLabel).join(", ") : "no entry"}</dd>
          </dl>

          <p className="links">
            {variant.rsid && (
              <a href={`https://www.ensembl.org/Homo_sapiens/Variation/Explore?v=${variant.rsid}`}
                 target="_blank" rel="noreferrer">Open in Ensembl</a>
            )}
            <a href={`https://gnomad.broadinstitute.org/variant/${gnomadId}?dataset=gnomad_r4`}
               target="_blank" rel="noreferrer">Open in gnomAD</a>
          </p>

          <h3>Transcripts ({variant.transcript_consequences.length})</h3>
          <div className="table-wrap">
            <table className="transcript-table">
              <thead>
                <tr>
                  <th scope="col">Gene</th>
                  <th scope="col">Transcript</th>
                  <th scope="col">Consequence</th>
                  <th scope="col">Impact</th>
                  <th scope="col">Protein</th>
                </tr>
              </thead>
              <tbody>
                {variant.transcript_consequences.map((t) => (
                  <tr key={t.transcript_id} className={t.is_canonical ? "canonical" : ""}>
                    <td>{t.gene_symbol || "—"}</td>
                    <td className="coord">
                      {t.transcript_id}
                      {t.is_canonical && <span className="canonical-tag">canonical</span>}
                    </td>
                    <td>{(t.consequence_terms || []).map(consequenceLabel).join(", ")}</td>
                    <td><span className={`badge impact-${(t.impact || "").toLowerCase()}`}>{(t.impact || "—").toLowerCase()}</span></td>
                    <td className="coord">{proteinChange(t.amino_acids, t.protein_start)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </aside>
  );
}
