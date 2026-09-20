-- Variant annotation database schema.
-- One variant can overlap many transcripts, so consequences live in their own table
-- (one-to-many relationship: variants 1 --- * transcript_consequences).

DROP TABLE IF EXISTS transcript_consequences;
DROP TABLE IF EXISTS variants;

CREATE TABLE variants (
    id                       SERIAL PRIMARY KEY,
    chrom                    TEXT    NOT NULL,
    pos                      INTEGER NOT NULL,
    rsid                     TEXT,
    ref                      TEXT    NOT NULL,
    alt                      TEXT    NOT NULL,
    most_severe_consequence  TEXT,
    gnomade_af               DOUBLE PRECISION,  -- gnomAD exomes allele frequency
    gnomadg_af               DOUBLE PRECISION,  -- gnomAD genomes allele frequency
    clin_sig                 TEXT[],            -- ClinVar clinical significance terms
    raw_vep                  JSONB,             -- full VEP response, kept for later use
    UNIQUE (chrom, pos, ref, alt)
);

CREATE TABLE transcript_consequences (
    id                   SERIAL PRIMARY KEY,
    variant_id           INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    gene_symbol          TEXT,
    gene_id              TEXT,
    transcript_id        TEXT NOT NULL,
    biotype              TEXT,
    is_canonical         BOOLEAN NOT NULL DEFAULT FALSE,
    consequence_terms    TEXT[],
    impact               TEXT,              -- HIGH / MODERATE / LOW / MODIFIER
    amino_acids          TEXT,              -- e.g. H/R
    protein_start        INTEGER,
    sift_prediction      TEXT,
    sift_score           DOUBLE PRECISION,
    polyphen_prediction  TEXT,
    polyphen_score       DOUBLE PRECISION
);

-- Indexes for the filters the web interface will use most.
CREATE INDEX idx_variants_gnomade_af   ON variants (gnomade_af);
CREATE INDEX idx_variants_consequence  ON variants (most_severe_consequence);
CREATE INDEX idx_tc_variant_id         ON transcript_consequences (variant_id);
CREATE INDEX idx_tc_gene_symbol        ON transcript_consequences (gene_symbol);
