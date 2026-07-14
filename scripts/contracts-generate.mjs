import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = resolve(
  repositoryRoot,
  "packages/contracts/schemas/platform-contracts.schema.json",
);
const outputArgument = process.argv.indexOf("--output-root");
const outputRoot =
  outputArgument === -1
    ? resolve(repositoryRoot, "packages/contracts/generated")
    : resolve(process.argv[outputArgument + 1]);

if (outputArgument !== -1 && !process.argv[outputArgument + 1]) {
  throw new Error("--output-root requires a path");
}

const schema = JSON.parse(await readFile(schemaPath, "utf8"));
const definitions = schema.$defs;

if (!definitions || typeof definitions !== "object") {
  throw new Error("Contract schema must define $defs");
}

function referenceName(reference) {
  const prefix = "#/$defs/";
  if (!reference.startsWith(prefix)) {
    throw new Error(`Unsupported schema reference: ${reference}`);
  }
  return reference.slice(prefix.length);
}

function stringValues(definition) {
  if (definition.oneOf) {
    return definition.oneOf.map((entry) => entry.const);
  }
  if (definition.enum) {
    return definition.enum;
  }
  if (definition.const) {
    return [definition.const];
  }
  return undefined;
}

function typescriptType(definition) {
  if (definition.$ref) return referenceName(definition.$ref);
  const values = stringValues(definition);
  if (values) return values.map((value) => JSON.stringify(value)).join(" | ");
  if (definition.type === "string") return "string";
  if (definition.type === "boolean") return "boolean";
  if (definition.type === "array")
    return `ReadonlyArray<${typescriptType(definition.items)}>`;
  throw new Error(
    `Unsupported TypeScript schema: ${JSON.stringify(definition)}`,
  );
}

function generateTypescriptDeclarations() {
  const lines = [
    "// Code generated from schemas/platform-contracts.schema.json. DO NOT EDIT.",
    "",
  ];

  for (const [name, definition] of Object.entries(definitions)) {
    if (definition.type === "object") {
      const required = new Set(definition.required ?? []);
      lines.push(`export interface ${name} {`);
      for (const [property, propertyDefinition] of Object.entries(
        definition.properties ?? {},
      )) {
        const optional = required.has(property) ? "" : "?";
        lines.push(
          `  readonly ${property}${optional}: ${typescriptType(propertyDefinition)};`,
        );
      }
      lines.push("}", "");
      continue;
    }

    lines.push(`export type ${name} = ${typescriptType(definition)};`, "");
  }

  lines.push(
    "export interface ErrorDefinition {",
    "  readonly httpStatus: number;",
    "  readonly retryable: boolean;",
    "  readonly defaultMessage: string;",
    "}",
    "",
    "export const CONTRACT_VERSION: ContractVersion;",
    "export const ERROR_DEFINITIONS: Readonly<Record<ErrorCode, ErrorDefinition>>;",
    "export function isValidRequestId(value: unknown): value is RequestId;",
    "export function errorCodeForHttpStatus(status: number): ErrorCode;",
    "export function createErrorResponse(input: {",
    "  readonly code: ErrorCode;",
    "  readonly requestId?: RequestId;",
    "  readonly details?: ReadonlyArray<ErrorDetail>;",
    "  readonly fieldErrors?: ReadonlyArray<FieldError>;",
    "}): ErrorResponse;",
    "",
  );

  return lines.join("\n");
}

function generateTypescriptRuntime() {
  const contractVersion = definitions.ContractVersion.const;
  const requestId = definitions.RequestId;
  const entries = definitions.ErrorCode.oneOf;
  const errorDefinitions = Object.fromEntries(
    entries.map((entry) => [
      entry.const,
      {
        httpStatus: entry["x-http-status"],
        retryable: entry["x-retryable"],
        defaultMessage: entry["x-default-message"],
      },
    ]),
  );
  const byStatus = Object.fromEntries(
    entries.map((entry) => [entry["x-http-status"], entry.const]),
  );

  return `// Code generated from schemas/platform-contracts.schema.json. DO NOT EDIT.

export const CONTRACT_VERSION = ${JSON.stringify(contractVersion)};
export const ERROR_DEFINITIONS = Object.freeze(${JSON.stringify(errorDefinitions, null, 2)});

const ERROR_CODE_BY_HTTP_STATUS = Object.freeze(${JSON.stringify(byStatus, null, 2)});
const REQUEST_ID_PATTERN = ${new RegExp(requestId.pattern)};

export function isValidRequestId(value) {
  return (
    typeof value === "string" &&
    value.length >= ${requestId.minLength} &&
    value.length <= ${requestId.maxLength} &&
    REQUEST_ID_PATTERN.test(value)
  );
}

export function errorCodeForHttpStatus(status) {
  return (
    ERROR_CODE_BY_HTTP_STATUS[status] ??
    (status >= 500 ? "PLATFORM_INTERNAL_ERROR" : "PLATFORM_VALIDATION_FAILED")
  );
}

export function createErrorResponse({ code, requestId, details, fieldErrors }) {
  const definition = ERROR_DEFINITIONS[code] ?? ERROR_DEFINITIONS.PLATFORM_INTERNAL_ERROR;
  const error = {
    code: ERROR_DEFINITIONS[code] ? code : "PLATFORM_INTERNAL_ERROR",
    message: definition.defaultMessage,
    retryable: definition.retryable,
  };

  if (requestId !== undefined) error.requestId = requestId;
  if (details !== undefined) error.details = details;
  if (fieldErrors !== undefined) error.fieldErrors = fieldErrors;

  return { contractVersion: CONTRACT_VERSION, error };
}
`;
}

function goName(value) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function goIdentifier(value) {
  const exported = value.charAt(0).toUpperCase() + value.slice(1);
  return exported.replace(/Id$/u, "ID");
}

function goType(definition, required) {
  if (definition.$ref) {
    const name = goIdentifier(referenceName(definition.$ref));
    return required ? name : `*${name}`;
  }
  if (definition.type === "string") return required ? "string" : "*string";
  if (definition.type === "boolean") return required ? "bool" : "*bool";
  if (definition.type === "array") {
    return `[]${goType(definition.items, true)}`;
  }
  throw new Error(`Unsupported Go schema: ${JSON.stringify(definition)}`);
}

function generateGo() {
  const lines = [
    "// Code generated from schemas/platform-contracts.schema.json. DO NOT EDIT.",
    "package contracts",
    "",
  ];

  for (const [name, definition] of Object.entries(definitions)) {
    const generatedName = goIdentifier(name);
    if (definition.type === "object") {
      const required = new Set(definition.required ?? []);
      lines.push(`type ${generatedName} struct {`);
      for (const [property, propertyDefinition] of Object.entries(
        definition.properties ?? {},
      )) {
        const isRequired = required.has(property);
        const omitEmpty = isRequired ? "" : ",omitempty";
        lines.push(
          `\t${goIdentifier(property)} ${goType(propertyDefinition, isRequired)} \`json:"${property}${omitEmpty}"\``,
        );
      }
      lines.push("}", "");
      continue;
    }

    lines.push(`type ${generatedName} string`, "");
    const values = stringValues(definition);
    if (values) {
      lines.push("const (");
      for (const value of values) {
        lines.push(
          `\t${generatedName}${goName(value)} ${generatedName} = ${JSON.stringify(value)}`,
        );
      }
      lines.push(")", "");
    }
  }

  return `${lines.join("\n")}\n`;
}

async function write(relativePath, content) {
  const path = resolve(outputRoot, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

await write("typescript/index.d.ts", generateTypescriptDeclarations());
await write("typescript/index.js", generateTypescriptRuntime());
const goPath = resolve(outputRoot, "go/contracts.go");
await write("go/contracts.go", generateGo());

const gofmt = spawnSync(process.env.GOFMT ?? "gofmt", ["-w", goPath], {
  encoding: "utf8",
});
if (gofmt.status !== 0) {
  throw new Error(gofmt.stderr || "gofmt failed");
}
