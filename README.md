# SchemaSync (MVP)

Herramienta open source para comparar schemas **MariaDB↔MariaDB** y **PostgreSQL↔PostgreSQL**, ver diffs y generar scripts de homologación. Incluye:
- `packages/core`: lógica de descubrimiento/diff (stub)
- `packages/cli`: CLI (`schemasync`)
- `apps/desktop`: app Electron mínima (stub)

## Scripts
- `pnpm -w build` — compila core/cli
- `pnpm -w dev:desktop` — ejecuta Electron (stub)
- `pnpm -w compare:demo` — demo CLI

## Requisitos
Node 18+, pnpm, Git.
