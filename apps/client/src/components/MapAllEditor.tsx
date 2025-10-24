import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default icons
// @ts-ignore
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
});

export type MiniClue = { id: string; name: string; lat: number; lng: number; radiusMeters: number };

type Props = {
  clues: MiniClue[];
  onChange: (id: string, update: Partial<MiniClue>) => void;
  height?: number;
};

export default function MapAllEditor({ clues, onChange, height = 520 }: Props) {
  const center = useMemo(() => {
    if (clues.length === 0) return L.latLng(0, 0);
    const lat = clues.reduce((s, c) => s + c.lat, 0) / clues.length;
    const lng = clues.reduce((s, c) => s + c.lng, 0) / clues.length;
    return L.latLng(lat, lng);
  }, [clues]);

  return (
    <div style={{ height }}>
      <MapContainer center={[center.lat, center.lng]} zoom={13} style={{ height: '100%', width: '100%', borderRadius: 8 }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
        {clues.map((c) => {
          const handlePos = (() => {
            const latRad = (c.lat * Math.PI) / 180;
            const metersPerDegLon = 111320 * Math.cos(latRad);
            const dLon = (c.radiusMeters / metersPerDegLon) || 0.0001;
            return L.latLng(c.lat, c.lng + dLon);
          })();
          return (
            <React.Fragment key={c.id}>
              <Marker
                position={[c.lat, c.lng]}
                draggable
                eventHandlers={{
                  dragend(e) {
                    const p = e.target.getLatLng();
                    onChange(c.id, { lat: p.lat, lng: p.lng });
                  }
                }}
              />
              <Circle center={[c.lat, c.lng]} radius={c.radiusMeters} pathOptions={{ color: '#22c55e' }} />
              <Marker
                position={[handlePos.lat, handlePos.lng]}
                draggable
                eventHandlers={{
                  dragend(e) {
                    const p = e.target.getLatLng();
                    const centerLatLng = L.latLng(c.lat, c.lng);
                    const newRadius = Math.max(1, Math.round(p.distanceTo(centerLatLng)));
                    onChange(c.id, { radiusMeters: newRadius });
                  }
                }}
              />
            </React.Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}

