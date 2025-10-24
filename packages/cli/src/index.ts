import fs from 'node:fs';
import path from 'node:path';

import chalk from 'chalk';
import { Command } from 'commander';

import {
  buildReviewPrompt,
  computeDiff,
  loadMariaDB,
  loadPostgres,
  normalizeSchemaModel,
  toMariaDB,
  toPostgres,
  type DiffResult,
  type SchemaModel,
  type SchemaRef,
} from '@schemasync/core';

const program = new Command();

program
  .name('schemasync')
  .description('Cross-database schema diff and migration tool')
  .version('0.1.0');

program
  .command('compare')
  .requiredOption('--from <conn>', 'Source connection URL')
  .requiredOption('--to <conn>', 'Target connection URL')
  .requiredOption('--schema <name>', 'Schema name to compare')
  .option('--format <format>', 'Output format (json|text)', 'text')
  .action(async (options) => {
    await runWithErrors(async () => {
      const sourceRef = parseConnection(options.from, options.schema);
      const targetRef = parseConnection(options.to, options.schema);

      const [source, target] = await Promise.all([
        loadSchema(sourceRef),
        loadSchema(targetRef),
      ]);

      const normalizedSource = normalizeSchemaModel(source, { normalizeDefaults: true, nameCase: { strategy: 'lower' } });
      const normalizedTarget = normalizeSchemaModel(target, { normalizeDefaults: true, nameCase: { strategy: 'lower' } });

      const diff = computeDiff(normalizedSource, normalizedTarget);

      if (options.format === 'json') {
        process.stdout.write(JSON.stringify({ diff, summary: summarizeDiff(diff) }, null, 2));
      } else {
        process.stdout.write(renderDiffSummary(diff));
      }
    });
  });

program
  .command('generate')
  .requiredOption('--from <conn>', 'Source connection URL')
  .requiredOption('--to <conn>', 'Target connection URL')
  .requiredOption('--schema <name>', 'Schema name to compare')
  .requiredOption('--target <db>', 'Target dialect postgres|mariadb')
  .option('--direction <dir>', 'Direction AtoB|BtoA', 'AtoB')
  .option('--out <file>', 'Output file path')
  .option('--with-transaction', 'Wrap migration in a transaction', false)
  .option('--safe', 'Comment out destructive statements', false)
  .option('--cascade', 'Cascade on drops', false)
  .option('--if-exists', 'Use IF EXISTS on drops', false)
  .action(async (options) => {
    await runWithErrors(async () => {
      const sourceRef = parseConnection(options.from, options.schema);
      const targetRef = parseConnection(options.to, options.schema);

      const [source, target] = await Promise.all([
        loadSchema(sourceRef),
        loadSchema(targetRef),
      ]);

      const normalizedSource = normalizeSchemaModel(source, { normalizeDefaults: true, nameCase: { strategy: 'lower' } });
      const normalizedTarget = normalizeSchemaModel(target, { normalizeDefaults: true, nameCase: { strategy: 'lower' } });

      const diff = computeDiff(normalizedSource, normalizedTarget);

      const genOptions = {
        direction: options.direction === 'BtoA' ? 'BtoA' : 'AtoB',
        withTransaction: Boolean(options.withTransaction),
        safeMode: Boolean(options.safe),
        cascade: Boolean(options.cascade),
        ifExists: Boolean(options.ifExists),
      } as const;

      let sql: string;
      if (options.target === 'postgres') {
        sql = toPostgres(diff, genOptions);
      } else if (options.target === 'mariadb') {
        sql = toMariaDB(diff, genOptions);
      } else {
        throw new Error(`Unsupported target dialect ${options.target}`);
      }

      if (options.out) {
        const filePath = path.resolve(process.cwd(), options.out);
        fs.writeFileSync(filePath, sql, 'utf-8');
        process.stdout.write(`${chalk.green('Wrote migration:')} ${filePath}\n`);
      }

      process.stdout.write(sql + '\n');
    });
  });

program
  .command('prompt')
  .requiredOption('--from <conn>', 'Source connection URL')
  .requiredOption('--to <conn>', 'Target connection URL')
  .requiredOption('--schema <name>', 'Schema name to compare')
  .option('--target <db>', 'Target dialect for script generation', 'postgres')
  .option('--direction <dir>', 'Direction AtoB|BtoA', 'AtoB')
  .action(async (options) => {
    await runWithErrors(async () => {
      const sourceRef = parseConnection(options.from, options.schema);
      const targetRef = parseConnection(options.to, options.schema);

      const [source, target] = await Promise.all([
        loadSchema(sourceRef),
        loadSchema(targetRef),
      ]);

      const normalizedSource = normalizeSchemaModel(source, { normalizeDefaults: true, nameCase: { strategy: 'lower' } });
      const normalizedTarget = normalizeSchemaModel(target, { normalizeDefaults: true, nameCase: { strategy: 'lower' } });

      const diff = computeDiff(normalizedSource, normalizedTarget);
      const summary = renderDiffSummary(diff);

      const genOptions = {
        direction: options.direction === 'BtoA' ? 'BtoA' : 'AtoB',
        withTransaction: true,
        safeMode: true,
        cascade: false,
        ifExists: true,
      } as const;

      const sql = options.target === 'mariadb' ? toMariaDB(diff, genOptions) : toPostgres(diff, genOptions);

      const prompt = buildReviewPrompt({
        sourceKind: sourceRef.kind,
        targetKind: targetRef.kind,
        diffSnippet: summary.slice(0, 1000),
        ddlProposal: sql.slice(0, 4000),
      });

      process.stdout.write(prompt + '\n');
    });
  });

program.parseAsync().catch((error) => {
  process.stderr.write(chalk.red(`Unexpected error: ${error.message}`) + '\n');
  process.exit(1);
});

function parseConnection(value: string, defaultSchema?: string): SchemaRef {
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

async function loadSchema(ref: SchemaRef): Promise<SchemaModel> {
  return ref.kind === 'postgres' ? loadPostgres(ref) : loadMariaDB(ref);
}

async function runWithErrors(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (error) {
    const err = error as Error;
    process.stderr.write(chalk.red(err.message) + '\n');
    process.exitCode = 1;
  }
}

function summarizeDiff(diff: DiffResult) {
  return {
    tables: {
      added: diff.tables.added.length,
      removed: diff.tables.removed.length,
      changed: diff.tables.changed.length,
    },
    views: diff.views,
    routines: diff.routines,
    triggers: diff.triggers,
  };
}

function renderDiffSummary(diff: DiffResult): string {
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
