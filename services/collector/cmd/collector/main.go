package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"os/signal"
	"syscall"
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

	if _, err := fmt.Fprintf(output, "collector started version=%s\n", version); err != nil {
		return err
	}

	<-ctx.Done()
	_, err := fmt.Fprintln(output, "collector stopped")
	return err
}
