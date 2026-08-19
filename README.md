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

Qdrant có API key sinh ngẫu nhiên. Collection RAG chỉ nên được tạo sau khi chốt
embedding model và vector dimension; bundle không tự đoán hai giá trị này.
