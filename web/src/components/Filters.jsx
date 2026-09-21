import { consequenceLabel } from "../format.js";

// Side panel: impact, consequence and gene filters, plus a summary of consequence types.
export default function Filters({ filters, onChange, stats }) {
  const total = stats?.byConsequence.reduce((sum, row) => sum + row.count, 0) || 0;

  return (
    <aside className="filters" aria-label="Filters">
      <label className="field">
        <span>Impact</span>
        <select value={filters.impact} onChange={(e) => onChange({ impact: e.target.value })}>
          <option value="">Any impact</option>
          <option value="HIGH">High</option>
          <option value="MODERATE">Moderate</option>
          <option value="LOW">Low</option>
          <option value="MODIFIER">Modifier</option>
        </select>
      </label>

      <label className="check">
        <input
          type="checkbox"
          checked={filters.includeOtherTranscripts}
          onChange={(e) => onChange({ includeOtherTranscripts: e.target.checked })}
        />
        <span>Match impact in any transcript, not only the canonical one</span>
      </label>

      <label className="field">
        <span>Gene</span>
        <input
          type="search"
          placeholder="e.g. HIRA"
          value={filters.gene}
          onChange={(e) => onChange({ gene: e.target.value.trim() })}
        />
      </label>

      {stats && (
        <div className="consequence-summary">
          <h2>Most severe consequence</h2>
          <ul>
            {stats.byConsequence.map((row) => {
              const active = filters.consequence === row.consequence;
              return (
                <li key={row.consequence}>
                  <button
                    type="button"
                    aria-pressed={active}
                    className="summary-row"
                    onClick={() => onChange({ consequence: active ? "" : row.consequence })}
                  >
                    <span className="summary-label">{consequenceLabel(row.consequence)}</span>
                    <span className="summary-count">{row.count}</span>
                    <span className="summary-bar" style={{ width: `${(row.count / total) * 100}%` }} />
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="hint">Across all transcripts. Select a row to filter.</p>
        </div>
      )}
    </aside>
  );
}
