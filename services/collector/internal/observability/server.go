package observability

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync/atomic"
	"time"
)

type Server struct {
	httpServer *http.Server
	listener   net.Listener
	done       chan error
	startedAt  time.Time
	version    string
	ready      atomic.Bool
}

func Start(address, version string) (*Server, error) {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return nil, fmt.Errorf("invalid Collector health listen address: %w", err)
	}
	if host != "127.0.0.1" && host != "localhost" && host != "::1" && host != "0.0.0.0" {
		return nil, fmt.Errorf("Collector health listen address must use a controlled interface")
	}

	listener, err := net.Listen("tcp", address)
	if err != nil {
		return nil, fmt.Errorf("listen for Collector health: %w", err)
	}
	server := &Server{
		listener:  listener,
		done:      make(chan error, 1),
		startedAt: time.Now().UTC(),
		version:   version,
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health/live", server.health("ALIVE", false))
	mux.HandleFunc("GET /health/ready", server.health("READY", true))
	mux.HandleFunc("GET /metrics", server.metrics)
	server.httpServer = &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 2 * time.Second,
		IdleTimeout:       30 * time.Second,
	}
	server.ready.Store(true)
	go func() {
		err := server.httpServer.Serve(listener)
		if err == http.ErrServerClosed {
			err = nil
		}
		server.done <- err
	}()
	return server, nil
}

func (server *Server) Address() string {
	return server.listener.Addr().String()
}

func (server *Server) Done() <-chan error {
	return server.done
}

func (server *Server) BeginDrain() {
	server.ready.Store(false)
}

func (server *Server) Shutdown(ctx context.Context) error {
	server.BeginDrain()
	return server.httpServer.Shutdown(ctx)
}

func (server *Server) health(readyStatus string, requiresReadiness bool) http.HandlerFunc {
	return func(response http.ResponseWriter, _ *http.Request) {
		response.Header().Set("Content-Type", "application/json")
		status := readyStatus
		code := http.StatusOK
		if requiresReadiness && !server.ready.Load() {
			status = "NOT_READY"
			code = http.StatusServiceUnavailable
		}
		response.WriteHeader(code)
		_ = json.NewEncoder(response).Encode(map[string]string{
			"service":   "collector",
			"status":    status,
			"version":   server.version,
			"startedAt": server.startedAt.Format(time.RFC3339Nano),
		})
	}
}

func (server *Server) metrics(response http.ResponseWriter, _ *http.Request) {
	response.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	up := 0
	if server.ready.Load() {
		up = 1
	}
	version := strings.NewReplacer("\\", "\\\\", "\"", "\\\"").Replace(server.version)
	_, _ = fmt.Fprintf(response, "# HELP nop_collector_up Collector process readiness.\n# TYPE nop_collector_up gauge\nnop_collector_up %d\n# HELP nop_collector_info Collector build information.\n# TYPE nop_collector_info gauge\nnop_collector_info{version=\"%s\"} 1\n", up, version)
}
