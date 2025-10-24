import { contextBridge, ipcRenderer } from 'electron';

import type { DiffResult } from '@schemasync/core';

import type { ConnectionConfig, PreferenceConfig, StoredData } from '../main/store';

console.log('Preload script loading...');

export interface IpcAPI {
  listConnections(): Promise<StoredData>;
  saveConnections(payload: { connections: { source?: ConnectionConfig; target?: ConnectionConfig } }): Promise<{ status: string }>;
  savePreferences(preferences: PreferenceConfig): Promise<{ status: string }>;
  testConnection(connection: ConnectionConfig): Promise<{ status: string }>;
  compare(payload: { source: ConnectionConfig; target: ConnectionConfig }): Promise<DiffResult>;
  generate(payload: {
    connections: { source: ConnectionConfig; target: ConnectionConfig };
    targetDialect: 'postgres' | 'mariadb';
    options: PreferenceConfig & { direction: 'AtoB' | 'BtoA'; ifExists: boolean };
  }): Promise<{ sql: string; diff: DiffResult }>;
  buildPrompt(payload: {
    connections: { source: ConnectionConfig; target: ConnectionConfig };
    targetDialect: 'postgres' | 'mariadb';
    options: PreferenceConfig & { direction: 'AtoB' | 'BtoA'; ifExists: boolean };
  }): Promise<{ prompt: string; sql: string; diff: DiffResult }>;
  saveFile(payload: { content: string; defaultPath?: string }): Promise<{ status: string; path?: string }>;
}

const api: IpcAPI = {
  listConnections: () => ipcRenderer.invoke('schemasync:list-connections'),
  saveConnections: (payload) => ipcRenderer.invoke('schemasync:save-connections', payload),
  savePreferences: (preferences) => ipcRenderer.invoke('schemasync:save-preferences', preferences),
  testConnection: (connection) => ipcRenderer.invoke('schemasync:test-connection', connection),
  compare: (payload) => ipcRenderer.invoke('schemasync:compare', payload),
  generate: (payload) => ipcRenderer.invoke('schemasync:generate', payload),
  buildPrompt: (payload) => ipcRenderer.invoke('schemasync:prompt', payload),
  saveFile: (payload) => ipcRenderer.invoke('schemasync:save-file', payload),
};

console.log('Exposing schemasync API...');
if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('schemasync', api);
  console.log('schemasync API exposed successfully via contextBridge');
  try {
    Reflect.set(window, 'schemasync', api);
  } catch (error) {
    console.warn('Unable to mirror schemasync API on window object', error);
  }
} else {
  Reflect.set(window, 'schemasync', api);
  console.log('schemasync API assigned directly to window');
}

declare global {
  interface Window {
    schemasync?: IpcAPI;
  }
}
