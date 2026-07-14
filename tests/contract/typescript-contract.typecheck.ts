import {
  CONTRACT_VERSION,
  type ErrorResponse,
  type InternalBatchEnvelope,
} from "@nop/contracts";

const errorResponse: ErrorResponse = {
  contractVersion: CONTRACT_VERSION,
  error: {
    code: "PLATFORM_INTERNAL_ERROR",
    message: "An internal error occurred",
    retryable: false,
  },
};

const internalBatch: InternalBatchEnvelope = {
  protocolVersion: CONTRACT_VERSION,
  sourceId: "central-default",
  batchId: "batch-1",
  submittedAt: "2026-07-14T00:00:00Z",
  items: [{ itemId: "item-1", observedAt: "2026-07-14T00:00:00Z" }],
};

void errorResponse;
void internalBatch;
