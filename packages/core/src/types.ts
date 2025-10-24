export type DatabaseKind = 'postgres' | 'mariadb';

export interface SchemaRef {
  kind: DatabaseKind;
  host: string;
  port: number;
  database: string;
  schema: string;
  user: string;
  password?: string;
  ssl?: boolean;
}

export interface Column {
  name: string;
  dataType: string;
  length?: number;
  precisionScale?: {
    precision: number;
    scale: number;
  };
  nullable: boolean;
  default?: string | null;
  generated?: 'identity' | 'sequence' | 'auto_increment' | null;
  collation?: string | null;
}

export interface Index {
  name: string;
  unique: boolean;
  columns: string[];
  using?: string;
}

export interface ForeignKey {
  name: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
  onUpdate?: string;
  onDelete?: string;
}

export interface Check {
  name: string;
  expression: string;
}

export interface Table {
  name: string;
  columns: Column[];
  primaryKey?: {
    name?: string | null;
    columns: string[];
  };
  indexes: Index[];
  checks: Check[];
  fks: ForeignKey[];
}

export interface View {
  name: string;
  definition: string;
}

export interface Routine {
  name: string;
  kind: 'function' | 'procedure';
  language?: string;
  definition: string;
}

export interface Trigger {
  name: string;
  table: string;
  timing: 'before' | 'after';
  events: Array<'insert' | 'update' | 'delete'>;
  definition: string;
}

export interface SchemaModel {
  tables: Table[];
  views: View[];
  routines: Routine[];
  triggers: Trigger[];
}

export interface NameCaseOptions {
  strategy: 'preserve' | 'lower' | 'upper';
  ignore?: string[];
}

export interface NormalizationOptions {
  nameCase?: NameCaseOptions;
  normalizeDefaults?: boolean;
  mapTypes?: Record<string, string>;
}
