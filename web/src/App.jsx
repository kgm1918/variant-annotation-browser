import { useEffect, useMemo, useState } from "react";
import { fetchStats, fetchVariants } from "./api.js";
import FrequencyRuler from "./components/FrequencyRuler.jsx";
import Filters from "./components/Filters.jsx";
import VariantTable from "./components/VariantTable.jsx";
import VariantDetail from "./components/VariantDetail.jsx";

const INITIAL_FILTERS = {
  maxAf: "0.01",
  impact: "",
  includeOtherTranscripts: false,
  consequence: "",
  gene: "",
};

// Translate interface state into API query parameters.
function toQuery(filters) {
  return {
    maxAf: filters.maxAf,
    consequence: filters.consequence,
    gene: filters.gene,
    [filters.includeOtherTranscripts ? "worstImpact" : "impact"]: filters.impact,
  };
}

export default function App() {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [allVariants, setAllVariants] = useState([]);
  const [variants, setVariants] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Everything, once: used by the frequency ruler and the summary.
  useEffect(() => {
    fetchVariants().then((data) => setAllVariants(data.variants)).catch((e) => setError(e.message));
    fetchStats().then(setStats).catch((e) => setError(e.message));
  }, []);

  // Filtered list: refetch when filters change (short delay so typing a gene name is smooth).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      fetchVariants(toQuery(filters))
        .then((data) => {
          if (cancelled) return;
          setVariants(data.variants);
          setError(null);
        })
        .catch((e) => !cancelled && setError(e.message))
        .finally(() => !cancelled && setLoading(false));
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [filters]);

  const matchingIds = useMemo(() => new Set(variants.map((v) => v.id)), [variants]);
  const updateFilters = (changes) => setFilters((current) => ({ ...current, ...changes }));

  return (
    <div className="page">
      <header className="masthead">
        <h1>Variant annotation browser</h1>
        <p>
          Variants from a VCF file, annotated with Ensembl VEP, gnomAD and ClinVar.
          Narrow them down to the rare ones that change a protein.
        </p>
      </header>

      <FrequencyRuler
        variants={allVariants}
        matchingIds={matchingIds}
        maxAf={filters.maxAf}
        onMaxAfChange={(maxAf) => updateFilters({ maxAf })}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />

      <div className="workspace">
        <Filters filters={filters} onChange={updateFilters} stats={stats} />

        <main className="results">
          <p className="result-count" aria-live="polite">
            {loading ? "Updating…" : `${variants.length} of ${allVariants.length} variants`}
          </p>
          {error ? (
            <div className="error">
              <p>Could not reach the API: {error}</p>
              <p>Check that the server is running with <code>npm start</code> in the api folder.</p>
            </div>
          ) : (
            <VariantTable variants={variants} selectedId={selectedId}
                          onSelect={setSelectedId} loading={loading} />
          )}
        </main>

        {selectedId && <VariantDetail id={selectedId} onClose={() => setSelectedId(null)} />}
      </div>
    </div>
  );
}
