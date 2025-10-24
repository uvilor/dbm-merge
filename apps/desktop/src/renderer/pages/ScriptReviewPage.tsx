import React, { useState } from 'react';
import { Link } from 'react-router-dom';

import type { AppState } from '../types';

interface ReviewContext {
  state: AppState;
  onBuildPrompt: (direction: 'AtoB' | 'BtoA') => Promise<void>;
  onUpdateSql: (sql: string) => void;
}

interface ScriptReviewPageProps {
  context: ReviewContext;
}

const ScriptReviewPage: React.FC<ScriptReviewPageProps> = ({ context }) => {
  const { state, onBuildPrompt, onUpdateSql } = context;
  const { compare } = state;
  const [direction, setDirection] = useState<'AtoB' | 'BtoA'>(state.compare.direction);
  const [message, setMessage] = useState<string | undefined>();

  const handleSave = async () => {
    if (!compare.lastGeneratedSql) return;
    const result = await window.schemasync.saveFile({ content: compare.lastGeneratedSql, defaultPath: 'migration.sql' });
    if (result.status === 'ok') {
      setMessage(`Saved to ${result.path}`);
    } else {
      setMessage('Save cancelled');
    }
  };

  const handlePrompt = async () => {
    await onBuildPrompt(direction);
    setMessage('Prompt updated.');
  };

  return (
    <main>
      <h1>Script review</h1>
      <p>Inspect and edit the generated SQL. Save it locally or build an AI review prompt for external validation.</p>
      <label>
        Direction
        <select value={direction} onChange={(event) => setDirection(event.target.value as 'AtoB' | 'BtoA')}>
          <option value="AtoB">A → B</option>
          <option value="BtoA">B → A</option>
        </select>
      </label>
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
        <div>
          <h2>DDL Proposal</h2>
          <textarea
            style={{ width: '100%', minHeight: '320px' }}
            value={compare.lastGeneratedSql}
            onChange={(event) => onUpdateSql(event.target.value)}
          />
          <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
            <button onClick={handleSave} disabled={!compare.lastGeneratedSql}>
              Save to file
            </button>
            <button onClick={handlePrompt} disabled={!compare.lastGeneratedSql}>
              Build AI prompt
            </button>
          </div>
        </div>
        <div>
          <h2>AI Prompt</h2>
          <textarea style={{ width: '100%', minHeight: '320px' }} value={compare.lastPrompt} readOnly />
        </div>
      </section>
      {message && <p>{message}</p>}
      {state.error && <p style={{ color: '#f87171' }}>{state.error}</p>}
      <Link to="/results" style={{ color: '#38bdf8', display: 'inline-block', marginTop: '16px' }}>
        ← Back to results
      </Link>
    </main>
  );
};

export default ScriptReviewPage;
