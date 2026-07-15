# Compose runtime boundary

The MVP runs one non-HA Compose project on one Ubuntu 24.04 host. One Platform image is reused by three distinct commands:

- `node apps/platform/dist/migrate.js up` is a short-lived, explicit migration step.
- `node apps/platform/dist/main.js` is the HTTP API.
- `node apps/platform/dist/worker.js` is the non-HTTP Worker.

Deployment starts PostgreSQL, runs `migrate` to completion, then starts API and Worker. API and Worker verify the shared schema but never apply migrations during normal startup. Each `stop_grace_period` exceeds its application deadline; exit code 137 therefore fails graceful-shutdown acceptance.

Container restart policies recover process failures only. They are not host high availability, zero-downtime deployment, or automatic database failover.

The Compose baseline includes bounded resource protection so one abnormal container cannot consume the whole reference host. Final production sizing remains subject to MVP-S1 capacity evidence.
