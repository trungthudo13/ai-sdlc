import { describe, expect, it } from "vitest";
import { requirePluginConfig } from "./config.js";

const completeConfig = {
  postgresUrl: "postgresql://example",
  qdrantUrl: "http://qdrant",
  qdrantApiKey: "qdrant-key",
  knowledgeCollection: "knowledge",
  embeddingModel: "text-embedding-3-large",
  embeddingDimension: "3072",
  qdrantDistance: "Cosine" as const,
  openaiApiKey: "openai-key",
};

describe("plugin config", () => {
  it("normalizes an interpolated embedding dimension", () => {
    expect(requirePluginConfig(completeConfig).embeddingDimension).toBe(3072);
  });

  it("reports missing embedding configuration", () => {
    expect(() =>
      requirePluginConfig({
        ...completeConfig,
        openaiApiKey: undefined,
      }),
    ).toThrow("missing openaiApiKey");
  });
});
