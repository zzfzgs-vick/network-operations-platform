# Issue tracker: Local Markdown

Executable tickets for this repository live under `docs/tickets/`. Product requirements live under `docs/product/`.

## Conventions

- Store each product requirement at `docs/product/<feature-slug>.md`.
- Store related tickets under `docs/tickets/<feature-slug>/`.
- Name tickets `<NN>-<slug>.md`, numbered from `01`.
- Record triage state as a `Status:` line near the top of each ticket.
- Append discussion history under a `## Comments` heading when needed.
- Link tickets to their product requirement or formal specification using repository-relative paths.

## Publishing

When a skill publishes a product requirement, write it under `docs/product/`.

When a skill publishes an executable issue, write it under `docs/tickets/<feature-slug>/`, creating the feature directory if needed.

## Fetching

Read the repository-relative path supplied by the user. A ticket number is scoped to its feature directory.
