import React, { useRef, useState } from 'react';

type Props = {
  teamId: string;
  clueId: string;
  position: { lat: number; lng: number } | null;
  onResult: (r: { ok: boolean; similarity: number; distance: number; geoOk: boolean; imgOk: boolean }) => void;
};

export default function CameraUpload({ teamId, clueId, position, onResult }: Props) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const onPick = () => inputRef.current?.click();

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !position) return;
    setBusy(true);
    // no preview to be displayed
    try {
      const form = new FormData();
      form.append('photo', file);
      form.append('teamId', teamId);
      form.append('clueId', clueId);
      form.append('lat', String(position.lat));
      form.append('lng', String(position.lng));
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      const json = await res.json();
      onResult(json);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>Submit proof photo</strong>
        <button disabled={!position || busy} onClick={onPick}>{busy ? 'Uploading...' : 'Take/Upload Photo'}</button>
      </div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleChange} />
      {/* no preview image displayed by request */}
      {!position && <div style={{ marginTop: 8, color: '#ef4444' }}>Waiting for location...</div>}
    </div>
  );
}
