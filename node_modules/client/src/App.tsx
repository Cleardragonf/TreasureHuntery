import React, { useEffect, useMemo, useState } from 'react';
import MapView from './components/MapView';
import CameraUpload from './components/CameraUpload';
import HintFeed from './components/HintFeed';
import { getSocket } from './lib/socket';
import AdminMUIPage from './pages/AdminMUIPage';
import ChatPanel from './components/ChatPanel';

type Clue = { id: string; name: string; lat: number; lng: number; radiusMeters: number; requireQA?: boolean; question?: string; validationMode?: 'photo'|'qa'|'both'|'either' };

export default function App() {
  const [teamId, setTeamId] = useState(() => localStorage.getItem('teamId') || `team-${Math.random().toString(36).slice(2, 8)}`);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [currentClueId, setCurrentClueId] = useState<string | null>(null);
  const [currentClue, setCurrentClue] = useState<Clue | null>(null);
  const [hints, setHints] = useState<{ message: string; nextClueId: string | null; done: boolean }[]>([]);
  const [showAdmin, setShowAdmin] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => { localStorage.setItem('teamId', teamId); }, [teamId]);

  useEffect(() => {
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setAccuracy(pos.coords.accuracy);
        setGeoError(null);
      },
      (err) => {
        console.error('Geolocation error', err);
        if (err.code === err.PERMISSION_DENIED) setGeoError('Permission denied.');
        else if (err.code === err.POSITION_UNAVAILABLE) setGeoError('Position unavailable.');
        else if (err.code === err.TIMEOUT) setGeoError('Timed out getting location.');
        else setGeoError('Unable to get location.');
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  function retryGeolocation() {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setAccuracy(pos.coords.accuracy);
        setGeoError(null);
      },
      (err) => {
        console.error('Geolocation retry error', err);
        setGeoError('Still cannot access location. Check browser permission.');
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  useEffect(() => {
    const socket = getSocket(teamId);
    socket.on('state', (s: { currentClueId: string; hint: string }) => {
      setCurrentClueId(s.currentClueId);
      setHints([{ message: s.hint, nextClueId: s.currentClueId, done: false }]);
    });
    socket.on('hint', (h: { message: string; nextClueId: string | null; done: boolean }) => {
      setHints((prev) => [h, ...prev]);
      if (h.nextClueId) setCurrentClueId(h.nextClueId);
    });
    socket.on('progress', (p: { nextClueId: string | null; done: boolean }) => {
      if (p.nextClueId) setCurrentClueId(p.nextClueId);
      if (p.done) setHints(prev => [{ message: 'Hunt complete!', nextClueId: null, done: true }, ...prev]);
      else setHints([]);
    });
    return () => { socket.off('state'); socket.off('hint'); socket.off('progress'); };
  }, [teamId]);

  useEffect(() => {
    async function loadClue(id: string) {
      const res = await fetch(`/api/clue/${id}`);
      if (res.ok) setCurrentClue(await res.json());
    }
    if (currentClueId) {
      // Reset hint feed for each new clue
      setHints([]);
      loadClue(currentClueId);
    }
  }, [currentClueId]);

  const target = useMemo(() => currentClue ? ({ lat: currentClue.lat, lng: currentClue.lng, radiusMeters: currentClue.radiusMeters }) : null, [currentClue]);

  return (
    <div className="app">
      <div className="header">
        <strong>Treasure Hunt</strong>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <label>Team:</label>
          <input value={teamId} onChange={(e) => setTeamId(e.target.value)} style={{ padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} />
          <button onClick={() => setShowAdmin(v => !v)}>{showAdmin ? 'Player View' : 'Admin'}</button>
        </div>
      </div>
      <div className="content">
        {!showAdmin && (
          <>
            <div>
              <MapView position={position} accuracy={accuracy} target={target} />
            </div>
            <div className="sidebar">
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>Location</strong>
                  <div style={{ fontSize: 12, color: geoError ? '#ef4444' : '#16a34a' }}>
                    {position ? `OK (\u00B1${Math.round(accuracy ?? 0)}m)${demoMode ? ' • Demo' : ''}` : (geoError ?? 'Waiting...')}
                  </div>
                </div>
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  <button onClick={retryGeolocation}>Retry</button>
                  <button onClick={() => { if (currentClue) { setPosition({ lat: currentClue.lat, lng: currentClue.lng }); setAccuracy(5); setGeoError('(Using demo location)'); setDemoMode(true); setHints(prev => [{ message: `Demo location set to ${currentClue.name}`, nextClueId: null, done: false }, ...prev]); } }} disabled={!currentClue}>Use demo location</button>
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
                  If blocked, allow location in your browser site settings.
                </div>
              </div>
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>Current Clue</strong>
                  <span style={{ color: '#64748b', fontSize: 12 }}>{currentClue?.name || 'Loading...'}</span>
                </div>
                <div style={{ marginTop: 8, fontSize: 13, color: '#334155' }}>
                  Move into the green circle and submit a photo of the target.
                </div>
                <div style={{ marginTop: 8 }}>
                  <button onClick={() => {
                    const s = getSocket(teamId);
                    s.emit('chat:send', { teamId, text: 'hint', lat: position?.lat, lng: position?.lng });
                  }}>Reveal hint</button>
                </div>
              </div>
              {(currentClue?.requireQA || currentClue?.validationMode === 'qa' || currentClue?.validationMode === 'both' || currentClue?.validationMode === 'either') && (
                <div className="card">
                  <strong>Question</strong>
                  <div style={{ marginTop: 8 }}>{currentClue.question || 'Answer the question for this location.'}</div>
                  <QAForm
                    disabled={!position}
                    onSubmit={async (answer) => {
                      if (!currentClueId || !position) return;
                      const res = await fetch('/api/answer', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ teamId, clueId: currentClueId, answer, lat: position.lat, lng: position.lng })
                      });
                      const json = await res.json();
                      setHints(prev => [{ message: `Answer ${json.ansOk ? 'accepted' : 'not accepted'}` , nextClueId: null, done: false }, ...prev]);
                    }}
                  />
                </div>
              )}
              {currentClueId && (
                <CameraUpload
                  teamId={teamId}
                  clueId={currentClueId}
                  position={position}
                  onResult={(r) => {
                    setHints((prev) => [
                      { message: `Upload result — geo:${r.geoOk ? 'ok' : 'no'} img:${r.imgOk ? 'ok' : 'no'} (sim ${(r.similarity * 100).toFixed(0)}%)`, nextClueId: null, done: false },
                      ...prev,
                    ]);
                  }}
                />
              )}
              <HintFeed hints={hints} />
              <ChatPanel teamId={teamId} position={position} />
            </div>
          </>
        )}
        {showAdmin && (
          <div style={{ gridColumn: '1 / span 2' }}>
            <AdminMUIPage />
          </div>
        )}
      </div>
    </div>
  );
}

function QAForm({ disabled, onSubmit }: { disabled?: boolean; onSubmit: (answer: string) => void | Promise<void> }) {
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
      <input value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Type your answer" style={{ flex: 1, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} />
      <button disabled={disabled || busy || !answer.trim()} onClick={async () => { setBusy(true); try { await onSubmit(answer.trim()); setAnswer(''); } finally { setBusy(false); } }}>{busy ? 'Submitting...' : 'Submit'}</button>
    </div>
  );
}
