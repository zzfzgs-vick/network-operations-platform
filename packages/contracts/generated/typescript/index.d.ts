// Code generated from schemas/platform-contracts.schema.json. DO NOT EDIT.

export type ContractVersion = "v1";

export type RequestId = string;

export type CorrelationId = string;

export type StableId = string;

export type UtcTimestamp = string;

export type ErrorCode = "PLATFORM_VALIDATION_FAILED" | "PLATFORM_UNAUTHENTICATED" | "PLATFORM_FORBIDDEN" | "PLATFORM_NOT_FOUND" | "PLATFORM_CONFLICT" | "PLATFORM_RATE_LIMITED" | "PLATFORM_UNAVAILABLE" | "PLATFORM_INTERNAL_ERROR";

export interface ErrorDetail {
  readonly key: string;
  readonly value: string;
}

export interface FieldError {
  readonly field: string;
  readonly message: string;
}

export interface PlatformError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly requestId?: RequestId;
  readonly details?: ReadonlyArray<ErrorDetail>;
  readonly fieldErrors?: ReadonlyArray<FieldError>;
}

export interface ErrorResponse {
  readonly contractVersion: ContractVersion;
  readonly error: PlatformError;
}

export type RuntimeHealthStatus = "READY" | "NOT_READY";

export interface RuntimeHealthResponse {
  readonly contractVersion: ContractVersion;
  readonly service: string;
  readonly version: string;
  readonly status: RuntimeHealthStatus;
  readonly requestId?: RequestId;
}

export type SessionLifecycleEventType = "CONNECTED" | "CLOSED";

export type SessionClosureReason = "UNAUTHENTICATED" | "IDLE_EXPIRED" | "ABSOLUTE_EXPIRED" | "REVOKED" | "AUTHORIZATION_CHANGED" | "CREDENTIAL_CHANGED" | "UNAVAILABLE";

export interface SessionLifecycleEvent {
  readonly contractVersion: ContractVersion;
  readonly event: SessionLifecycleEventType;
  readonly reason?: SessionClosureReason;
  readonly occurredAt: UtcTimestamp;
  readonly lastSuccessfulAt?: UtcTimestamp;
  readonly stale: boolean;
  readonly reauthenticationRequired: boolean;
}

export type FailureClassification = "TRANSIENT" | "PERMANENT" | "VALIDATION" | "VERSION_MISMATCH" | "UNAVAILABLE" | "UNKNOWN";

export interface InternalFailure {
  readonly classification: FailureClassification;
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

export interface InternalBatchItemEnvelope {
  readonly itemId: StableId;
  readonly correlationId?: CorrelationId;
  readonly observedAt: UtcTimestamp;
  readonly failure?: InternalFailure;
}

export interface InternalBatchEnvelope {
  readonly protocolVersion: ContractVersion;
  readonly sourceId: StableId;
  readonly batchId: StableId;
  readonly submittedAt: UtcTimestamp;
  readonly items: ReadonlyArray<InternalBatchItemEnvelope>;
}

export interface ErrorDefinition {
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly defaultMessage: string;
}

export const CONTRACT_VERSION: ContractVersion;
export const ERROR_DEFINITIONS: Readonly<Record<ErrorCode, ErrorDefinition>>;
export function isValidRequestId(value: unknown): value is RequestId;
export function errorCodeForHttpStatus(status: number): ErrorCode;
export function createErrorResponse(input: {
  readonly code: ErrorCode;
  readonly requestId?: RequestId;
  readonly details?: ReadonlyArray<ErrorDetail>;
  readonly fieldErrors?: ReadonlyArray<FieldError>;
}): ErrorResponse;
