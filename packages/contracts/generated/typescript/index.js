// Code generated from schemas/platform-contracts.schema.json. DO NOT EDIT.

export const CONTRACT_VERSION = "v1";
export const ERROR_DEFINITIONS = Object.freeze({
  "PLATFORM_VALIDATION_FAILED": {
    "httpStatus": 400,
    "retryable": false,
    "defaultMessage": "Request validation failed"
  },
  "PLATFORM_UNAUTHENTICATED": {
    "httpStatus": 401,
    "retryable": false,
    "defaultMessage": "Authentication is required"
  },
  "PLATFORM_FORBIDDEN": {
    "httpStatus": 403,
    "retryable": false,
    "defaultMessage": "Access is forbidden"
  },
  "PLATFORM_NOT_FOUND": {
    "httpStatus": 404,
    "retryable": false,
    "defaultMessage": "The requested resource was not found"
  },
  "PLATFORM_CONFLICT": {
    "httpStatus": 409,
    "retryable": false,
    "defaultMessage": "The request conflicts with current state"
  },
  "PLATFORM_RATE_LIMITED": {
    "httpStatus": 429,
    "retryable": true,
    "defaultMessage": "Too many requests"
  },
  "PLATFORM_UNAVAILABLE": {
    "httpStatus": 503,
    "retryable": true,
    "defaultMessage": "The service is temporarily unavailable"
  },
  "PLATFORM_INTERNAL_ERROR": {
    "httpStatus": 500,
    "retryable": false,
    "defaultMessage": "An internal error occurred"
  }
});

const ERROR_CODE_BY_HTTP_STATUS = Object.freeze({
  "400": "PLATFORM_VALIDATION_FAILED",
  "401": "PLATFORM_UNAUTHENTICATED",
  "403": "PLATFORM_FORBIDDEN",
  "404": "PLATFORM_NOT_FOUND",
  "409": "PLATFORM_CONFLICT",
  "429": "PLATFORM_RATE_LIMITED",
  "500": "PLATFORM_INTERNAL_ERROR",
  "503": "PLATFORM_UNAVAILABLE"
});
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function isValidRequestId(value) {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 64 &&
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
