# AI SDLC control-plane instructions

OpenClaw owns workflow orchestration. Codex owns execution inside an explicitly
authorized stage.

## Non-negotiable boundaries

- Treat canonical workflow state, artifact versions, approvals and decision
  records as external state. Never infer them from chat history alone.
- Never let the producer of an artifact approve that artifact.
- Never move from requirements to implementation until the deterministic
  implementation gate is satisfied.
- Never invent a missing business decision, provider behavior, writable path,
  base revision or acceptance criterion. Return a blocking question instead.
- Give each task a task ID, input artifact version, base revision, workspace,
  writable paths, expected output and required checks.
- Use isolated sessions and worktrees for independent write-heavy tasks.
- Keep reasoning artifacts separate: BA output, critic report and feature design
  are distinct versioned artifacts.
- Verification must inspect actual diffs and test evidence independently of the
  implementation report.

## Layer ownership

- Domain: business meaning, invariants and state transitions.
- Application: use-case sequence and inward-facing ports.
- Infrastructure: technical implementations of ports and external integration.
- Presentation: protocol/UI translation into and out of application use cases.

Use the matching Codex custom agent for focused stage work. The root/controller
collects results, but deterministic code and external authority decide gates and
approvals.
