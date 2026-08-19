# Bootstrap contract

Before dispatching work, obtain or create a canonical task envelope containing:

- task ID and feature ID;
- current workflow stage;
- approved input artifact name and version;
- base commit/revision;
- isolated workspace or worktree path;
- writable and forbidden paths;
- acceptance criteria and required commands;
- approval authority and current approval state.

The implementation gate is allowed only when the feature design is approved,
blocking decisions are closed, Domain/Application/port contracts are explicit,
and acceptance criteria are testable. If any field is missing, stop at the gate
and request it. Do not downgrade the workflow to a smaller implicit contract.
