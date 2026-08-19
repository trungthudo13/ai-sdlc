import { transaction } from "./database.js";

export async function registerFeatureState(
  postgresUrl: string,
  input: {
    featureId: string;
    goal: string;
    knowledgeSnapshotId?: string;
  },
): Promise<{
  featureId: string;
  revision: number;
  created: boolean;
  openclawFlowId?: string;
}> {
  return transaction(postgresUrl, async (client) => {
    const inserted = await client.query<{ revision: string }>(
      `INSERT INTO ai_sdlc.feature_states (
         feature_id, phase, status, revision, knowledge_snapshot_id, state
       ) VALUES ($1, 'business-analysis', 'queued', 1, $2, $3::jsonb)
       ON CONFLICT (feature_id) DO NOTHING
       RETURNING revision`,
      [
        input.featureId,
        input.knowledgeSnapshotId ?? null,
        JSON.stringify({ goal: input.goal }),
      ],
    );
    if (inserted.rowCount) {
      await client.query(
        `INSERT INTO ai_sdlc.workflow_events (
           feature_id, expected_revision, event_type, payload, actor
         ) VALUES ($1, 1, 'feature.created', $2::jsonb, 'openclaw/ai-sdlc')`,
        [input.featureId, JSON.stringify(input)],
      );
      return { featureId: input.featureId, revision: 1, created: true };
    }
    const existing = await client.query<{
      revision: string;
      openclaw_flow_id: string | null;
    }>(
      `SELECT revision, state->>'openclawFlowId' AS openclaw_flow_id
         FROM ai_sdlc.feature_states
        WHERE feature_id = $1`,
      [input.featureId],
    );
    return {
      featureId: input.featureId,
      revision: Number(existing.rows[0].revision),
      created: false,
      ...(existing.rows[0].openclaw_flow_id
        ? { openclawFlowId: existing.rows[0].openclaw_flow_id }
        : {}),
    };
  });
}

export async function attachOpenClawFlow(
  postgresUrl: string,
  input: { featureId: string; openclawFlowId: string },
): Promise<{ featureId: string; revision: number; openclawFlowId: string }> {
  return transaction(postgresUrl, async (client) => {
    const updated = await client.query<{ revision: string }>(
      `UPDATE ai_sdlc.feature_states
          SET state = jsonb_set(state, '{openclawFlowId}', to_jsonb($2::text), true),
              revision = revision + 1,
              updated_at = now()
        WHERE feature_id = $1
          AND NOT (state ? 'openclawFlowId')
      RETURNING revision`,
      [input.featureId, input.openclawFlowId],
    );
    if (!updated.rowCount) {
      const existing = await client.query<{
        revision: string;
        openclaw_flow_id: string;
      }>(
        `SELECT revision, state->>'openclawFlowId' AS openclaw_flow_id
           FROM ai_sdlc.feature_states
          WHERE feature_id = $1`,
        [input.featureId],
      );
      if (!existing.rowCount || !existing.rows[0].openclaw_flow_id) {
        throw new Error(`feature state ${input.featureId} is missing`);
      }
      return {
        featureId: input.featureId,
        revision: Number(existing.rows[0].revision),
        openclawFlowId: existing.rows[0].openclaw_flow_id,
      };
    }
    await client.query(
      `INSERT INTO ai_sdlc.workflow_events (
         feature_id, expected_revision, event_type, payload, actor
       ) VALUES ($1, $2, 'openclaw.flow.attached', $3::jsonb, 'openclaw/ai-sdlc')`,
      [
        input.featureId,
        Number(updated.rows[0].revision),
        JSON.stringify({ openclawFlowId: input.openclawFlowId }),
      ],
    );
    return {
      featureId: input.featureId,
      revision: Number(updated.rows[0].revision),
      openclawFlowId: input.openclawFlowId,
    };
  });
}
