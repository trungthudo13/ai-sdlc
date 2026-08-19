# Architecture

```
                              User
                                │
                                ▼
┌─────────────────────────────────────────────────────────────┐
│                    OpenClaw Gateway                         │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                 AI-SDLC Plugin                        │  │
│  │                                                       │  │
│  │  Task Flow Controller                                 │  │
│  │  Artifact schemas                                     │  │
│  │  Decision register                                    │  │
│  │  Deterministic gates                                  │  │
│  │  Agent routing                                        │  │
│  └──────────────────────────┬────────────────────────────┘  │
│                             │                               │
│       ┌─────────────────────┼──────────────────────┐        │
│       ▼                     ▼                      ▼        │
│   BA Agent             Critic Agent         Architect Agent │
│   session riêng        session riêng        session riêng   │
│                                                             │
│                             │                               │
│                             ▼                               │
│                    Codex Implementation                     │
│                    native app-server runtime                │
│                             │                               │
│             ┌───────────────┼────────────────┐              │
│             ▼               ▼                ▼              │
│        Domain Agent   Application Agent   Infra Agent       │
│                                             │               │
│                                      Presentation Agent     │
│                                                             │
│                             │                               │
│                             ▼                               │
│                 Verification / Review Agent                 │
└─────────────────────────────┬───────────────────────────────┘
                              │
          ┌───────────────────┼────────────────────┐
          ▼                   ▼                    ▼
     PostgreSQL             Qdrant                Git
     canonical state        RAG index             worktrees
     decisions              business context      commits/diffs
     approvals
     artifacts
```

## Runtime boundary

OpenClaw là control plane. Nó giữ workflow state, artifact version, decision
register, approval state và quyết định khi nào một stage được phép chạy. Codex
là execution harness bên trong stage; custom agents không tự chuyển workflow
sang stage tiếp theo và không tự phê duyệt output của chính mình.

Implementation gate chỉ được mở khi có đủ bằng chứng:

- Feature design đã được phê duyệt bởi authority bên ngoài agent.
- Blocking decisions đã đóng.
- Domain API, application contracts và infrastructure ports đã rõ.
- Acceptance criteria có thể kiểm thử.
- Task chỉ rõ base revision, workspace và writable paths.

Các agent reasoning trả artifact/report riêng. Các implementation worker chỉ
thay đổi phần được giao. Verification độc lập kiểm tra diff, scope và test result
trước khi control plane cân nhắc chuyển trạng thái.

`ai_sdlc_flow_create` tạo một native managed TaskFlow trong OpenClaw và lưu đúng
`flowId` vào canonical feature state của PostgreSQL. Các artifact là JSON typed,
bất biến theo `(artifactId, version)` và được tham chiếu bằng exact
`contentHash`; outbox là seam dispatch đáng tin cậy, không biến PostgreSQL thành
message broker tổng quát.

Qdrant chỉ là derived semantic index. PostgreSQL vẫn là nguồn đúng cho quyết
định, approval, artifact, finding và workflow event. Collection/vector index
không được provision cho đến khi embedding model cùng vector dimension được chốt;
điều này ngăn việc tạo một index không tương thích rồi phải rebuild âm thầm.
