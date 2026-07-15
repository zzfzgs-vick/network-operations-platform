# Production Secret injection

This directory documents the mount boundary only. Real Secret files are ignored by Git and Docker build context and must never be copied into an image.

Production supplies sensitive values with the corresponding `_FILE` variable, for example `DATABASE_PASSWORD_FILE`, `COLLECTOR_SERVICE_TOKEN_FILE`, or `VMALERT_SERVICE_TOKEN_FILE`. Mount each file read-only from protected host storage, restrict host permissions to the service operator and container runtime, and place one Secret in each file. A single trailing LF or CRLF is accepted; other content is preserved exactly.

Direct Secret environment variables and the values in `.env.example` or the development Compose file are local/test placeholders only. Production startup rejects direct Secret values. Rotation may temporarily mount both the current and `*_PREVIOUS_TOKEN_FILE` value; remove the previous file and restart the API after callers have changed. Removing a credential keeps it revoked across subsequent restarts.

Do not put Secret values in URLs, command arguments, health checks, logs, metrics, tickets, or this directory.
