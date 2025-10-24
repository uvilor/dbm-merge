import isEqual from 'lodash/isEqual.js';
import sortBy from 'lodash/sortBy.js';

import type { Check, Column, ForeignKey, Index, Table } from '../types';
import type {
  ChangeEnvelope,
  CheckChange,
  ColumnChange,
  ForeignKeyChange,
  IndexChange,
  PrimaryKeyChange,
} from './types';

export function compareColumns(
  source: Table,
  target: Table,
): {
  added: Column[];
  removed: Column[];
  changed: ChangeEnvelope<ColumnChange>[];
} {
  const sourceMap = new Map(source.columns.map((column) => [column.name, column]));
  const targetMap = new Map(target.columns.map((column) => [column.name, column]));

  const added: Column[] = [];
  const removed: Column[] = [];
  const changed: ChangeEnvelope<ColumnChange>[] = [];

  target.columns.forEach((column) => {
    if (!sourceMap.has(column.name)) {
      added.push(column);
    }
  });

  source.columns.forEach((column) => {
    if (!targetMap.has(column.name)) {
      removed.push(column);
    }
  });

  source.columns.forEach((column) => {
    const counterpart = targetMap.get(column.name);
    if (!counterpart) return;
    const change = diffColumn(column, counterpart);
    if (change) {
      changed.push({
        name: column.name,
        change,
      });
    }
  });

  return {
    added: sortBy(added, (col) => col.name),
    removed: sortBy(removed, (col) => col.name),
    changed: sortBy(changed, (change) => change.name),
  };
}

function diffColumn(source: Column, target: Column): ColumnChange | null {
  const change: ColumnChange = {};
  if (source.dataType !== target.dataType) {
    change.typeChanged = { from: source.dataType, to: target.dataType };
  }
  if (source.nullable !== target.nullable) {
    change.nullableChanged = { from: source.nullable, to: target.nullable };
  }
  if (!isEqual(source.default ?? null, target.default ?? null)) {
    change.defaultChanged = { from: source.default, to: target.default };
  }
  if ((source.generated ?? null) !== (target.generated ?? null)) {
    change.generatedChanged = { from: source.generated ?? null, to: target.generated ?? null };
  }
  if ((source.collation ?? null) !== (target.collation ?? null)) {
    change.collationChanged = { from: source.collation ?? null, to: target.collation ?? null };
  }

  return Object.keys(change).length > 0 ? change : null;
}

export function comparePrimaryKeys(
  source?: Table['primaryKey'],
  target?: Table['primaryKey'],
): PrimaryKeyChange | null {
  if (!source && !target) return null;
  if (!source && target) return { to: target };
  if (source && !target) return { from: source };
  if (!isEqual(sortBy(source!.columns), sortBy(target!.columns))) {
    return {
      from: source!,
      to: target!,
    };
  }
  return null;
}

export function compareIndexes(
  source: Index[],
  target: Index[],
): {
  added: Index[];
  removed: Index[];
  changed: ChangeEnvelope<IndexChange>[];
} {
  const sourceMap = new Map(source.map((index) => [index.name, index]));
  const targetMap = new Map(target.map((index) => [index.name, index]));

  const added: Index[] = [];
  const removed: Index[] = [];
  const changed: ChangeEnvelope<IndexChange>[] = [];

  target.forEach((index) => {
    if (!sourceMap.has(index.name)) {
      added.push(index);
    }
  });

  source.forEach((index) => {
    if (!targetMap.has(index.name)) {
      removed.push(index);
    }
  });

  source.forEach((index) => {
    const targetIndex = targetMap.get(index.name);
    if (!targetIndex) return;
    if (!isEqual(normalizeIndex(index), normalizeIndex(targetIndex))) {
      changed.push({ name: index.name, change: { from: index, to: targetIndex } });
    }
  });

  return {
    added: sortBy(added, (index) => index.name),
    removed: sortBy(removed, (index) => index.name),
    changed: sortBy(changed, (index) => index.name),
  };
}

function normalizeIndex(index: Index) {
  return {
    unique: index.unique,
    using: index.using?.toLowerCase() ?? null,
    columns: sortBy(index.columns.map((col) => col.toLowerCase())),
  };
}

export function compareChecks(
  source: Check[],
  target: Check[],
): {
  added: Check[];
  removed: Check[];
  changed: ChangeEnvelope<CheckChange>[];
} {
  const sourceMap = new Map(source.map((check) => [check.name, check]));
  const targetMap = new Map(target.map((check) => [check.name, check]));

  const added: Check[] = [];
  const removed: Check[] = [];
  const changed: ChangeEnvelope<CheckChange>[] = [];

  target.forEach((check) => {
    if (!sourceMap.has(check.name)) {
      added.push(check);
    }
  });

  source.forEach((check) => {
    if (!targetMap.has(check.name)) {
      removed.push(check);
    }
  });

  source.forEach((check) => {
    const targetCheck = targetMap.get(check.name);
    if (!targetCheck) return;
    if (!isEqual(normalizeExpression(check.expression), normalizeExpression(targetCheck.expression))) {
      changed.push({ name: check.name, change: { from: check, to: targetCheck } });
    }
  });

  return {
    added: sortBy(added, (check) => check.name),
    removed: sortBy(removed, (check) => check.name),
    changed: sortBy(changed, (check) => check.name),
  };
}

function normalizeExpression(expression: string) {
  return expression.replace(/\s+/g, ' ').trim();
}

export function compareForeignKeys(
  source: ForeignKey[],
  target: ForeignKey[],
): {
  added: ForeignKey[];
  removed: ForeignKey[];
  changed: ChangeEnvelope<ForeignKeyChange>[];
} {
  const sourceMap = new Map(source.map((fk) => [fk.name, fk]));
  const targetMap = new Map(target.map((fk) => [fk.name, fk]));

  const added: ForeignKey[] = [];
  const removed: ForeignKey[] = [];
  const changed: ChangeEnvelope<ForeignKeyChange>[] = [];

  target.forEach((fk) => {
    if (!sourceMap.has(fk.name)) {
      added.push(fk);
    }
  });

  source.forEach((fk) => {
    if (!targetMap.has(fk.name)) {
      removed.push(fk);
    }
  });

  source.forEach((fk) => {
    const targetFk = targetMap.get(fk.name);
    if (!targetFk) return;
    if (!isEqual(normalizeForeignKey(fk), normalizeForeignKey(targetFk))) {
      changed.push({ name: fk.name, change: { from: fk, to: targetFk } });
    }
  });

  return {
    added: sortBy(added, (fk) => fk.name),
    removed: sortBy(removed, (fk) => fk.name),
    changed: sortBy(changed, (fk) => fk.name),
  };
}

function normalizeForeignKey(fk: ForeignKey) {
  return {
    columns: sortBy(fk.columns.map((col) => col.toLowerCase())),
    refTable: fk.refTable.toLowerCase(),
    refColumns: sortBy(fk.refColumns.map((col) => col.toLowerCase())),
    onUpdate: fk.onUpdate?.toUpperCase() ?? null,
    onDelete: fk.onDelete?.toUpperCase() ?? null,
  };
}
