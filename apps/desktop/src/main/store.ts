import Store from 'electron-store';

import type { DatabaseKind, SchemaRef } from '@schemasync/core';

export interface ConnectionConfig {
  kind: DatabaseKind;
  host: string;
  port: number;
  database: string;
  schema: string;
  user: string;
  rememberPassword: boolean;
  password?: string;
  ssl?: boolean;
}

export interface PreferenceConfig {
  safeMode: boolean;
  withTransaction: boolean;
  cascade: boolean;
}

export interface StoredData {
  connections: {
    source?: ConnectionConfig;
    target?: ConnectionConfig;
  };
  preferences: PreferenceConfig;
}

export interface KeyStore {
  load(): StoredData;
  saveConnections(payload: StoredData['connections']): void;
  savePreferences(preferences: PreferenceConfig): void;
}

const defaults: StoredData = {
  connections: {},
  preferences: {
    safeMode: true,
    withTransaction: true,
    cascade: false,
  },
};

class ElectronKeyStore implements KeyStore {
  private store = new Store<StoredData>({
    name: 'schemasync',
    encryptionKey: process.env.SCHEMASYNC_STORE_KEY,
    defaults,
  });

  load(): StoredData {
    const data = this.store.store ?? defaults;
    return {
      connections: data.connections ?? {},
      preferences: data.preferences ?? defaults.preferences,
    };
  }

  saveConnections(payload: StoredData['connections']): void {
    const sanitized: StoredData['connections'] = {};
    if (payload.source) {
      sanitized.source = sanitizeConnection(payload.source);
    }
    if (payload.target) {
      sanitized.target = sanitizeConnection(payload.target);
    }
    this.store.set('connections', sanitized);
  }

  savePreferences(preferences: PreferenceConfig): void {
    this.store.set('preferences', preferences);
  }
}

function sanitizeConnection(connection: ConnectionConfig): ConnectionConfig {
  const base: ConnectionConfig = {
    ...connection,
    password: connection.rememberPassword ? connection.password : undefined,
  };
  return base;
}

export function connectionToSchemaRef(connection: ConnectionConfig): SchemaRef {
  return {
    kind: connection.kind,
    host: connection.host,
    port: connection.port,
    database: connection.database,
    schema: connection.schema,
    user: connection.user,
    password: connection.password,
    ssl: connection.ssl,
  };
}

export const keyStore: KeyStore = new ElectronKeyStore();
