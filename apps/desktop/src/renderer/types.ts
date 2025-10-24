import type { DiffResult } from '@schemasync/core';

import type { ConnectionConfig, PreferenceConfig } from '../../main/store';

export type ConnectionState = ConnectionConfig;

export interface CompareState {
  diff: DiffResult | null;
  lastGeneratedSql: string;
  lastPrompt: string;
  direction: 'AtoB' | 'BtoA';
}

export interface AppState {
  connections: {
    source: ConnectionState;
    target: ConnectionState;
  };
  preferences: PreferenceConfig;
  compare: CompareState;
  loading: boolean;
  error?: string;
  selectedObjects: Set<string>;
}
