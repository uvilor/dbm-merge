import React from 'react';
import { Link } from 'react-router-dom';

import type { ConnectionConfig } from '../../main/store';
import type { AppState } from '../types';

interface ConnectionsPageProps {
  state: AppState;
  onUpdateConnection: (side: 'source' | 'target', updates: Partial<ConnectionConfig>) => void;
  onSave: () => Promise<void>;
  onTest: (side: 'source' | 'target') => Promise<void>;
}

const ConnectionsPage: React.FC<ConnectionsPageProps> = ({ state, onUpdateConnection, onSave, onTest }) => {
  const { connections, loading, error } = state;
  return (
    <main>
      <h1>SchemaSync – Connections</h1>
      <p>Configure database connections for side A and side B. Passwords are only stored if you enable “remember password”.</p>
      <section className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <ConnectionForm title="Source (A)" connection={connections.source} onChange={(updates) => onUpdateConnection('source', updates)} onTest={() => onTest('source')} loading={loading} />
        <ConnectionForm title="Target (B)" connection={connections.target} onChange={(updates) => onUpdateConnection('target', updates)} onTest={() => onTest('target')} loading={loading} />
      </section>
      {error && <p style={{ color: '#f87171' }}>{error}</p>}
      <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
        <button onClick={onSave} disabled={loading}>
          Save connections
        </button>
        <Link to="/compare" style={{ alignSelf: 'center', color: '#38bdf8' }}>
          Continue to Compare →
        </Link>
      </div>
    </main>
  );
};

interface ConnectionFormProps {
  title: string;
  connection: ConnectionConfig;
  onChange: (updates: Partial<ConnectionConfig>) => void;
  onTest: () => Promise<void>;
  loading: boolean;
}

const ConnectionForm: React.FC<ConnectionFormProps> = ({ title, connection, onChange, onTest, loading }) => {
  return (
    <form style={{ background: '#1e293b', padding: '16px', borderRadius: '12px' }}>
      <h2>{title}</h2>
      <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
        <label>
          Engine
          <select value={connection.kind} onChange={(event) => onChange({ kind: event.target.value as ConnectionConfig['kind'], port: event.target.value === 'postgres' ? 5432 : 3306 })}>
            <option value="postgres">PostgreSQL</option>
            <option value="mariadb">MariaDB</option>
          </select>
        </label>
        <label>
          Host
          <input value={connection.host} onChange={(event) => onChange({ host: event.target.value })} />
        </label>
        <label>
          Port
          <input type="number" value={connection.port} onChange={(event) => onChange({ port: Number(event.target.value) })} />
        </label>
        <label>
          Database
          <input value={connection.database} onChange={(event) => onChange({ database: event.target.value })} />
        </label>
        <label>
          Schema
          <input value={connection.schema} onChange={(event) => onChange({ schema: event.target.value })} />
        </label>
        <label>
          User
          <input value={connection.user} onChange={(event) => onChange({ user: event.target.value })} />
        </label>
        <label>
          Password
          <input type="password" value={connection.password ?? ''} onChange={(event) => onChange({ password: event.target.value })} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input type="checkbox" checked={connection.rememberPassword} onChange={(event) => onChange({ rememberPassword: event.target.checked })} />
          Remember password
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input type="checkbox" checked={connection.ssl ?? false} onChange={(event) => onChange({ ssl: event.target.checked })} />
          Enable SSL
        </label>
      </div>
      <button type="button" onClick={onTest} disabled={loading} style={{ marginTop: '16px' }}>
        Test connection
      </button>
    </form>
  );
};

export default ConnectionsPage;
