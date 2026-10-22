import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Check, CreditCard, LocateFixed, LockKeyhole, Moon, QrCode, Sun } from 'lucide-react';
import { requestJson } from '../lib/api';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import GcashPaymentForm from '../components/GcashPaymentForm.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

function money(value) { return `₱${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

function getInitialTheme() {
  try {
    return localStorage.getItem('caterai-theme') === 'dark' ? 'dark' : 'light';
  } catch (error) {
    console.warn('Failed to read the saved theme preference:', error);
    return 'light';
  }
}

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

  return <div className="venue-picker"><input name="venue_address" type="hidden" value={value} required readOnly /><div className="venue-search-row"><input aria-label="Search venue address" value={query} onChange={searchAddress} placeholder="e.g. Municipal Hall" /><button type="button" onClick={useCurrentLocation}><LocateFixed size={15} aria-hidden="true" />Use my location</button></div>{searching && <p className="venue-picker-status">Searching addresses...</p>}{status && <p className="venue-picker-status">{status}</p>}{results.length > 0 && <div className="venue-results">{results.map((result) => <button key={result.place_id} type="button" onClick={() => selectLocation(result)}>{result.display_name}</button>)}</div>}<div className="venue-address-grid"><label>City / Municipality<input name="venue_city" value={parts.city} onChange={(event) => updatePart('city', event.target.value)} placeholder="Mamburao" /></label><label>Barangay<input name="venue_barangay" value={parts.barangay} onChange={(event) => updatePart('barangay', event.target.value)} placeholder="Payompon" /></label><label>Postal code <span>(optional)</span><input name="venue_postal" inputMode="numeric" value={parts.postal} onChange={(event) => updatePart('postal', event.target.value)} placeholder="5106" /></label><label className="venue-street-field">Street, building, house no.<input name="venue_street" value={parts.street} onChange={(event) => updatePart('street', event.target.value)} placeholder="Purok / street / building" /></label></div><p className="venue-map-hint">Tap the map or drag the pin to the exact event location.</p><div className="venue-map" id="venue-address-map" />{value && <p className="venue-selected">Event venue: {value}</p>}</div>;
}

export default function Book() {
  const query = new URLSearchParams(window.location.search);
  const packageId = Number(query.get('package') || 0); const catererId = Number(query.get('caterer') || 0);
  const [status, setStatus] = useState(''); const [loading, setLoading] = useState(false); const [item, setItem] = useState(null);
  const [venueAddress, setVenueAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('paypal');
  const [gcashOption, setGcashOption] = useState(null);
  const [theme, setTheme] = useState(getInitialTheme);
  const today = new Date().toISOString().split('T')[0]; const maxBookingDate = `${new Date().getFullYear() + 2}-12-31`;
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem('caterai-theme', theme);
    } catch (error) {
      console.warn('Failed to save the theme preference:', error);
    }
  }, [theme]);
  useEffect(() => {
    async function loadPackage() {
      if (!packageId || !catererId) return;
      try {
        if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
        const { data, error } = await supabase
          .from('packages')
          .select('id, package_name, price, caterer_id, caterers!inner(business_name, is_verified, gcash_qr_code)')
          .eq('id', packageId)
          .eq('caterer_id', catererId)
          .eq('caterers.is_verified', true)
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Package not found or not available.');
        setItem({ ...data, business_name: data.caterers?.business_name, gcash_qr_code: data.caterers?.gcash_qr_code });
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
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget));
      const result = await requestJson('/backend/booking_api.php', {
        method: 'POST',
        body: JSON.stringify({ ...values, package_id: packageId, caterer_id: catererId, payment_method: paymentMethod }),
      });
      if (result.manual_gcash) {
        setGcashOption({
          reservation_id: result.reservation_id,
          payment_type: 'down_payment',
          amount: Number(result.amount),
          gcash_qr_code: result.qr_code,
          business_name: item.business_name,
        });
        setLoading(false);
        return;
      }
      window.location.href = result.approval_url;
    }
    catch (error) { setStatus(error.message); setLoading(false); }
  }
  if (!packageId || !catererId) return <main className="packages-page"><nav className="packages-nav"><a className="brand" href="/">Cater<span>AI</span></a><a href="/packages">Explore caterers</a></nav><section className="packages-content booking-message"><p className="eyebrow">Booking unavailable</p><h1>Choose a package first.</h1><p>{status || 'This booking link does not contain a valid package.'}</p><a className="button button-primary" href="/packages">Explore caterers <span>↗</span></a></section></main>;
  if (!item && !status) return <main className="packages-page" aria-busy="true"><LoadingSpinner fullPage /></main>;
  const total = Number(item?.price || 0); const advance = total * 0.3; const balance = total - advance;
  return (
    <main className="packages-page booking-page">
      <nav className="packages-nav booking-nav">
        <a className="brand" href="/">Cater<span>AI</span></a>
        <div className="booking-nav-actions">
          <button
            className="booking-theme-toggle"
            type="button"
            onClick={() => setTheme((currentTheme) => currentTheme === 'light' ? 'dark' : 'light')}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? <Moon size={17} aria-hidden="true" /> : <Sun size={17} aria-hidden="true" />}
          </button>
          <a href="/packages">Cancel</a>
        </div>
      </nav>
      <section className="packages-content booking-content">
        <header className="booking-heading">
          <p className="booking-step-label"><strong>Request your booking</strong><span>· Step 1 of 2</span></p>
          <h1>Tell us about your event</h1>
          <p>Share a few details so the caterer can prepare for your event.</p>
        </header>
        <div className="booking-layout">
          <form id="booking-form" className="auth-form booking-form" onSubmit={submit}>
            {status && <p className="form-alert error-alert">{status}</p>}
            {gcashOption ? (
              <section className="gcash-submitted-state">
                <h2>Booking request created</h2>
                <p>Complete the GCash payment in the dialog. Your caterer must verify the receipt before the booking is marked paid.</p>
              </section>
            ) : (
              <>
                <section className="booking-section">
                  <h2><span>1</span>Event details</h2>
                  <div className="booking-fields-two">
                    <label className="booking-field">Event date<input name="event_date" type="date" min={today} max={maxBookingDate} required /></label>
                    <label className="booking-field">Start time<input name="event_time" type="time" required /></label>
                  </div>
                </section>
                <section className="booking-section">
                  <h2><span>2</span>Venue</h2>
                  <label className="booking-field">Venue name<input name="venue_name" placeholder="Grand Ballroom" required /></label>
                  <div className="booking-field booking-address-field">
                    <span>Search address or landmark</span>
                    <VenueAddressPicker value={venueAddress} onChange={setVenueAddress} />
                  </div>
                </section>
                <section className="booking-section booking-payment-section">
                  <h2><span>3</span>Payment method</h2>
                  <fieldset className="booking-payment-method">
                    <legend className="visually-hidden">Choose a payment method</legend>
                    <label className={paymentMethod === 'paypal' ? 'booking-payment-option is-selected' : 'booking-payment-option'}>
                      <input type="radio" name="payment_method" value="paypal" checked={paymentMethod === 'paypal'} onChange={() => setPaymentMethod('paypal')} />
                      <span className="booking-payment-icon"><CreditCard size={19} aria-hidden="true" /></span>
                      <span className="booking-payment-copy"><strong>PayPal</strong><small>Pay your down payment online. You’ll be redirected to PayPal.</small></span>
                      <span className="booking-payment-check">{paymentMethod === 'paypal' && <Check size={13} aria-hidden="true" />}</span>
                    </label>
                    <label className={`${paymentMethod === 'gcash' ? 'booking-payment-option is-selected' : 'booking-payment-option'}${!item?.gcash_qr_code ? ' booking-payment-disabled' : ''}`}>
                      <input type="radio" name="payment_method" value="gcash" checked={paymentMethod === 'gcash'} disabled={!item?.gcash_qr_code} onChange={() => setPaymentMethod('gcash')} />
                      <span className="booking-payment-icon"><QrCode size={19} aria-hidden="true" /></span>
                      <span className="booking-payment-copy"><strong>GCash</strong><small>{item?.gcash_qr_code ? 'Scan the caterer’s GCash QR and upload your receipt.' : 'Not set up by the caterer yet.'}</small></span>
                      <span className="booking-payment-check">{paymentMethod === 'gcash' && <Check size={13} aria-hidden="true" />}</span>
                    </label>
                  </fieldset>
                </section>
              </>
            )}
          </form>
          <aside className="payment-summary">
            <p className="payment-summary-label">Booking summary</p>
            <div className="payment-summary-package">
              <span className="payment-summary-avatar">{(item?.package_name || 'C').charAt(0).toUpperCase()}</span>
              <span><strong>{item?.package_name || ''}</strong><small>{item?.business_name || ''}</small></span>
            </div>
            <div className="payment-progress" aria-label="30 percent down payment, 70 percent remaining"><span /></div>
            <div className="payment-row"><span>Package total</span><strong>{money(total)}</strong></div>
            <div className="payment-row advance"><span>Pay now · 30% down payment</span><strong>{money(advance)}</strong></div>
            <div className="payment-row"><span>Remaining balance · 70%</span><strong>{money(balance)}</strong></div>
            <p className="payment-note">
              {paymentMethod === 'gcash'
                ? <><LockKeyhole size={15} aria-hidden="true" /><span>Scan the caterer’s GCash QR and upload your receipt. The payment will be reviewed by the caterer.</span></>
                : <><LockKeyhole size={15} aria-hidden="true" /><span>You’ll be redirected to PayPal to securely complete your online payment.</span></>}
            </p>
            <label className="booking-terms"><input form="booking-form" name="agree_terms" type="checkbox" required /> <span>I agree to the booking terms and 30% down payment.</span></label>
            <button className="booking-submit" form="booking-form" disabled={loading || !item || Boolean(gcashOption)} type="submit">
              {loading ? 'Preparing payment…' : paymentMethod === 'gcash' ? 'Continue to GCash' : 'Continue to PayPal'} <span aria-hidden="true">↗</span>
            </button>
          </aside>
        </div>
      </section>
      {gcashOption && (
        <GcashPaymentForm
          option={gcashOption}
          onClose={() => { setGcashOption(null); window.location.assign('/dashboard/customer'); }}
          onSubmitted={() => window.location.assign('/dashboard/customer?gcash=submitted')}
        />
      )}
    </main>
  );
}
