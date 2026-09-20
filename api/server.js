// REST API for the variant annotation browser.
// Reads VEP-annotated variants from PostgreSQL and serves them as JSON.

import express from "express";
import cors from "cors";
import pg from "pg";

const PORT = process.env.PORT || 3001;

// Connection settings come from standard PG* environment variables;
// by default we use the local "variants_db" database.
const pool = new pg.Pool({ database: process.env.PGDATABASE || "variants_db" });

const app = express();
app.use(cors());

// Order of VEP impact categories, from most to least severe.
const IMPACT_RANK = `CASE t.impact WHEN 'HIGH' THEN 1 WHEN 'MODERATE' THEN 2
                                   WHEN 'LOW' THEN 3 ELSE 4 END`;

// One row per variant.
// "Canonical" columns: among the variant's canonical transcripts, prefer one with a gene
// symbol and the most severe impact (a variant can overlap several genes).
// "Worst" columns: the most severe consequence across ALL transcripts, canonical or not.
// Showing both lets the interface warn when a severe effect exists only in an
// alternative transcript.
const VARIANT_SUMMARY = `
  WITH canonical AS (
    SELECT DISTINCT ON (t.variant_id) t.*
    FROM transcript_consequences t
    WHERE t.is_canonical
    ORDER BY t.variant_id, (t.gene_symbol IS NULL), ${IMPACT_RANK}
  ),
  worst AS (
    SELECT DISTINCT ON (t.variant_id)
           t.variant_id, t.impact, t.gene_symbol, t.transcript_id, t.consequence_terms
    FROM transcript_consequences t
    ORDER BY t.variant_id, ${IMPACT_RANK}, (NOT t.is_canonical), (t.gene_symbol IS NULL)
  )
  SELECT v.id, v.chrom, v.pos, v.rsid, v.ref, v.alt,
         v.most_severe_consequence,
         v.gnomade_af, v.gnomadg_af,
         COALESCE(v.gnomade_af, v.gnomadg_af) AS gnomad_af,
         v.clin_sig,
         c.gene_symbol, c.transcript_id, c.impact, c.consequence_terms,
         c.amino_acids, c.protein_start,
         c.sift_prediction, c.sift_score, c.polyphen_prediction, c.polyphen_score,
         w.impact            AS worst_impact,
         w.gene_symbol       AS worst_gene_symbol,
         w.transcript_id     AS worst_transcript_id,
         w.consequence_terms AS worst_consequence_terms
  FROM variants v
  LEFT JOIN canonical c ON c.variant_id = v.id
  LEFT JOIN worst w     ON w.variant_id = v.id
`;

// GET /api/variants?maxAf=0.01&impact=HIGH&worstImpact=HIGH&consequence=missense_variant&gene=HIRA
// impact      - impact in the canonical transcript
// worstImpact - impact in any transcript (including non-canonical ones)
// All filters are optional. Values are passed as query parameters ($1, $2, ...),
// never pasted into the SQL string, which protects against SQL injection.
app.get("/api/variants", async (req, res, next) => {
  try {
    const { maxAf, impact, worstImpact, consequence, gene } = req.query;
    const conditions = [];
    const params = [];

    if (maxAf !== undefined) {
      const value = Number(maxAf);
      if (Number.isNaN(value) || value < 0 || value > 1) {
        return res.status(400).json({ error: "maxAf must be a number between 0 and 1" });
      }
      params.push(value);
      // Variants absent from gnomAD (NULL) count as rare.
      conditions.push(`COALESCE(s.gnomad_af, 0) <= $${params.length}`);
    }
    if (impact) {
      params.push(impact.toUpperCase());
      conditions.push(`s.impact = $${params.length}`);
    }
    if (worstImpact) {
      params.push(worstImpact.toUpperCase());
      conditions.push(`s.worst_impact = $${params.length}`);
    }
    if (consequence) {
      params.push(consequence);
      conditions.push(`s.most_severe_consequence = $${params.length}`);
    }
    if (gene) {
      params.push(gene.toUpperCase());
      conditions.push(`UPPER(s.gene_symbol) = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `
      SELECT * FROM (${VARIANT_SUMMARY}) s
      ${where}
      ORDER BY COALESCE(s.gnomad_af, 0), s.chrom, s.pos
    `;
    const { rows } = await pool.query(sql, params);
    res.json({ count: rows.length, variants: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/variants/:id — one variant with all its transcript consequences.
app.get("/api/variants/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "id must be an integer" });
    }
    const variant = await pool.query(
      `SELECT id, chrom, pos, rsid, ref, alt, most_severe_consequence,
              gnomade_af, gnomadg_af, clin_sig
       FROM variants WHERE id = $1`,
      [id]
    );
    if (variant.rows.length === 0) {
      return res.status(404).json({ error: "Variant not found" });
    }
    const consequences = await pool.query(
      `SELECT gene_symbol, gene_id, transcript_id, biotype, is_canonical,
              consequence_terms, impact, amino_acids, protein_start,
              sift_prediction, sift_score, polyphen_prediction, polyphen_score
       FROM transcript_consequences t
       WHERE variant_id = $1
       ORDER BY is_canonical DESC, ${IMPACT_RANK}, gene_symbol`,
      [id]
    );
    res.json({ ...variant.rows[0], transcript_consequences: consequences.rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/stats — counts for charts in the web interface.
app.get("/api/stats", async (req, res, next) => {
  try {
    const byConsequence = await pool.query(
      `SELECT most_severe_consequence AS consequence, COUNT(*)::int AS count
       FROM variants GROUP BY 1 ORDER BY 2 DESC`
    );
    const byFrequency = await pool.query(
      `SELECT CASE
                WHEN af IS NULL OR af = 0 THEN 'absent'
                WHEN af < 0.0001 THEN '<0.01%'
                WHEN af < 0.01   THEN '0.01–1%'
                WHEN af < 0.05   THEN '1–5%'
                ELSE '≥5%'
              END AS bin,
              COUNT(*)::int AS count
       FROM (SELECT COALESCE(gnomade_af, gnomadg_af) AS af FROM variants) f
       GROUP BY 1`
    );
    res.json({ byConsequence: byConsequence.rows, byFrequency: byFrequency.rows });
  } catch (err) {
    next(err);
  }
});

// Central error handler: log details on the server, return a short message.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`API running at http://localhost:${PORT}`);
});
