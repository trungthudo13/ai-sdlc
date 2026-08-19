import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Ajv, type ValidateFunction } from "ajv";

const schemaDirectory = fileURLToPath(new URL("../schemas/", import.meta.url));
const validators = new Map<string, ValidateFunction>();
const ajv = new Ajv({ allErrors: true, strict: true });

for (const fileName of readdirSync(schemaDirectory)) {
  if (!fileName.endsWith(".json")) continue;
  const schema = JSON.parse(
    readFileSync(`${schemaDirectory}/${fileName}`, "utf8"),
  ) as { $id?: string };
  if (!schema.$id) {
    throw new Error(`schema ${fileName} is missing $id`);
  }
  validators.set(schema.$id, ajv.compile(schema));
}

export function validateArtifactPayload(schemaName: string, payload: unknown): void {
  const validate = validators.get(schemaName);
  if (!validate) {
    throw new Error(`unsupported artifact schema: ${schemaName}`);
  }
  if (!validate(payload)) {
    throw new Error(
      `artifact payload does not match ${schemaName}: ${ajv.errorsText(validate.errors)}`,
    );
  }
}

export function listArtifactSchemas(): string[] {
  return [...validators.keys()].sort();
}
