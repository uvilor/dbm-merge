import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';

import type { DiffResult } from '@schemasync/core';

import type { ConnectionConfig, PreferenceConfig } from '../../main/store';
import type { AppState } from '../types';
import ConnectionsPage from './ConnectionsPage';
import ComparePage from './ComparePage';
import ResultsPage from './ResultsPage';
import ScriptReviewPage from './ScriptReviewPage';

interface ActionContext {
  state: AppState;
  onCompare: (direction: 'AtoB' | 'BtoA') => Promise<void>;
  onGenerate: (direction: 'AtoB' | 'BtoA') => Promise<void>;
  onBuildPrompt: (direction: 'AtoB' | 'BtoA') => Promise<void>;
  onUpdateSql: (sql: string) => void;
  onToggleSelection: (key: string) => void;
  setPreferences: (preferences: PreferenceConfig) => void;
}

const DEFAULT_CONNECTION: ConnectionConfig = {
  kind: 'postgres',
  host: 'localhost',
  port: 5432,
  database: '',
  schema: 'public',
  user: 'postgres',
  password: '',
  rememberPassword: false,
  ssl: false,
};

const DEFAULT_PREFERENCES: PreferenceConfig = {
  safeMode: true,
  withTransaction: true,
  cascade: false,
};

const INITIAL_STATE: AppState = {
  connections: {
    source: { ...DEFAULT_CONNECTION },
    target: { ...DEFAULT_CONNECTION, kind: 'mariadb', port: 3306, schema: 'public' },
  },
  preferences: { ...DEFAULT_PREFERENCES },
  compare: {
    diff: null,
    lastGeneratedSql: '',
    lastPrompt: '',
    direction: 'AtoB',
  },
  loading: false,
  error: undefined,
  selectedObjects: new Set<string>(),
};

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const navigate = useNavigate();

  useEffect(() => {
    const debug = [
      'App useEffect running...',
      `window.schemasync available: ${!!window.schemasync}`,
      `window object keys: ${Object.keys(window).join(', ')}`,
    ].join('\n');
    setDebugInfo(debug);
    console.log(debug);
    
    if (window.schemasync) {
      console.log('Calling listConnections...');
      window.schemasync
        .listConnections()
        .then((data) => {
          console.log('Connections loaded:', data);
          setState((prev) => ({
            ...prev,
            connections: {
              source: data.connections.source ?? { ...DEFAULT_CONNECTION },
              target: data.connections.target ?? { ...DEFAULT_CONNECTION, kind: 'mariadb', port: 3306 },
            },
            preferences: data.preferences ?? { ...DEFAULT_PREFERENCES },
          }));
        })
        .catch((error) => {
          console.error('Error loading connections:', error);
        });
    } else {
      console.warn('window.schemasync not available, using default state');
    }
  }, []);

  const updateConnection = useCallback(
    (side: 'source' | 'target', updates: Partial<ConnectionConfig>) => {
      setState((prev) => ({
        ...prev,
        connections: {
          ...prev.connections,
          [side]: {
            ...prev.connections[side],
            ...updates,
          },
        },
      }));
    },
    [],
  );

  const setLoading = useCallback((loading: boolean, error?: string) => {
    setState((prev) => ({ ...prev, loading, error }));
  }, []);

  const handleSaveConnections = useCallback(async () => {
    if (window.schemasync) {
      await window.schemasync.saveConnections({ connections: state.connections });
    } else {
      console.warn('window.schemasync not available, cannot save connections');
    }
  }, [state.connections]);

  const handleTestConnection = useCallback(async (side: 'source' | 'target') => {
    if (!window.schemasync) {
      setLoading(false, 'API not available');
      return;
    }
    try {
      setLoading(true);
      await window.schemasync.testConnection(state.connections[side]);
      setLoading(false);
      setState((prev) => ({ ...prev, error: undefined }));
    } catch (error) {
      const err = error as Error;
      setLoading(false, err.message);
    }
  }, [setLoading, state.connections]);

  const handleCompare = useCallback(
    async (direction: 'AtoB' | 'BtoA') => {
      try {
        setLoading(true);
        const diff = await window.schemasync.compare({
          source: state.connections.source,
          target: state.connections.target,
        });
        setState((prev) => ({
          ...prev,
          compare: { ...prev.compare, diff, direction },
          loading: false,
          error: undefined,
          selectedObjects: collectObjectKeys(diff),
        }));
        navigate('/results');
      } catch (error) {
        const err = error as Error;
        setLoading(false, err.message);
      }
    },
    [navigate, setLoading, state.connections],
  );

  const handlePreferencesChange = useCallback((preferences: PreferenceConfig) => {
    setState((prev) => ({ ...prev, preferences }));
    window.schemasync.savePreferences(preferences).catch((error) => console.error(error));
  }, []);

  const handleGenerate = useCallback(
    async (direction: 'AtoB' | 'BtoA') => {
      if (!state.compare.diff) return;
      try {
        setLoading(true);
        const result = await window.schemasync.generate({
          connections: state.connections,
          targetDialect: direction === 'AtoB' ? state.connections.target.kind : state.connections.source.kind,
          options: { ...state.preferences, direction, ifExists: true },
        });
        setState((prev) => ({
          ...prev,
          compare: {
            ...prev.compare,
            lastGeneratedSql: result.sql,
            diff: result.diff,
            direction,
          },
          loading: false,
          error: undefined,
        }));
        navigate('/review');
      } catch (error) {
        const err = error as Error;
        setLoading(false, err.message);
      }
    },
    [navigate, setLoading, state.compare.diff, state.connections, state.preferences],
  );

  const handleBuildPrompt = useCallback(
    async (direction: 'AtoB' | 'BtoA') => {
      try {
        const result = await window.schemasync.buildPrompt({
          connections: state.connections,
          targetDialect: direction === 'AtoB' ? state.connections.target.kind : state.connections.source.kind,
          options: { ...state.preferences, direction, ifExists: true },
        });
        setState((prev) => ({
          ...prev,
          compare: { ...prev.compare, lastPrompt: result.prompt, lastGeneratedSql: result.sql, diff: result.diff, direction },
        }));
      } catch (error) {
        const err = error as Error;
        setState((prev) => ({ ...prev, error: err.message }));
      }
    },
    [state.connections, state.preferences],
  );

  const handleUpdateSql = useCallback((sql: string) => {
    setState((prev) => ({
      ...prev,
      compare: {
        ...prev.compare,
        lastGeneratedSql: sql,
      },
    }));
  }, []);

  const toggleSelection = useCallback((key: string) => {
    setState((prev) => {
      const next = new Set(prev.selectedObjects);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return { ...prev, selectedObjects: next };
    });
  }, []);

  const context: ActionContext = useMemo(
    () => ({
      state,
      onCompare: handleCompare,
      onGenerate: handleGenerate,
      onBuildPrompt: handleBuildPrompt,
      onUpdateSql: handleUpdateSql,
      onToggleSelection: toggleSelection,
      setPreferences: handlePreferencesChange,
    }),
    [handleBuildPrompt, handleCompare, handleGenerate, handlePreferencesChange, handleUpdateSql, state, toggleSelection],
  );

  return (
    <div>
      <div style={{ background: '#1e293b', padding: '10px', margin: '10px', borderRadius: '5px', color: 'white', fontSize: '12px' }}>
        <h3>Debug Info:</h3>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{debugInfo}</pre>
      </div>
      <Routes>
        <Route
          path="/"
          element={
            <ConnectionsPage
              state={state}
              onUpdateConnection={updateConnection}
              onSave={handleSaveConnections}
              onTest={handleTestConnection}
            />
          }
        />
        <Route
          path="/compare"
          element={<ComparePage state={state} onCompare={handleCompare} onPreferencesChange={handlePreferencesChange} />}
        />
        <Route
          path="/results"
          element={
            <ResultsPage
              context={context}
            />
          }
        />
        <Route
          path="/review"
          element={
            <ScriptReviewPage
              context={context}
            />
          }
        />
      </Routes>
    </div>
  );
};

export default App;

function collectObjectKeys(diff: DiffResult): Set<string> {
  const keys = new Set<string>();
  diff.tables.added.forEach((table) => keys.add(`table:${table.name}`));
  diff.tables.removed.forEach((table) => keys.add(`table:${table.name}`));
  diff.tables.changed.forEach((change) => keys.add(`table:${change.table.name}`));
  diff.views.added.forEach((view) => keys.add(`view:${view.name}`));
  diff.views.removed.forEach((view) => keys.add(`view:${view.name}`));
  diff.views.changed.forEach((view) => keys.add(`view:${view.name}`));
  return keys;
}
