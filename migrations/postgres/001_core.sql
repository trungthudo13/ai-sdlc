BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS ai_sdlc;

CREATE TABLE IF NOT EXISTS ai_sdlc.schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_sdlc.feature_states (
    feature_id text PRIMARY KEY,
    phase text NOT NULL,
    status text NOT NULL CHECK (status IN ('queued', 'running', 'waiting', 'blocked', 'succeeded', 'failed', 'cancelled')),
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    knowledge_snapshot_id text,
    state jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_sdlc.artifacts (
    artifact_id text NOT NULL,
    version integer NOT NULL CHECK (version > 0),
    feature_id text NOT NULL,
    schema_name text NOT NULL,
    schema_version integer NOT NULL CHECK (schema_version > 0),
    content_hash text NOT NULL CHECK (content_hash ~ '^sha256:[0-9a-f]{64}$'),
    payload jsonb NOT NULL,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (artifact_id, version),
    UNIQUE (artifact_id, version, content_hash)
);

CREATE INDEX IF NOT EXISTS artifacts_feature_schema_idx
    ON ai_sdlc.artifacts (feature_id, schema_name, version DESC);

CREATE TABLE IF NOT EXISTS ai_sdlc.artifact_dependencies (
    artifact_id text NOT NULL,
    artifact_version integer NOT NULL,
    depends_on_artifact_id text NOT NULL,
    depends_on_version integer NOT NULL,
    depends_on_content_hash text NOT NULL,
    PRIMARY KEY (
        artifact_id,
        artifact_version,
        depends_on_artifact_id,
        depends_on_version
    ),
    FOREIGN KEY (artifact_id, artifact_version)
        REFERENCES ai_sdlc.artifacts (artifact_id, version),
    FOREIGN KEY (depends_on_artifact_id, depends_on_version, depends_on_content_hash)
        REFERENCES ai_sdlc.artifacts (artifact_id, version, content_hash)
);

CREATE TABLE IF NOT EXISTS ai_sdlc.decisions (
    decision_id text NOT NULL,
    version integer NOT NULL CHECK (version > 0),
    feature_id text NOT NULL,
    artifact_id text,
    artifact_version integer,
    decision_type text NOT NULL,
    question text NOT NULL,
    options jsonb NOT NULL DEFAULT '[]'::jsonb,
    selected_option jsonb,
    risk text NOT NULL CHECK (risk IN ('low', 'medium', 'high', 'critical')),
    blocking boolean NOT NULL DEFAULT true,
    status text NOT NULL CHECK (status IN ('requested', 'approved', 'rejected', 'superseded')),
    authority text,
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (decision_id, version),
    FOREIGN KEY (artifact_id, artifact_version)
        REFERENCES ai_sdlc.artifacts (artifact_id, version)
);

CREATE INDEX IF NOT EXISTS decisions_feature_latest_idx
    ON ai_sdlc.decisions (feature_id, decision_id, version DESC);

CREATE TABLE IF NOT EXISTS ai_sdlc.approvals (
    approval_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    feature_id text NOT NULL,
    artifact_id text NOT NULL,
    artifact_version integer NOT NULL,
    status text NOT NULL CHECK (status IN ('approved', 'rejected', 'revoked')),
    authority text NOT NULL,
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (artifact_id, artifact_version)
        REFERENCES ai_sdlc.artifacts (artifact_id, version)
);

CREATE INDEX IF NOT EXISTS approvals_artifact_latest_idx
    ON ai_sdlc.approvals (artifact_id, artifact_version, recorded_at DESC);

CREATE TABLE IF NOT EXISTS ai_sdlc.findings (
    finding_id text NOT NULL,
    version integer NOT NULL CHECK (version > 0),
    feature_id text NOT NULL,
    target_artifact_id text NOT NULL,
    target_artifact_version integer NOT NULL,
    severity text NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
    finding_type text NOT NULL,
    subject_ref text,
    blocking boolean NOT NULL DEFAULT false,
    status text NOT NULL CHECK (status IN ('open', 'resolved', 'accepted', 'superseded')),
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by text NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (finding_id, version),
    FOREIGN KEY (target_artifact_id, target_artifact_version)
        REFERENCES ai_sdlc.artifacts (artifact_id, version)
);

CREATE INDEX IF NOT EXISTS findings_feature_latest_idx
    ON ai_sdlc.findings (feature_id, finding_id, version DESC);

CREATE TABLE IF NOT EXISTS ai_sdlc.knowledge_snapshots (
    snapshot_id text PRIMARY KEY,
    collection_name text NOT NULL,
    embedding_model text NOT NULL,
    vector_size integer NOT NULL CHECK (vector_size > 0),
    source_manifest jsonb NOT NULL,
    content_hash text NOT NULL CHECK (content_hash ~ '^sha256:[0-9a-f]{64}$'),
    approved_by text,
    approved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_sdlc.workflow_events (
    event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    feature_id text NOT NULL,
    expected_revision bigint,
    event_type text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    actor text NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workflow_events_feature_time_idx
    ON ai_sdlc.workflow_events (feature_id, occurred_at);

CREATE TABLE IF NOT EXISTS ai_sdlc.outbox_events (
    event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type text NOT NULL,
    aggregate_id text NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    claimed_at timestamptz,
    published_at timestamptz,
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);

CREATE INDEX IF NOT EXISTS outbox_unpublished_idx
    ON ai_sdlc.outbox_events (created_at)
    WHERE published_at IS NULL;

CREATE OR REPLACE FUNCTION ai_sdlc.reject_artifact_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'artifact versions are immutable; insert a new version instead';
END;
$$;

DROP TRIGGER IF EXISTS artifacts_immutable ON ai_sdlc.artifacts;
CREATE TRIGGER artifacts_immutable
BEFORE UPDATE OR DELETE ON ai_sdlc.artifacts
FOR EACH ROW EXECUTE FUNCTION ai_sdlc.reject_artifact_mutation();

INSERT INTO ai_sdlc.schema_migrations (version)
VALUES ('001_core')
ON CONFLICT (version) DO NOTHING;

COMMIT;
