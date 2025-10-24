import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default icon URLs for Leaflet
// @ts-ignore
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
});

type Props = {
  lat: number;
  lng: number;
  radiusMeters: number;
  onChange: (v: { lat: number; lng: number; radiusMeters: number }) => void;
  height?: number;
};

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), 16));
  }, [lat, lng, map]);
  return null;
}

function ClickToSet({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
}

export default function MapEditor({ lat, lng, radiusMeters, onChange, height = 220 }: Props) {
  const center = useMemo(() => L.latLng(lat || 0, lng || 0), [lat, lng]);
  const radius = Math.max(1, radiusMeters || 50);

  // Compute a radius handle position due east of the center
  const handlePos = useMemo(() => {
    const latRad = (center.lat * Math.PI) / 180;
    const metersPerDegLon = 111320 * Math.cos(latRad);
    const dLon = (radius / metersPerDegLon) || 0.0001;
    return L.latLng(center.lat, center.lng + dLon);
  }, [center, radius]);

  const [localCenter, setLocalCenter] = useState(center);
  const [localHandle, setLocalHandle] = useState(handlePos);

  useEffect(() => setLocalCenter(center), [center]);
  useEffect(() => setLocalHandle(handlePos), [handlePos]);

  function onCenterDragEnd(e: any) {
    const p = e.target.getLatLng();
    // Move handle to maintain radius to the east
    const latRad = (p.lat * Math.PI) / 180;
    const metersPerDegLon = 111320 * Math.cos(latRad);
    const dLon = (radius / metersPerDegLon) || 0.0001;
    const newHandle = L.latLng(p.lat, p.lng + dLon);
    setLocalCenter(p);
    setLocalHandle(newHandle);
    onChange({ lat: p.lat, lng: p.lng, radiusMeters: radius });
  }

  function onHandleDrag(e: any) {
    const p = e.target.getLatLng();
    setLocalHandle(p);
  }

  function onHandleDragEnd(e: any) {
    const p = e.target.getLatLng();
    const newRadius = p.distanceTo(localCenter);
    onChange({ lat: localCenter.lat, lng: localCenter.lng, radiusMeters: Math.max(1, Math.round(newRadius)) });
  }

  return (
    <div>
      <div style={{ height, width: '100%' }}>
        <MapContainer center={[localCenter.lat, localCenter.lng]} zoom={16} style={{ height: '100%', width: '100%', borderRadius: 8 }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap contributors' />
          <ClickToSet onClick={(lat, lng) => {
            const p = L.latLng(lat, lng);
            const latRad = (p.lat * Math.PI) / 180;
            const metersPerDegLon = 111320 * Math.cos(latRad);
            const dLon = (radius / metersPerDegLon) || 0.0001;
            const newHandle = L.latLng(p.lat, p.lng + dLon);
            setLocalCenter(p);
            setLocalHandle(newHandle);
            onChange({ lat: p.lat, lng: p.lng, radiusMeters: radius });
          }} />
          <Marker position={[localCenter.lat, localCenter.lng]} draggable eventHandlers={{ dragend: onCenterDragEnd }} />
          <Circle center={[localCenter.lat, localCenter.lng]} radius={radius} pathOptions={{ color: '#22c55e' }} />
          <Marker position={[localHandle.lat, localHandle.lng]} draggable eventHandlers={{ drag: onHandleDrag, dragend: onHandleDragEnd }} />
          <Recenter lat={localCenter.lat} lng={localCenter.lng} />
        </MapContainer>
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#64748b' }}>Radius:</span>
        <input
          type="number"
          min={1}
          value={radius}
          onChange={(e) => onChange({ lat: localCenter.lat, lng: localCenter.lng, radiusMeters: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
          style={{ width: 100, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }}
        />
        <span style={{ fontSize: 12 }}>m</span>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: '#64748b' }}>
          Drag center pin to move; drag small pin to change radius
        </div>
      </div>
    </div>
  );
}
