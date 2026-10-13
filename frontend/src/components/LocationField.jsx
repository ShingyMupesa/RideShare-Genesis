import { useEffect, useRef, useState } from 'react';

const PRESETS = [
  { label: 'Downtown Plaza', lat: -1.2921, lng: 36.8219 },
  { label: 'Airport Terminal', lat: -1.3192, lng: 36.9278 },
  { label: 'University Campus', lat: -1.2635, lng: 36.8121 },
  { label: 'Tech Park', lat: -1.2167, lng: 36.8956 },
];

// Free, keyless geocoding via OpenStreetMap's Nominatim — no API key to
// configure, consistent with the rest of the app never treating a paid
// external service as a hard dependency. If it's unreachable or returns
// nothing, manual coordinate entry stays available as a fallback below.
async function searchAddress(query, signal) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=0&limit=5&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('Address search failed');
  return res.json();
}

// Nominatim's display_name is a long comma-separated string; the first two
// segments are usually enough to identify a place without cluttering the UI.
function shortLabel(displayName) {
  return displayName.split(',').slice(0, 2).join(',').trim();
}

export default function LocationField({ label, value, onChange }) {
  const [query, setQuery] = useState(value.label || '');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState(false);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);
  const rootRef = useRef(null);

  useEffect(() => setQuery(value.label || ''), [value.label]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function handleQueryChange(text) {
    setQuery(text);
    onChange({ ...value, label: text });
    clearTimeout(debounceRef.current);
    abortRef.current?.abort();

    if (text.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      setSearching(true);
      setSearchError(false);
      setOpen(true);
      try {
        const results = await searchAddress(text, controller.signal);
        setSuggestions(results);
      } catch (err) {
        if (err.name !== 'AbortError') setSearchError(true);
      } finally {
        setSearching(false);
      }
    }, 400);
  }

  function pick(place) {
    const picked = { label: shortLabel(place.display_name), lat: Number(place.lat), lng: Number(place.lon) };
    setQuery(picked.label);
    onChange(picked);
    setSuggestions([]);
    setOpen(false);
  }

  function pickPreset(p) {
    setQuery(p.label);
    onChange(p);
    setSuggestions([]);
    setOpen(false);
  }

  const hasCoords = Number.isFinite(value.lat) && Number.isFinite(value.lng) && value.lat !== '' && value.lng !== '';

  return (
    <div className="form-field" ref={rootRef} style={{ position: 'relative' }}>
      <label>{label}</label>
      <input
        placeholder="Search an address or place…"
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        autoComplete="off"
      />
      {open && (searching || suggestions.length > 0 || searchError) && (
        <div className="location-suggestions">
          {searching && <div className="location-suggestions__note">Searching…</div>}
          {!searching && searchError && (
            <div className="location-suggestions__note">Couldn't reach the address search — try the presets below, or enter coordinates manually.</div>
          )}
          {!searching &&
            suggestions.map((s) => (
              <button key={s.place_id} type="button" className="location-suggestions__item" onClick={() => pick(s)}>
                {s.display_name}
              </button>
            ))}
        </div>
      )}
      <p className="muted" style={{ fontSize: '0.78rem', margin: '4px 0 0' }}>
        {hasCoords ? `${value.lat.toFixed?.(4) ?? value.lat}, ${value.lng.toFixed?.(4) ?? value.lng}` : 'No location selected yet'}
      </p>

      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        {PRESETS.map((p) => (
          <button key={p.label} type="button" className="pill" style={{ cursor: 'pointer', border: 'none' }} onClick={() => pickPreset(p)}>
            {p.label}
          </button>
        ))}
        <button
          type="button"
          className="pill"
          style={{ cursor: 'pointer', border: 'none' }}
          onClick={() => setManual((m) => !m)}
        >
          {manual ? 'Hide manual coordinates' : 'Enter coordinates manually'}
        </button>
      </div>

      {manual && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            type="number"
            step="any"
            placeholder="Latitude"
            value={value.lat}
            onChange={(e) => onChange({ ...value, lat: Number(e.target.value) })}
          />
          <input
            type="number"
            step="any"
            placeholder="Longitude"
            value={value.lng}
            onChange={(e) => onChange({ ...value, lng: Number(e.target.value) })}
          />
        </div>
      )}
    </div>
  );
}
