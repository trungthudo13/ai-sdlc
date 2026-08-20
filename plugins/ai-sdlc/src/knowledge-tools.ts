export type KnowledgeSearchInput = {
  vector: number[];
  limit: number;
  featureId?: string;
  knowledgeSnapshotId?: string;
};

export type QdrantDistance = "Cosine" | "Euclid" | "Dot" | "Manhattan";

export type KnowledgePoint = {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
};

async function qdrantError(response: Response): Promise<string> {
  const body = (await response.text()).trim();
  return body ? `: ${body.slice(0, 500)}` : "";
}

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

export async function ensureKnowledgeCollection(
  baseUrl: string,
  apiKey: string,
  collection: string,
  dimension: number,
  distance: QdrantDistance,
  signal?: AbortSignal,
): Promise<{ created: boolean; dimension: number; distance: QdrantDistance }> {
  const collectionUrl = `${baseUrl.replace(/\/$/, "")}/collections/${encodeURIComponent(collection)}`;
  const headers = { "api-key": apiKey };
  const existing = await fetch(collectionUrl, { headers, signal });
  if (existing.status === 404) {
    const created = await fetch(collectionUrl, {
      method: "PUT",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ vectors: { size: dimension, distance } }),
      signal,
    });
    if (!created.ok) {
      throw new Error(
        `Qdrant collection creation failed with HTTP ${created.status}${await qdrantError(created)}`,
      );
    }
    return { created: true, dimension, distance };
  }
  if (!existing.ok) {
    throw new Error(
      `Qdrant collection lookup failed with HTTP ${existing.status}${await qdrantError(existing)}`,
    );
  }
  const payload = (await existing.json()) as {
    result?: { config?: { params?: { vectors?: unknown } } };
  };
  const vectors = payload.result?.config?.params?.vectors as
    | { size?: number; distance?: QdrantDistance }
    | undefined;
  if (vectors?.size !== dimension || vectors.distance !== distance) {
    throw new Error(
      `Qdrant collection ${collection} is incompatible: expected ${dimension}/${distance}, ` +
        `found ${String(vectors?.size)}/${String(vectors?.distance)}`,
    );
  }
  return { created: false, dimension, distance };
}

export async function upsertKnowledge(
  baseUrl: string,
  apiKey: string,
  collection: string,
  points: KnowledgePoint[],
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/collections/${encodeURIComponent(collection)}/points?wait=true`,
    {
      method: "PUT",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({ points }),
      signal,
    },
  );
  if (!response.ok) {
    throw new Error(
      `Qdrant upsert failed with HTTP ${response.status}${await qdrantError(response)}`,
    );
  }
  return response.json();
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
    throw new Error(
      `Qdrant query failed with HTTP ${response.status}${await qdrantError(response)}`,
    );
  }
  return response.json();
}
