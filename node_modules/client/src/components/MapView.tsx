import { MapContainer, Marker, TileLayer, Circle, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import React, { useEffect } from 'react';

// Fix default marker icon path for Leaflet in bundlers
// @ts-ignore
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
});

type Props = {
  position: { lat: number; lng: number } | null;
  accuracy?: number | null;
  target?: { lat: number; lng: number; radiusMeters: number } | null;
};

function Recenter({ position }: { position: Props['position'] }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.setView([position.lat, position.lng], 16);
  }, [position, map]);
  return null;
}

export default function MapView({ position, accuracy, target }: Props) {
  return (
    <div style={{ height: '100%', width: '100%' }}>
      <MapContainer center={[0, 0]} zoom={2} style={{ height: '100%', width: '100%', borderRadius: 8 }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        {position && <Marker position={[position.lat, position.lng]} />}
        {position && accuracy && accuracy > 0 && (
          <Circle center={[position.lat, position.lng]} radius={accuracy} pathOptions={{ color: '#38bdf8' }} />
        )}
        {target && (
          <Circle center={[target.lat, target.lng]} radius={target.radiusMeters} pathOptions={{ color: '#22c55e' }} />
        )}
        <Recenter position={position} />
      </MapContainer>
    </div>
  );
}

