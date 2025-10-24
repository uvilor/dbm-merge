#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import chalk from 'chalk';
import { computeDiff, loadSchema, generateSql, type DatabaseKind } from '@schemasync/core';

const argv = yargs(hideBin(process.argv))
  .option('from', { type: 'string', demandOption: true })
  .option('to', { type: 'string', demandOption: true })
  .option('engine', { type: 'string', choices: ['mariadb', 'postgres'], demandOption: true })
  .option('format', { type: 'string', choices: ['text','json'], default: 'text' })
  .help()
  .parseSync();

async function main() {
  const engine = argv.engine as DatabaseKind;
  const a = await loadSchema(argv.from, engine);
  const b = await loadSchema(argv.to, engine);
  const diff = computeDiff(a, b);

  if (argv.format === 'json') {
    console.log(JSON.stringify(diff, null, 2));
    return;
  }

  console.log(chalk.cyan('== SchemaSync (MVP) =='));
  console.log('Added tables :', diff.addedTables);
  console.log('Removed tables:', diff.removedTables);

  const sql = generateSql(diff, engine);
  console.log('\n--- SQL ---\n' + sql);
}

main().catch(err => {
  console.error(chalk.red('Error:'), err);
  process.exit(1);
});
