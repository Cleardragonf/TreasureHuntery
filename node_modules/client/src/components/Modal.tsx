import React from 'react';

type Props = { open: boolean; onClose: () => void; title?: string; children: React.ReactNode; width?: number };

export default function Modal({ open, onClose, title, children, width = 720 }: Props) {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 8, boxShadow: '0 10px 30px rgba(0,0,0,0.2)', width, maxWidth: '95%', maxHeight: '90%', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: 12, borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center' }}>
          <strong style={{ flex: 1 }}>{title}</strong>
          <button onClick={onClose} style={{ background: '#e5e7eb', color: '#111827' }}>Close</button>
        </div>
        <div style={{ padding: 12 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

