import { describe, expect, it } from "vitest";
import { getToolPluginMetadata } from "openclaw/plugin-sdk/tool-plugin";
import entry from "./index.js";
import { contentHash } from "./artifact-service.js";

describe("ai-sdlc plugin metadata", () => {
  it("declares all workflow-domain tools as optional", () => {
    const metadata = getToolPluginMetadata(entry);
    expect(metadata?.tools.map((tool) => tool.name)).toEqual([
      "ai_sdlc_health",
      "ai_sdlc_flow_create",
      "ai_sdlc_artifact_submit",
      "ai_sdlc_artifact_get",
      "ai_sdlc_decision_request_submit",
      "ai_sdlc_finding_submit",
      "ai_sdlc_gate_check",
      "ai_sdlc_knowledge_index",
      "ai_sdlc_knowledge_search",
    ]);
    expect(metadata?.tools.every((tool) => tool.optional)).toBe(true);
  });

  it("hashes JSON independent of object key insertion order", () => {
    expect(contentHash({ b: 2, a: 1 })).toBe(contentHash({ a: 1, b: 2 }));
  });
});
