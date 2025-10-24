import { describe, expect, it } from 'vitest';

import type { SchemaModel } from '../src/types';
import { computeDiff } from '../src/diff';

const baseModel: SchemaModel = {
  tables: [
    {
      name: 'accounts',
      columns: [
        {
          name: 'id',
          dataType: 'uuid',
          nullable: false,
          default: 'gen_random_uuid()',
          generated: 'sequence',
        },
        {
          name: 'email',
          dataType: 'varchar',
          length: 255,
          nullable: false,
        },
      ],
      primaryKey: {
        name: 'accounts_pkey',
        columns: ['id'],
      },
      indexes: [
        { name: 'accounts_email_key', unique: true, columns: ['email'] },
      ],
      checks: [],
      fks: [],
    },
  ],
  views: [
    {
      name: 'active_accounts_v',
      definition: 'SELECT * FROM accounts WHERE active = true;',
    },
  ],
  routines: [],
  triggers: [],
};

const targetModel: SchemaModel = {
  tables: [
    {
      name: 'accounts',
      columns: [
        {
          name: 'id',
          dataType: 'uuid',
          nullable: false,
          default: 'gen_random_uuid()',
          generated: 'sequence',
        },
        {
          name: 'email',
          dataType: 'varchar',
          length: 128,
          nullable: false,
        },
        {
          name: 'created_at',
          dataType: 'timestamp',
          nullable: false,
          default: 'CURRENT_TIMESTAMP',
        },
      ],
      primaryKey: {
        name: 'accounts_pkey',
        columns: ['id'],
      },
      indexes: [
        { name: 'accounts_email_key', unique: false, columns: ['email'] },
        { name: 'accounts_created_at_idx', unique: false, columns: ['created_at'] },
      ],
      checks: [],
      fks: [],
    },
    {
      name: 'audit_log',
      columns: [
        {
          name: 'id',
          dataType: 'bigint',
          nullable: false,
          generated: 'sequence',
        },
        {
          name: 'payload',
          dataType: 'jsonb',
          nullable: true,
        },
      ],
      indexes: [],
      checks: [],
      fks: [],
    },
  ],
  views: [],
  routines: [],
  triggers: [],
};

describe('computeDiff', () => {
  it('produces a structured diff for tables and indexes', () => {
    const diff = computeDiff(baseModel, targetModel);
    expect(diff).toMatchSnapshot();
  });
});
