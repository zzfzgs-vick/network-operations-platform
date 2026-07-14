package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestRunStopsWhenContextIsCancelled(t *testing.T) {
	t.Setenv("COLLECTOR_HEALTH_LISTEN_ADDRESS", "127.0.0.1:0")
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

func TestHealthEndpointUsesTheRealCollectorLifecycle(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	address := listener.Addr().String()
	if err := listener.Close(); err != nil {
		t.Fatal(err)
	}
	t.Setenv("COLLECTOR_HEALTH_LISTEN_ADDRESS", address)

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- run(ctx, nil, &bytes.Buffer{})
	}()

	client := http.Client{Timeout: time.Second}
	url := fmt.Sprintf("http://%s/health/ready", address)
	var response *http.Response
	for attempt := 0; attempt < 50; attempt++ {
		response, err = client.Get(url)
		if err == nil {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if err != nil {
		cancel()
		t.Fatalf("collector health did not start: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("health status = %d", response.StatusCode)
	}
	var health struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(response.Body).Decode(&health); err != nil {
		t.Fatal(err)
	}
	if health.Status != "READY" {
		t.Fatalf("health status body = %q", health.Status)
	}

	metrics, err := client.Get(fmt.Sprintf("http://%s/metrics", address))
	if err != nil {
		t.Fatal(err)
	}
	defer metrics.Body.Close()
	buffer := new(bytes.Buffer)
	if _, err := buffer.ReadFrom(metrics.Body); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(buffer.String(), "# HELP nop_collector_up") {
		t.Fatalf("collector metrics missing metadata: %q", buffer.String())
	}

	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("collector stopped with error: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("collector did not stop")
	}
	if _, err := client.Get(url); err == nil {
		t.Fatal("collector still reports health after shutdown")
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
