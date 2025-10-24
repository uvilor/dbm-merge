import { describe, expect, it } from 'vitest';

import { computeDiff } from '../src/diff';
import { toMariaDB, toPostgres } from '../src/generate';
import type { SchemaModel } from '../src/types';

const source: SchemaModel = {
  tables: [
    {
      name: 'users',
      columns: [
        { name: 'id', dataType: 'serial', nullable: false, generated: 'sequence' },
        { name: 'email', dataType: 'varchar', length: 255, nullable: false },
      ],
      primaryKey: { name: 'users_pkey', columns: ['id'] },
      indexes: [{ name: 'users_email_key', unique: true, columns: ['email'] }],
      checks: [],
      fks: [],
    },
  ],
  views: [],
  routines: [],
  triggers: [],
};

const target: SchemaModel = {
  tables: [
    {
      name: 'users',
      columns: [
        { name: 'id', dataType: 'serial', nullable: false, generated: 'sequence' },
        { name: 'email', dataType: 'varchar', length: 128, nullable: false },
        { name: 'status', dataType: 'varchar', length: 32, nullable: true, default: "'pending'" },
      ],
      primaryKey: { name: 'users_pkey', columns: ['id'] },
      indexes: [
        { name: 'users_email_key', unique: false, columns: ['email'] },
        { name: 'users_status_idx', unique: false, columns: ['status'] },
      ],
      checks: [],
      fks: [],
    },
  ],
  views: [],
  routines: [],
  triggers: [],
};

describe('DDL generators', () => {
  it('produces postgres DDL snapshots', () => {
    const diff = computeDiff(source, target);
    const sql = toPostgres(diff, { direction: 'AtoB', withTransaction: true, safeMode: true });
    expect(sql).toMatchSnapshot();
  });

  it('produces mariadb DDL snapshots', () => {
    const diff = computeDiff(source, target);
    const sql = toMariaDB(diff, { direction: 'AtoB', withTransaction: true, safeMode: false });
    expect(sql).toMatchSnapshot();
  });
});
