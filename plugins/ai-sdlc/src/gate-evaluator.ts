import { query } from "./database.js";

export type GateName = "requirement" | "implementation";

export async function evaluateGate(
  postgresUrl: string,
  featureId: string,
  gate: GateName,
): Promise<Record<string, unknown>> {
  const rows = await query<{ result: Record<string, unknown> }>(
    postgresUrl,
    `SELECT ai_sdlc.evaluate_gate($1, $2) AS result`,
    [featureId, gate],
  );
  return rows[0].result;
}
