export type KnowledgeSearchInput = {
  vector: number[];
  limit: number;
  featureId?: string;
  knowledgeSnapshotId?: string;
};

export async function qdrantHealth(
  baseUrl: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/healthz`, {
    headers: { "api-key": apiKey },
    signal,
  });
  return response.ok;
}

export async function searchKnowledge(
  baseUrl: string,
  apiKey: string,
  collection: string,
  input: KnowledgeSearchInput,
  signal?: AbortSignal,
): Promise<unknown> {
  const must: unknown[] = [];
  if (input.featureId) {
    must.push({ key: "featureId", match: { value: input.featureId } });
  }
  if (input.knowledgeSnapshotId) {
    must.push({
      key: "knowledgeSnapshotId",
      match: { value: input.knowledgeSnapshotId },
    });
  }
  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/collections/${encodeURIComponent(collection)}/points/query`,
    {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query: input.vector,
        limit: input.limit,
        with_payload: true,
        with_vector: false,
        ...(must.length ? { filter: { must } } : {}),
      }),
      signal,
    },
  );
  if (!response.ok) {
    throw new Error(`Qdrant query failed with HTTP ${response.status}`);
  }
  return response.json();
}
