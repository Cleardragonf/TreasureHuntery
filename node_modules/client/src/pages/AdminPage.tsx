import React, { useEffect, useMemo, useState } from 'react';
import MapEditor from '@/components/MapEditor';
import Modal from '@/components/Modal';
import MapAllEditor from '@/components/MapAllEditor';

type Clue = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  imagePath: string;
  hint: string;
  nextClueId?: string | null;
  requirePhoto?: boolean;
  requireQA?: boolean;
  question?: string;
  expectedAnswer?: string;
  hints?: string[];
  hintsPhoto?: string[];
  hintsAnswer?: string[];
};

type GameConfig = { startClueId: string; clues: Clue[]; wrongImageTips?: string[]; wrongAnswerTips?: string[] };

export default function AdminPage() {
  const [cfg, setCfg] = useState<GameConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState(localStorage.getItem('adminToken') || 'dev');
  const headers = useMemo(() => ({ 'x-admin-token': token }), [token]);
  const [tab, setTab] = useState<'clues' | 'tips' | 'map'>('clues');
  const [mapClueId, setMapClueId] = useState<string | null>(null);

  useEffect(() => { localStorage.setItem('adminToken', token); }, [token]);

  async function load() {
    const res = await fetch('/api/admin/config', { headers });
    if (res.ok) setCfg(await res.json());
  }
  useEffect(() => { load(); }, []);

  async function saveStart(id: string) {
    setBusy(true);
    await fetch(`/api/admin/start/${encodeURIComponent(id)}`, { method: 'PUT', headers });
    await load();
    setBusy(false);
  }

  async function createClue() {
    const id = prompt('New clue id (unique, no spaces):');
    if (!id) return;
    const name = prompt('Clue name:') || id;
    setBusy(true);
    await fetch('/api/admin/clue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ id, name, lat: 0, lng: 0, radiusMeters: 50, hint: '', hints: ['', '', ''] })
    });
    await load();
    setBusy(false);
  }

  async function updateClue(c: Clue) {
    setBusy(true);
    await fetch(`/api/admin/clue/${encodeURIComponent(c.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(c)
    });
    await load();
    setBusy(false);
  }

  async function deleteClue(id: string) {
    if (!confirm(`Delete clue ${id}?`)) return;
    setBusy(true);
    await fetch(`/api/admin/clue/${encodeURIComponent(id)}`, { method: 'DELETE', headers });
    await load();
    setBusy(false);
  }

  async function uploadImage(id: string, file: File) {
    const form = new FormData();
    form.append('image', file);
    setBusy(true);
    await fetch(`/api/admin/clue/${encodeURIComponent(id)}/image`, { method: 'POST', headers, body: form });
    await load();
    setBusy(false);
  }

  async function saveTips(next: { wrongImageTips?: string[]; wrongAnswerTips?: string[] }) {
    setBusy(true);
    await fetch('/api/admin/tips', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(next) });
    await load();
    setBusy(false);
  }

  if (!cfg) return <div className="card">Loading config…</div>;

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
        <strong>Admin</strong>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: '#64748b' }}>Admin token</label>
          <input value={token} onChange={e => setToken(e.target.value)} style={{ padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setTab('clues')} disabled={tab==='clues'}>Clues</button>
          <button onClick={() => setTab('tips')} disabled={tab==='tips'}>Tips</button>
          <button onClick={() => setTab('map')} disabled={tab==='map'}>All Clues Map</button>
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        {tab === 'clues' && (
          <>
            <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={createClue} disabled={busy}>Add Clue</button>
              <button onClick={() => load()} disabled={busy}>Refresh</button>
              <div style={{ marginLeft: 'auto' }}>
                <label><strong>Start clue:</strong> </label>
                <select value={cfg.startClueId} onChange={e => saveStart(e.target.value)}>
                  {cfg.clues.map(c => <option key={c.id} value={c.id}>{c.id}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {cfg.clues.map((c) => (
                <div key={c.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>{c.id}</strong>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button onClick={() => setMapClueId(c.id)} title="Edit location">🎯</button>
                      <button onClick={() => updateClue(c)} disabled={busy}>Save</button>
                      <button onClick={() => deleteClue(c.id)} disabled={busy}>Delete</button>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                    <label>Name <input value={c.name} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, name: e.target.value}:x) }))} /></label>
                    <label>Next <input value={c.nextClueId ?? ''} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, nextClueId: e.target.value || null}:x) }))} /></label>
                    <label>Lat <input type="number" step="0.000001" value={c.lat} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, lat: Number(e.target.value)}:x) }))} /></label>
                    <label>Lng <input type="number" step="0.000001" value={c.lng} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, lng: Number(e.target.value)}:x) }))} /></label>
                    <label>Radius (m) <input type="number" value={c.radiusMeters} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, radiusMeters: Number(e.target.value)}:x) }))} /></label>
                    <label style={{ gridColumn: '1 / span 2' }}>Success Message <input value={c.hint} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, hint: e.target.value}:x) }))} /></label>
                    <div style={{ gridColumn: '1 / span 2', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      <label>Generic Hint 1 <input value={c.hints?.[0] || ''} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, hints: [e.target.value, x.hints?.[1] || '', x.hints?.[2] || '']}:x) }))} /></label>
                      <label>Generic Hint 2 <input value={c.hints?.[1] || ''} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, hints: [x.hints?.[0] || '', e.target.value, x.hints?.[2] || '']}:x) }))} /></label>
                      <label>Generic Hint 3 <input value={c.hints?.[2] || ''} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, hints: [x.hints?.[0] || '', x.hints?.[1] || '', e.target.value]}:x) }))} /></label>
                    </div>
                    <div style={{ gridColumn: '1 / span 2', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      <label>Photo Hint 1 <input value={c.hintsPhoto?.[0] || ''} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, hintsPhoto: [e.target.value, x.hintsPhoto?.[1] || '', x.hintsPhoto?.[2] || '']}:x) }))} /></label>
                      <label>Photo Hint 2 <input value={c.hintsPhoto?.[1] || ''} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, hintsPhoto: [x.hintsPhoto?.[0] || '', e.target.value, x.hintsPhoto?.[2] || '']}:x) }))} /></label>
                      <label>Photo Hint 3 <input value={c.hintsPhoto?.[2] || ''} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, hintsPhoto: [x.hintsPhoto?.[0] || '', x.hintsPhoto?.[1] || '', e.target.value]}:x) }))} /></label>
                    </div>
                    <div style={{ gridColumn: '1 / span 2', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      <label>Answer Hint 1 <input value={c.hintsAnswer?.[0] || ''} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, hintsAnswer: [e.target.value, x.hintsAnswer?.[1] || '', x.hintsAnswer?.[2] || '']}:x) }))} /></label>
                      <label>Answer Hint 2 <input value={c.hintsAnswer?.[1] || ''} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, hintsAnswer: [x.hintsAnswer?.[0] || '', e.target.value, x.hintsAnswer?.[2] || '']}:x) }))} /></label>
                      <label>Answer Hint 3 <input value={c.hintsAnswer?.[2] || ''} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, hintsAnswer: [x.hintsAnswer?.[0] || '', x.hintsAnswer?.[1] || '', e.target.value]}:x) }))} /></label>
                    </div>
                    <label style={{ gridColumn: '1 / span 2' }}>Validation Mode
                      <select
                        value={(c as any).validationMode || (((c as any).requirePhoto ?? true) && ((c as any).requireQA ?? false) ? 'both' : ((c as any).requireQA ? 'qa' : 'photo'))}
                        onChange={e => {
                          const v = e.target.value as any;
                          setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, validationMode: v, requirePhoto: (v==='photo'||v==='both'||v==='either'), requireQA: (v==='qa'||v==='both'||v==='either')}:x) }))
                        }}
                      >
                        <option value="photo">Photo only</option>
                        <option value="qa">Q/A only</option>
                        <option value="both">Both (photo AND answer)</option>
                        <option value="either">Either (photo OR answer)</option>
                      </select>
                    </label>
                    <label style={{ gridColumn: '1 / span 2' }}>Question <input value={(c as any).question || ''} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, question: e.target.value}:x) }))} /></label>
                    <label style={{ gridColumn: '1 / span 2' }}>Expected Answer <input value={(c as any).expectedAnswer || ''} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, expectedAnswer: e.target.value}:x) }))} /></label>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                    {c.imagePath && <img src={`/${c.imagePath}`} alt="ref" style={{ maxHeight: 80, borderRadius: 6 }} />}
                    <input type="file" accept="image/*" onChange={e => e.target.files && uploadImage(c.id, e.target.files[0])} />
                  </div>
                </div>
              ))}
            </div>

            <Modal open={!!mapClueId} onClose={() => setMapClueId(null)} title={`Edit location: ${mapClueId || ''}`}>
              {mapClueId && (() => {
                const c = cfg.clues.find(x => x.id === mapClueId)!;
                return (
                  <div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <button onClick={() => {
                        if (!navigator.geolocation) return alert('Geolocation not supported');
                        navigator.geolocation.getCurrentPosition(
                          (pos) => {
                            const { latitude, longitude } = pos.coords;
                            setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id === c.id ? { ...x, lat: latitude, lng: longitude } : x) }));
                          },
                          () => alert('Could not get your location. Please allow permission.'),
                          { enableHighAccuracy: true, timeout: 15000 }
                        );
                      }}>Use my location</button>
                      <div style={{ fontSize: 12, color: '#64748b' }}>Click on the map to drop the pin; drag small pin to resize radius.</div>
                    </div>
                    <MapEditor
                      lat={c.lat}
                      lng={c.lng}
                      radiusMeters={c.radiusMeters}
                      onChange={(v) => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, lat: v.lat, lng: v.lng, radiusMeters: v.radiusMeters}:x) }))}
                      height={420}
                    />
                    <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                      <button onClick={() => setMapClueId(null)}>Done</button>
                    </div>
                  </div>
                );
              })()}
            </Modal>
          </>
        )}
        {tab === 'tips' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <strong>Wrong Image Tips</strong>
                <ListEditor
                  items={cfg.wrongImageTips || []}
                  onChange={items => saveTips({ wrongImageTips: items })}
                />
              </div>
              <div>
                <strong>Wrong Answer Tips</strong>
                <ListEditor
                  items={cfg.wrongAnswerTips || []}
                  onChange={items => saveTips({ wrongAnswerTips: items })}
                />
              </div>
            </div>
          </div>
        )}
        {tab === 'map' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button onClick={() => load()} disabled={busy}>Refresh</button>
              <button
                onClick={async () => {
                  setBusy(true);
                  try {
                    for (const c of cfg.clues) {
                      await fetch(`/api/admin/clue/${encodeURIComponent(c.id)}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', ...headers },
                        body: JSON.stringify(c)
                      });
                    }
                    await load();
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
              >Save All</button>
            </div>
            <MapAllEditor
              clues={cfg.clues.map(c => ({ id: c.id, name: c.name, lat: c.lat, lng: c.lng, radiusMeters: c.radiusMeters }))}
              onChange={(id, update) => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===id?{...x, ...update}:x) }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ListEditor({ items, onChange }: { items: string[]; onChange: (items: string[]) => void }) {
  const [draft, setDraft] = useState('');
  return (
    <div className="card" style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Add a tip..." style={{ flex: 1, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} />
        <button onClick={() => { if (draft.trim()) { onChange([...items, draft.trim()]); setDraft(''); } }}>Add</button>
      </div>
      <ul style={{ paddingLeft: 18, marginTop: 8 }}>
        {items.map((t, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <span style={{ flex: 1 }}>{t}</span>
            <button onClick={() => onChange(items.filter((_, idx) => idx !== i))}>Remove</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
