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

### Command line usage

Build the CLI bundle and inspect available commands:

```bash
pnpm --filter @schemasync/cli run build
pnpm --filter @schemasync/cli exec -- node dist/index.js --help
```

Once built you can run comparisons or generate scripts directly. Example comparing two
local schemas (replace the URLs with your own):

```bash
pnpm --filter @schemasync/cli exec -- node dist/index.js compare \
  --from "postgres://user:pass@localhost:5432/app?schema=public" \
  --to "mariadb://user:pass@localhost:3306/app?schema=public" \
  --schema public --format json
```

### Build a desktop executable

Package the Electron application with `electron-builder`. The command builds the
production bundles and produces unpacked artifacts under `apps/desktop/dist` (for
example `linux-unpacked` on Linux).

```bash
pnpm package:desktop
```

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
