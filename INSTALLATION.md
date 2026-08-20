# Installation

## Yêu cầu

- Ubuntu 24.04 hoặc môi trường Linux có `bash`, `make` và `curl`.
- Quyền cài user-level service nếu muốn Gateway chạy bằng systemd user.
- Tài khoản Codex đã đăng nhập hoặc có thể đăng nhập sau khi cài.
- Docker Engine và Docker Compose plugin.

OpenClaw hiện tự quản lý Node phù hợp khi cài bằng installer chính thức. Không
cài cố định Node 22 trong repo vì yêu cầu runtime của OpenClaw thay đổi theo bản
phát hành.

## Các target chính

```sh
make status                    # chỉ kiểm kê, không thay đổi global state
make install-tools             # chỉ cài tool còn thiếu
make install-openclaw-plugin   # cài official @openclaw/codex plugin
make data-up                  # chạy PostgreSQL + Qdrant, chờ healthy
make migrate-data             # áp migrations PostgreSQL idempotently
make provision-qdrant         # tạo/kiểm tra collection theo embedding contract
make validate-data            # kiểm tra schema và Qdrant API
make install-ai-sdlc-plugin   # build/test/link native AI-SDLC plugin
make install-codex-agents      # đồng bộ custom agents vào Codex home
make configure-openclaw        # merge config + workspace vào global OpenClaw
make install-daemon            # cài Gateway service (installer có thể tự start)
make deploy                    # chạy toàn bộ các bước trên và verify
make validate                  # kiểm tra package và global runtime hiện tại
```

Lần chạy đầu, `make prepare-runtime` tạo `.env` với password/API key ngẫu nhiên
và quyền `0600`. File này bị Git ignore. Các biến kết nối cần cho Gateway được
đồng bộ vào khối managed trong `~/.openclaw/.env`, cũng với quyền `0600`; biến
không thuộc bundle được giữ nguyên.

Trước `make configure-openclaw` hoặc `make deploy`, điền API key hợp lệ và giữ
nguyên embedding contract đã chốt:

```dotenv
AI_SDLC_QDRANT_EMBEDDING_MODEL=text-embedding-3-large
AI_SDLC_QDRANT_EMBEDDING_DIMENSION=3072
AI_SDLC_QDRANT_DISTANCE=Cosine
AI_SDLC_OPENAI_API_KEY=sk-...
```

`AI_SDLC_OPENAI_API_KEY` là secret runtime, không commit. Model và dimension
phải giống nhau ở lúc index tài liệu và lúc embed câu truy vấn. Nếu cần đổi một
trong các giá trị này sau khi đã có dữ liệu, tạo snapshot/collection mới và
re-index có chủ đích thay vì sửa collection hiện hữu.

PostgreSQL dùng cổng host `55432` vì `5432` thường đã thuộc PostgreSQL khác.
Có thể đổi port trong `.env`, nhưng phải đổi đồng thời `AI_SDLC_POSTGRES_URL`.
Các cổng mặc định chỉ bind `127.0.0.1`. Muốn mở ra LAN cần bổ sung TLS/firewall
và đổi binding một cách chủ động; bundle không tự mở database ra mọi interface.

Quản lý data plane:

```sh
make data-up
make provision-qdrant
make data-logs
make data-down       # không xóa named volumes
```

## Cơ chế cài đặt

Nếu chưa có OpenClaw:

```sh
curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard
```

Nếu chưa có Codex:

```sh
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

Nếu command đã tồn tại trên `PATH`, Makefile báo phiên bản và bỏ qua cài đặt.
OpenClaw config được áp dụng bằng `openclaw config patch`, nên các object không
liên quan như channel, auth và provider hiện có được giữ nguyên.
Các allow-list được merge cộng dồn; bundle chỉ thêm `codex`/`ai-sdlc`, không
xóa plugin hoặc tool đã được người dùng cho phép trước đó.

Plugin AI-SDLC được link từ `plugins/ai-sdlc` để code đã build trong repo là
source of truth, tránh một bản copy global bị cũ. Build chạy TypeScript, unit
tests và validator chính thức của OpenClaw trước khi Gateway restart.
Nếu đã có plugin cùng id nhưng trỏ tới nguồn khác, deploy dừng thay vì thay thế
âm thầm; `FORCE=1` chỉ dùng sau khi đã review nguồn hiện hữu.

Bundle đặt Gateway ở `local`/`loopback` và restart user service sau khi áp patch
để runtime luôn nhận cấu hình mới. Token Gateway được OpenClaw sinh ở lần cài
service đầu tiên và chỉ lưu trong global config; token không đi vào repository.

## Authentication

Bundle đặt `plugins.entries.codex.config.appServer.homeScope` thành `user` để
OpenClaw dùng trực tiếp Codex home, auth, plugins và agent profiles của người
dùng. Kiểm tra trước khi deploy:

```sh
codex login status
```

Nếu chưa đăng nhập, chạy `codex` và hoàn tất luồng đăng nhập tương tác. Makefile
không nhận hay lưu token trong command line.
