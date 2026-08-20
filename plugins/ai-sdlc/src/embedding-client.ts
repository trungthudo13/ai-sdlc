export type EmbeddingClientConfig = {
  apiKey: string;
  model: string;
  dimension: number;
};

type EmbeddingResponse = {
  data?: Array<{
    embedding?: number[];
    index?: number;
  }>;
};

async function responseError(response: Response): Promise<string> {
  const body = (await response.text()).trim();
  return body ? `: ${body.slice(0, 500)}` : "";
}

export async function createEmbeddings(
  config: EmbeddingClientConfig,
  inputs: string[],
  signal?: AbortSignal,
): Promise<number[][]> {
  if (!inputs.length) {
    throw new Error("at least one embedding input is required");
  }
  if (inputs.length > 2048) {
    throw new Error("OpenAI embeddings requests support at most 2048 inputs");
  }
  if (inputs.some((input) => !input.trim())) {
    throw new Error("embedding inputs must not be empty");
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      input: inputs,
      dimensions: config.dimension,
      encoding_format: "float",
    }),
    signal,
  });
  if (!response.ok) {
    throw new Error(
      `OpenAI embeddings request failed with HTTP ${response.status}${await responseError(response)}`,
    );
  }

  const payload = (await response.json()) as EmbeddingResponse;
  const ordered = [...(payload.data ?? [])].sort(
    (left, right) => (left.index ?? -1) - (right.index ?? -1),
  );
  if (ordered.length !== inputs.length) {
    throw new Error(
      `OpenAI embeddings response returned ${ordered.length} vectors for ${inputs.length} inputs`,
    );
  }
  return ordered.map((item, index) => {
    if (!Array.isArray(item.embedding)) {
      throw new Error(`OpenAI embeddings response is missing vector ${index}`);
    }
    if (item.embedding.length !== config.dimension) {
      throw new Error(
        `OpenAI embedding ${index} has dimension ${item.embedding.length}; expected ${config.dimension}`,
      );
    }
    return item.embedding;
  });
}
