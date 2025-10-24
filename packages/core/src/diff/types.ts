import type { Check, Column, ForeignKey, Index, Routine, Table, Trigger, View } from '../types';

export interface ChangeEnvelope<TChange> {
  name: string;
  change: TChange;
}

export interface ColumnChange {
  typeChanged?: { from: string; to: string };
  nullableChanged?: { from: boolean; to: boolean };
  defaultChanged?: { from: string | null | undefined; to: string | null | undefined };
  generatedChanged?: { from: Column['generated']; to: Column['generated'] };
  collationChanged?: { from: string | null | undefined; to: string | null | undefined };
}

export interface PrimaryKeyChange {
  from?: Table['primaryKey'];
  to?: Table['primaryKey'];
}

export interface IndexChange {
  from: Index;
  to: Index;
}

export interface ForeignKeyChange {
  from: ForeignKey;
  to: ForeignKey;
}

export interface CheckChange {
  from: Check;
  to: Check;
}

export interface DefinitionChange {
  from: string;
  to: string;
}

export interface TableChange {
  table: Table;
  sourceTable: Table;
  addedColumns: Column[];
  removedColumns: Column[];
  columnChanges: ChangeEnvelope<ColumnChange>[];
  primaryKeyChange?: PrimaryKeyChange;
  addedIndexes: Index[];
  removedIndexes: Index[];
  indexChanges: ChangeEnvelope<IndexChange>[];
  addedChecks: Check[];
  removedChecks: Check[];
  checkChanges: ChangeEnvelope<CheckChange>[];
  addedForeignKeys: ForeignKey[];
  removedForeignKeys: ForeignKey[];
  foreignKeyChanges: ChangeEnvelope<ForeignKeyChange>[];
}

export interface ObjectCollectionDiff<T, TChange = DefinitionChange> {
  added: T[];
  removed: T[];
  changed: ChangeEnvelope<TChange>[];
}

export interface DiffResult {
  tables: {
    added: Table[];
    removed: Table[];
    changed: TableChange[];
  };
  views: ObjectCollectionDiff<View>;
  routines: ObjectCollectionDiff<Routine>;
  triggers: ObjectCollectionDiff<Trigger>;
}
