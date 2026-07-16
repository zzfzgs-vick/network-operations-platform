# Local identity access foundation

Build and migrate first, then initialize the first administrator exactly once:

```text
npm run db:migrate --workspace apps/platform
npm run identity:bootstrap-admin --workspace apps/platform
```

Set `ADMIN_USERNAME` and provide `ADMIN_PASSWORD_FILE` as a protected UTF-8 file. A direct
`ADMIN_PASSWORD` value is accepted only by the shared T008 development/test Secret boundary and is
rejected in production. The command never accepts a password argument and prints only the new
`userId`, username, creation time, and completion state.
