# Shared wire contracts

`schemas/platform-contracts.schema.json` is the sole authority for the base wire
contracts in this package. Files below `generated/` are committed outputs and
must not be edited manually.

Run `npm run contracts:generate` after changing the schema and
`npm run contracts:check` before review. Runtime boundaries must still validate
untrusted input; generated static types are not runtime validation.

## Compatibility rules

- Adding an optional field is normally backward compatible. Consumers must
  ignore unknown optional fields.
- Removing a field, changing its type, or making an optional field required is
  incompatible and requires a new contract version.
- Error codes are stable identifiers. A published code must not be reused with
  a different meaning; clients must not branch on the human-readable message.
- Adding an enum value can affect clients that do not handle unknown values and
  requires compatibility review.
- Servers must not depend on clients sending undeclared fields.

The runtime health envelope describes process readiness only. It is not the
domain Health model and does not define device, circuit, or site health.

## Error and request identifiers

Clients branch on the stable error `code`, never on `message` or an HTTP status
alone. The schema is the authority for each base code's HTTP status,
retryability, and safe default message. Domain Tickets add only the codes they
actually need; they do not reuse an existing code with a new meaning.

The API accepts `X-Request-ID` only when it is 1–64 characters of the schema's
restricted character set. Otherwise it generates a random UUID. The selected
value is returned in `X-Request-ID` and error envelopes and is available to the
HTTP error log context. It must not be used as a metric label, business
fingerprint, idempotency key, or carrier for user data.
