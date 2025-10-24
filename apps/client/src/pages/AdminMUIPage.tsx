import React, { useEffect, useMemo, useState } from 'react';
import MapEditor from '@/components/MapEditor';
import MapAllEditor from '@/components/MapAllEditor';
import {
  Box, Paper, Typography, Stack, Button, Tabs, Tab, TextField, Select, MenuItem,
  FormControl, InputLabel, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  Divider, List, ListItem, ListItemText, Snackbar, Alert
} from '@mui/material';
import Grid from '@mui/material/Grid';
import RoomIcon from '@mui/icons-material/Room';
import DeleteIcon from '@mui/icons-material/Delete';

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
  validationMode?: 'photo'|'qa'|'both'|'either';
};

type GameConfig = { startClueId: string; clues: Clue[]; wrongImageTips?: string[]; wrongAnswerTips?: string[] };

export default function AdminMUIPage() {
  const [cfg, setCfg] = useState<GameConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState(localStorage.getItem('adminToken') || 'dev');
  const headers = useMemo(() => ({ 'x-admin-token': token }), [token]);
  const [tab, setTab] = useState<'clues' | 'tips' | 'map'>('clues');
  const [mapClueId, setMapClueId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{open:boolean; msg:string; severity:'success'|'error'|'info'|'warning'}>({open:false,msg:'',severity:'success'});

  useEffect(() => { localStorage.setItem('adminToken', token); }, [token]);

  async function load() {
    const res = await fetch('/api/admin/config', { headers });
    if (res.ok) setCfg(await res.json());
  }
  useEffect(() => { load(); }, []);

  async function saveStart(id: string) {
    try {
      setBusy(true);
      const res = await fetch(`/api/admin/start/${encodeURIComponent(id)}`, { method: 'PUT', headers });
      if (!res.ok) throw new Error('Failed to set start clue');
      await load();
      setToast({open:true,msg:'Start clue updated',severity:'success'});
    } catch (e:any) {
      setToast({open:true,msg:e.message||'Failed to set start clue',severity:'error'});
    } finally {
      setBusy(false);
    }
  }

  async function createClue() {
    const id = prompt('New clue id (unique, no spaces):');
    if (!id) return;
    const name = prompt('Clue name:') || id;
    try {
      setBusy(true);
      const res = await fetch('/api/admin/clue', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ id, name, lat: 0, lng: 0, radiusMeters: 50, hint: '', hints: ['', '', ''] }) });
      if (!res.ok) throw new Error('Failed to create clue');
      await load();
      setToast({open:true,msg:`Clue ${id} created`,severity:'success'});
    } catch (e:any) {
      setToast({open:true,msg:e.message||'Failed to create clue',severity:'error'});
    } finally {
      setBusy(false);
    }
  }

  async function updateClue(c: Clue) {
    try {
      setBusy(true);
      const res = await fetch(`/api/admin/clue/${encodeURIComponent(c.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(c) });
      if (!res.ok) throw new Error('Failed to save clue');
      await load();
      setToast({open:true,msg:`Clue ${c.id} saved`,severity:'success'});
    } catch (e:any) {
      setToast({open:true,msg:e.message||'Failed to save clue',severity:'error'});
    } finally {
      setBusy(false);
    }
  }

  async function deleteClue(id: string) {
    if (!confirm(`Delete clue ${id}?`)) return;
    try {
      setBusy(true);
      const res = await fetch(`/api/admin/clue/${encodeURIComponent(id)}`, { method: 'DELETE', headers });
      if (!res.ok) throw new Error('Failed to delete clue');
      await load();
      setToast({open:true,msg:`Clue ${id} deleted`,severity:'success'});
    } catch (e:any) {
      setToast({open:true,msg:e.message||'Failed to delete clue',severity:'error'});
    } finally {
      setBusy(false);
    }
  }

  async function uploadImage(id: string, file: File) {
    const form = new FormData();
    form.append('image', file);
    try {
      setBusy(true);
      const res = await fetch(`/api/admin/clue/${encodeURIComponent(id)}/image`, { method: 'POST', headers, body: form });
      if (!res.ok) throw new Error('Failed to upload image');
      await load();
      setToast({open:true,msg:`Reference image set for ${id}`,severity:'success'});
    } catch (e:any) {
      setToast({open:true,msg:e.message||'Failed to upload image',severity:'error'});
    } finally {
      setBusy(false);
    }
  }

  async function saveTips(next: { wrongImageTips?: string[]; wrongAnswerTips?: string[] }) {
    setBusy(true);
    await fetch('/api/admin/tips', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(next) });
    await load();
    setBusy(false);
  }

  // Loading UI moved to main return to keep hooks order
  const filteredClues = useMemo(() => {
    const list = cfg?.clues || [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(c => c.id.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
  }, [cfg, search]);

  return (
    <>
    { !cfg ? (
      <Paper sx={{ p: 2 }}>
        <Typography>Loading config…</Typography>
      </Paper>
    ) : (
    <Paper sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" spacing={2} justifyContent="space-between">
        <Typography variant="h6">Admin</Typography>
        <TextField size="small" label="Admin token" value={token} onChange={e => setToken(e.target.value)} />
      </Stack>
      <Tabs value={tab} onChange={(_,v: 'clues'|'tips'|'map') => setTab(v)} sx={{ mt: 2 }}>
        <Tab label="Clues" value="clues" />
        <Tab label="Tips" value="tips" />
        <Tab label="All Clues Map" value="map" />
      </Tabs>

      {tab === 'clues' && (
        <Box sx={{ mt: 2 }}>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
            <Button variant="contained" onClick={createClue} disabled={busy}>Add Clue</Button>
            <Button variant="outlined" onClick={() => load()} disabled={busy}>Refresh</Button>
            <TextField size="small" placeholder="Search by id or name" value={search} onChange={e => setSearch(e.target.value)} sx={{ minWidth: 220 }} />
            <Box sx={{ ml: 'auto', minWidth: 220 }}>
              <FormControl fullWidth size="small">
                <InputLabel id="startclue-label">Start clue</InputLabel>
                <Select labelId="startclue-label" label="Start clue" value={cfg.startClueId} onChange={e => saveStart(String(e.target.value))}>
                  {cfg.clues.map(c => <MenuItem key={c.id} value={c.id}>{c.id}</MenuItem>)}
                </Select>
              </FormControl>
            </Box>
          </Stack>

          <Grid container spacing={2}>
            {filteredClues.map((c) => (
              <Grid item xs={12} md={6} key={c.id}>
                <Paper sx={{ p: 2, height: '100%' }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Typography variant="subtitle1">{c.id}</Typography>
                    <Stack direction="row" spacing={1}>
                      <IconButton color="primary" title="Edit location" onClick={() => setMapClueId(c.id)}><RoomIcon /></IconButton>
                      <Button variant="contained" onClick={() => updateClue(c)} disabled={busy}>Save</Button>
                      <Button variant="outlined" color="error" onClick={() => deleteClue(c.id)} disabled={busy}>Delete</Button>
                    </Stack>
                  </Stack>
                  <Grid container spacing={2} sx={{ mt: 1 }}>
                  <Grid item xs={12} md={6}><TextField fullWidth size="small" label="Name" value={c.name} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, name: e.target.value}:x) }))} /></Grid>
                  <Grid item xs={12} md={6}><TextField fullWidth size="small" label="Next" value={c.nextClueId ?? ''} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, nextClueId: e.target.value || null}:x) }))} /></Grid>
                  <Grid item xs={12} md={4}><TextField fullWidth size="small" type="number" label="Lat" value={c.lat} error={c.lat < -90 || c.lat > 90} helperText={(c.lat < -90 || c.lat > 90) ? 'Lat must be between -90 and 90' : ''} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, lat: Number(e.target.value)}:x) }))} /></Grid>
                  <Grid item xs={12} md={4}><TextField fullWidth size="small" type="number" label="Lng" value={c.lng} error={c.lng < -180 || c.lng > 180} helperText={(c.lng < -180 || c.lng > 180) ? 'Lng must be between -180 and 180' : ''} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, lng: Number(e.target.value)}:x) }))} /></Grid>
                  <Grid item xs={12} md={4}><TextField fullWidth size="small" type="number" label="Radius (m)" value={c.radiusMeters} error={c.radiusMeters <= 0} helperText={c.radiusMeters <= 0 ? 'Radius must be > 0' : ''} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, radiusMeters: Number(e.target.value)}:x) }))} /></Grid>
                  <Grid item xs={12}><TextField fullWidth size="small" label="Success Message" value={c.hint} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, hint: e.target.value}:x) }))} /></Grid>
                  <Grid item xs={12} md={6}>
                    <FormControl fullWidth size="small">
                      <InputLabel id={`vmode-${c.id}`}>Validation Mode</InputLabel>
                      <Select
                        labelId={`vmode-${c.id}`}
                        label="Validation Mode"
                        value={c.validationMode || ((c.requirePhoto ?? true) && (c.requireQA ?? false) ? 'both' : ((c.requireQA ? 'qa' : 'photo')))}
                        onChange={e => {
                          const v = e.target.value as any;
                          setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, validationMode: v, requirePhoto: (v==='photo'||v==='both'||v==='either'), requireQA: (v==='qa'||v==='both'||v==='either')}:x) }))
                        }}
                      >
                        <MenuItem value="photo">Photo only</MenuItem>
                        <MenuItem value="qa">Q/A only</MenuItem>
                        <MenuItem value="both">Both (photo AND answer)</MenuItem>
                        <MenuItem value="either">Either (photo OR answer)</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid2>
                  <Grid item xs={12} md={6}>
                    <TextField fullWidth size="small" label="Question" value={c.question || ''} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, question: e.target.value}:x) }))} />
                  </Grid2>
                  <Grid2 xs={12} md={6}>
                    <TextField fullWidth size="small" label="Expected Answer" value={c.expectedAnswer || ''} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, expectedAnswer: e.target.value}:x) }))} />
                  </Grid2>
                  <Grid item xs={12}><Divider /></Grid>
                  <Grid item xs={12} md={4}><TextField fullWidth size="small" label="Generic Hint 1" value={c.hints?.[0] || ''} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, hints: [e.target.value, x.hints?.[1] || '', x.hints?.[2] || '']}:x) }))} /></Grid>
                  <Grid item xs={12} md={4}><TextField fullWidth size="small" label="Generic Hint 2" value={c.hints?.[1] || ''} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, hints: [x.hints?.[0] || '', e.target.value, x.hints?.[2] || '']}:x) }))} /></Grid>
                  <Grid item xs={12} md={4}><TextField fullWidth size="small" label="Generic Hint 3" value={c.hints?.[2] || ''} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, hints: [x.hints?.[0] || '', x.hints?.[1] || '', e.target.value]}:x) }))} /></Grid>
                  <Grid item xs={12} md={4}><TextField fullWidth size="small" label="Photo Hint 1" value={c.hintsPhoto?.[0] || ''} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, hintsPhoto: [e.target.value, x.hintsPhoto?.[1] || '', x.hintsPhoto?.[2] || '']}:x) }))} /></Grid>
                  <Grid item xs={12} md={4}><TextField fullWidth size="small" label="Photo Hint 2" value={c.hintsPhoto?.[1] || ''} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, hintsPhoto: [x.hintsPhoto?.[0] || '', e.target.value, x.hintsPhoto?.[2] || '']}:x) }))} /></Grid>
                  <Grid item xs={12} md={4}><TextField fullWidth size="small" label="Photo Hint 3" value={c.hintsPhoto?.[2] || ''} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, hintsPhoto: [x.hintsPhoto?.[0] || '', x.hintsPhoto?.[1] || '', e.target.value]}:x) }))} /></Grid>
                  <Grid item xs={12} md={4}><TextField fullWidth size="small" label="Answer Hint 1" value={c.hintsAnswer?.[0] || ''} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, hintsAnswer: [e.target.value, x.hintsAnswer?.[1] || '', x.hintsAnswer?.[2] || '']}:x) }))} /></Grid>
                  <Grid item xs={12} md={4}><TextField fullWidth size="small" label="Answer Hint 2" value={c.hintsAnswer?.[1] || ''} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, hintsAnswer: [x.hintsAnswer?.[0] || '', e.target.value, x.hintsAnswer?.[2] || '']}:x) }))} /></Grid>
                  <Grid item xs={12} md={4}><TextField fullWidth size="small" label="Answer Hint 3" value={c.hintsAnswer?.[2] || ''} onChange={e => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, hintsAnswer: [x.hintsAnswer?.[0] || '', x.hintsAnswer?.[1] || '', e.target.value]}:x) }))} /></Grid>
                  <Grid item xs={12}>
                    <Stack direction="row" spacing={2} alignItems="center">
                      {c.imagePath && <img src={`/${c.imagePath}`} alt="ref" style={{ maxHeight: 80, borderRadius: 6 }} />}
                      <Button variant="outlined" component="label">Upload reference image
                        <input hidden type="file" accept="image/*" onChange={e => e.target.files && uploadImage(c.id, e.target.files[0])} />
                      </Button>
                    </Stack>
                  </Grid2>
                </Grid2>
              </Paper>
              </Grid2>
            ))}
          </Grid2>

          <Dialog fullWidth maxWidth="md" open={!!mapClueId} onClose={() => setMapClueId(null)}>
            <DialogTitle>Edit location: {mapClueId || ''}</DialogTitle>
            <DialogContent dividers>
              {mapClueId && (() => {
                const c = cfg.clues.find(x => x.id === mapClueId)!;
                return (
                  <Box>
                    <Stack direction="row" spacing={2} sx={{ mb: 1 }}>
                      <Button onClick={() => {
                        if (!navigator.geolocation) return alert('Geolocation not supported');
                        navigator.geolocation.getCurrentPosition(
                          (pos) => {
                            const { latitude, longitude } = pos.coords;
                            setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id === c.id ? { ...x, lat: latitude, lng: longitude } : x) }));
                          },
                          () => alert('Could not get your location. Please allow permission.'),
                          { enableHighAccuracy: true, timeout: 15000 }
                        );
                      }}>Use my location</Button>
                      <Typography variant="body2" color="text.secondary">Click map to drop pin; drag small pin to resize radius.</Typography>
                    </Stack>
                    <MapEditor
                      lat={c.lat}
                      lng={c.lng}
                      radiusMeters={c.radiusMeters}
                      onChange={(v) => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===c.id?{...x, lat: v.lat, lng: v.lng, radiusMeters: v.radiusMeters}:x) }))}
                      height={420}
                    />
                  </Box>
                );
              })()}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setMapClueId(null)}>Done</Button>
            </DialogActions>
          </Dialog>
        </Box>
      )}

      {tab === 'tips' && (
          <Grid container spacing={2} sx={{ mt: 2 }}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="subtitle1">Wrong Image Tips</Typography>
              <ListEditor items={cfg.wrongImageTips || []} onChange={items => saveTips({ wrongImageTips: items })} />
            </Paper>
          </Grid2>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="subtitle1">Wrong Answer Tips</Typography>
              <ListEditor items={cfg.wrongAnswerTips || []} onChange={items => saveTips({ wrongAnswerTips: items })} />
            </Paper>
          </Grid2>
        </Grid2>
      )}

      {tab === 'map' && (
        <Box sx={{ mt: 2 }}>
          <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
            <Button variant="outlined" onClick={() => load()} disabled={busy}>Refresh</Button>
            <Button variant="contained" disabled={busy} onClick={async () => {
              setBusy(true);
              try {
                for (const c of cfg.clues) {
                  await fetch(`/api/admin/clue/${encodeURIComponent(c.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(c) });
                }
                await load();
              } finally {
                setBusy(false);
              }
            }}>Save All</Button>
          </Stack>
          <Paper sx={{ p: 1 }}>
            <MapAllEditor clues={cfg.clues.map(c => ({ id: c.id, name: c.name, lat: c.lat, lng: c.lng, radiusMeters: c.radiusMeters }))} onChange={(id: string, update: Partial<{lat:number;lng:number;radiusMeters:number}>) => setCfg(cfg => cfg && ({ ...cfg, clues: cfg.clues.map(x => x.id===id?{...x, ...update}:x) }))} />
          </Paper>
        </Box>
      )}
    </Paper>
    ) }
    <Snackbar open={toast.open} autoHideDuration={2500} onClose={() => setToast(s => ({...s, open:false}))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
      <Alert severity={toast.severity} onClose={() => setToast(s => ({...s, open:false}))}>{toast.msg}</Alert>
    </Snackbar>
    </>
  );
}

function ListEditor({ items, onChange }: { items: string[]; onChange: (items: string[]) => void }) {
  const [draft, setDraft] = useState('');
  return (
    <Box>
      <Stack direction="row" spacing={1}>
        <TextField size="small" fullWidth placeholder="Add a tip..." value={draft} onChange={e => setDraft(e.target.value)} />
        <Button variant="contained" onClick={() => { if (draft.trim()) { onChange([...items, draft.trim()]); setDraft(''); } }}>Add</Button>
      </Stack>
      <List>
        {items.map((t, i) => (
          <ListItem key={i}
            secondaryAction={<IconButton edge="end" aria-label="delete" onClick={() => onChange(items.filter((_, idx) => idx !== i))}><DeleteIcon /></IconButton>}
          >
            <ListItemText primary={t} />
          </ListItem>
        ))}
      </List>
    </Box>
  );
}
