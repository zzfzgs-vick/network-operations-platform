// Code generated from schemas/platform-contracts.schema.json. DO NOT EDIT.
package contracts

type ContractVersion string

const (
	ContractVersionV1 ContractVersion = "v1"
)

type RequestID string

type CorrelationID string

type StableID string

type UtcTimestamp string

type ErrorCode string

const (
	ErrorCodePlatformValidationFailed ErrorCode = "PLATFORM_VALIDATION_FAILED"
	ErrorCodePlatformUnauthenticated  ErrorCode = "PLATFORM_UNAUTHENTICATED"
	ErrorCodePlatformForbidden        ErrorCode = "PLATFORM_FORBIDDEN"
	ErrorCodePlatformNotFound         ErrorCode = "PLATFORM_NOT_FOUND"
	ErrorCodePlatformConflict         ErrorCode = "PLATFORM_CONFLICT"
	ErrorCodePlatformRateLimited      ErrorCode = "PLATFORM_RATE_LIMITED"
	ErrorCodePlatformUnavailable      ErrorCode = "PLATFORM_UNAVAILABLE"
	ErrorCodePlatformInternalError    ErrorCode = "PLATFORM_INTERNAL_ERROR"
)

type ErrorDetail struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type FieldError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

type PlatformError struct {
	Code        ErrorCode     `json:"code"`
	Message     string        `json:"message"`
	Retryable   bool          `json:"retryable"`
	RequestID   *RequestID    `json:"requestId,omitempty"`
	Details     []ErrorDetail `json:"details,omitempty"`
	FieldErrors []FieldError  `json:"fieldErrors,omitempty"`
}

type ErrorResponse struct {
	ContractVersion ContractVersion `json:"contractVersion"`
	Error           PlatformError   `json:"error"`
}

type RuntimeHealthStatus string

const (
	RuntimeHealthStatusReady    RuntimeHealthStatus = "READY"
	RuntimeHealthStatusNotReady RuntimeHealthStatus = "NOT_READY"
)

type RuntimeHealthResponse struct {
	ContractVersion ContractVersion     `json:"contractVersion"`
	Service         string              `json:"service"`
	Version         string              `json:"version"`
	Status          RuntimeHealthStatus `json:"status"`
	RequestID       *RequestID          `json:"requestId,omitempty"`
}

type SessionLifecycleEventType string

const (
	SessionLifecycleEventTypeConnected SessionLifecycleEventType = "CONNECTED"
	SessionLifecycleEventTypeClosed    SessionLifecycleEventType = "CLOSED"
)

type SessionClosureReason string

const (
	SessionClosureReasonUnauthenticated      SessionClosureReason = "UNAUTHENTICATED"
	SessionClosureReasonIdleExpired          SessionClosureReason = "IDLE_EXPIRED"
	SessionClosureReasonAbsoluteExpired      SessionClosureReason = "ABSOLUTE_EXPIRED"
	SessionClosureReasonRevoked              SessionClosureReason = "REVOKED"
	SessionClosureReasonAuthorizationChanged SessionClosureReason = "AUTHORIZATION_CHANGED"
	SessionClosureReasonCredentialChanged    SessionClosureReason = "CREDENTIAL_CHANGED"
	SessionClosureReasonUnavailable          SessionClosureReason = "UNAVAILABLE"
)

type SessionLifecycleEvent struct {
	ContractVersion          ContractVersion           `json:"contractVersion"`
	Event                    SessionLifecycleEventType `json:"event"`
	Reason                   *SessionClosureReason     `json:"reason,omitempty"`
	OccurredAt               UtcTimestamp              `json:"occurredAt"`
	LastSuccessfulAt         *UtcTimestamp             `json:"lastSuccessfulAt,omitempty"`
	Stale                    bool                      `json:"stale"`
	ReauthenticationRequired bool                      `json:"reauthenticationRequired"`
}

type FailureClassification string

const (
	FailureClassificationTransient       FailureClassification = "TRANSIENT"
	FailureClassificationPermanent       FailureClassification = "PERMANENT"
	FailureClassificationValidation      FailureClassification = "VALIDATION"
	FailureClassificationVersionMismatch FailureClassification = "VERSION_MISMATCH"
	FailureClassificationUnavailable     FailureClassification = "UNAVAILABLE"
	FailureClassificationUnknown         FailureClassification = "UNKNOWN"
)

type InternalFailure struct {
	Classification FailureClassification `json:"classification"`
	Code           string                `json:"code"`
	Message        string                `json:"message"`
	Retryable      bool                  `json:"retryable"`
}

type InternalBatchItemEnvelope struct {
	ItemID        StableID         `json:"itemId"`
	CorrelationID *CorrelationID   `json:"correlationId,omitempty"`
	ObservedAt    UtcTimestamp     `json:"observedAt"`
	Failure       *InternalFailure `json:"failure,omitempty"`
}

type InternalBatchEnvelope struct {
	ProtocolVersion ContractVersion             `json:"protocolVersion"`
	SourceID        StableID                    `json:"sourceId"`
	BatchID         StableID                    `json:"batchId"`
	SubmittedAt     UtcTimestamp                `json:"submittedAt"`
	Items           []InternalBatchItemEnvelope `json:"items"`
}
