import { createHash, randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

export const AUDIT_REDACTED = "[REDACTED]";

const maximumDetailsBytes = 8192;
const maximumDetailsDepth = 4;
const maximumArrayItems = 16;
const maximumObjectFields = 32;
const maximumStringLength = 256;
const allowedDetailFields = new Set([
  "changedFields",
  "metadata",
  "newState",
  "previousState",
  "reasonCategory",
  "references",
]);
const stablePattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u;
const eventTypePattern = /^[A-Z][A-Z0-9_.-]*$/u;
const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const sensitiveKeyFragments = [
  "authorization",
  "authkey",
  "community",
  "connectionstring",
  "cookie",
  "databasepassword",
  "databaseurl",
  "environment",
  "headers",
  "password",
  "passwd",
  "payload",
  "privatekey",
  "privacykey",
  "rawrequest",
  "requestbody",
  "secret",
  "sessiontoken",
  "token",
  "totp",
] as const;
const sensitiveValuePatterns = [
  /\bbearer\s+\S+/iu,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/iu,
  /postgres(?:ql)?:\/\/\S+/iu,
  /\b(?:password|token|secret|cookie)\s*[=:]\s*\S+/iu,
] as const;

export type AuditActorType = "USER" | "SERVICE" | "SYSTEM" | "UNKNOWN";
export type AuditOutcome = "SUCCESS" | "DENIED" | "FAILED";
export type AuditDetailValue =
  string | number | boolean | null | AuditDetails | readonly AuditDetailValue[];
export interface AuditDetails {
  readonly [key: string]: AuditDetailValue;
}

export type AuditActor =
  | { readonly type: "USER" | "SERVICE"; readonly id: string }
  | { readonly type: "SYSTEM" | "UNKNOWN"; readonly id?: string };

export interface AuditContext {
  readonly actor: AuditActor;
  readonly requestId?: string;
  readonly correlationId?: string;
}

export interface AuditEventInput extends AuditContext {
  readonly eventType: string;
  readonly source: string;
  readonly outcome: AuditOutcome;
  readonly failureCategory?: string;
  readonly resource?: {
    readonly type: string;
    readonly id: string;
  };
  readonly idempotencyKey?: string;
  readonly details?: unknown;
}

export interface AuditEvent {
  readonly eventId: string;
  readonly actorType: AuditActorType;
  readonly actorId: string | null;
  readonly eventType: string;
  readonly occurredAt: string;
  readonly source: string;
  readonly outcome: AuditOutcome;
  readonly failureCategory: string | null;
  readonly resourceType: string | null;
  readonly resourceId: string | null;
  readonly requestId: string | null;
  readonly correlationId: string | null;
  readonly details: AuditDetails;
}

export interface AuditCursor {
  readonly occurredAt: string;
  readonly eventId: string;
}

export interface AuditQuery {
  readonly actorType?: AuditActorType;
  readonly eventType?: string;
  readonly outcome?: AuditOutcome;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly correlationId?: string;
  readonly from?: string;
  readonly to?: string;
  readonly cursor?: AuditCursor;
  readonly limit?: number;
}

interface AuditRow {
  readonly event_id: string;
  readonly actor_type: AuditActorType;
  readonly actor_id: string | null;
  readonly event_type: string;
  readonly occurred_at: Date;
  readonly source: string;
  readonly outcome: AuditOutcome;
  readonly failure_category: string | null;
  readonly resource_type: string | null;
  readonly resource_id: string | null;
  readonly request_id: string | null;
  readonly correlation_id: string | null;
  readonly details: AuditDetails;
}

function sensitiveKey(key: string) {
  const normalized = key.toLowerCase().replaceAll(/[^a-z0-9]/gu, "");
  return sensitiveKeyFragments.some((fragment) =>
    normalized.includes(fragment),
  );
}

function plainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

export function sanitizeAuditDetails(input: unknown): {
  readonly details: AuditDetails;
  readonly redactedFieldCount: number;
} {
  if (input === undefined) return { details: {}, redactedFieldCount: 0 };
  if (!plainObject(input)) {
    throw new Error("Audit details must be a plain object");
  }
  for (const key of Object.keys(input)) {
    if (!sensitiveKey(key) && !allowedDetailFields.has(key)) {
      throw new Error("Audit details contain a field outside the allowlist");
    }
  }

  let redactedFieldCount = 0;
  const sanitize = (value: unknown, depth: number): AuditDetailValue => {
    if (depth > maximumDetailsDepth) {
      throw new Error("Audit details exceed the depth limit");
    }
    if (
      value === null ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    ) {
      return value;
    }
    if (typeof value === "string") {
      if (value.length > maximumStringLength) {
        throw new Error("Audit details contain an oversized string");
      }
      if (sensitiveValuePatterns.some((pattern) => pattern.test(value))) {
        redactedFieldCount += 1;
        return AUDIT_REDACTED;
      }
      return value;
    }
    if (Array.isArray(value)) {
      if (value.length > maximumArrayItems) {
        throw new Error("Audit details exceed the array item limit");
      }
      return value.map((item) => sanitize(item, depth + 1));
    }
    if (!plainObject(value)) {
      throw new Error("Audit details contain an unsupported value");
    }
    const entries = Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    if (entries.length > maximumObjectFields) {
      throw new Error("Audit details exceed the field limit");
    }
    const result: Record<string, AuditDetailValue> = {};
    for (const [key, item] of entries) {
      if (
        key.length < 1 ||
        key.length > 64 ||
        !/^[A-Za-z][A-Za-z0-9_.-]*$/u.test(key)
      ) {
        throw new Error("Audit details contain an invalid field name");
      }
      if (sensitiveKey(key)) {
        result[key] = AUDIT_REDACTED;
        redactedFieldCount += 1;
      } else {
        result[key] = sanitize(item, depth + 1);
      }
    }
    return result;
  };

  const details = sanitize(input, 0);
  if (!plainObject(details)) {
    throw new Error("Audit details must be an object");
  }
  if (
    Buffer.byteLength(JSON.stringify(details), "utf8") > maximumDetailsBytes
  ) {
    throw new Error("Audit details exceed the size limit");
  }
  return { details, redactedFieldCount };
}

function boundedStable(
  value: unknown,
  name: string,
  maximum: number,
  pattern = stablePattern,
) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    !pattern.test(value)
  ) {
    throw new Error(`${name} must be a bounded stable value`);
  }
  return value;
}

function validatedInput(input: AuditEventInput) {
  if (
    !(["USER", "SERVICE", "SYSTEM", "UNKNOWN"] as const).includes(
      input.actor.type,
    )
  ) {
    throw new Error("actorType is invalid");
  }
  const actorId =
    "id" in input.actor && input.actor.id !== undefined
      ? boundedStable(input.actor.id, "actorId", 128)
      : null;
  if (
    (input.actor.type === "USER" || input.actor.type === "SERVICE") &&
    !actorId
  ) {
    throw new Error("actorId is required for this actor type");
  }
  if (!(["SUCCESS", "DENIED", "FAILED"] as const).includes(input.outcome)) {
    throw new Error("outcome is invalid");
  }
  const failureCategory =
    input.failureCategory === undefined
      ? null
      : boundedStable(
          input.failureCategory,
          "failureCategory",
          64,
          eventTypePattern,
        );
  if (
    (input.outcome === "SUCCESS" && failureCategory !== null) ||
    (input.outcome !== "SUCCESS" && failureCategory === null)
  ) {
    throw new Error("failureCategory does not match outcome");
  }
  const sanitized = sanitizeAuditDetails(input.details);
  return {
    actorType: input.actor.type,
    actorId,
    eventType: boundedStable(
      input.eventType,
      "eventType",
      128,
      eventTypePattern,
    ),
    source: boundedStable(input.source, "source", 64),
    outcome: input.outcome,
    failureCategory,
    resourceType:
      input.resource === undefined
        ? null
        : boundedStable(input.resource.type, "resourceType", 64),
    resourceId:
      input.resource === undefined
        ? null
        : boundedStable(input.resource.id, "resourceId", 128),
    requestId:
      input.requestId === undefined
        ? null
        : boundedStable(input.requestId, "requestId", 64, requestIdPattern),
    correlationId:
      input.correlationId === undefined
        ? null
        : boundedStable(input.correlationId, "correlationId", 128),
    idempotencyKey:
      input.idempotencyKey === undefined
        ? null
        : boundedStable(input.idempotencyKey, "idempotencyKey", 128),
    ...sanitized,
  } as const;
}

function mapRow(row: AuditRow): AuditEvent {
  return {
    eventId: row.event_id,
    actorType: row.actor_type,
    actorId: row.actor_id,
    eventType: row.event_type,
    occurredAt: row.occurred_at.toISOString(),
    source: row.source,
    outcome: row.outcome,
    failureCategory: row.failure_category,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    requestId: row.request_id,
    correlationId: row.correlation_id,
    details: row.details,
  };
}

export class AuditStore {
  private writesSucceeded = 0;
  private writesFailed = 0;
  private rejectedFieldCount = 0;
  private writeLatencyMsTotal = 0;

  constructor(private readonly pool: Pool) {}

  get metrics() {
    return Object.freeze({
      writesSucceeded: this.writesSucceeded,
      writesFailed: this.writesFailed,
      rejectedFieldCount: this.rejectedFieldCount,
      writeLatencyMsTotal: this.writeLatencyMsTotal,
    });
  }

  async append(client: PoolClient, input: AuditEventInput) {
    const started = performance.now();
    try {
      const value = validatedInput(input);
      this.rejectedFieldCount += value.redactedFieldCount;
      const eventHash = createHash("sha256")
        .update(
          JSON.stringify({
            actorType: value.actorType,
            actorId: value.actorId,
            eventType: value.eventType,
            source: value.source,
            outcome: value.outcome,
            failureCategory: value.failureCategory,
            resourceType: value.resourceType,
            resourceId: value.resourceId,
            requestId: value.requestId,
            correlationId: value.correlationId,
            details: value.details,
          }),
        )
        .digest("hex");
      const eventId = randomUUID();
      const inserted = await client.query<{
        event_id: string;
        occurred_at: Date;
      }>(
        `
          insert into public.audit_events (
            event_id, actor_type, actor_id, event_type, source, outcome,
            failure_category, resource_type, resource_id, request_id,
            correlation_id, idempotency_key, event_hash, details
          ) values (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
          )
          on conflict (source, idempotency_key)
            where idempotency_key is not null
            do nothing
          returning event_id, occurred_at
        `,
        [
          eventId,
          value.actorType,
          value.actorId,
          value.eventType,
          value.source,
          value.outcome,
          value.failureCategory,
          value.resourceType,
          value.resourceId,
          value.requestId,
          value.correlationId,
          value.idempotencyKey,
          eventHash,
          JSON.stringify(value.details),
        ],
      );
      const created = inserted.rows[0];
      if (created) {
        this.writesSucceeded += 1;
        return {
          eventId: created.event_id,
          occurredAt: created.occurred_at.toISOString(),
          created: true,
        } as const;
      }

      const existing = await client.query<{
        event_id: string;
        occurred_at: Date;
        event_hash: string;
      }>(
        `
          select event_id, occurred_at, event_hash
          from public.audit_events
          where source = $1 and idempotency_key = $2
        `,
        [value.source, value.idempotencyKey],
      );
      const row = existing.rows[0];
      if (!row || row.event_hash !== eventHash) {
        throw new Error("Audit idempotency key conflicts with another event");
      }
      this.writesSucceeded += 1;
      return {
        eventId: row.event_id,
        occurredAt: row.occurred_at.toISOString(),
        created: false,
      } as const;
    } catch (error) {
      this.writesFailed += 1;
      throw error;
    } finally {
      this.writeLatencyMsTotal += performance.now() - started;
    }
  }

  async query(query: AuditQuery = {}) {
    const limit = query.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("Audit query limit must be between 1 and 100");
    }
    const conditions: string[] = [];
    const values: unknown[] = [];
    const add = (condition: string, value: unknown) => {
      values.push(value);
      conditions.push(condition.replace("?", `$${values.length}`));
    };
    if (query.actorType !== undefined) {
      if (
        !(["USER", "SERVICE", "SYSTEM", "UNKNOWN"] as const).includes(
          query.actorType,
        )
      ) {
        throw new Error("actorType is invalid");
      }
      add("actor_type = ?", query.actorType);
    }
    if (query.eventType !== undefined) {
      add(
        "event_type = ?",
        boundedStable(query.eventType, "eventType", 128, eventTypePattern),
      );
    }
    if (query.outcome !== undefined) {
      if (!(["SUCCESS", "DENIED", "FAILED"] as const).includes(query.outcome)) {
        throw new Error("outcome is invalid");
      }
      add("outcome = ?", query.outcome);
    }
    if (query.resourceType !== undefined) {
      add(
        "resource_type = ?",
        boundedStable(query.resourceType, "resourceType", 64),
      );
    }
    if (query.resourceId !== undefined) {
      add(
        "resource_id = ?",
        boundedStable(query.resourceId, "resourceId", 128),
      );
    }
    if (query.correlationId !== undefined) {
      add(
        "correlation_id = ?",
        boundedStable(query.correlationId, "correlationId", 128),
      );
    }
    for (const [name, value, operator] of [
      ["from", query.from, ">="],
      ["to", query.to, "<="],
    ] as const) {
      if (value !== undefined) {
        if (Number.isNaN(Date.parse(value))) {
          throw new Error(`${name} must be a timestamp`);
        }
        add(`occurred_at ${operator} ?::timestamptz`, value);
      }
    }
    if (query.cursor !== undefined) {
      if (Number.isNaN(Date.parse(query.cursor.occurredAt))) {
        throw new Error("cursor occurredAt must be a timestamp");
      }
      const eventId = boundedStable(query.cursor.eventId, "cursor eventId", 36);
      values.push(query.cursor.occurredAt, eventId);
      conditions.push(
        `(occurred_at, event_id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`,
      );
    }
    values.push(limit);
    const result = await this.pool.query<AuditRow>(
      `
        select event_id, actor_type, actor_id, event_type, occurred_at, source,
               outcome, failure_category, resource_type, resource_id, request_id,
               correlation_id, details
        from public.audit_events
        ${conditions.length > 0 ? `where ${conditions.join(" and ")}` : ""}
        order by occurred_at desc, event_id desc
        limit $${values.length}
      `,
      values,
    );
    const events = result.rows.map(mapRow);
    const last = events.at(-1);
    return {
      events,
      nextCursor:
        events.length === limit && last
          ? { occurredAt: last.occurredAt, eventId: last.eventId }
          : null,
    } as const;
  }
}
