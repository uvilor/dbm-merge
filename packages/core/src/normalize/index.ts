import cloneDeep from 'lodash/cloneDeep.js';
import sortBy from 'lodash/sortBy.js';

import type { Column, NormalizationOptions, SchemaModel, Table } from '../types';

const DEFAULT_TYPE_MAPPINGS: Record<string, string> = {
  'double precision': 'double',
  'character varying': 'varchar',
  'timestamp without time zone': 'timestamp',
  'timestamp with time zone': 'timestamptz',
  'integer': 'int',
  'int4': 'int',
  'int8': 'bigint',
  'int2': 'smallint',
  'tinyint(1)': 'boolean',
  'bool': 'boolean',
  'bit(1)': 'boolean',
};

export function normalizeSchemaModel(
  model: SchemaModel,
  options: NormalizationOptions = {},
): SchemaModel {
  const copy = cloneDeep(model);
  const mapper = { ...DEFAULT_TYPE_MAPPINGS, ...(options.mapTypes ?? {}) };

  copy.tables = copy.tables.map((table) => normalizeTable(table, mapper, options));
  copy.views = sortBy(copy.views, (v) => v.name.toLowerCase());
  copy.routines = sortBy(copy.routines, (r) => r.name.toLowerCase());
  copy.triggers = sortBy(copy.triggers, (t) => `${t.table}.${t.name}`.toLowerCase());
  return copy;
}

function normalizeTable(
  table: Table,
  mapper: Record<string, string>,
  options: NormalizationOptions,
): Table {
  const name = normalizeName(table.name, options);
  const normalizedColumns = table.columns.map((column) => normalizeColumn(column, mapper, options));

  return {
    ...table,
    name,
    columns: normalizedColumns,
    primaryKey: table.primaryKey
      ? {
          name: table.primaryKey.name ?? null,
          columns: table.primaryKey.columns.map((col) => normalizeName(col, options)),
        }
      : undefined,
    indexes: table.indexes.map((index) => ({
      ...index,
      name: normalizeName(index.name, options),
      columns: index.columns.map((col) => normalizeName(col, options)),
      using: index.using?.toLowerCase(),
    })),
    checks: table.checks.map((check) => ({
      ...check,
      name: normalizeName(check.name, options),
      expression: normalizeExpression(check.expression),
    })),
    fks: table.fks.map((fk) => ({
      ...fk,
      name: normalizeName(fk.name, options),
      columns: fk.columns.map((col) => normalizeName(col, options)),
      refTable: normalizeName(fk.refTable, options),
      refColumns: fk.refColumns.map((col) => normalizeName(col, options)),
      onDelete: fk.onDelete?.toUpperCase(),
      onUpdate: fk.onUpdate?.toUpperCase(),
    })),
  };
}

function normalizeColumn(
  column: Column,
  mapper: Record<string, string>,
  options: NormalizationOptions,
): Column {
  const normalizedType = mapper[column.dataType.toLowerCase()] ?? column.dataType.toLowerCase();
  const normalizedDefault = options.normalizeDefaults ? normalizeDefault(column.default) : column.default;
  return {
    ...column,
    name: normalizeName(column.name, options),
    dataType: normalizedType,
    default: normalizedDefault,
    generated: column.generated ?? null,
    collation: column.collation ?? null,
  };
}

export function normalizeName(value: string, options: NormalizationOptions): string {
  const nameCase = options.nameCase;
  if (!nameCase) return value;
  if (nameCase.ignore?.includes(value)) return value;
  switch (nameCase.strategy) {
    case 'lower':
      return value.toLowerCase();
    case 'upper':
      return value.toUpperCase();
    default:
      return value;
  }
}

export function normalizeDefault(value?: string | null): string | null | undefined {
  if (value == null) return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  // Remove wrapping parentheses from defaults like ((now()))
  let normalized = trimmed;
  while (normalized.startsWith('(') && normalized.endsWith(')')) {
    const inner = normalized.slice(1, -1).trim();
    if (!inner) break;
    normalized = inner;
  }
  if (normalized.toLowerCase() === 'now()') {
    normalized = 'CURRENT_TIMESTAMP';
  }
  return normalized;
}

function normalizeExpression(expression: string): string {
  return expression.replace(/\s+/g, ' ').trim();
}
