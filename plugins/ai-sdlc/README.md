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
- searching an explicitly configured Qdrant collection.

Human approvals and final business decisions are deliberately not exposed as
model-callable tools. They must enter through a trusted operator surface.
