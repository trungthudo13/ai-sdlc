import { Type } from "typebox";
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import { jsonResult } from "openclaw/plugin-sdk/tool-results";
import { pluginConfigSchema, requirePluginConfig } from "./config.js";
import { getArtifact, submitArtifact } from "./artifact-service.js";
import { query } from "./database.js";
import { submitDecisionRequest, submitFinding } from "./decision-service.js";
import { evaluateGate } from "./gate-evaluator.js";
import { indexKnowledge, searchKnowledgeByText } from "./knowledge-service.js";
import { qdrantHealth } from "./knowledge-tools.js";
import { listArtifactSchemas } from "./schema-registry.js";
import {
  attachOpenClawFlow,
  registerFeatureState,
} from "./task-flow-controller.js";

const artifactReferenceSchema = Type.Object(
  {
    artifactId: Type.String({ minLength: 1 }),
    version: Type.Integer({ minimum: 1 }),
    contentHash: Type.String({ pattern: "^sha256:[0-9a-f]{64}$" }),
  },
  { additionalProperties: false },
);

const flowCreateParameters = Type.Object(
  {
    featureId: Type.String({ minLength: 1 }),
    goal: Type.String({ minLength: 1 }),
    knowledgeSnapshotId: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

export default defineToolPlugin({
  id: "ai-sdlc",
  name: "AI SDLC",
  description:
    "Durable typed artifacts, deterministic gates, and semantic knowledge retrieval.",
  configSchema: pluginConfigSchema,
  tools: (tool) => [
    tool({
      name: "ai_sdlc_health",
      description: "Check PostgreSQL, Qdrant, and registered artifact schemas.",
      parameters: Type.Object({}, { additionalProperties: false }),
      optional: true,
      execute: async (_params, config, context) => {
        const resolvedConfig = requirePluginConfig(config);
        context.signal?.throwIfAborted();
        const databaseRows = await query<{ ok: number }>(
          resolvedConfig.postgresUrl,
          "SELECT 1 AS ok",
        );
        return {
          postgres: databaseRows[0]?.ok === 1,
          qdrant: await qdrantHealth(
            resolvedConfig.qdrantUrl,
            resolvedConfig.qdrantApiKey,
            context.signal,
          ),
          embedding: {
            model: resolvedConfig.embeddingModel,
            dimension: resolvedConfig.embeddingDimension,
            distance: resolvedConfig.qdrantDistance,
            collection: resolvedConfig.knowledgeCollection,
          },
          schemas: listArtifactSchemas(),
        };
      },
    }),
    tool({
      name: "ai_sdlc_flow_create",
      description:
        "Create the canonical feature state before the OpenClaw controller dispatches stage tasks.",
      parameters: flowCreateParameters,
      optional: true,
      factory: ({ api, config, toolContext }) => ({
        name: "ai_sdlc_flow_create",
        label: "AI-SDLC Flow Create",
        description:
          "Create matching canonical PostgreSQL and managed OpenClaw TaskFlow records.",
        parameters: flowCreateParameters,
        execute: async (_toolCallId, rawParams) => {
          const params = rawParams as {
            featureId: string;
            goal: string;
            knowledgeSnapshotId?: string;
          };
          const resolvedConfig = requirePluginConfig(config);
          const featureState = await registerFeatureState(
            resolvedConfig.postgresUrl,
            params,
          );
          if (featureState.openclawFlowId) {
            return jsonResult(featureState);
          }
          const managedFlow = api.runtime.tasks.managedFlows
            .fromToolContext(toolContext)
            .createManaged({
              controllerId: "ai-sdlc",
              goal: params.goal,
              status: "queued",
              currentStep: "business-analysis",
              stateJson: {
                featureId: params.featureId,
                ...(params.knowledgeSnapshotId
                  ? { knowledgeSnapshotId: params.knowledgeSnapshotId }
                  : {}),
              },
            });
          const attached = await attachOpenClawFlow(resolvedConfig.postgresUrl, {
            featureId: params.featureId,
            openclawFlowId: managedFlow.flowId,
          });
          return jsonResult({
            ...attached,
            created: featureState.created,
            openclawRevision: managedFlow.revision,
          });
        },
      }),
    }),
    tool({
      name: "ai_sdlc_artifact_submit",
      description:
        "Validate and store one immutable typed artifact version with exact dependencies.",
      parameters: Type.Object(
        {
          artifactId: Type.String({ minLength: 1 }),
          version: Type.Integer({ minimum: 1 }),
          featureId: Type.String({ minLength: 1 }),
          schemaName: Type.String({ minLength: 1 }),
          schemaVersion: Type.Integer({ minimum: 1 }),
          payload: Type.Unknown(),
          createdBy: Type.String({ minLength: 1 }),
          dependencies: Type.Optional(Type.Array(artifactReferenceSchema)),
        },
        { additionalProperties: false },
      ),
      optional: true,
      execute: (params, config) =>
        submitArtifact(requirePluginConfig(config).postgresUrl, {
          ...params,
          dependencies: params.dependencies ?? [],
        }),
    }),
    tool({
      name: "ai_sdlc_artifact_get",
      description: "Fetch an exact artifact version, or the latest version when omitted.",
      parameters: Type.Object(
        {
          artifactId: Type.String({ minLength: 1 }),
          version: Type.Optional(Type.Integer({ minimum: 1 })),
        },
        { additionalProperties: false },
      ),
      optional: true,
      execute: (params, config) =>
        getArtifact(
          requirePluginConfig(config).postgresUrl,
          params.artifactId,
          params.version,
        ),
    }),
    tool({
      name: "ai_sdlc_decision_request_submit",
      description:
        "Record an unresolved business decision request. This tool cannot approve it.",
      parameters: Type.Object(
        {
          decisionId: Type.String({ minLength: 1 }),
          version: Type.Integer({ minimum: 1 }),
          featureId: Type.String({ minLength: 1 }),
          artifactId: Type.Optional(Type.String({ minLength: 1 })),
          artifactVersion: Type.Optional(Type.Integer({ minimum: 1 })),
          decisionType: Type.String({ minLength: 1 }),
          question: Type.String({ minLength: 1 }),
          options: Type.Array(Type.Unknown()),
          risk: Type.Union([
            Type.Literal("low"),
            Type.Literal("medium"),
            Type.Literal("high"),
            Type.Literal("critical"),
          ]),
          blocking: Type.Boolean(),
        },
        { additionalProperties: false },
      ),
      optional: true,
      execute: (params, config) =>
        submitDecisionRequest(requirePluginConfig(config).postgresUrl, params),
    }),
    tool({
      name: "ai_sdlc_finding_submit",
      description: "Record an independent finding against an exact artifact version.",
      parameters: Type.Object(
        {
          findingId: Type.String({ minLength: 1 }),
          version: Type.Integer({ minimum: 1 }),
          featureId: Type.String({ minLength: 1 }),
          targetArtifactId: Type.String({ minLength: 1 }),
          targetArtifactVersion: Type.Integer({ minimum: 1 }),
          severity: Type.Union([
            Type.Literal("info"),
            Type.Literal("low"),
            Type.Literal("medium"),
            Type.Literal("high"),
            Type.Literal("critical"),
          ]),
          findingType: Type.String({ minLength: 1 }),
          subjectRef: Type.Optional(Type.String({ minLength: 1 })),
          blocking: Type.Boolean(),
          details: Type.Unknown(),
          createdBy: Type.String({ minLength: 1 }),
        },
        { additionalProperties: false },
      ),
      optional: true,
      execute: (params, config) =>
        submitFinding(requirePluginConfig(config).postgresUrl, params),
    }),
    tool({
      name: "ai_sdlc_gate_check",
      description:
        "Evaluate a deterministic requirement or implementation gate from canonical records.",
      parameters: Type.Object(
        {
          featureId: Type.String({ minLength: 1 }),
          gate: Type.Union([
            Type.Literal("requirement"),
            Type.Literal("implementation"),
          ]),
        },
        { additionalProperties: false },
      ),
      optional: true,
      execute: (params, config) =>
        evaluateGate(
          requirePluginConfig(config).postgresUrl,
          params.featureId,
          params.gate,
        ),
    }),
    tool({
      name: "ai_sdlc_knowledge_index",
      description:
        "Embed and index an immutable, explicitly identified knowledge snapshot in Qdrant and PostgreSQL.",
      parameters: Type.Object(
        {
          knowledgeSnapshotId: Type.String({ minLength: 1 }),
          sourceManifest: Type.Unknown(),
          documents: Type.Array(
            Type.Object(
              {
                id: Type.String({ minLength: 1 }),
                text: Type.String({ minLength: 1 }),
                sourceRef: Type.String({ minLength: 1 }),
                featureId: Type.Optional(Type.String({ minLength: 1 })),
                metadata: Type.Optional(
                  Type.Record(Type.String(), Type.Unknown()),
                ),
              },
              { additionalProperties: false },
            ),
            { minItems: 1, maxItems: 100 },
          ),
        },
        { additionalProperties: false },
      ),
      optional: true,
      execute: (params, config, context) =>
        indexKnowledge(requirePluginConfig(config), params, context.signal),
    }),
    tool({
      name: "ai_sdlc_knowledge_search",
      description:
        "Embed a text query and search the configured Qdrant knowledge collection.",
      parameters: Type.Object(
        {
          query: Type.String({ minLength: 1 }),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
          featureId: Type.Optional(Type.String({ minLength: 1 })),
          knowledgeSnapshotId: Type.Optional(Type.String({ minLength: 1 })),
        },
        { additionalProperties: false },
      ),
      optional: true,
      execute: (params, config, context) => {
        const resolvedConfig = requirePluginConfig(config);
        return searchKnowledgeByText(
          resolvedConfig,
          { ...params, limit: params.limit ?? 10 },
          context.signal,
        );
      },
    }),
  ],
});
