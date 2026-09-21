import { impactRank } from "../format.js";

// A log-scale strip of gnomAD allele frequencies. Every variant is a dot, placed in a lane
// by its impact in the canonical transcript. Dots that pass the current filters are solid;
// the rest are faded. The dashed line is the rarity threshold.

const WIDTH = 1000;
const HEIGHT = 132;
const ABSENT_ZONE = 110;          // left zone for variants absent from gnomAD
const PLOT_LEFT = ABSENT_ZONE + 50;
const PLOT_RIGHT = WIDTH - 12;
const MIN_LOG = -6;               // 1 in 1,000,000
const MAX_LOG = 0;                // 100%
const LANES = ["HIGH", "MODERATE", "LOW", "MODIFIER"];
const LANE_TOP = 14;
const LANE_GAP = 22;

const TICKS = [
  { value: 1e-6, label: "1 in 1M" },
  { value: 1e-4, label: "1 in 10,000" },
  { value: 1e-2, label: "1%" },
  { value: 1, label: "100%" },
];

export const RARITY_OPTIONS = [
  { value: "", label: "Any frequency" },
  { value: "0.05", label: "Under 5%" },
  { value: "0.01", label: "Under 1%" },
  { value: "0.001", label: "Under 0.1%" },
  { value: "0.0001", label: "Under 1 in 10,000" },
];

function xFor(af) {
  if (af === null || af === undefined || af === 0) return null;
  const log = Math.min(MAX_LOG, Math.max(MIN_LOG, Math.log10(af)));
  return PLOT_LEFT + ((log - MIN_LOG) / (MAX_LOG - MIN_LOG)) * (PLOT_RIGHT - PLOT_LEFT);
}

// Spread dots that land on the same spot so they stay visible.
function jitter(id) {
  return ((id * 37) % 11) - 5;
}

// Variants absent from gnomAD have no x position, so lay them out in a small grid per lane.
function absentPositions(variants) {
  const perLane = {};
  const positions = new Map();
  for (const v of variants) {
    if (xFor(v.gnomad_af) !== null) continue;
    const lane = Math.min(impactRank(v.impact), 4) - 1;
    const k = (perLane[lane] = (perLane[lane] ?? -1) + 1);
    positions.set(v.id, {
      x: 12 + (k % 9) * 10.5,
      y: LANE_TOP + lane * LANE_GAP + (Math.floor(k / 9) % 2 ? 5 : -3),
    });
  }
  return positions;
}

export default function FrequencyRuler({ variants, matchingIds, maxAf, onMaxAfChange, selectedId, onSelect }) {
  const threshold = maxAf ? xFor(Number(maxAf)) : null;
  const absent = absentPositions(variants);

  return (
    <section className="ruler" aria-labelledby="ruler-title">
      <div className="ruler-head">
        <h2 id="ruler-title">How common is each variant?</h2>
        <p className="ruler-note">
          Population frequency from gnomAD. A variant carried by many healthy people is
          unlikely to cause a rare disease.
        </p>
      </div>

      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="ruler-svg" role="img"
           aria-label="Variants plotted by gnomAD allele frequency and impact">
        {LANES.map((lane, i) => (
          <g key={lane}>
            <line x1={0} x2={WIDTH} y1={LANE_TOP + i * LANE_GAP} y2={LANE_TOP + i * LANE_GAP}
                  className="lane-line" />
          </g>
        ))}

        <rect x={0} y={2} width={ABSENT_ZONE} height={LANE_TOP + 3 * LANE_GAP + 10}
              className="absent-zone" />
        <text x={ABSENT_ZONE / 2} y={HEIGHT - 8} className="axis-label" textAnchor="middle">
          not in gnomAD
        </text>

        {TICKS.map((t) => (
          <g key={t.label}>
            <line x1={xFor(t.value)} x2={xFor(t.value)} y1={4} y2={LANE_TOP + 3 * LANE_GAP + 8}
                  className="tick-line" />
            <text x={xFor(t.value)} y={HEIGHT - 8} className="axis-label"
                  textAnchor={t.value === 1 ? "end" : "middle"}>
              {t.label}
            </text>
          </g>
        ))}

        {threshold !== null && (
          <g>
            <rect x={threshold} y={2} width={PLOT_RIGHT - threshold + 12}
                  height={LANE_TOP + 3 * LANE_GAP + 10} className="excluded-zone" />
            <line x1={threshold} x2={threshold} y1={0} y2={LANE_TOP + 3 * LANE_GAP + 12}
                  className="threshold-line" />
          </g>
        )}

        {variants.map((v) => {
          const lane = Math.min(impactRank(v.impact), 4) - 1;
          const placed = absent.get(v.id);
          const x = placed ? placed.x : xFor(v.gnomad_af);
          const y = placed ? placed.y : LANE_TOP + lane * LANE_GAP + jitter(v.id) * 0.8;
          const matches = matchingIds.has(v.id);
          const selected = v.id === selectedId;
          return (
            <circle
              key={v.id}
              cx={x}
              cy={y}
              r={selected ? 7 : 4.5}
              className={`dot impact-${(v.impact || "none").toLowerCase()}${matches ? "" : " faded"}${selected ? " selected" : ""}`}
              onClick={() => onSelect(v.id)}
            >
              <title>{`${v.rsid || v.chrom + ":" + v.pos} · ${v.gene_symbol || "no gene"} · ${v.impact || "no impact"}`}</title>
            </circle>
          );
        })}
      </svg>

      <div className="rarity-control" role="group" aria-label="Maximum population frequency">
        {RARITY_OPTIONS.map((option) => (
          <button
            key={option.label}
            type="button"
            aria-pressed={maxAf === option.value}
            className="rarity-button"
            onClick={() => onMaxAfChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <ul className="lane-legend" aria-label="Dot colours show impact in the canonical transcript">
        {LANES.map((lane) => (
          <li key={lane}><span className={`swatch impact-${lane.toLowerCase()}`} />{lane.toLowerCase()}</li>
        ))}
      </ul>
    </section>
  );
}
