# Agent instructions

## Documentation layout

- Project context: `docs/CONTEXT.md`
- Product requirements: `docs/product/`
- Domain model: `docs/domain/`
- Architecture documentation: `docs/architecture/`
- Architecture decision records: `docs/architecture/adr/`
- Formal specifications: `docs/specs/`
- Executable tickets: `docs/tickets/`
- Phase handoffs: `docs/handoffs/`

Use repository-relative paths in project files.

## Agent skills

### Issue tracker

Issues are tracked as local Markdown files under `docs/tickets/`; product requirements live under `docs/product/`. External PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five canonical labels without custom mappings: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository. Read `docs/CONTEXT.md`, relevant material under `docs/domain/`, and applicable ADRs under `docs/architecture/adr/`. See `docs/agents/domain.md`.

## Working rules

- Prefer the smallest implementation that satisfies the confirmed requirement.
- Reuse existing code and platform capabilities before adding abstractions or dependencies.
- Do not weaken security, error handling, tests, or deployment maintainability to reduce code.
- Do not introduce infrastructure or distributed-system components before their need is confirmed.
- Record resolved architectural decisions as ADRs; do not treat assumptions as decisions.
