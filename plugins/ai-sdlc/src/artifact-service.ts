import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { query, transaction } from "./database.js";
import { validateArtifactPayload } from "./schema-registry.js";

export type ArtifactReference = {
  artifactId: string;
  version: number;
  contentHash: string;
};

export type SubmitArtifactInput = {
  artifactId: string;
  version: number;
  featureId: string;
  schemaName: string;
  schemaVersion: number;
  payload: unknown;
  createdBy: string;
  dependencies: ArtifactReference[];
};

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(",")}}`;
}

export function contentHash(payload: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalize(payload)).digest("hex")}`;
}

async function insertDependencies(
  client: PoolClient,
  input: SubmitArtifactInput,
): Promise<void> {
  for (const dependency of input.dependencies) {
    await client.query(
      `INSERT INTO ai_sdlc.artifact_dependencies (
         artifact_id, artifact_version, depends_on_artifact_id,
         depends_on_version, depends_on_content_hash
       ) VALUES ($1, $2, $3, $4, $5)`,
      [
        input.artifactId,
        input.version,
        dependency.artifactId,
        dependency.version,
        dependency.contentHash,
      ],
    );
  }
}

export async function submitArtifact(
  postgresUrl: string,
  input: SubmitArtifactInput,
): Promise<ArtifactReference & { inserted: boolean }> {
  validateArtifactPayload(input.schemaName, input.payload);
  const hash = contentHash(input.payload);

  return transaction(postgresUrl, async (client) => {
    const existing = await client.query<{
      content_hash: string;
    }>(
      `SELECT content_hash
         FROM ai_sdlc.artifacts
        WHERE artifact_id = $1 AND version = $2`,
      [input.artifactId, input.version],
    );
    if (existing.rowCount) {
      if (existing.rows[0].content_hash !== hash) {
        throw new Error(
          `artifact ${input.artifactId} version ${input.version} already exists with different content`,
        );
      }
      return {
        artifactId: input.artifactId,
        version: input.version,
        contentHash: hash,
        inserted: false,
      };
    }

    await client.query(
      `INSERT INTO ai_sdlc.artifacts (
         artifact_id, version, feature_id, schema_name, schema_version,
         content_hash, payload, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [
        input.artifactId,
        input.version,
        input.featureId,
        input.schemaName,
        input.schemaVersion,
        hash,
        JSON.stringify(input.payload),
        input.createdBy,
      ],
    );
    await insertDependencies(client, input);
    await client.query(
      `INSERT INTO ai_sdlc.outbox_events (
         aggregate_type, aggregate_id, event_type, payload
       ) VALUES ('artifact', $1, 'artifact.submitted', $2::jsonb)`,
      [
        `${input.artifactId}:${input.version}`,
        JSON.stringify({
          featureId: input.featureId,
          artifactId: input.artifactId,
          version: input.version,
          contentHash: hash,
          schemaName: input.schemaName,
        }),
      ],
    );

    return {
      artifactId: input.artifactId,
      version: input.version,
      contentHash: hash,
      inserted: true,
    };
  });
}

export async function getArtifact(
  postgresUrl: string,
  artifactId: string,
  version?: number,
): Promise<Record<string, unknown> | null> {
  const rows = await query<Record<string, unknown>>(
    postgresUrl,
    `SELECT artifact_id AS "artifactId", version, feature_id AS "featureId",
            schema_name AS "schemaName", schema_version AS "schemaVersion",
            content_hash AS "contentHash", payload, created_by AS "createdBy",
            created_at AS "createdAt"
       FROM ai_sdlc.artifacts
      WHERE artifact_id = $1
        AND ($2::integer IS NULL OR version = $2)
      ORDER BY version DESC
      LIMIT 1`,
    [artifactId, version ?? null],
  );
  return rows[0] ?? null;
}
