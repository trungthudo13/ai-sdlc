#!/usr/bin/env bash
set -euo pipefail

repo_root=${1:?usage: prepare-runtime-env.sh REPO_ROOT}
env_file="$repo_root/.env"

if [[ -e "$env_file" ]]; then
  echo "Runtime secrets already exist at $env_file; leaving unchanged."
  exit 0
fi

command -v openssl >/dev/null 2>&1 || {
  echo "openssl is required to generate runtime secrets" >&2
  exit 1
}

umask 077
postgres_password=$(openssl rand -hex 32)
qdrant_api_key=$(openssl rand -hex 32)

{
  echo "AI_SDLC_POSTGRES_USER=ai_sdlc"
  echo "AI_SDLC_POSTGRES_PASSWORD=$postgres_password"
  echo "AI_SDLC_POSTGRES_DB=ai_sdlc"
  echo "AI_SDLC_POSTGRES_PORT=55432"
  echo "AI_SDLC_POSTGRES_URL=postgresql://ai_sdlc:$postgres_password@127.0.0.1:55432/ai_sdlc"
  echo "AI_SDLC_QDRANT_API_KEY=$qdrant_api_key"
  echo "AI_SDLC_QDRANT_URL=http://127.0.0.1:6333"
  echo "AI_SDLC_QDRANT_HTTP_PORT=6333"
  echo "AI_SDLC_QDRANT_GRPC_PORT=6334"
  echo "AI_SDLC_QDRANT_COLLECTION=ai_sdlc_knowledge"
  echo "AI_SDLC_QDRANT_EMBEDDING_MODEL=text-embedding-3-large"
  echo "AI_SDLC_QDRANT_EMBEDDING_DIMENSION=3072"
  echo "AI_SDLC_QDRANT_DISTANCE=Cosine"
  echo "AI_SDLC_OPENAI_API_KEY="
} >"$env_file"

chmod 600 "$env_file"
echo "Generated local runtime secrets at $env_file."
