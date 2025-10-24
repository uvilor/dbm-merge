import chalk from 'chalk';
import type { DiffResult, SchemaRef } from '@schemasync/core';

export function parseConnection(value: string, defaultSchema?: string): SchemaRef {
  const url = new URL(value);
  const kind = url.protocol.replace(':', '');
  if (kind !== 'postgres' && kind !== 'mariadb') {
    throw new Error(`Unsupported protocol ${url.protocol}`);
  }

  const schema = url.searchParams.get('schema') ?? defaultSchema;
  if (!schema) {
    throw new Error('Schema must be provided via ?schema= or --schema');
  }

  return {
    kind,
    host: url.hostname,
    port: Number(url.port || (kind === 'postgres' ? 5432 : 3306)),
    database: url.pathname.replace(/^\//, ''),
    schema,
    user: decodeURIComponent(url.username),
    password: url.password ? decodeURIComponent(url.password) : undefined,
    ssl: url.searchParams.get('ssl') === 'true',
  };
}

export function summarizeDiff(diff: DiffResult) {
  return {
    tables: {
      added: diff.tables.added.length,
      removed: diff.tables.removed.length,
      changed: diff.tables.changed.length,
    },
    views: {
      added: diff.views.added.length,
      removed: diff.views.removed.length,
      changed: diff.views.changed.length,
    },
    routines: {
      added: diff.routines.added.length,
      removed: diff.routines.removed.length,
      changed: diff.routines.changed.length,
    },
    triggers: {
      added: diff.triggers.added.length,
      removed: diff.triggers.removed.length,
      changed: diff.triggers.changed.length,
    },
  };
}

export function renderDiffSummary(diff: DiffResult): string {
  const lines: string[] = [];
  lines.push(chalk.bold('Tables:'));
  lines.push(`  Added: ${diff.tables.removed.length}`);
  lines.push(`  Removed: ${diff.tables.added.length}`);
  lines.push(`  Changed: ${diff.tables.changed.length}`);

  diff.tables.changed.forEach((change) => {
    lines.push(`    - ${change.table.name}: +${change.removedColumns.length} columns, -${change.addedColumns.length} columns`);
  });

  lines.push('');
  lines.push(chalk.bold('Views:'));
  lines.push(`  Added: ${diff.views.removed.length}`);
  lines.push(`  Removed: ${diff.views.added.length}`);
  lines.push(`  Changed: ${diff.views.changed.length}`);

  lines.push('');
  lines.push(chalk.bold('Routines:'));
  lines.push(`  Added: ${diff.routines.removed.length}`);
  lines.push(`  Removed: ${diff.routines.added.length}`);
  lines.push(`  Changed: ${diff.routines.changed.length}`);

  lines.push('');
  lines.push(chalk.bold('Triggers:'));
  lines.push(`  Added: ${diff.triggers.removed.length}`);
  lines.push(`  Removed: ${diff.triggers.added.length}`);
  lines.push(`  Changed: ${diff.triggers.changed.length}`);

  return lines.join('\n');
}
