import { Client } from 'pg';

import type {
  Check,
  Column,
  ForeignKey,
  Index,
  SchemaModel,
  SchemaRef,
  Table,
  Trigger,
  View,
  Routine,
} from '../types';

const SYSTEM_SCHEMAS = new Set([
  'pg_catalog',
  'information_schema',
  'pg_toast',
  'pg_internal',
]);

interface TableAccumulator extends Table {
  columnsByName: Map<string, Column>;
}

function createTable(name: string): TableAccumulator {
  return {
    name,
    columns: [],
    columnsByName: new Map(),
    indexes: [],
    checks: [],
    fks: [],
  };
}

export async function loadPostgres(schemaRef: SchemaRef): Promise<SchemaModel> {
  if (schemaRef.kind !== 'postgres') {
    throw new Error(`SchemaRef.kind must be \"postgres\" for loadPostgres (received ${schemaRef.kind})`);
  }

  if (SYSTEM_SCHEMAS.has(schemaRef.schema)) {
    throw new Error(`Refusing to introspect system schema ${schemaRef.schema}`);
  }

  const client = new Client({
    host: schemaRef.host,
    port: schemaRef.port,
    database: schemaRef.database,
    user: schemaRef.user,
    password: schemaRef.password,
    ssl: schemaRef.ssl,
  });

  await client.connect();

  try {
    const tables = await introspectTables(client, schemaRef.schema);
    const views = await introspectViews(client, schemaRef.schema);
    const routines = await introspectRoutines(client, schemaRef.schema);
    const triggers = await introspectTriggers(client, schemaRef.schema);

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
    await client.end();
  }
}

async function introspectTables(client: Client, schema: string): Promise<TableAccumulator[]> {
  const tablesByName = new Map<string, TableAccumulator>();

  const tablesQuery = await client.query<{ table_name: string }>(
    `
      /* List user tables */
      SELECT c.relname AS table_name
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relkind IN ('r', 'p')
      ORDER BY c.relname
    `,
    [schema],
  );

  for (const row of tablesQuery.rows) {
    tablesByName.set(row.table_name, createTable(row.table_name));
  }

  const columnQuery = await client.query<{
    table_name: string;
    column_name: string;
    data_type: string;
    character_maximum_length: number | null;
    numeric_precision: number | null;
    numeric_scale: number | null;
    is_nullable: 'YES' | 'NO';
    column_default: string | null;
    identity_generation: 'ALWAYS' | 'BY DEFAULT' | null;
    collation_name: string | null;
    has_sequence: boolean;
  }>(
    `
      /* Column metadata */
      SELECT
        c.table_name,
        c.column_name,
        c.data_type,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale,
        c.is_nullable,
        c.column_default,
        pg_get_serial_sequence(format('%I.%I', c.table_schema, c.table_name), c.column_name) IS NOT NULL AS has_sequence,
        c.identity_generation,
        c.collation_name
      FROM information_schema.columns c
      WHERE c.table_schema = $1
      ORDER BY c.table_name, c.ordinal_position
    `,
    [schema],
  );

  for (const row of columnQuery.rows) {
    const table = tablesByName.get(row.table_name);
    if (!table) {
      continue;
    }

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
      generated:
        row.identity_generation === 'ALWAYS' || row.identity_generation === 'BY DEFAULT'
          ? 'identity'
          : row.has_sequence
            ? 'sequence'
            : null,
      collation: row.collation_name,
    };

    table.columns.push(column);
    table.columnsByName.set(column.name, column);
  }

  const pkQuery = await client.query<{
    table_name: string;
    constraint_name: string;
    column_name: string;
    ordinal_position: number;
  }>(
    `
      /* Primary key columns */
      SELECT
        tc.table_name,
        tc.constraint_name,
        kcu.column_name,
        kcu.ordinal_position
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_name = kcu.table_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = $1 AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY tc.table_name, kcu.ordinal_position
    `,
    [schema],
  );

  for (const row of pkQuery.rows) {
    const table = tablesByName.get(row.table_name);
    if (!table) continue;
    if (!table.primaryKey) {
      table.primaryKey = { name: row.constraint_name, columns: [] };
    }
    table.primaryKey.columns.push(row.column_name);
  }

  const indexQuery = await client.query<{
    tablename: string;
    indexname: string;
    indexdef: string;
  }>(
    `
      /* Index definitions */
      SELECT tablename, indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = $1
    `,
    [schema],
  );

  for (const row of indexQuery.rows) {
    const table = tablesByName.get(row.tablename);
    if (!table) continue;
    const unique = row.indexdef.includes('UNIQUE');
    const usingMatch = /USING\s+(\w+)/i.exec(row.indexdef);
    const columnsMatch = row.indexdef.match(/\((.*)\)/);
    const columns = columnsMatch
      ? columnsMatch[1]
          .split(',')
          .map((c: string) => c.trim().replace(/"/g, ''))
      : [];
    const index: Index = {
      name: row.indexname,
      unique,
      using: usingMatch ? usingMatch[1] : undefined,
      columns,
    };
    table.indexes.push(index);
  }

  const fkQuery = await client.query<{
    table_name: string;
    constraint_name: string;
    column_name: string;
    foreign_table_name: string;
    foreign_column_name: string;
    update_rule: string | null;
    delete_rule: string | null;
  }>(
    `
      /* Foreign key metadata */
      SELECT
        tc.table_name,
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.update_rule,
        rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.referential_constraints rc
        ON rc.constraint_name = tc.constraint_name
        AND rc.constraint_schema = tc.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = rc.unique_constraint_name
        AND ccu.constraint_schema = rc.unique_constraint_schema
      WHERE tc.table_schema = $1 AND tc.constraint_type = 'FOREIGN KEY'
      ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position
    `,
    [schema],
  );

  const fkAccumulator = new Map<string, ForeignKey>();

  for (const row of fkQuery.rows) {
    const table = tablesByName.get(row.table_name);
    if (!table) continue;
    const key = `${row.table_name}.${row.constraint_name}`;
    let fk = fkAccumulator.get(key);
    if (!fk) {
      fk = {
        name: row.constraint_name,
        columns: [],
        refTable: row.foreign_table_name,
        refColumns: [],
        onUpdate: row.update_rule ?? undefined,
        onDelete: row.delete_rule ?? undefined,
      };
      fkAccumulator.set(key, fk);
      table.fks.push(fk);
    }
    fk.columns.push(row.column_name);
    fk.refColumns.push(row.foreign_column_name);
  }

  const checkQuery = await client.query<{
    table_name: string;
    constraint_name: string;
    check_clause: string;
  }>(
    `
      /* Check constraints */
      SELECT
        tc.table_name,
        tc.constraint_name,
        cc.check_clause
      FROM information_schema.table_constraints tc
      JOIN information_schema.check_constraints cc
        ON cc.constraint_name = tc.constraint_name
        AND cc.constraint_schema = tc.table_schema
      WHERE tc.table_schema = $1 AND tc.constraint_type = 'CHECK'
      ORDER BY tc.table_name
    `,
    [schema],
  );

  for (const row of checkQuery.rows) {
    const table = tablesByName.get(row.table_name);
    if (!table) continue;
    const check: Check = {
      name: row.constraint_name,
      expression: row.check_clause,
    };
    table.checks.push(check);
  }

  return Array.from(tablesByName.values());
}

async function introspectViews(client: Client, schema: string): Promise<View[]> {
  const result = await client.query<{
    viewname: string;
    definition: string;
  }>(
    `
      /* View definitions */
      SELECT c.relname AS viewname, pg_get_viewdef(c.oid, true) AS definition
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relkind = 'v'
      ORDER BY c.relname
    `,
    [schema],
  );

  return result.rows.map((row) => ({ name: row.viewname, definition: row.definition }));
}

async function introspectRoutines(client: Client, schema: string): Promise<Routine[]> {
  const result = await client.query<{
    routine_name: string;
    routine_type: 'FUNCTION' | 'PROCEDURE';
    routine_definition: string | null;
    specific_name: string;
    external_language: string | null;
  }>(
    `
      /* Routine source code */
      SELECT
        p.proname AS routine_name,
        CASE WHEN p.prokind = 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END AS routine_type,
        pg_get_functiondef(p.oid) AS routine_definition,
        p.oid::text AS specific_name,
        l.lanname AS external_language
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_language l ON l.oid = p.prolang
      WHERE n.nspname = $1
      ORDER BY p.proname
    `,
    [schema],
  );

  return result.rows.map((row) => ({
    name: row.routine_name,
    kind: row.routine_type === 'PROCEDURE' ? 'procedure' : 'function',
    language: row.external_language ?? undefined,
    definition: row.routine_definition ?? '',
  }));
}

async function introspectTriggers(client: Client, schema: string): Promise<Trigger[]> {
  const result = await client.query<{
    trigger_name: string;
    event_manipulation: string;
    event_object_table: string;
    action_timing: 'BEFORE' | 'AFTER';
    action_statement: string;
  }>(
    `
      /* Trigger metadata */
      SELECT
        t.trigger_name,
        t.event_manipulation,
        t.event_object_table,
        t.action_timing,
        pg_get_triggerdef(pg_trigger.oid, true) AS action_statement
      FROM information_schema.triggers t
      JOIN pg_trigger ON pg_trigger.tgname = t.trigger_name
      JOIN pg_class ON pg_class.relname = t.event_object_table
      JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
      WHERE t.trigger_schema = $1 AND pg_namespace.nspname = $1
      ORDER BY t.event_object_table, t.trigger_name
    `,
    [schema],
  );

  const grouped = new Map<string, Trigger>();

  for (const row of result.rows) {
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
  }

  return Array.from(grouped.values()).map((trigger) => ({
    ...trigger,
    events: Array.from(new Set(trigger.events)),
  }));
}
