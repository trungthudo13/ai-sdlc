import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmbeddings } from "./embedding-client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAI embedding client", () => {
  it("sends the configured model and dimensions and preserves input order", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { index: 1, embedding: [0.3, 0.4] },
            { index: 0, embedding: [0.1, 0.2] },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createEmbeddings(
        { apiKey: "secret", model: "text-embedding-3-large", dimension: 2 },
        ["first", "second"],
      ),
    ).resolves.toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);

    const [, request] = fetchMock.mock.calls[0];
    expect(JSON.parse(request.body)).toEqual({
      model: "text-embedding-3-large",
      input: ["first", "second"],
      dimensions: 2,
      encoding_format: "float",
    });
  });

  it("rejects a vector with the wrong dimension", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [{ index: 0, embedding: [0.1] }] }), {
          status: 200,
        }),
      ),
    );
    await expect(
      createEmbeddings(
        { apiKey: "secret", model: "text-embedding-3-large", dimension: 2 },
        ["text"],
      ),
    ).rejects.toThrow("has dimension 1; expected 2");
  });
});
