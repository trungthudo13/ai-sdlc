import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureKnowledgeCollection } from "./knowledge-tools.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Qdrant collection provisioning", () => {
  it("creates a missing collection with the configured vector contract", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      ensureKnowledgeCollection(
        "http://qdrant/",
        "secret",
        "knowledge",
        3072,
        "Cosine",
      ),
    ).resolves.toEqual({ created: true, dimension: 3072, distance: "Cosine" });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      vectors: { size: 3072, distance: "Cosine" },
    });
  });

  it("rejects an incompatible existing collection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            result: {
              config: { params: { vectors: { size: 1536, distance: "Cosine" } } },
            },
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(
      ensureKnowledgeCollection(
        "http://qdrant",
        "secret",
        "knowledge",
        3072,
        "Cosine",
      ),
    ).rejects.toThrow("expected 3072/Cosine, found 1536/Cosine");
  });
});
