import React from 'react';

type Hint = { message: string; nextClueId: string | null; done: boolean };

export default function HintFeed({ hints }: { hints: Hint[] }) {
  return (
    <div className="card">
      <strong>Hints</strong>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        {hints.length === 0 && <div>No hints yet. Complete a clue to receive one.</div>}
        {hints.map((h, i) => (
          <div key={i} className="hint">
            <div>{h.message}</div>
            {h.nextClueId && <div style={{ fontSize: 12, color: '#64748b' }}>Next clue: {h.nextClueId}</div>}
            {h.done && <div style={{ fontSize: 12, color: '#16a34a' }}>Treasure hunt complete! 🎉</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

