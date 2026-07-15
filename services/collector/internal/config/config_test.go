package config

import (
	"errors"
	"fmt"
	"os"
	"runtime"
	"strings"
	"testing"
)

func environment(values map[string]string) lookupEnvironment {
	return func(name string) (string, bool) {
		value, found := values[name]
		return value, found
	}
}

func TestConfigRejectsMissingAndConflictingSecrets(t *testing.T) {
	_, err := load(environment(map[string]string{}), func(string) ([]byte, error) {
		return nil, errors.New("not used")
	})
	if err == nil || err.Error() != "COLLECTOR_SERVICE_TOKEN is required" {
		t.Fatalf("unexpected missing Secret error: %v", err)
	}

	_, err = load(environment(map[string]string{
		"COLLECTOR_SERVICE_TOKEN":      "t008-test-only-token-not-production",
		"COLLECTOR_SERVICE_TOKEN_FILE": "ignored",
	}), func(string) ([]byte, error) { return nil, nil })
	if err == nil || !strings.Contains(err.Error(), "cannot both be set") {
		t.Fatalf("unexpected conflict error: %v", err)
	}
}

func TestConfigReadsCRLFSecretWithoutTrimmingContent(t *testing.T) {
	configuration, err := load(environment(map[string]string{
		"NODE_ENV":                     "production",
		"COLLECTOR_SERVICE_TOKEN_FILE": "private-location",
	}), func(path string) ([]byte, error) {
		if path != "private-location" {
			t.Fatalf("unexpected path: %q", path)
		}
		return []byte("t008-test-only-token-from-file-not-production\r\n"), nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if configuration.ServiceToken.Reveal() != "t008-test-only-token-from-file-not-production" {
		t.Fatalf("Secret content changed: %q", configuration.ServiceToken.Reveal())
	}
	if configuration.ServiceToken.String() != "[REDACTED]" {
		t.Fatalf("Secret formatting is unsafe: %s", configuration.ServiceToken)
	}
	if rendered := fmt.Sprintf("%#v", configuration); strings.Contains(rendered, configuration.ServiceToken.Reveal()) {
		t.Fatalf("configuration debug output exposed Secret: %q", rendered)
	}
}

func TestConfigDoesNotExposeSecretFilePathOrValue(t *testing.T) {
	path := "private-user-path/collector-token"
	_, err := load(environment(map[string]string{
		"NODE_ENV":                     "production",
		"COLLECTOR_SERVICE_TOKEN_FILE": path,
	}), func(string) ([]byte, error) { return nil, errors.New("read failed") })
	if err == nil {
		t.Fatal("expected read failure")
	}
	if strings.Contains(err.Error(), path) {
		t.Fatalf("error exposed Secret path: %q", err)
	}
}

func TestSecretFileRejectsBroadPermissionsOnProductionPlatforms(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows does not expose Unix Secret file permissions")
	}
	path := t.TempDir() + "/collector-token"
	if err := os.WriteFile(path, []byte("t008-test-only-protected-secret\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := readFile(path); err == nil || !strings.Contains(err.Error(), "permissions") {
		t.Fatalf("expected broad permission rejection, got %v", err)
	}
}

func TestConfigValidatesListenAddressAndTimeout(t *testing.T) {
	values := map[string]string{
		"NODE_ENV":                        "test",
		"COLLECTOR_SERVICE_TOKEN":         "t008-test-only-token-not-production",
		"COLLECTOR_HEALTH_LISTEN_ADDRESS": "192.0.2.1:9090",
	}
	_, err := load(environment(values), func(string) ([]byte, error) { return nil, nil })
	if err == nil || !strings.Contains(err.Error(), "controlled interface") {
		t.Fatalf("unexpected listen error: %v", err)
	}

	values["COLLECTOR_HEALTH_LISTEN_ADDRESS"] = "127.0.0.1:9090"
	values["COLLECTOR_HEALTH_SHUTDOWN_TIMEOUT_MS"] = "0"
	_, err = load(environment(values), func(string) ([]byte, error) { return nil, nil })
	if err == nil || !strings.Contains(err.Error(), "between 1 and 60000") {
		t.Fatalf("unexpected timeout error: %v", err)
	}
}

func TestConfigProductionRequiresSecretFile(t *testing.T) {
	_, err := load(environment(map[string]string{
		"NODE_ENV":                "production",
		"COLLECTOR_SERVICE_TOKEN": "t008-test-only-token-not-production",
	}), func(string) ([]byte, error) { return nil, nil })
	if err == nil || !strings.Contains(err.Error(), "must use COLLECTOR_SERVICE_TOKEN_FILE") {
		t.Fatalf("unexpected production Secret error: %v", err)
	}
}
