import isEqual from 'lodash/isEqual.js';
import sortBy from 'lodash/sortBy.js';

import type { SchemaModel, Table } from '../types';
import type {
  ChangeEnvelope,
  ColumnChange,
  DefinitionChange,
  DiffResult,
  TableChange,
} from './types';
import {
  compareChecks,
  compareColumns,
  compareForeignKeys,
  compareIndexes,
  comparePrimaryKeys,
} from './tableComparators';

export { type DiffResult } from './types';

export function computeDiff(a: SchemaModel, b: SchemaModel): DiffResult {
  const tableDiff = diffTables(a.tables, b.tables);
  const viewDiff = diffCollection(a.views, b.views, (item) => item.name, (item) => item.definition);
  const routineDiff = diffCollection(
    a.routines,
    b.routines,
    (item) => `${item.kind}:${item.name}`,
    (item) => item.definition,
  );
  const triggerDiff = diffCollection(
    a.triggers,
    b.triggers,
    (item) => `${item.table}.${item.name}`,
    (item) => [item.timing, item.events.join(','), item.definition].join('\n'),
  );

  return {
    tables: tableDiff,
    views: viewDiff,
    routines: routineDiff,
    triggers: triggerDiff,
  };
}

function diffTables(source: Table[], target: Table[]) {
  const sourceMap = new Map(source.map((table) => [table.name, table]));
  const targetMap = new Map(target.map((table) => [table.name, table]));

  const added: Table[] = [];
  const removed: Table[] = [];
  const changed: TableChange[] = [];

  target.forEach((table) => {
    if (!sourceMap.has(table.name)) {
      added.push(table);
    }
  });

  source.forEach((table) => {
    if (!targetMap.has(table.name)) {
      removed.push(table);
    }
  });

  source.forEach((table) => {
    const counterpart = targetMap.get(table.name);
    if (!counterpart) return;
    const tableChange = diffTable(table, counterpart);
    if (tableChange) {
      changed.push(tableChange);
    }
  });

  return { added, removed, changed: sortBy(changed, (change) => change.table.name) };
}

function diffTable(source: Table, target: Table): TableChange | null {
  const { added: addedColumns, removed: removedColumns, changed: columnChanges } = compareColumns(
    source,
    target,
  );

  const primaryKeyChange = comparePrimaryKeys(source.primaryKey, target.primaryKey);
  const { added: addedIndexes, removed: removedIndexes, changed: indexChanges } = compareIndexes(
    source.indexes,
    target.indexes,
  );
  const { added: addedChecks, removed: removedChecks, changed: checkChanges } = compareChecks(
    source.checks,
    target.checks,
  );
  const {
    added: addedForeignKeys,
    removed: removedForeignKeys,
    changed: foreignKeyChanges,
  } = compareForeignKeys(source.fks, target.fks);

  const hasChanges =
    addedColumns.length > 0 ||
    removedColumns.length > 0 ||
    columnChanges.length > 0 ||
    primaryKeyChange != null ||
    addedIndexes.length > 0 ||
    removedIndexes.length > 0 ||
    indexChanges.length > 0 ||
    addedChecks.length > 0 ||
    removedChecks.length > 0 ||
    checkChanges.length > 0 ||
    addedForeignKeys.length > 0 ||
    removedForeignKeys.length > 0 ||
    foreignKeyChanges.length > 0;

  if (!hasChanges) {
    return null;
  }

  return {
    table: target,
    sourceTable: source,
    addedColumns,
    removedColumns,
    columnChanges,
    primaryKeyChange: primaryKeyChange ?? undefined,
    addedIndexes,
    removedIndexes,
    indexChanges,
    addedChecks,
    removedChecks,
    checkChanges,
    addedForeignKeys,
    removedForeignKeys,
    foreignKeyChanges,
  };
}

function diffCollection<T>(
  source: T[],
  target: T[],
  keyFn: (item: T) => string,
  valueFn: (item: T) => unknown,
): { added: T[]; removed: T[]; changed: ChangeEnvelope<DefinitionChange>[] } {
  const sourceMap = new Map<string, T>();
  const targetMap = new Map<string, T>();

  source.forEach((item) => {
    sourceMap.set(keyFn(item), item);
  });

  target.forEach((item) => {
    targetMap.set(keyFn(item), item);
  });

  const added: T[] = [];
  const removed: T[] = [];
  const changed: ChangeEnvelope<DefinitionChange>[] = [];

  targetMap.forEach((value, key) => {
    if (!sourceMap.has(key)) {
      added.push(value);
    }
  });

  sourceMap.forEach((value, key) => {
    if (!targetMap.has(key)) {
      removed.push(value);
    }
  });

  sourceMap.forEach((value, key) => {
    if (!targetMap.has(key)) return;
    const targetValue = targetMap.get(key)!;
    if (!isEqual(valueFn(value), valueFn(targetValue))) {
      changed.push({
        name: key,
        change: {
          from: String(valueFn(value)),
          to: String(valueFn(targetValue)),
        },
      });
    }
  });

  return {
    added: sortBy(added, (item) => keyFn(item)),
    removed: sortBy(removed, (item) => keyFn(item)),
    changed: sortBy(changed, (item) => item.name),
  };
}
