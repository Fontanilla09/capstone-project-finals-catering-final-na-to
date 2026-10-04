import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { requestJson } from '../lib/api';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

function money(value) { return `₱${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

function VenueAddressPicker({ value, onChange }) {
  const mapRef = useRef(null); const markerRef = useRef(null); const searchTimerRef = useRef(null);
  const [query, setQuery] = useState(value || ''); const [results, setResults] = useState([]); const [status, setStatus] = useState(''); const [searching, setSearching] = useState(false);
  const [parts, setParts] = useState({ city: '', barangay: '', postal: '', street: '' });

  useEffect(() => {
    const map = L.map('venue-address-map', { zoomControl: false }).setView([12.8797, 121.774], 5);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    map.on('click', ({ latlng }) => reverseLookup(latlng.lat, latlng.lng));
    mapRef.current = map;
    return () => map.remove();
  }, []);

  async function reverseLookup(latitude, longitude) {
    setStatus('Finding the address at this location...');
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${latitude}&lon=${longitude}`);
      if (!response.ok) throw new Error('Unable to identify this map location.');
      selectLocation(await response.json());
    } catch (error) { setStatus(error.message); }
  }

  function placeMarker(latitude, longitude) {
    if (!mapRef.current) return;
    mapRef.current.setView([latitude, longitude], Math.max(mapRef.current.getZoom(), 16));
    if (markerRef.current) markerRef.current.remove();
    markerRef.current = L.marker([latitude, longitude], { draggable: true }).addTo(mapRef.current);
    markerRef.current.on('dragend', ({ target }) => {
      const position = target.getLatLng();
      reverseLookup(position.lat, position.lng);
    });
  }

  function selectLocation(location) {
    const latitude = Number(location.lat); const longitude = Number(location.lon);
    const address = location.display_name || '';
    const addressParts = location.address || {};

    const normalize = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
    const rawBarangay = [
      addressParts.barangay,
      addressParts.village,
      addressParts.suburb,
      addressParts.neighbourhood,
      addressParts.hamlet,
      addressParts.city_district,
    ].map(normalize).find(Boolean) || '';
    const rawStreet = [
      addressParts.house_number,
      addressParts.road,
      addressParts.pedestrian,
      addressParts.path,
      addressParts.footway,
      addressParts.cycleway,
    ].map(normalize).filter(Boolean).join(' ');
    const isPurokLike = /(?:^|\s)(purok|sitio|zone|subdivision|block|blkg)(?:\s|$)/i.test(rawBarangay);

    const nextParts = {
      city: addressParts.city || addressParts.town || addressParts.municipality || '',
      barangay: isPurokLike && !addressParts.barangay ? '' : rawBarangay,
      postal: addressParts.postcode || '',
      street: isPurokLike && !addressParts.barangay ? `${rawBarangay}${rawStreet ? `, ${rawStreet}` : ''}` : rawStreet,
    };

    setParts(nextParts); onChange(address); setQuery(address); setResults([]); setStatus('');
    placeMarker(latitude, longitude);
  }

  function updatePart(name, nextValue) {
    const nextParts = { ...parts, [name]: nextValue }; setParts(nextParts);
    onChange(Object.values(nextParts).filter(Boolean).join(', '));
  }

  function searchAddress(event) {
    const nextQuery = event.target.value; setQuery(nextQuery); onChange(nextQuery); setResults([]); setStatus('');
    clearTimeout(searchTimerRef.current);
    if (nextQuery.trim().length < 3) return;
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=ph&limit=5&q=${encodeURIComponent(nextQuery)}`);
        if (!response.ok) throw new Error('Address search is unavailable right now.');
        setResults(await response.json());
      } catch (error) { setStatus(error.message); } finally { setSearching(false); }
    }, 500);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) { setStatus('Location services are not available in this browser.'); return; }
    setStatus('Finding your location...');
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.latitude}&lon=${coords.longitude}`);
        if (!response.ok) throw new Error('Unable to find the address for your location.');
        selectLocation(await response.json());
          if (coords.accuracy > 100) setStatus(`Approximate location only (accuracy about ${Math.round(coords.accuracy)}m). Drag the pin or tap the exact spot on the map.`);
      } catch (error) { setStatus(error.message); }
    }, () => setStatus('Please allow location access or search for an address instead.'), { enableHighAccuracy: true, timeout: 7000, maximumAge: 0 });
  }

  return <div className="venue-picker"><input name="venue_address" type="hidden" value={value} required readOnly /><div className="venue-search-row"><input aria-label="Search venue address" value={query} onChange={searchAddress} placeholder="Search address or landmark" /><button type="button" onClick={useCurrentLocation}>Use my location</button></div>{searching && <p className="venue-picker-status">Searching addresses...</p>}{status && <p className="venue-picker-status">{status}</p>}{results.length > 0 && <div className="venue-results">{results.map((result) => <button key={result.place_id} type="button" onClick={() => selectLocation(result)}>{result.display_name}</button>)}</div>}<div className="venue-address-heading">Or enter the event address</div><div className="venue-address-grid"><label>City / Municipality<input name="venue_city" value={parts.city} onChange={(event) => updatePart('city', event.target.value)} placeholder="Mamburao" /></label><label>Barangay<input name="venue_barangay" value={parts.barangay} onChange={(event) => updatePart('barangay', event.target.value)} placeholder="Payompon" /></label><label>Postal code<input name="venue_postal" inputMode="numeric" value={parts.postal} onChange={(event) => updatePart('postal', event.target.value)} placeholder="5106" /></label><label className="venue-street-field">Street, building, house no.<input name="venue_street" value={parts.street} onChange={(event) => updatePart('street', event.target.value)} placeholder="Purok / street / building" /></label></div><p className="venue-map-hint">Tap the map or drag the pin to the exact event location.</p><div className="venue-map" id="venue-address-map" />{value && <p className="venue-selected">Event venue: {value}</p>}</div>;
}

export default function Book() {
  const query = new URLSearchParams(window.location.search);
  const packageId = Number(query.get('package') || 0); const catererId = Number(query.get('caterer') || 0);
  const [status, setStatus] = useState(''); const [loading, setLoading] = useState(false); const [item, setItem] = useState(null);
  const [venueAddress, setVenueAddress] = useState('');
  const today = new Date().toISOString().split('T')[0]; const maxBookingDate = `${new Date().getFullYear() + 2}-12-31`;
  useEffect(() => {
    async function loadPackage() {
      if (!packageId || !catererId) return;
      try {
        if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
        const { data, error } = await supabase
          .from('packages')
          .select('id, package_name, price, caterer_id, caterers!inner(business_name, is_verified)')
          .eq('id', packageId)
          .eq('caterer_id', catererId)
          .eq('caterers.is_verified', true)
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Package not found or not available.');
        setItem({ ...data, business_name: data.caterers?.business_name });
        setStatus('');
      } catch (error) {
        setStatus(error.message);
      }
    }
    loadPackage();
  }, [packageId, catererId]);
  async function submit(event) {
    event.preventDefault(); if (!packageId || !catererId) { setStatus('This booking link is invalid. Please choose a package first.'); return; }
    setLoading(true); setStatus('');
    try { const values = Object.fromEntries(new FormData(event.currentTarget)); const result = await requestJson('/backend/booking_api.php', { method: 'POST', body: JSON.stringify({ ...values, package_id: packageId, caterer_id: catererId }) }); window.location.href = result.approval_url; }
    catch (error) { setStatus(error.message); setLoading(false); }
  }
  if (!packageId || !catererId) return <main className="packages-page"><nav className="packages-nav"><a className="brand" href="/">Cater<span>AI</span></a><a href="/packages">Explore caterers</a></nav><section className="packages-content booking-message"><p className="eyebrow">Booking unavailable</p><h1>Choose a package first.</h1><p>{status || 'This booking link does not contain a valid package.'}</p><a className="button button-primary" href="/packages">Explore caterers <span>↗</span></a></section></main>;
  const total = Number(item?.price || 0); const advance = total * 0.3; const balance = total - advance;
  return <main className="packages-page"><nav className="packages-nav"><a className="brand" href="/">Cater<span>AI</span></a><a href="/packages">Cancel</a></nav><section className="packages-content"><p className="eyebrow">Request your booking</p><h1>Tell us about<br /><em>your event.</em></h1><div className="booking-layout"><form className="auth-form booking-form" onSubmit={submit}>{status && <p className="form-alert error-alert">{status}</p>}<label>Event date</label><input name="event_date" type="date" min={today} max={maxBookingDate} required /><label>Event start time</label><input name="event_time" type="time" required /><label>Number of guests</label><input name="guest_count" type="number" min="1" required /><label>Venue name</label><input name="venue_name" placeholder="Grand Ballroom" required /><label>Venue address</label><VenueAddressPicker value={venueAddress} onChange={setVenueAddress} /><label className="check-label"><input name="agree_terms" type="checkbox" required /> I agree to the booking terms and 30% down payment.</label><button className="button button-primary auth-submit" disabled={loading || !item} type="submit">{loading ? 'Opening PayPal checkout...' : 'Continue to PayPal'} <span>↗</span></button></form><aside className="payment-summary"><p className="eyebrow">Online payment summary</p><h2>{item?.package_name || 'Loading package...'}</h2><p className="payment-caterer">{item?.business_name || ''}</p><div className="payment-row"><span>Package total</span><strong>{money(total)}</strong></div><div className="payment-row advance"><span>Pay now · 30% down payment</span><strong>{money(advance)}</strong></div><div className="payment-row"><span>Remaining balance · 70%</span><strong>{money(balance)}</strong></div><p className="payment-note">You will be redirected to PayPal to securely complete your online payment.</p></aside></div></section></main>;
}
