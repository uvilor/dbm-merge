export type DatabaseKind = 'postgres' | 'mariadb';

export interface Column {
  name: string;
  dataType: string;
  nullable: boolean;
  default?: string | null;
}

export interface Table {
  name: string;
  columns: Column[];
}

export interface SchemaModel {
  tables: Table[];
}

export async function loadSchema(_conn: string, _engine: DatabaseKind): Promise<SchemaModel> {
  // Stub: en el MVP real, aquí se consulta information_schema/pg_catalog
  return { tables: [] };
}

export function computeDiff(a: SchemaModel, b: SchemaModel) {
  // Stub mínimo
  return {
    addedTables: b.tables.filter(tb => !a.tables.some(x => x.name === tb.name)).map(t => t.name),
    removedTables: a.tables.filter(tb => !b.tables.some(x => x.name === tb.name)).map(t => t.name)
  };
}

export function generateSql(_diff: ReturnType<typeof computeDiff>, _engine: DatabaseKind): string {
  // Stub mínimo de generador
  return `-- SQL de homologación (MVP stub)`;
}
