package config

import (
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

const maxSecretBytes = 4096

type Secret struct {
	value string
}

func (secret Secret) Reveal() string { return secret.value }
func (Secret) String() string        { return "[REDACTED]" }
func (Secret) GoString() string      { return "[REDACTED]" }

type Config struct {
	HealthListenAddress   string
	HealthShutdownTimeout time.Duration
	ServiceToken          Secret
}

type lookupEnvironment func(string) (string, bool)
type readSecretFile func(string) ([]byte, error)

func readFile(path string) ([]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	metadata, err := file.Stat()
	if err != nil {
		return nil, err
	}
	if runtime.GOOS != "windows" && metadata.Mode().Perm()&0o077 != 0 {
		return nil, errors.New("Secret file permissions are too broad")
	}
	return io.ReadAll(io.LimitReader(file, maxSecretBytes+1))
}

func trimOneLineEnding(value string) string {
	if strings.HasSuffix(value, "\r\n") {
		return strings.TrimSuffix(value, "\r\n")
	}
	return strings.TrimSuffix(value, "\n")
}

func environmentName(lookup lookupEnvironment) (string, error) {
	value, found := lookup("NODE_ENV")
	if !found || value == "" {
		return "development", nil
	}
	if value != "development" && value != "test" && value != "production" {
		return "", errors.New("NODE_ENV must be development, test, or production")
	}
	return value, nil
}

func secret(lookup lookupEnvironment, read readSecretFile, name string) (Secret, error) {
	direct, hasDirect := lookup(name)
	fileName := name + "_FILE"
	path, hasFile := lookup(fileName)
	if hasDirect && hasFile {
		return Secret{}, fmt.Errorf("%s and %s cannot both be set", name, fileName)
	}
	if !hasDirect && !hasFile {
		return Secret{}, fmt.Errorf("%s is required", name)
	}
	environment, err := environmentName(lookup)
	if err != nil {
		return Secret{}, err
	}
	if hasDirect && environment == "production" {
		return Secret{}, fmt.Errorf("%s must use %s in production", name, fileName)
	}
	value := direct
	if hasFile {
		content, readError := read(path)
		if readError != nil {
			return Secret{}, fmt.Errorf("%s could not be read", fileName)
		}
		if len(content) > maxSecretBytes {
			return Secret{}, fmt.Errorf("%s exceeds %d bytes", fileName, maxSecretBytes)
		}
		if !utf8.Valid(content) {
			return Secret{}, fmt.Errorf("%s must contain UTF-8", fileName)
		}
		value = trimOneLineEnding(string(content))
	}
	if len([]byte(value)) > maxSecretBytes {
		return Secret{}, fmt.Errorf("%s exceeds %d bytes", name, maxSecretBytes)
	}
	if strings.TrimSpace(value) == "" {
		return Secret{}, fmt.Errorf("%s must not be empty", name)
	}
	return Secret{value: value}, nil
}

func serviceToken(lookup lookupEnvironment, read readSecretFile) (Secret, error) {
	token, err := secret(lookup, read, "COLLECTOR_SERVICE_TOKEN")
	if err != nil {
		return Secret{}, err
	}
	value := token.Reveal()
	if len(value) < 32 || len(value) > 512 {
		return Secret{}, errors.New("COLLECTOR_SERVICE_TOKEN must be a bounded opaque token")
	}
	for _, character := range value {
		if !((character >= 'a' && character <= 'z') ||
			(character >= 'A' && character <= 'Z') ||
			(character >= '0' && character <= '9') ||
			strings.ContainsRune("._~-", character)) {
			return Secret{}, errors.New("COLLECTOR_SERVICE_TOKEN must be a bounded opaque token")
		}
	}
	return token, nil
}

func positiveMilliseconds(lookup lookupEnvironment, name string, fallback int) (time.Duration, error) {
	raw, found := lookup(name)
	if !found {
		raw = strconv.Itoa(fallback)
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < 1 || value > 60000 {
		return 0, fmt.Errorf("%s must be an integer between 1 and 60000", name)
	}
	return time.Duration(value) * time.Millisecond, nil
}

func listenAddress(lookup lookupEnvironment) (string, error) {
	address, found := lookup("COLLECTOR_HEALTH_LISTEN_ADDRESS")
	if !found || address == "" {
		address = "127.0.0.1:9090"
	}
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return "", errors.New("COLLECTOR_HEALTH_LISTEN_ADDRESS must be a valid host and port")
	}
	if host != "127.0.0.1" && host != "localhost" && host != "::1" && host != "0.0.0.0" {
		return "", errors.New("COLLECTOR_HEALTH_LISTEN_ADDRESS must use a controlled interface")
	}
	return address, nil
}

func load(lookup lookupEnvironment, read readSecretFile) (Config, error) {
	address, err := listenAddress(lookup)
	if err != nil {
		return Config{}, err
	}
	timeout, err := positiveMilliseconds(lookup, "COLLECTOR_HEALTH_SHUTDOWN_TIMEOUT_MS", 2000)
	if err != nil {
		return Config{}, err
	}
	token, err := serviceToken(lookup, read)
	if err != nil {
		return Config{}, err
	}
	return Config{
		HealthListenAddress:   address,
		HealthShutdownTimeout: timeout,
		ServiceToken:          token,
	}, nil
}

func Load() (Config, error) {
	return load(os.LookupEnv, readFile)
}
