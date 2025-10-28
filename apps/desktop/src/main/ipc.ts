import { dialog, ipcMain } from 'electron';
import { writeFile } from 'node:fs/promises';

import type {
  DiffResult,
  SchemaModel,
} from '@schemasync/core';

import { connectionToSchemaRef, keyStore, type ConnectionConfig, type PreferenceConfig } from './store';

interface ComparePayload {
  source: ConnectionConfig;
  target: ConnectionConfig;
}

interface GeneratePayload {
  connections: ComparePayload;
  targetDialect: 'postgres' | 'mariadb';
  options: PreferenceConfig & { direction: 'AtoB' | 'BtoA'; ifExists: boolean };
}

type CoreModule = typeof import('@schemasync/core');

let coreModulePromise: Promise<CoreModule> | undefined;

function loadCoreModule(): Promise<CoreModule> {
  if (!coreModulePromise) {
    coreModulePromise = import('@schemasync/core').catch(async (error: unknown) => {
      const nodeError = error as NodeJS.ErrnoException;
      const message = error instanceof Error ? error.message : '';
      const isMissingModule = nodeError?.code === 'ERR_MODULE_NOT_FOUND' || message.includes('Cannot find module');
      if (!isMissingModule) {
        throw error;
      }
      const coreSourceUrl = new URL('../../../../packages/core/src/index.ts', import.meta.url);
      return import(coreSourceUrl.href) as Promise<CoreModule>;
    });
  }
  return coreModulePromise;
}

const corePromise = loadCoreModule();

export function registerIpcHandlers() {
  ipcMain.handle('schemasync:list-connections', () => {
    return keyStore.load();
  });

  ipcMain.handle('schemasync:save-connections', (_event, payload: { connections: ComparePayload }) => {
    keyStore.saveConnections(payload.connections);
    return { status: 'ok' };
  });

  ipcMain.handle('schemasync:save-preferences', (_event, preferences: PreferenceConfig) => {
    keyStore.savePreferences(preferences);
    return { status: 'ok' };
  });

  ipcMain.handle('schemasync:test-connection', async (_event, connection: ConnectionConfig) => {
    await loadSchema(connection);
    return { status: 'ok' };
  });

  ipcMain.handle('schemasync:save-file', async (_event, payload: { content: string; defaultPath?: string }) => {
    const result = await dialog.showSaveDialog({
      title: 'Save migration script',
      defaultPath: payload.defaultPath ?? 'migration.sql',
      filters: [{ name: 'SQL', extensions: ['sql'] }, { name: 'Text', extensions: ['txt'] }],
    });
    if (result.canceled || !result.filePath) {
      return { status: 'cancelled' };
    }
    await writeFile(result.filePath, payload.content, 'utf-8');
    return { status: 'ok', path: result.filePath };
  });

  ipcMain.handle('schemasync:compare', async (_event, payload: ComparePayload) => {
    const diff = await loadDiff(payload.source, payload.target);
    return diff;
  });

  ipcMain.handle('schemasync:generate', async (_event, payload: GeneratePayload) => {
    const { toMariaDB, toPostgres } = await corePromise;
    const diff = await loadDiff(payload.connections.source, payload.connections.target);
    const sql = payload.targetDialect === 'mariadb'
      ? toMariaDB(diff, payload.options)
      : toPostgres(diff, payload.options);
    return { sql, diff };
  });

  ipcMain.handle('schemasync:prompt', async (_event, payload: GeneratePayload) => {
    const { buildReviewPrompt, toMariaDB, toPostgres } = await corePromise;
    const diff = await loadDiff(payload.connections.source, payload.connections.target);
    const sql = payload.targetDialect === 'mariadb'
      ? toMariaDB(diff, payload.options)
      : toPostgres(diff, payload.options);
    const summary = summarizeDiff(diff);

    const prompt = buildReviewPrompt({
      sourceKind: payload.connections.source.kind,
      targetKind: payload.connections.target.kind,
      diffSnippet: summary,
      ddlProposal: sql,
    });
    return { prompt, sql, diff };
  });
}

async function loadDiff(sourceConn: ConnectionConfig, targetConn: ConnectionConfig): Promise<DiffResult> {
  const { computeDiff, normalizeSchemaModel } = await corePromise;
  const [source, target] = await Promise.all([
    loadSchema(sourceConn),
    loadSchema(targetConn),
  ]);
  const normalizedSource = normalizeSchemaModel(source, {
    normalizeDefaults: true,
    nameCase: { strategy: 'lower' },
  });
  const normalizedTarget = normalizeSchemaModel(target, {
    normalizeDefaults: true,
    nameCase: { strategy: 'lower' },
  });
  return computeDiff(normalizedSource, normalizedTarget);
}

async function loadSchema(config: ConnectionConfig): Promise<SchemaModel> {
  const { loadPostgres, loadMariaDB } = await corePromise;
  const ref = connectionToSchemaRef(config);
  return config.kind === 'postgres' ? loadPostgres(ref) : loadMariaDB(ref);
}

function summarizeDiff(diff: DiffResult): string {
  const lines: string[] = [];
  lines.push(`Tables added: ${diff.tables.removed.length}`);
  lines.push(`Tables removed: ${diff.tables.added.length}`);
  lines.push(`Tables changed: ${diff.tables.changed.length}`);
  lines.push(`Views changed: ${diff.views.changed.length}`);
  lines.push(`Routines changed: ${diff.routines.changed.length}`);
  lines.push(`Triggers changed: ${diff.triggers.changed.length}`);
  return lines.join('\n');
}
