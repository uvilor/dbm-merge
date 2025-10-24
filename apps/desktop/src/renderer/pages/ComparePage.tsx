import React, { useState } from 'react';
import { Link } from 'react-router-dom';

import type { PreferenceConfig } from '../../main/store';
import type { AppState } from '../types';

interface ComparePageProps {
  state: AppState;
  onCompare: (direction: 'AtoB' | 'BtoA') => Promise<void>;
  onPreferencesChange: (preferences: PreferenceConfig) => void;
}

const ComparePage: React.FC<ComparePageProps> = ({ state, onCompare, onPreferencesChange }) => {
  const [direction, setDirection] = useState<'AtoB' | 'BtoA'>('AtoB');
  const [preferences, setPreferences] = useState<PreferenceConfig>(state.preferences);

  const handlePreferenceChange = (updates: Partial<PreferenceConfig>) => {
    const next = { ...preferences, ...updates };
    setPreferences(next);
    onPreferencesChange(next);
  };

  return (
    <main>
      <h1>Compare schemas</h1>
      <p>Select comparison options. Schema discovery can take a few moments for large databases.</p>
      <div style={{ display: 'flex', gap: '24px' }}>
        <section style={{ background: '#1e293b', padding: '16px', borderRadius: '12px', flex: 1 }}>
          <h2>Options</h2>
          <label>
            Direction
            <select value={direction} onChange={(event) => setDirection(event.target.value as 'AtoB' | 'BtoA')}>
              <option value="AtoB">A → B</option>
              <option value="BtoA">B → A</option>
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
            <input type="checkbox" checked={preferences.withTransaction} onChange={(event) => handlePreferenceChange({ withTransaction: event.target.checked })} />
            Wrap migrations in a transaction
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
            <input type="checkbox" checked={preferences.safeMode} onChange={(event) => handlePreferenceChange({ safeMode: event.target.checked })} />
            Safe mode (comment destructive statements)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
            <input type="checkbox" checked={preferences.cascade} onChange={(event) => handlePreferenceChange({ cascade: event.target.checked })} />
            Allow cascade drops
          </label>
          <button style={{ marginTop: '16px' }} disabled={state.loading} onClick={() => onCompare(direction)}>
            {state.loading ? 'Scanning…' : 'Scan schemas'}
          </button>
          {state.error && <p style={{ color: '#f87171' }}>{state.error}</p>}
        </section>
        <aside style={{ maxWidth: '320px' }}>
          <h3>Ignored schemas</h3>
          <p>SchemaSync skips system schemas automatically:</p>
          <ul>
            <li>pg_catalog</li>
            <li>information_schema</li>
            <li>mysql</li>
            <li>performance_schema</li>
            <li>sys</li>
            <li>pg_toast</li>
          </ul>
          <Link to="/" style={{ color: '#38bdf8' }}>← Back to connections</Link>
        </aside>
      </div>
    </main>
  );
};

export default ComparePage;
