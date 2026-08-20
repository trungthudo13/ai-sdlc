import { Type, type Static } from "typebox";

export const pluginConfigSchema = Type.Object(
  {
    postgresUrl: Type.Optional(Type.String({ minLength: 1 })),
    qdrantUrl: Type.Optional(Type.String({ minLength: 1 })),
    qdrantApiKey: Type.Optional(Type.String({ minLength: 1 })),
    knowledgeCollection: Type.Optional(Type.String({ minLength: 1 })),
    embeddingModel: Type.Optional(Type.String({ minLength: 1 })),
    embeddingDimension: Type.Optional(
      Type.Union([
        Type.Integer({ minimum: 1 }),
        Type.String({ pattern: "^[1-9][0-9]*$" }),
      ]),
    ),
    qdrantDistance: Type.Optional(
      Type.Union([
        Type.Literal("Cosine"),
        Type.Literal("Euclid"),
        Type.Literal("Dot"),
        Type.Literal("Manhattan"),
      ]),
    ),
    openaiApiKey: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

export type PluginConfig = Static<typeof pluginConfigSchema>;

export type ResolvedPluginConfig = {
  postgresUrl: string;
  qdrantUrl: string;
  qdrantApiKey: string;
  knowledgeCollection: string;
  embeddingModel: string;
  embeddingDimension: number;
  qdrantDistance: "Cosine" | "Euclid" | "Dot" | "Manhattan";
  openaiApiKey: string;
};

export function requirePluginConfig(config: PluginConfig): ResolvedPluginConfig {
  const missing = [
    "postgresUrl",
    "qdrantUrl",
    "qdrantApiKey",
    "knowledgeCollection",
    "embeddingModel",
    "embeddingDimension",
    "qdrantDistance",
    "openaiApiKey",
  ].filter((key) => !config[key as keyof PluginConfig]);
  if (missing.length) {
    throw new Error(`AI-SDLC plugin is not configured: missing ${missing.join(", ")}`);
  }
  return {
    ...(config as Omit<ResolvedPluginConfig, "embeddingDimension">),
    embeddingDimension: Number(config.embeddingDimension),
  };
}
