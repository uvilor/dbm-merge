import React, { useState } from 'react';
import { Link } from 'react-router-dom';

import type { AppState } from '../types';

interface ResultsContext {
  state: AppState;
  onGenerate: (direction: 'AtoB' | 'BtoA') => Promise<void>;
  onBuildPrompt: (direction: 'AtoB' | 'BtoA') => Promise<void>;
  onToggleSelection: (key: string) => void;
}

interface ResultsPageProps {
  context: ResultsContext;
}

const ResultsPage: React.FC<ResultsPageProps> = ({ context }) => {
  const { state, onGenerate, onBuildPrompt, onToggleSelection } = context;
  const diff = state.compare.diff;
  const [direction, setDirection] = useState<'AtoB' | 'BtoA'>(state.compare.direction);

  if (!diff) {
    return (
      <main>
        <h1>No diff yet</h1>
        <p>Run a comparison first.</p>
        <Link to="/compare" style={{ color: '#38bdf8' }}>
          ← Back to compare
        </Link>
      </main>
    );
  }

  return (
    <main>
      <h1>Schema differences</h1>
      <p>
        Review discovered differences below. Toggle items to exclude them from script generation. (Filtering is a work in progress
        – unchecked items are marked but still included in the generated SQL for now.)
      </p>
      <section style={{ display: 'flex', gap: '24px' }}>
        <div style={{ flex: 1 }}>
          <DiffGroup
            title="Tables"
            items={[
              ...diff.tables.added.map((table) => ({ key: `table:${table.name}`, label: `Only in B: ${table.name}` })),
              ...diff.tables.removed.map((table) => ({ key: `table:${table.name}`, label: `Only in A: ${table.name}` })),
              ...diff.tables.changed.map((change) => ({
                key: `table:${change.table.name}`,
                label: `${change.table.name} (columns Δ${change.columnChanges.length}, indexes Δ${change.indexChanges.length})`,
              })),
            ]}
            selected={state.selectedObjects}
            onToggle={onToggleSelection}
          />
          <DiffGroup
            title="Views"
            items={[
              ...diff.views.added.map((view) => ({ key: `view:${view.name}`, label: `Only in B: ${view.name}` })),
              ...diff.views.removed.map((view) => ({ key: `view:${view.name}`, label: `Only in A: ${view.name}` })),
              ...diff.views.changed.map((view) => ({ key: `view:${view.name}`, label: `${view.name} definition changed` })),
            ]}
            selected={state.selectedObjects}
            onToggle={onToggleSelection}
          />
        </div>
        <aside style={{ maxWidth: '320px' }}>
          <label>
            Direction
            <select value={direction} onChange={(event) => setDirection(event.target.value as 'AtoB' | 'BtoA')}>
              <option value="AtoB">A → B</option>
              <option value="BtoA">B → A</option>
            </select>
          </label>
          <button style={{ marginTop: '12px', width: '100%' }} onClick={() => onGenerate(direction)} disabled={state.loading}>
            {state.loading ? 'Building SQL…' : 'Generate migration script'}
          </button>
          <button style={{ marginTop: '12px', width: '100%' }} onClick={() => onBuildPrompt(direction)}>
            Build AI prompt
          </button>
          <Link to="/compare" style={{ color: '#38bdf8', display: 'block', marginTop: '16px' }}>
            ← Back to compare
          </Link>
        </aside>
      </section>
    </main>
  );
};

interface DiffGroupProps {
  title: string;
  items: Array<{ key: string; label: string }>;
  selected: Set<string>;
  onToggle: (key: string) => void;
}

const DiffGroup: React.FC<DiffGroupProps> = ({ title, items, selected, onToggle }) => {
  if (items.length === 0) {
    return null;
  }
  return (
    <section style={{ background: '#1e293b', padding: '16px', borderRadius: '12px', marginBottom: '16px' }}>
      <h2>{title}</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {items.map((item) => (
          <li key={item.key} style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '8px' }}>
            <input type="checkbox" checked={selected.has(item.key)} onChange={() => onToggle(item.key)} />
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default ResultsPage;
