# AI-SDLC OpenClaw plugin

This native tool plugin is the workflow-domain boundary described by the
repository architecture. It does not replace OpenClaw Task Flow or the Codex
harness.

Flow creation writes both a native managed OpenClaw TaskFlow and its exact
`flowId` into PostgreSQL canonical feature state. PostgreSQL remains canonical;
Qdrant is a derived semantic retrieval index, not an approval authority.

It exposes optional tools for:

- creating a managed feature flow;
- submitting and exact-fetching immutable typed artifacts;
- recording agent-created decision requests and findings;
- evaluating deterministic requirement/implementation gates in PostgreSQL;
- embedding and indexing explicitly versioned knowledge snapshots;
- embedding text queries and searching the configured Qdrant collection.

Knowledge indexing uses the configured OpenAI embedding model and dimension for
both documents and queries. Qdrant collection provisioning rejects an existing
collection with a different dimension or distance instead of rebuilding it
silently. PostgreSQL records the immutable snapshot identity, source manifest,
embedding model, vector size, and content hash; Qdrant remains a derived index.

Human approvals and final business decisions are deliberately not exposed as
model-callable tools. They must enter through a trusted operator surface.

The runtime requires `openaiApiKey`, `embeddingModel`, `embeddingDimension`, and
`qdrantDistance` plugin configuration. Embeddings are created through the OpenAI
`/v1/embeddings` endpoint with an explicit `dimensions` value; an API response
with a different vector length is rejected before Qdrant upsert.
