BEGIN;

CREATE OR REPLACE FUNCTION ai_sdlc.evaluate_gate(
    requested_feature_id text,
    gate_name text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    open_decision_ids text[];
    blocking_finding_ids text[];
    design_artifact_id text;
    design_artifact_version integer;
    design_payload jsonb;
    design_approved boolean := false;
BEGIN
    IF gate_name NOT IN ('requirement', 'implementation') THEN
        RAISE EXCEPTION 'unsupported gate: %', gate_name;
    END IF;

    SELECT coalesce(array_agg(latest.decision_id ORDER BY latest.decision_id), ARRAY[]::text[])
      INTO open_decision_ids
      FROM (
        SELECT DISTINCT ON (decision_id)
               decision_id, blocking, status
          FROM ai_sdlc.decisions
         WHERE feature_id = requested_feature_id
         ORDER BY decision_id, version DESC
      ) AS latest
     WHERE latest.blocking AND latest.status <> 'approved';

    SELECT coalesce(array_agg(latest.finding_id ORDER BY latest.finding_id), ARRAY[]::text[])
      INTO blocking_finding_ids
      FROM (
        SELECT DISTINCT ON (finding_id)
               finding_id, severity, blocking, status
          FROM ai_sdlc.findings
         WHERE feature_id = requested_feature_id
         ORDER BY finding_id, version DESC
      ) AS latest
     WHERE latest.status = 'open'
       AND (latest.blocking OR latest.severity IN ('high', 'critical'));

    IF cardinality(open_decision_ids) > 0 THEN
        RETURN jsonb_build_object(
            'status', 'waiting',
            'reason', 'human-business-decision-required',
            'decisionIds', to_jsonb(open_decision_ids)
        );
    END IF;

    IF cardinality(blocking_finding_ids) > 0 THEN
        RETURN jsonb_build_object(
            'status', 'blocked',
            'reason', 'open-blocking-findings',
            'findingIds', to_jsonb(blocking_finding_ids)
        );
    END IF;

    IF gate_name = 'requirement' THEN
        RETURN jsonb_build_object('status', 'ready');
    END IF;

    SELECT artifact_id, version, payload
      INTO design_artifact_id, design_artifact_version, design_payload
      FROM ai_sdlc.artifacts
     WHERE feature_id = requested_feature_id
       AND schema_name = 'ai-sdlc.feature-design.v1'
     ORDER BY version DESC
     LIMIT 1;

    IF design_artifact_id IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'blocked',
            'reason', 'missing-feature-design'
        );
    END IF;

    SELECT EXISTS (
        SELECT 1
          FROM ai_sdlc.approvals
         WHERE artifact_id = design_artifact_id
           AND artifact_version = design_artifact_version
         ORDER BY recorded_at DESC
         LIMIT 1
    ) AND (
        SELECT status = 'approved'
          FROM ai_sdlc.approvals
         WHERE artifact_id = design_artifact_id
           AND artifact_version = design_artifact_version
         ORDER BY recorded_at DESC
         LIMIT 1
    )
      INTO design_approved;

    IF NOT coalesce(design_approved, false) THEN
        RETURN jsonb_build_object(
            'status', 'waiting',
            'reason', 'feature-design-approval-required',
            'artifactId', design_artifact_id,
            'artifactVersion', design_artifact_version
        );
    END IF;

    IF NOT (
        design_payload ? 'domain'
        AND design_payload ? 'application'
        AND design_payload ? 'ports'
        AND design_payload ? 'acceptanceCriteria'
    ) THEN
        RETURN jsonb_build_object(
            'status', 'blocked',
            'reason', 'incomplete-feature-design-contract',
            'requiredFields', jsonb_build_array(
                'domain',
                'application',
                'ports',
                'acceptanceCriteria'
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'status', 'allowed',
        'artifactId', design_artifact_id,
        'artifactVersion', design_artifact_version
    );
END;
$$;

INSERT INTO ai_sdlc.schema_migrations (version)
VALUES ('002_gates')
ON CONFLICT (version) DO NOTHING;

COMMIT;
