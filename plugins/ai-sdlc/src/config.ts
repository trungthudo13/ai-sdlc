import { Type, type Static } from "typebox";

export const pluginConfigSchema = Type.Object(
  {
    postgresUrl: Type.Optional(Type.String({ minLength: 1 })),
    qdrantUrl: Type.Optional(Type.String({ minLength: 1 })),
    qdrantApiKey: Type.Optional(Type.String({ minLength: 1 })),
    knowledgeCollection: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

export type PluginConfig = Static<typeof pluginConfigSchema>;

export type ResolvedPluginConfig = {
  postgresUrl: string;
  qdrantUrl: string;
  qdrantApiKey: string;
  knowledgeCollection: string;
};

export function requirePluginConfig(config: PluginConfig): ResolvedPluginConfig {
  const missing = [
    "postgresUrl",
    "qdrantUrl",
    "qdrantApiKey",
    "knowledgeCollection",
  ].filter((key) => !config[key as keyof PluginConfig]);
  if (missing.length) {
    throw new Error(`AI-SDLC plugin is not configured: missing ${missing.join(", ")}`);
  }
  return config as ResolvedPluginConfig;
}
