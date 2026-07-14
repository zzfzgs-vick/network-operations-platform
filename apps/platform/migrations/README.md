# Platform migrations

Use one global, forward-only migration stream named `NNNN_owner_description.up.sql`, starting at
`0001` without gaps. Applied files are immutable and verified by SHA-256 checksum.

From the repository root:

- `npm run db:status --workspace apps/platform`
- `npm run db:migrate --workspace apps/platform`
- `npm run db:verify --workspace apps/platform`
- `npm run test:db --workspace apps/platform -- database`

Each migration runs in its own PostgreSQL transaction under one advisory lock. A failed migration
is rolled back and remains pending. After release, corrections use a new forward migration; test
databases may be recreated. API and Worker startup only run `db:verify` behavior and never migrate.

`0002_reliable_work_foundation.up.sql` owns the T006 Inbox, Outbox, Job, attempt, finite lease,
and Dead Letter schema. After release it is immutable; corrections use a new forward migration.
