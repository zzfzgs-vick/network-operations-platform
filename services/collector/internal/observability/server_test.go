package observability

import (
	"context"
	"net/http"
	"testing"
	"time"
)

func TestDrainSeparatesReadinessFromLivenessAndReleasesTheListener(t *testing.T) {
	server, err := Start("127.0.0.1:0", "test")
	if err != nil {
		t.Fatal(err)
	}
	client := http.Client{Timeout: time.Second}
	baseURL := "http://" + server.Address()

	server.BeginDrain()
	ready, err := client.Get(baseURL + "/health/ready")
	if err != nil {
		t.Fatal(err)
	}
	ready.Body.Close()
	if ready.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("readiness status = %d", ready.StatusCode)
	}
	live, err := client.Get(baseURL + "/health/live")
	if err != nil {
		t.Fatal(err)
	}
	live.Body.Close()
	if live.StatusCode != http.StatusOK {
		t.Fatalf("liveness status = %d", live.StatusCode)
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := client.Get(baseURL + "/health/live"); err == nil {
		t.Fatal("Collector listener remains reachable after shutdown")
	}
}
