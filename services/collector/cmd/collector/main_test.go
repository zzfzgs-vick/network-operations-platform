package main

import (
	"bytes"
	"context"
	"strings"
	"testing"
)

func TestRunStopsWhenContextIsCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	var output bytes.Buffer
	if err := run(ctx, nil, &output); err != nil {
		t.Fatalf("run returned an error: %v", err)
	}

	log := output.String()
	if !strings.Contains(log, "collector started version=dev") {
		t.Fatalf("missing start log: %q", log)
	}
	if !strings.Contains(log, "collector stopped") {
		t.Fatalf("missing stop log: %q", log)
	}
}

func TestRunReportsVersion(t *testing.T) {
	var output bytes.Buffer
	if err := run(context.Background(), []string{"--version"}, &output); err != nil {
		t.Fatalf("run returned an error: %v", err)
	}

	if got := output.String(); got != "collector dev\n" {
		t.Fatalf("unexpected version output: %q", got)
	}
}
