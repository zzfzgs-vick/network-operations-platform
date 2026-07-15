# Same-origin reverse-proxy contract

T009 fixes the production ingress contract without selecting or adding another proxy product:

- `/` routes to the Web container.
- `/api/` routes to the Platform API container.
- `/events/` routes to the Platform API SSE boundary with buffering disabled.
- `/ws/` remains absent until WebSocket is approved.

Production exposes only the reverse proxy through HTTPS. API, Web, Collector health, PostgreSQL, VictoriaMetrics, and vmalert remain on the internal Compose network. The proxy must preserve the same origin and must not log authorization headers, cookies, service credentials, or query-string tokens.

The concrete TLS certificate and proxy implementation are deployment inputs outside T009. This Ticket deliberately adds no Nginx, Caddy, ingress controller, or second public origin.
