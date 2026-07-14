package contract_test

import (
	"encoding/json"
	"strings"
	"testing"

	contracts "github.com/zzfzgs-vick/network-operations-platform/packages/contracts/generated/go"
)

func TestGoErrorEnvelopeUsesStableJSONFields(t *testing.T) {
	requestID := contracts.RequestID("request-123")
	response := contracts.ErrorResponse{
		ContractVersion: contracts.ContractVersionV1,
		Error: contracts.PlatformError{
			Code:      contracts.ErrorCodePlatformNotFound,
			Message:   "The requested resource was not found",
			Retryable: false,
			RequestID: &requestID,
		},
	}

	encoded, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("marshal error response: %v", err)
	}

	for _, field := range []string{`"contractVersion":"v1"`, `"requestId":"request-123"`, `"code":"PLATFORM_NOT_FOUND"`} {
		if !strings.Contains(string(encoded), field) {
			t.Fatalf("generated JSON is missing %s: %s", field, encoded)
		}
	}
}

func TestGoBatchEnvelopeToleratesUnknownOptionalFields(t *testing.T) {
	payload := []byte(`{
		"protocolVersion":"v1",
		"sourceId":"central-default",
		"batchId":"batch-1",
		"submittedAt":"2026-07-14T00:00:00Z",
		"items":[{"itemId":"item-1","observedAt":"2026-07-14T00:00:00Z","futureField":true}],
		"futureEnvelopeField":"ignored"
	}`)
	var envelope contracts.InternalBatchEnvelope

	if err := json.Unmarshal(payload, &envelope); err != nil {
		t.Fatalf("unmarshal compatible envelope: %v", err)
	}
	if envelope.ProtocolVersion != contracts.ContractVersionV1 {
		t.Fatalf("unexpected protocol version: %q", envelope.ProtocolVersion)
	}
	if len(envelope.Items) != 1 || envelope.Items[0].ItemID != "item-1" {
		t.Fatalf("unexpected items: %#v", envelope.Items)
	}
}
