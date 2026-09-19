import { useEffect, useState } from 'react';
import { API_BASE, requestJson } from '../lib/api';

export default function Packages() {
  const [packages, setPackages] = useState([]);
  const [eventTypes, setEventTypes] = useState([]);
  const [filters, setFilters] = useState({ search: '', event_type: '', sort: 'newest' });
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);

  async function load(nextFilters = filters) {
    setLoading(true);
    try {
      const query = new URLSearchParams(nextFilters);
      const data = await requestJson(`/backend/packages_api.php?${query}`);
      setPackages(data.packages || []);
      setEventTypes(data.event_types || []);
    } catch (error) {
      setPackages([]);
      setEventTypes([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    requestJson('/backend/session_api.php').then(setSession).catch(() => setSession({ authenticated: false }));
  }, []);

  const update = (event) => setFilters({ ...filters, [event.target.name]: event.target.value });

  return <main className="packages-page">
    <nav className="packages-nav">
      <a className="brand" href="/">Cater<span>AI</span></a>
      {session?.authenticated ? <a href={session.redirect}>Dashboard</a> : <a href="/login">Log in</a>}
    </nav>
    <section className="packages-content">
      <p className="eyebrow">Find your table</p>
      <h1>Packages made<br /><em>for the occasion.</em></h1>
      <form className="package-filters" onSubmit={(event) => { event.preventDefault(); load(); }}>
        <input name="search" value={filters.search} onChange={update} placeholder="Search packages or caterers" />
        <select name="event_type" value={filters.event_type} onChange={update}><option value="">All event types</option>{eventTypes.map((item) => <option key={item.event_type} value={item.event_type}>{item.event_type}</option>)}</select>
        <select name="sort" value={filters.sort} onChange={update}><option value="newest">Newest</option><option value="price_low">Price: low to high</option><option value="price_high">Price: high to low</option><option value="rating">Top rated</option></select>
        <button className="button button-primary" type="submit">Search <span>↗</span></button>
      </form>
      {loading ? <p className="package-empty">Loading packages...</p> : packages.length === 0 ? <p className="package-empty">No packages found.</p> : <div className="package-grid">
        {packages.map((item) => <article className="package-card" key={item.id}>
          {item.image_path ? <img className="package-card-image" src={`${API_BASE}${item.image_path}`} alt={`${item.package_name} sample`} /> : <div className="package-card-image package-card-image-empty">CaterAI</div>}
          <div className="package-card-top"><span>{item.event_type || 'Catering package'}</span><strong>★ {item.rating || 'New'}</strong></div>
          <h2>{item.package_name}</h2>
          <p className="package-caterer">{item.business_name} · {item.city || 'Local caterer'}</p>
          <p>{item.description || 'A thoughtfully prepared package for your event.'}</p>
          {Number(item.is_full) === 1 && <strong className="package-full-label">Package full</strong>}
          <div className="package-footer"><strong>₱{Number(item.price).toLocaleString()}</strong><span>{item.guest_count_min}-{item.guest_count_max} guests</span></div>
          <a className="package-link" href={`/packages/${item.id}?caterer=${item.caterer_id}`}>View package ↗</a>
        </article>)}
      </div>}
    </section>
  </main>;
}
