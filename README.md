# AI SDLC runtime bundle

Repository này đóng gói cấu hình runtime cho OpenClaw và các custom subagent của
Codex theo boundary đã thống nhất:

- OpenClaw sở hữu orchestration, canonical workflow state và deterministic gates.
- Codex sở hữu việc thực thi trong từng stage thông qua các agent chuyên trách.
- Business approval và final authority không thuộc về bất kỳ LLM agent nào.

## Thành phần

- `config/openclaw.patch.json5`: patch merge vào cấu hình OpenClaw global.
- `compose.yaml`: PostgreSQL canonical store và Qdrant semantic index.
- `migrations/postgres/`: schema state, artifacts, decisions, approvals, findings,
  outbox và deterministic gates.
- `plugins/ai-sdlc/`: native OpenClaw tools nối TaskFlow với PostgreSQL/Qdrant.
- `codex/agents/`: custom agent profiles được cài vào Codex home của người dùng.
- `openclaw/workspace/`: bootstrap instructions cho OpenClaw control plane.
- `Makefile`: cài tool còn thiếu, cài `@openclaw/codex`, đồng bộ cấu hình và
  quản lý Gateway daemon.

## Triển khai

Xem trước các bước:

```sh
make help
make status
```

Triển khai toàn bộ runtime đã đóng gói:

```sh
make deploy
```

`make deploy` là idempotent: OpenClaw hoặc Codex đã có trên `PATH` sẽ không bị
cài lại. Các file agent/workspace trùng nội dung được bỏ qua; file cùng tên nhưng
khác nội dung làm lệnh dừng để không ghi đè dữ liệu cá nhân. Sau khi review, có
thể cho phép backup rồi thay thế bằng:

```sh
make deploy FORCE=1
```

Không commit token hoặc API key vào repo này. Cấu hình dùng Codex home của người
dùng, nên Codex phải được đăng nhập trước khi Gateway chạy agent turn.

Plugin trust list chỉ cho phép `codex` và `ai-sdlc`; các plugin ngoài bundle
không được tự động nạp chỉ vì được phát hiện trong OpenClaw home.

## Data plane

`make deploy` khởi động PostgreSQL 18.4 và Qdrant 1.19.0 bằng Docker Compose,
áp migration rồi mới cấu hình/restart Gateway. Dữ liệu nằm trong named volumes.
Cổng được publish ra host nhưng chỉ bind loopback:

- PostgreSQL: `127.0.0.1:55432` → container `5432`.
- Qdrant REST/dashboard: `127.0.0.1:6333`.
- Qdrant gRPC: `127.0.0.1:6334`.

Qdrant có API key sinh ngẫu nhiên. `make provision-qdrant` tạo collection RAG
idempotently theo model, vector dimension và distance đã chốt trong `.env`.
Collection hiện hữu nhưng sai contract sẽ làm deploy dừng; bundle không tự xóa
collection hoặc âm thầm rebuild vector.

Plugin dùng cùng embedding contract cho cả index và query. Tài liệu được gửi qua
`ai_sdlc_knowledge_index`; truy vấn text qua `ai_sdlc_knowledge_search` được
embed trước khi tìm trong Qdrant. OpenAI API key chỉ nằm trong runtime `.env` và
khối managed của `~/.openclaw/.env`, không được commit.
