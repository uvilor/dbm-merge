import { EOL } from 'node:os';

import type { DiffResult } from '../diff';
import type { Column, Index, Table } from '../types';

export interface GenOptions {
  direction: 'AtoB' | 'BtoA';
  withTransaction?: boolean;
  safeMode?: boolean;
  ifExists?: boolean;
  cascade?: boolean;
}

interface TableChangePlan {
  table: Table;
  desired: Table;
  addColumns: Column[];
  dropColumns: Column[];
  alterColumns: Array<{ column: Column; change: string[] }>;
  dropIndexes: Index[];
  createIndexes: Index[];
}

export function toPostgres(diff: DiffResult, opts: GenOptions): string {
  const lines: string[] = [];
  const { toCreate, toDrop, tablePlans } = planTables(diff, opts);

  if (opts.withTransaction) {
    lines.push('BEGIN;');
  }

  if (opts.safeMode && toDrop.length > 0) {
    lines.push('-- SAFE MODE: review drops below before executing.');
  }

  toDrop.forEach((table) => {
    const drop = `DROP TABLE${opts.ifExists ? ' IF EXISTS' : ''} ${quoteIdent(table.name)}${
      opts.cascade ? ' CASCADE' : ''
    };`;
    lines.push(opts.safeMode ? `-- ${drop}` : drop);
  });

  toCreate.forEach((table) => {
    lines.push(renderPostgresCreateTable(table));
  });

  tablePlans.forEach((plan) => {
    const tableName = quoteIdent(plan.table.name);
    plan.dropColumns.forEach((column) => {
      const drop = `ALTER TABLE ${tableName} DROP COLUMN ${quoteIdent(column.name)}${opts.cascade ? ' CASCADE' : ''};`;
      lines.push(opts.safeMode ? `-- ${drop}` : drop);
    });
    plan.addColumns.forEach((column) => {
      lines.push(`ALTER TABLE ${tableName} ADD COLUMN ${renderPostgresColumn(column)};`);
    });
    plan.alterColumns.forEach((alteration) => {
      alteration.change.forEach((ddl) => {
        lines.push(`ALTER TABLE ${tableName} ${ddl};`);
      });
    });

    plan.dropIndexes.forEach((index) => {
      const drop = `DROP INDEX${opts.ifExists ? ' IF EXISTS' : ''} ${quoteIdent(index.name)};`;
      lines.push(opts.safeMode ? `-- ${drop}` : drop);
    });
    plan.createIndexes.forEach((index) => {
      lines.push(renderPostgresIndex(plan.table.name, index));
    });
  });

  renderViewChanges(diff, opts, lines, 'postgres');
  renderRoutineChanges(diff, opts, lines, 'postgres');
  renderTriggerChanges(diff, opts, lines, 'postgres');

  if (opts.withTransaction) {
    lines.push('COMMIT;');
  }

  return lines.filter((line) => line.trim().length > 0).join(EOL + EOL);
}

export function toMariaDB(diff: DiffResult, opts: GenOptions): string {
  const lines: string[] = [];
  const { toCreate, toDrop, tablePlans } = planTables(diff, opts);

  if (opts.withTransaction) {
    lines.push('START TRANSACTION;');
  }

  if (opts.safeMode && toDrop.length > 0) {
    lines.push('-- SAFE MODE: review drops below before executing.');
  }

  toDrop.forEach((table) => {
    const drop = `DROP TABLE${opts.ifExists ? ' IF EXISTS' : ''} ${backtick(table.name)}${
      opts.cascade ? ' CASCADE' : ''
    };`;
    lines.push(opts.safeMode ? `-- ${drop}` : drop);
  });

  toCreate.forEach((table) => {
    lines.push(renderMariaCreateTable(table));
  });

  tablePlans.forEach((plan) => {
    const tableName = backtick(plan.table.name);
    plan.dropColumns.forEach((column) => {
      const drop = `ALTER TABLE ${tableName} DROP COLUMN ${backtick(column.name)};`;
      lines.push(opts.safeMode ? `-- ${drop}` : drop);
    });
    plan.addColumns.forEach((column) => {
      lines.push(`ALTER TABLE ${tableName} ADD COLUMN ${renderMariaColumn(column)};`);
    });
    plan.alterColumns.forEach((alteration) => {
      alteration.change.forEach((ddl) => {
        lines.push(`ALTER TABLE ${tableName} ${ddl};`);
      });
    });

    plan.dropIndexes.forEach((index) => {
      const drop = `DROP INDEX ${backtick(index.name)} ON ${tableName};`;
      lines.push(opts.safeMode ? `-- ${drop}` : drop);
    });
    plan.createIndexes.forEach((index) => {
      lines.push(renderMariaIndex(plan.table.name, index));
    });
  });

  renderViewChanges(diff, opts, lines, 'mariadb');
  renderRoutineChanges(diff, opts, lines, 'mariadb');
  renderTriggerChanges(diff, opts, lines, 'mariadb');

  if (opts.withTransaction) {
    lines.push('COMMIT;');
  }

  return lines.filter((line) => line.trim().length > 0).join(EOL + EOL);
}

function planTables(diff: DiffResult, opts: GenOptions) {
  const createTables = opts.direction === 'AtoB' ? diff.tables.removed : diff.tables.added;
  const dropTables = opts.direction === 'AtoB' ? diff.tables.added : diff.tables.removed;

  const tablePlans = diff.tables.changed.map((change) => buildTablePlan(change, opts.direction));
  return { toCreate: createTables, toDrop: dropTables, tablePlans };
}

function buildTablePlan(
  change: DiffResult['tables']['changed'][number],
  direction: GenOptions['direction'],
): TableChangePlan {
  const desired = direction === 'AtoB' ? change.sourceTable : change.table;
  const working = direction === 'AtoB' ? change.table : change.sourceTable;

  const addColumns = direction === 'AtoB' ? change.removedColumns : change.addedColumns;
  const dropColumns = direction === 'AtoB' ? change.addedColumns : change.removedColumns;

  const alterColumns = change.columnChanges.map(({ name, change: columnChange }) => {
    const desiredColumn = desired.columns.find((col) => col.name === name) ?? desired.columns[0];
    if (!desiredColumn) {
      return { column: working.columns.find((col) => col.name === name)!, change: [`-- TODO: review column ${name}`] };
    }
    const statements: string[] = [];
    if (columnChange.typeChanged) {
      statements.push(`ALTER COLUMN ${quoteIdent(name)} TYPE ${desiredColumn.dataType}`);
      statements.push(`-- TODO: verify casts for ${name}`);
    }
    if (columnChange.nullableChanged) {
      const clause = desiredColumn.nullable ? 'DROP NOT NULL' : 'SET NOT NULL';
      statements.push(`ALTER COLUMN ${quoteIdent(name)} ${clause}`);
    }
    if (columnChange.defaultChanged) {
      const def = desiredColumn.default;
      const clause = def == null ? 'DROP DEFAULT' : `SET DEFAULT ${def}`;
      statements.push(`ALTER COLUMN ${quoteIdent(name)} ${clause}`);
    }
    if (columnChange.generatedChanged) {
      statements.push(`-- TODO: reconcile generation strategy for ${name}`);
    }
    if (columnChange.collationChanged) {
      statements.push(`-- TODO: adjust collation for ${name}`);
    }
    return { column: desiredColumn, change: statements };
  });

  const dropIndexes = direction === 'AtoB' ? change.addedIndexes : change.removedIndexes;
  const createIndexes = direction === 'AtoB' ? change.removedIndexes : change.addedIndexes;

  return {
    table: working,
    desired,
    addColumns,
    dropColumns,
    alterColumns,
    dropIndexes,
    createIndexes,
  };
}

function renderPostgresCreateTable(table: Table): string {
  const columns = table.columns.map((column) => renderPostgresColumn(column));
  if (table.primaryKey) {
    columns.push(
      `CONSTRAINT ${quoteIdent(table.primaryKey.name ?? `${table.name}_pkey`)} PRIMARY KEY (${table.primaryKey.columns
        .map(quoteIdent)
        .join(', ')})`,
    );
  }
  return `CREATE TABLE ${quoteIdent(table.name)} (\n  ${columns.join(',\n  ')}\n);`;
}

function renderMariaCreateTable(table: Table): string {
  const columns = table.columns.map((column) => renderMariaColumn(column));
  if (table.primaryKey) {
    columns.push(
      `CONSTRAINT ${backtick(table.primaryKey.name ?? `${table.name}_pk`)} PRIMARY KEY (${table.primaryKey.columns
        .map((col) => backtick(col))
        .join(', ')})`,
    );
  }
  return `CREATE TABLE ${backtick(table.name)} (\n  ${columns.join(',\n  ')}\n) ENGINE=InnoDB;`;
}

function renderPostgresColumn(column: Column): string {
  const parts = [quoteIdent(column.name), column.dataType];
  if (column.length) {
    parts[1] = `${column.dataType}(${column.length})`;
  }
  if (column.precisionScale) {
    parts[1] = `${column.dataType}(${column.precisionScale.precision}, ${column.precisionScale.scale})`;
  }
  if (!column.nullable) {
    parts.push('NOT NULL');
  }
  if (column.default != null) {
    parts.push(`DEFAULT ${column.default}`);
  }
  if (column.generated === 'identity' || column.generated === 'sequence') {
    parts.push('-- TODO: ensure generation strategy is preserved');
  }
  if (column.collation) {
    parts.push(`COLLATE ${quoteIdent(column.collation)}`);
  }
  return parts.join(' ');
}

function renderMariaColumn(column: Column): string {
  const parts = [backtick(column.name), column.dataType.toUpperCase()];
  if (column.length) {
    parts[1] = `${column.dataType.toUpperCase()}(${column.length})`;
  }
  if (column.precisionScale) {
    parts[1] = `${column.dataType.toUpperCase()}(${column.precisionScale.precision}, ${column.precisionScale.scale})`;
  }
  if (!column.nullable) {
    parts.push('NOT NULL');
  }
  if (column.default != null) {
    parts.push(`DEFAULT ${column.default}`);
  }
  if (column.generated === 'auto_increment') {
    parts.push('AUTO_INCREMENT');
  }
  if (column.collation) {
    parts.push(`COLLATE ${column.collation}`);
  }
  return parts.join(' ');
}

function renderPostgresIndex(tableName: string, index: Index): string {
  return `CREATE${index.unique ? ' UNIQUE' : ''} INDEX ${quoteIdent(index.name)} ON ${quoteIdent(tableName)}${
    index.using ? ` USING ${index.using}` : ''
  } (${index.columns.map(quoteIdent).join(', ')});`;
}

function renderMariaIndex(tableName: string, index: Index): string {
  const type = index.unique ? 'UNIQUE ' : '';
  return `CREATE ${type}INDEX ${backtick(index.name)} ON ${backtick(tableName)} (${index.columns
    .map((column) => backtick(column))
    .join(', ')});`;
}

function renderViewChanges(
  diff: DiffResult,
  opts: GenOptions,
  lines: string[],
  dialect: 'postgres' | 'mariadb',
) {
  const createViews = opts.direction === 'AtoB' ? diff.views.removed : diff.views.added;
  const dropViews = opts.direction === 'AtoB' ? diff.views.added : diff.views.removed;

  dropViews.forEach((view) => {
    const drop = `DROP VIEW${opts.ifExists ? ' IF EXISTS' : ''} ${
      dialect === 'postgres' ? quoteIdent(view.name) : backtick(view.name)
    }${opts.cascade ? ' CASCADE' : ''};`;
    lines.push(opts.safeMode ? `-- ${drop}` : drop);
  });

  createViews.forEach((view) => {
    const name = dialect === 'postgres' ? quoteIdent(view.name) : backtick(view.name);
    lines.push(`CREATE OR REPLACE VIEW ${name} AS\n${view.definition.trim()};`);
  });

  diff.views.changed.forEach((change) => {
    lines.push(`-- TODO: view ${change.name} changed; consider drop and recreate.`);
  });
}

function renderRoutineChanges(
  diff: DiffResult,
  opts: GenOptions,
  lines: string[],
  dialect: 'postgres' | 'mariadb',
) {
  const createRoutines = opts.direction === 'AtoB' ? diff.routines.removed : diff.routines.added;
  const dropRoutines = opts.direction === 'AtoB' ? diff.routines.added : diff.routines.removed;

  dropRoutines.forEach((routine) => {
    const drop = `DROP ${routine.kind.toUpperCase()}${opts.ifExists ? ' IF EXISTS' : ''} ${
      dialect === 'postgres' ? quoteIdent(routine.name) : backtick(routine.name)
    };`;
    lines.push(opts.safeMode ? `-- ${drop}` : drop);
  });

  createRoutines.forEach((routine) => {
    lines.push(`-- Routine ${routine.name}`);
    lines.push(routine.definition.trim());
  });

  diff.routines.changed.forEach((change) => {
    lines.push(`-- TODO: routine ${change.name} definition changed; drop and recreate manually.`);
  });
}

function renderTriggerChanges(
  diff: DiffResult,
  opts: GenOptions,
  lines: string[],
  dialect: 'postgres' | 'mariadb',
) {
  const createTriggers = opts.direction === 'AtoB' ? diff.triggers.removed : diff.triggers.added;
  const dropTriggers = opts.direction === 'AtoB' ? diff.triggers.added : diff.triggers.removed;

  dropTriggers.forEach((trigger) => {
    const name = dialect === 'postgres' ? quoteIdent(trigger.name) : backtick(trigger.name);
    const table = dialect === 'postgres' ? quoteIdent(trigger.table) : backtick(trigger.table);
    const drop = `DROP TRIGGER${opts.ifExists ? ' IF EXISTS' : ''} ${name} ON ${table};`;
    lines.push(opts.safeMode ? `-- ${drop}` : drop);
  });

  createTriggers.forEach((trigger) => {
    lines.push(`-- Trigger ${trigger.name} on ${trigger.table}`);
    lines.push(trigger.definition.trim());
  });

  diff.triggers.changed.forEach((change) => {
    lines.push(`-- TODO: trigger ${change.name} changed; consider drop and recreate.`);
  });
}

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function backtick(identifier: string): string {
  return `\`${identifier.replace(/`/g, '``')}\``;
}
