import chalk from 'chalk';
import { describe, expect, it } from 'vitest';

import { parseConnection, renderDiffSummary, summarizeDiff } from '../src/index';

chalk.level = 0;

describe('CLI helpers', () => {
  it('parses connection URLs with defaults', () => {
    const ref = parseConnection('postgres://user:pass@localhost:5432/app?schema=public');
    expect(ref).toEqual({
      kind: 'postgres',
      host: 'localhost',
      port: 5432,
      database: 'app',
      schema: 'public',
      user: 'user',
      password: 'pass',
      ssl: false,
    });
  });

  it('summarizes and renders diff counts consistently', () => {
    const diff = {
      tables: {
        added: [{ name: 'accounts', columns: [], indexes: [], checks: [], fks: [] }],
        removed: [],
        changed: [
          {
            table: { name: 'profiles', columns: [], indexes: [], checks: [], fks: [] },
            sourceTable: { name: 'profiles', columns: [], indexes: [], checks: [], fks: [] },
            addedColumns: [],
            removedColumns: [],
            columnChanges: [],
            primaryKeyChange: undefined,
            addedIndexes: [],
            removedIndexes: [],
            indexChanges: [],
            addedChecks: [],
            removedChecks: [],
            checkChanges: [],
            addedForeignKeys: [],
            removedForeignKeys: [],
            foreignKeyChanges: [],
          },
        ],
      },
      views: { added: [], removed: [{ name: 'active_accounts', definition: '' }], changed: [] },
      routines: {
        added: [],
        removed: [],
        changed: [
          {
            name: 'sync_accounts',
            change: { from: 'SELECT 1', to: 'SELECT 2' },
          },
        ],
      },
      triggers: { added: [], removed: [], changed: [] },
    } as const;

    const summary = summarizeDiff(diff);
    expect(summary).toEqual({
      tables: { added: 1, removed: 0, changed: 1 },
      views: { added: 0, removed: 1, changed: 0 },
      routines: { added: 0, removed: 0, changed: 1 },
      triggers: { added: 0, removed: 0, changed: 0 },
    });

    const rendered = renderDiffSummary(diff as any);
    expect(rendered).toContain('Tables:');
    expect(rendered).toContain('Added: 1');
    expect(rendered).toContain('Removed: 0');
    expect(rendered).toContain('Changed: 1');
  });
});
