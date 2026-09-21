import {
  clinSigLabel, consequenceLabel, formatFrequency, impactRank, proteinChange, variantLabel,
} from "../format.js";

function ImpactBadge({ impact }) {
  if (!impact) return <span className="badge">none</span>;
  return <span className={`badge impact-${impact.toLowerCase()}`}>{impact.toLowerCase()}</span>;
}

export default function VariantTable({ variants, selectedId, onSelect, loading }) {
  if (!loading && variants.length === 0) {
    return (
      <div className="empty">
        <p>No variants match these filters.</p>
        <p>Try a higher frequency limit, or match impact in any transcript.</p>
      </div>
    );
  }

  return (
    <div className="table-wrap" aria-busy={loading}>
      <table className="variant-table">
        <thead>
          <tr>
            <th scope="col">Variant</th>
            <th scope="col">Gene</th>
            <th scope="col">Effect in canonical transcript</th>
            <th scope="col">Protein</th>
            <th scope="col" className="num">gnomAD frequency</th>
            <th scope="col">ClinVar</th>
          </tr>
        </thead>
        <tbody>
          {variants.map((v) => {
            const moreSevereElsewhere =
              v.worst_impact && impactRank(v.worst_impact) < impactRank(v.impact);
            return (
              <tr
                key={v.id}
                className={v.id === selectedId ? "selected" : ""}
                tabIndex={0}
                onClick={() => onSelect(v.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(v.id);
                  }
                }}
                aria-selected={v.id === selectedId}
              >
                <td>
                  <span className="coord">{variantLabel(v)}</span>
                  <span className="rsid">{v.rsid || "no rsID"}</span>
                </td>
                <td className="gene">{v.gene_symbol || "—"}</td>
                <td>
                  <div className="effect">
                    <ImpactBadge impact={v.impact} />
                    <span>{consequenceLabel(v.consequence_terms?.[0])}</span>
                  </div>
                  {moreSevereElsewhere && (
                    <p className="warning">
                      <span className="warning-mark" aria-hidden="true">!</span>
                      {consequenceLabel(v.worst_consequence_terms?.[0])} in a non-canonical{" "}
                      {v.worst_gene_symbol || ""} transcript
                    </p>
                  )}
                </td>
                <td className="coord">{proteinChange(v.amino_acids, v.protein_start)}</td>
                <td className="num">{formatFrequency(v.gnomad_af)}</td>
                <td>
                  {v.clin_sig?.length
                    ? v.clin_sig.map((s) => (
                        <span key={s} className={`clinsig clinsig-${s}`}>{clinSigLabel(s)}</span>
                      ))
                    : <span className="muted">no entry</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
