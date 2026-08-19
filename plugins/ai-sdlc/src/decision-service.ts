import { transaction } from "./database.js";

export type DecisionRequestInput = {
  decisionId: string;
  version: number;
  featureId: string;
  artifactId?: string;
  artifactVersion?: number;
  decisionType: string;
  question: string;
  options: unknown[];
  risk: "low" | "medium" | "high" | "critical";
  blocking: boolean;
};

export async function submitDecisionRequest(
  postgresUrl: string,
  input: DecisionRequestInput,
): Promise<{ decisionId: string; version: number; inserted: boolean }> {
  return transaction(postgresUrl, async (client) => {
    const existing = await client.query(
      `SELECT 1 FROM ai_sdlc.decisions WHERE decision_id = $1 AND version = $2`,
      [input.decisionId, input.version],
    );
    if (existing.rowCount) {
      return { decisionId: input.decisionId, version: input.version, inserted: false };
    }
    await client.query(
      `INSERT INTO ai_sdlc.decisions (
         decision_id, version, feature_id, artifact_id, artifact_version,
         decision_type, question, options, risk, blocking, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, 'requested')`,
      [
        input.decisionId,
        input.version,
        input.featureId,
        input.artifactId ?? null,
        input.artifactVersion ?? null,
        input.decisionType,
        input.question,
        JSON.stringify(input.options),
        input.risk,
        input.blocking,
      ],
    );
    await client.query(
      `INSERT INTO ai_sdlc.outbox_events (
         aggregate_type, aggregate_id, event_type, payload
       ) VALUES ('decision', $1, 'decision.requested', $2::jsonb)`,
      [
        `${input.decisionId}:${input.version}`,
        JSON.stringify(input),
      ],
    );
    return { decisionId: input.decisionId, version: input.version, inserted: true };
  });
}

export type FindingInput = {
  findingId: string;
  version: number;
  featureId: string;
  targetArtifactId: string;
  targetArtifactVersion: number;
  severity: "info" | "low" | "medium" | "high" | "critical";
  findingType: string;
  subjectRef?: string;
  blocking: boolean;
  details: unknown;
  createdBy: string;
};

export async function submitFinding(
  postgresUrl: string,
  input: FindingInput,
): Promise<{ findingId: string; version: number; inserted: boolean }> {
  return transaction(postgresUrl, async (client) => {
    const existing = await client.query(
      `SELECT 1 FROM ai_sdlc.findings WHERE finding_id = $1 AND version = $2`,
      [input.findingId, input.version],
    );
    if (existing.rowCount) {
      return { findingId: input.findingId, version: input.version, inserted: false };
    }
    await client.query(
      `INSERT INTO ai_sdlc.findings (
         finding_id, version, feature_id, target_artifact_id,
         target_artifact_version, severity, finding_type, subject_ref,
         blocking, status, details, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open', $10::jsonb, $11)`,
      [
        input.findingId,
        input.version,
        input.featureId,
        input.targetArtifactId,
        input.targetArtifactVersion,
        input.severity,
        input.findingType,
        input.subjectRef ?? null,
        input.blocking,
        JSON.stringify(input.details),
        input.createdBy,
      ],
    );
    return { findingId: input.findingId, version: input.version, inserted: true };
  });
}
