package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/zzfzgs-vick/network-operations-platform/services/collector/internal/observability"
)

const version = "dev"

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := run(ctx, os.Args[1:], os.Stdout); err != nil {
		log.Fatal(err)
	}
}

func run(ctx context.Context, args []string, output io.Writer) error {
	if len(args) == 1 && args[0] == "--version" {
		_, err := fmt.Fprintf(output, "collector %s\n", version)
		return err
	}

	if len(args) > 0 {
		return fmt.Errorf("unknown argument: %s", args[0])
	}

	address := os.Getenv("COLLECTOR_HEALTH_LISTEN_ADDRESS")
	if address == "" {
		address = "127.0.0.1:9090"
	}
	server, err := observability.Start(address, version)
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(output, "collector started version=%s health=%s\n", version, server.Address()); err != nil {
		return err
	}

	select {
	case <-ctx.Done():
	case err := <-server.Done():
		if err != nil {
			return err
		}
	}

	timeout := 2 * time.Second
	if raw := os.Getenv("COLLECTOR_HEALTH_SHUTDOWN_TIMEOUT_MS"); raw != "" {
		milliseconds, err := strconv.Atoi(raw)
		if err != nil || milliseconds < 1 {
			return fmt.Errorf("COLLECTOR_HEALTH_SHUTDOWN_TIMEOUT_MS must be a positive integer")
		}
		timeout = time.Duration(milliseconds) * time.Millisecond
	}
	shutdownContext, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	if err := server.Shutdown(shutdownContext); err != nil {
		return fmt.Errorf("stop Collector health server: %w", err)
	}
	_, err = fmt.Fprintln(output, "collector stopped")
	return err
}
