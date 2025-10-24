import mariadb from 'mariadb';

import type {
  Check,
  Column,
  ForeignKey,
  Index,
  Routine,
  SchemaModel,
  SchemaRef,
  Table,
  Trigger,
  View,
} from '../types';

const SYSTEM_SCHEMAS = new Set([
  'mysql',
  'performance_schema',
  'information_schema',
  'sys',
]);

interface TableAccumulator extends Table {
  columnsByName: Map<string, Column>;
}

function createTable(name: string): TableAccumulator {
  return {
    name,
    columns: [],
    indexes: [],
    checks: [],
    fks: [],
    columnsByName: new Map(),
  };
}

export async function loadMariaDB(schemaRef: SchemaRef): Promise<SchemaModel> {
  if (schemaRef.kind !== 'mariadb') {
    throw new Error(
      `SchemaRef.kind must be \"mariadb\" for loadMariaDB (received ${schemaRef.kind})`,
    );
  }

  if (SYSTEM_SCHEMAS.has(schemaRef.schema)) {
    throw new Error(`Refusing to introspect system schema ${schemaRef.schema}`);
  }

  const pool = mariadb.createPool({
    host: schemaRef.host,
    port: schemaRef.port,
    database: schemaRef.database,
    user: schemaRef.user,
    password: schemaRef.password,
    ssl: schemaRef.ssl ? { rejectUnauthorized: false } : undefined,
    connectionLimit: 2,
  });

  const conn = await pool.getConnection();

  try {
    const tables = await introspectTables(conn, schemaRef.schema);
    const views = await introspectViews(conn, schemaRef.schema);
    const routines = await introspectRoutines(conn, schemaRef.schema);
    const triggers = await introspectTriggers(conn, schemaRef.schema);

    return {
      tables: tables.map((t) => ({
        name: t.name,
        columns: t.columns,
        primaryKey: t.primaryKey,
        indexes: t.indexes,
        checks: t.checks,
        fks: t.fks,
      })),
      views,
      routines,
      triggers,
    };
  } finally {
    conn.release();
    await pool.end();
  }
}

async function introspectTables(conn: mariadb.Connection, schema: string): Promise<TableAccumulator[]> {
  const tablesByName = new Map<string, TableAccumulator>();

  const tables = await conn.query<{ table_name: string }[]>(
    `
      /* List MariaDB tables */
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = ? AND table_type IN ('BASE TABLE', 'SYSTEM VERSIONED')
      ORDER BY table_name
    `,
    [schema],
  );

  tables.forEach((row) => {
    tablesByName.set(row.table_name, createTable(row.table_name));
  });

  const columns = await conn.query<{
    table_name: string;
    column_name: string;
    data_type: string;
    character_maximum_length: number | null;
    numeric_precision: number | null;
    numeric_scale: number | null;
    is_nullable: 'YES' | 'NO';
    column_default: string | null;
    extra: string | null;
    collation_name: string | null;
  }[]>(
    `
      /* Column metadata */
      SELECT
        table_name,
        column_name,
        data_type,
        character_maximum_length,
        numeric_precision,
        numeric_scale,
        is_nullable,
        column_default,
        extra,
        collation_name
      FROM information_schema.columns
      WHERE table_schema = ?
      ORDER BY table_name, ordinal_position
    `,
    [schema],
  );

  columns.forEach((row) => {
    const table = tablesByName.get(row.table_name);
    if (!table) return;
    const column: Column = {
      name: row.column_name,
      dataType: row.data_type,
      length: row.character_maximum_length ?? undefined,
      precisionScale:
        row.numeric_precision != null && row.numeric_scale != null
          ? { precision: row.numeric_precision, scale: row.numeric_scale }
          : undefined,
      nullable: row.is_nullable === 'YES',
      default: row.column_default,
      generated: row.extra?.includes('auto_increment') ? 'auto_increment' : null,
      collation: row.collation_name,
    };
    table.columns.push(column);
    table.columnsByName.set(column.name, column);
  });

  const primaryKeys = await conn.query<{
    table_name: string;
    constraint_name: string;
    column_name: string;
    ordinal_position: number;
  }[]>(
    `
      /* Primary keys */
      SELECT tc.table_name, tc.constraint_name, kcu.column_name, kcu.ordinal_position
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
        AND tc.table_name = kcu.table_name
      WHERE tc.table_schema = ? AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY tc.table_name, kcu.ordinal_position
    `,
    [schema],
  );

  primaryKeys.forEach((row) => {
    const table = tablesByName.get(row.table_name);
    if (!table) return;
    if (!table.primaryKey) {
      table.primaryKey = { name: row.constraint_name, columns: [] };
    }
    table.primaryKey.columns.push(row.column_name);
  });

  const indexes = await conn.query<{
    table_name: string;
    index_name: string;
    column_name: string;
    non_unique: 0 | 1;
    index_type: string;
    seq_in_index: number;
  }[]>(
    `
      /* Index metadata via STATISTICS */
      SELECT table_name, index_name, column_name, non_unique, index_type, seq_in_index
      FROM information_schema.statistics
      WHERE table_schema = ?
      ORDER BY table_name, index_name, seq_in_index
    `,
    [schema],
  );

  const indexAccumulator = new Map<string, Index>();

  indexes.forEach((row) => {
    const table = tablesByName.get(row.table_name);
    if (!table) return;
    if (row.index_name === 'PRIMARY') {
      return;
    }
    const key = `${row.table_name}.${row.index_name}`;
    let index = indexAccumulator.get(key);
    if (!index) {
      index = {
        name: row.index_name,
        unique: row.non_unique === 0,
        columns: [],
        using: row.index_type.toLowerCase(),
      };
      indexAccumulator.set(key, index);
      table.indexes.push(index);
    }
    index.columns.push(row.column_name);
  });

  const foreignKeys = await conn.query<{
    table_name: string;
    constraint_name: string;
    column_name: string;
    referenced_table_name: string;
    referenced_column_name: string;
    update_rule: string | null;
    delete_rule: string | null;
    ordinal_position: number;
  }[]>(
    `
      /* Foreign keys */
      SELECT
        rc.table_name,
        rc.constraint_name,
        kcu.column_name,
        rc.referenced_table_name,
        rc.referenced_column_name,
        rc.update_rule,
        rc.delete_rule,
        kcu.position_in_unique_constraint AS ordinal_position
      FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage kcu
        ON rc.constraint_name = kcu.constraint_name
        AND rc.constraint_schema = kcu.table_schema
        AND rc.table_name = kcu.table_name
      WHERE rc.constraint_schema = ?
      ORDER BY rc.table_name, rc.constraint_name, ordinal_position
    `,
    [schema],
  );

  const fkAccumulator = new Map<string, ForeignKey>();
  foreignKeys.forEach((row) => {
    const table = tablesByName.get(row.table_name);
    if (!table) return;
    const key = `${row.table_name}.${row.constraint_name}`;
    let fk = fkAccumulator.get(key);
    if (!fk) {
      fk = {
        name: row.constraint_name,
        columns: [],
        refTable: row.referenced_table_name,
        refColumns: [],
        onUpdate: row.update_rule ?? undefined,
        onDelete: row.delete_rule ?? undefined,
      };
      fkAccumulator.set(key, fk);
      table.fks.push(fk);
    }
    fk.columns.push(row.column_name);
    fk.refColumns.push(row.referenced_column_name);
  });

  const checks = await conn.query<{
    table_name: string;
    constraint_name: string;
    check_clause: string;
  }[]>(
    `
      /* MariaDB check constraints */
      SELECT tc.table_name, tc.constraint_name, cc.check_clause
      FROM information_schema.table_constraints tc
      JOIN information_schema.check_constraints cc
        ON cc.constraint_name = tc.constraint_name
        AND cc.constraint_schema = tc.table_schema
      WHERE tc.table_schema = ? AND tc.constraint_type = 'CHECK'
    `,
    [schema],
  );

  checks.forEach((row) => {
    const table = tablesByName.get(row.table_name);
    if (!table) return;
    const check: Check = {
      name: row.constraint_name,
      expression: row.check_clause,
    };
    table.checks.push(check);
  });

  return Array.from(tablesByName.values());
}

async function introspectViews(conn: mariadb.Connection, schema: string): Promise<View[]> {
  const views = await conn.query<{
    table_name: string;
    view_definition: string;
  }[]>(
    `
      SELECT table_name, view_definition
      FROM information_schema.views
      WHERE table_schema = ?
      ORDER BY table_name
    `,
    [schema],
  );

  return views.map((row) => ({ name: row.table_name, definition: row.view_definition }));
}

async function introspectRoutines(conn: mariadb.Connection, schema: string): Promise<Routine[]> {
  const routines = await conn.query<{
    routine_name: string;
    routine_type: 'FUNCTION' | 'PROCEDURE';
    routine_definition: string | null;
    routine_body: string | null;
  }[]>(
    `
      SELECT routine_name, routine_type, routine_definition, routine_body
      FROM information_schema.routines
      WHERE routine_schema = ?
      ORDER BY routine_name
    `,
    [schema],
  );

  return routines.map((row) => ({
    name: row.routine_name,
    kind: row.routine_type === 'PROCEDURE' ? 'procedure' : 'function',
    language: row.routine_body ?? undefined,
    definition: row.routine_definition ?? '',
  }));
}

async function introspectTriggers(conn: mariadb.Connection, schema: string): Promise<Trigger[]> {
  const triggers = await conn.query<{
    trigger_name: string;
    event_object_table: string;
    action_timing: 'BEFORE' | 'AFTER';
    event_manipulation: 'INSERT' | 'UPDATE' | 'DELETE';
    action_statement: string;
  }[]>(
    `
      SELECT trigger_name, event_object_table, action_timing, event_manipulation, action_statement
      FROM information_schema.triggers
      WHERE trigger_schema = ?
      ORDER BY event_object_table, trigger_name
    `,
    [schema],
  );

  const grouped = new Map<string, Trigger>();

  triggers.forEach((row) => {
    const key = `${row.event_object_table}.${row.trigger_name}`;
    let trigger = grouped.get(key);
    if (!trigger) {
      trigger = {
        name: row.trigger_name,
        table: row.event_object_table,
        timing: row.action_timing.toLowerCase() as Trigger['timing'],
        events: [],
        definition: row.action_statement,
      };
      grouped.set(key, trigger);
    }
    trigger.events.push(row.event_manipulation.toLowerCase() as Trigger['events'][number]);
  });

  return Array.from(grouped.values()).map((trigger) => ({
    ...trigger,
    events: Array.from(new Set(trigger.events)),
  }));
}
