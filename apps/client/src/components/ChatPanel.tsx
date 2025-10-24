import React, { useEffect, useRef, useState } from 'react';
import { getSocket } from '@/lib/socket';

type Msg = { role: 'user'|'bot'|'system'; text: string; ts: number };

export default function ChatPanel({ teamId, position }: { teamId: string; position: {lat:number;lng:number}|null }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement|null>(null);

  useEffect(() => {
    const s = getSocket(teamId);
    const onHist = (hist: Msg[]) => setMessages(hist);
    const onMsg = (m: Msg) => setMessages(prev => [...prev, m]);
    s.on('chat:history', onHist);
    s.on('chat:message', onMsg);
    return () => { s.off('chat:history', onHist); s.off('chat:message', onMsg); };
  }, [teamId]);

  useEffect(() => {
    // scroll to bottom
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    const t = text.trim();
    if (!t) return;
    const s = getSocket(teamId);
    s.emit('chat:send', { teamId, text: t, lat: position?.lat, lng: position?.lng });
    setText('');
  }

  return (
    <div className="card">
      <strong>Chat</strong>
      <div ref={listRef} style={{ marginTop: 8, maxHeight: 220, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', background: m.role==='user'?'#e0f2fe':'#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 8px', maxWidth: '80%' }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>{m.role.toUpperCase()}</div>
            <div>{m.text}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Type a message (e.g., hint, where, answer: ...)" style={{ flex: 1, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} />
        <button onClick={send}>Send</button>
      </div>
    </div>
  );
}

