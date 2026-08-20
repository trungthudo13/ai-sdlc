import { createHash } from "node:crypto";
import { contentHash } from "./artifact-service.js";
import type { ResolvedPluginConfig } from "./config.js";
import { transaction } from "./database.js";
import { createEmbeddings } from "./embedding-client.js";
import {
  ensureKnowledgeCollection,
  searchKnowledge,
  upsertKnowledge,
} from "./knowledge-tools.js";

export type KnowledgeDocument = {
  id: string;
  text: string;
  sourceRef: string;
  featureId?: string;
  metadata?: Record<string, unknown>;
};

export type IndexKnowledgeInput = {
  knowledgeSnapshotId: string;
  sourceManifest: unknown;
  documents: KnowledgeDocument[];
};

function pointId(snapshotId: string, documentId: string): string {
  const hex = createHash("sha256")
    .update(`${snapshotId}\0${documentId}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function embeddingConfig(config: ResolvedPluginConfig) {
  return {
    apiKey: config.openaiApiKey,
    model: config.embeddingModel,
    dimension: config.embeddingDimension,
  };
}

export async function indexKnowledge(
  config: ResolvedPluginConfig,
  input: IndexKnowledgeInput,
  signal?: AbortSignal,
): Promise<{
  knowledgeSnapshotId: string;
  contentHash: string;
  indexedDocuments: number;
  snapshotInserted: boolean;
}> {
  const duplicateIds = input.documents.filter(
    (document, index) =>
      input.documents.findIndex((candidate) => candidate.id === document.id) !== index,
  );
  if (duplicateIds.length) {
    throw new Error(`knowledge document ids must be unique: ${duplicateIds[0].id}`);
  }

  const snapshotHash = contentHash({
    sourceManifest: input.sourceManifest,
    documents: input.documents,
  });
  const snapshotInserted = await transaction(config.postgresUrl, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      input.knowledgeSnapshotId,
    ]);
    const existing = await client.query<{
      collection_name: string;
      embedding_model: string;
      vector_size: number;
      content_hash: string;
    }>(
      `SELECT collection_name, embedding_model, vector_size, content_hash
         FROM ai_sdlc.knowledge_snapshots
        WHERE snapshot_id = $1`,
      [input.knowledgeSnapshotId],
    );
    if (existing.rowCount) {
      const row = existing.rows[0];
      if (
        row.collection_name !== config.knowledgeCollection ||
        row.embedding_model !== config.embeddingModel ||
        Number(row.vector_size) !== config.embeddingDimension ||
        row.content_hash !== snapshotHash
      ) {
        throw new Error(
          `knowledge snapshot ${input.knowledgeSnapshotId} already exists with incompatible content or embedding configuration`,
        );
      }
    }

    await ensureKnowledgeCollection(
      config.qdrantUrl,
      config.qdrantApiKey,
      config.knowledgeCollection,
      config.embeddingDimension,
      config.qdrantDistance,
      signal,
    );
    const embeddings = await createEmbeddings(
      embeddingConfig(config),
      input.documents.map((document) => document.text),
      signal,
    );
    await upsertKnowledge(
      config.qdrantUrl,
      config.qdrantApiKey,
      config.knowledgeCollection,
      input.documents.map((document, index) => ({
        id: pointId(input.knowledgeSnapshotId, document.id),
        vector: embeddings[index],
        payload: {
          documentId: document.id,
          text: document.text,
          sourceRef: document.sourceRef,
          knowledgeSnapshotId: input.knowledgeSnapshotId,
          ...(document.featureId ? { featureId: document.featureId } : {}),
          ...(document.metadata ? { metadata: document.metadata } : {}),
        },
      })),
      signal,
    );

    if (!existing.rowCount) {
      await client.query(
        `INSERT INTO ai_sdlc.knowledge_snapshots (
           snapshot_id, collection_name, embedding_model, vector_size,
           source_manifest, content_hash
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
        [
          input.knowledgeSnapshotId,
          config.knowledgeCollection,
          config.embeddingModel,
          config.embeddingDimension,
          JSON.stringify(input.sourceManifest),
          snapshotHash,
        ],
      );
      await client.query(
        `INSERT INTO ai_sdlc.outbox_events (
           aggregate_type, aggregate_id, event_type, payload
         ) VALUES ('knowledge_snapshot', $1, 'knowledge.snapshot.indexed', $2::jsonb)`,
        [
          input.knowledgeSnapshotId,
          JSON.stringify({
            knowledgeSnapshotId: input.knowledgeSnapshotId,
            collectionName: config.knowledgeCollection,
            embeddingModel: config.embeddingModel,
            vectorSize: config.embeddingDimension,
            contentHash: snapshotHash,
            indexedDocuments: input.documents.length,
          }),
        ],
      );
    }
    return !existing.rowCount;
  });

  return {
    knowledgeSnapshotId: input.knowledgeSnapshotId,
    contentHash: snapshotHash,
    indexedDocuments: input.documents.length,
    snapshotInserted,
  };
}

export async function searchKnowledgeByText(
  config: ResolvedPluginConfig,
  input: {
    query: string;
    limit: number;
    featureId?: string;
    knowledgeSnapshotId?: string;
  },
  signal?: AbortSignal,
): Promise<unknown> {
  const [vector] = await createEmbeddings(
    embeddingConfig(config),
    [input.query],
    signal,
  );
  return searchKnowledge(
    config.qdrantUrl,
    config.qdrantApiKey,
    config.knowledgeCollection,
    { ...input, vector },
    signal,
  );
}
