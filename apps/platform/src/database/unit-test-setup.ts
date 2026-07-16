process.env.NODE_ENV = "test";
process.env.DATABASE_STARTUP_CHECK = "disabled";
process.env.COLLECTOR_SERVICE_TOKEN ??=
  "t008-test-only-collector-token-not-production";
process.env.VMALERT_SERVICE_TOKEN ??=
  "t008-test-only-vmalert-token-not-production";
process.env.TOTP_ENCRYPTION_KEY ??=
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
