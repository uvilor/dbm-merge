# SchemaSync Monorepo

SchemaSync is a cross-database schema comparison toolkit that targets PostgreSQL and MariaDB.
It provides:

- **@schemasync/core** – discovery, normalization, diffing, DDL generation, and AI prompt helpers.
- **@schemasync/cli** – a command-line interface for comparing schemas, generating migrations, and building AI review prompts.
- **@schemasync/desktop** – an Electron + React desktop application for a visual diff and script review workflow.

> ⚠️ The codebase ships with production-oriented architecture but uses lightweight fixtures and mock data for automated tests. Always validate against real databases before releasing migrations.

## Getting started

```bash
pnpm install
```

### Build everything

```bash
pnpm build
```

### Run unit tests

```bash
pnpm test
```

### Lint and format

```bash
pnpm lint
pnpm format:check
```

### Desktop development

```bash
pnpm dev
```

This launches the Electron renderer with hot reload using electron-vite.

## Workspace layout

```
apps/
  desktop/          Electron + React desktop client
packages/
  cli/              CLI entry point powered by @schemasync/core
  core/             Database discovery, diffing, generators, and prompt tools
```

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE).
