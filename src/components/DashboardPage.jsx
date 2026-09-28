import { useEffect, useState } from 'react';
import { ArrowRight, CalendarPlus, X } from 'lucide-react';
import { API_BASE } from '../lib/api';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

const dashboardSections = {
  customer: [['overview', 'Overview', '/dashboard/customer'], ['notifications', 'Notifications', '/dashboard/customer?notifications=1'], ['packages', 'Explore caterers', '/packages'], ['messages', 'Messages', '/dashboard/messages']],
  caterer: [['overview', 'Overview', '/dashboard/caterer'], ['profile', 'Business profile', '/dashboard/caterer/profile'], ['services', 'Manage services', '/dashboard/caterer/services'], ['ai-photos', 'AI generated photo', '/dashboard/caterer/ai-photos'], ['reservations', 'Reservations', '/dashboard/caterer/reservations'], ['earnings', 'Earnings', '/dashboard/caterer/earnings'], ['messages', 'Messages', '/dashboard/messages']],
  admin: [['overview', 'Overview', '/dashboard/admin'], ['users', 'User management', '/dashboard/admin/users'], ['activity', 'Activity log', '/dashboard/admin/activity']],
};

const dashboardTitles = { customer: 'Customer dashboard', caterer: 'Caterer dashboard', admin: 'Admin dashboard' };

function getInitials(name) {
  if (!name) return 'C';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'C';
}

export default function DashboardPage({ role, section = 'overview', children }) {
  const [displayName, setDisplayName] = useState('');
  const [displayEmail, setDisplayEmail] = useState('');
  const [profileImage, setProfileImage] = useState('');
  const [authChecked, setAuthChecked] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadReservations, setUnreadReservations] = useState(0);
  const [reservationNotice, setReservationNotice] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentCustomerId, setCurrentCustomerId] = useState(null);
  const [currentCatererId, setCurrentCatererId] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const sections = dashboardSections[role];
  const current = sections.find(([key]) => key === section) || sections[0];
  const totalUnread = unreadMessages + unreadNotifications + unreadReservations;

  useEffect(() => {
    let active = true;
    const redirectToLogin = () => {
      if (window.location.pathname !== '/login') window.location.replace('/login');
    };
    const checkSession = async () => {
      if (!isSupabaseConfigured) {
        redirectToLogin();
        return;
      }
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) throw new Error('Not authenticated');
        const { data: profiles, error: profileError } = await supabase.rpc('get_my_profile');
        const profile = profiles?.[0];
        if (profileError || !profile || profile.role !== role || (role !== 'admin' && !profile.is_verified)) throw new Error('Invalid profile');
        if (!active) return;
        setDisplayName(profile.display_name || (role === 'admin' ? 'Admin' : role === 'caterer' ? 'Caterer' : 'Customer'));
        setDisplayEmail(authData.user.email || '');
        setCurrentUserId(profile.user_id);
        setCurrentCustomerId(profile.customer_id || null);
        setCurrentCatererId(profile.caterer_id || null);
        setProfileImage('');
        setAuthChecked(true);
      } catch {
        redirectToLogin();
      }
    };
    const handleExpired = redirectToLogin;
    const handlePageShow = (event) => {
      if (!event.persisted) return;
      setAuthChecked(false);
      checkSession();
    };
    const handleFocus = () => checkSession();
    checkSession();
    const timer = setInterval(checkSession, 30000);
    window.addEventListener('auth-expired', handleExpired);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('focus', handleFocus);
    const { data: authListener } = supabase?.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') redirectToLogin();
    }) || { data: {} };
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('auth-expired', handleExpired);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('focus', handleFocus);
      authListener?.subscription?.unsubscribe();
    };
  }, [role]);

  useEffect(() => {
    if (!authChecked || !currentUserId || !['customer', 'caterer'].includes(role)) return undefined;
    const loadUnread = async () => {
      if (role === 'customer' && currentCustomerId) {
        const storedCount = Number(localStorage.getItem(`caterai-reservation-notifications-unread-${currentCustomerId}`) || 0);
        setUnreadNotifications(Number.isFinite(storedCount) ? storedCount : 0);
      }
      const { data, error } = await supabase.rpc('get_my_unread_messages');
      if (!error) {
        setUnreadMessages(Number(data || 0));
        return;
      }
      setUnreadMessages(0);
    };
    loadUnread();
    const timer = setInterval(loadUnread, 3000);
    window.addEventListener('messages-seen', loadUnread);
    const channel = supabase
      .channel(`messages-notifications-${currentUserId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${currentUserId}` }, loadUnread)
      .subscribe();
    return () => {
      clearInterval(timer);
      window.removeEventListener('messages-seen', loadUnread);
      supabase.removeChannel(channel);
    };
  }, [authChecked, currentUserId, currentCustomerId, role, section]);

  useEffect(() => {
    if (!authChecked || role !== 'caterer' || !currentCatererId) return undefined;
    const lastSeenKey = `caterai-caterer-last-seen-reservation-${currentCatererId}`;
    const lastNotifiedKey = `caterai-caterer-last-notified-reservation-${currentCatererId}`;
    const loadUnreadReservations = async () => {
      const { data, error } = await supabase.rpc('get_caterer_reservations');
      if (error) return;
      const reservations = data || [];
      const maxId = reservations.reduce((maximum, item) => Math.max(maximum, Number(item.id) || 0), 0);
      const lastSeenId = localStorage.getItem(lastSeenKey);
      if (lastSeenId === null) {
        localStorage.setItem(lastSeenKey, String(maxId));
        localStorage.setItem(lastNotifiedKey, String(maxId));
        setUnreadReservations(0);
        setReservationNotice(null);
        return;
      }
      const unread = reservations.filter((item) => item.reservation_status === 'pending' && Number(item.id) > Number(lastSeenId));
      setUnreadReservations(unread.length);
      if (!unread.length) {
        setReservationNotice(null);
        return;
      }
      const lastNotifiedId = Number(localStorage.getItem(lastNotifiedKey) || lastSeenId);
      const fresh = unread.filter((item) => Number(item.id) > lastNotifiedId);
      if (fresh.length) {
        const newest = fresh.reduce((latest, item) => Number(item.id) > Number(latest.id) ? item : latest);
        setReservationNotice({
          count: fresh.length,
          customerName: newest.customer_name,
          packageName: newest.package_name,
        });
        localStorage.setItem(lastNotifiedKey, String(Math.max(...fresh.map((item) => Number(item.id)) )));
      }
    };
    loadUnreadReservations();
    const timer = setInterval(loadUnreadReservations, 15000);
    window.addEventListener('caterer-reservations-seen', loadUnreadReservations);
    return () => {
      clearInterval(timer);
      window.removeEventListener('caterer-reservations-seen', loadUnreadReservations);
    };
  }, [authChecked, currentCatererId, role]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  async function signOut() {
    try {
      await supabase?.auth.signOut({ scope: 'local' });
    } finally {
      window.location.replace('/login');
    }
  }

  if (!authChecked) return <main className="dashboard-page"><div className="dashboard-auth-loading">Checking your session...</div></main>;

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div className="dashboard-header-left">
          <button className="dashboard-menu-toggle" aria-expanded={menuOpen} aria-controls="dashboard-navigation" aria-label={`${menuOpen ? 'Close' : 'Open'} dashboard menu${totalUnread ? `, ${totalUnread} unread updates` : ''}`} onClick={() => setMenuOpen((open) => !open)} type="button">
            {menuOpen ? <span aria-hidden="true">&#215;</span> : <span aria-hidden="true">&#9776;</span>}
            {totalUnread > 0 && <span className="dashboard-menu-toggle-badge">{totalUnread > 99 ? '99+' : totalUnread}</span>}
          </button>
          <div className="dashboard-brand-block">
            <span className="dashboard-brand-small">CATERAI WORKSPACE</span>
            <h1>{dashboardTitles[role]}</h1>
          </div>
        </div>

        <div className="dashboard-header-right">
          <div className="dashboard-user-pill" aria-label="Signed in user">
            {profileImage ? <img className="dashboard-user-avatar dashboard-user-avatar-image" src={`${API_BASE}${profileImage}`} alt="Profile" /> : <div className="dashboard-user-avatar" aria-hidden="true">{getInitials(displayName)}</div>}
            <div className="dashboard-user-meta">
              <strong>{displayName || 'Customer'}</strong>
              <small>{displayEmail || 'customer@caterai.com'}</small>
            </div>
          </div>
          <button className="dashboard-signout" onClick={signOut} type="button">Sign out</button>
        </div>
      </header>

      {menuOpen && <button className="dashboard-menu-backdrop" aria-label="Close dashboard menu" onClick={() => setMenuOpen(false)} type="button" />}

      <div className="dashboard-shell">
        <aside id="dashboard-navigation" className={menuOpen ? 'dashboard-nav open' : 'dashboard-nav'} aria-label="Dashboard navigation">
          <div className="dashboard-menu-account">
            <div className="dashboard-user-pill" aria-label="Signed in user">
              {profileImage ? <img className="dashboard-user-avatar dashboard-user-avatar-image" src={`${API_BASE}${profileImage}`} alt="Profile" /> : <div className="dashboard-user-avatar" aria-hidden="true">{getInitials(displayName)}</div>}
              <div className="dashboard-user-meta">
                <strong>{displayName || 'Customer'}</strong>
                <small>{displayEmail || 'customer@caterai.com'}</small>
              </div>
            </div>
          </div>
          {sections.map(([key, label, href]) => (
            <a className={section === key ? 'active' : ''} href={href} key={key} onClick={() => {
              setMenuOpen(false);
              if (key === 'notifications' && currentCustomerId) {
                localStorage.setItem(`caterai-reservation-notifications-unread-${currentCustomerId}`, '0');
                setUnreadNotifications(0);
              }
            }}>
              {label}
              {key === 'notifications' && unreadNotifications > 0 && <span className="message-badge">{unreadNotifications > 99 ? '99+' : unreadNotifications}</span>}
              {key === 'reservations' && unreadReservations > 0 && <span className="message-badge">{unreadReservations > 99 ? '99+' : unreadReservations}</span>}
              {key === 'messages' && unreadMessages > 0 && <span className="message-badge">{unreadMessages > 99 ? '99+' : unreadMessages}</span>}
            </a>
          ))}
          <button className="dashboard-menu-signout" onClick={signOut} type="button">Sign out</button>
        </aside>

        <section className="dashboard-content-panel">
          <div className="dashboard-panel-header">
            <span className="dashboard-panel-kicker">{current[1]}</span>
          </div>
          {role === 'caterer' && reservationNotice && (
            <div className="caterer-booking-notice" role="status">
              <CalendarPlus size={19} aria-hidden="true" />
              <div>
                <strong>{reservationNotice.count > 1 ? `${reservationNotice.count} new booking requests` : 'New booking request'}</strong>
                <p>{reservationNotice.customerName} booked {reservationNotice.packageName}.</p>
              </div>
              <a href="/dashboard/caterer/reservations" onClick={() => setReservationNotice(null)}>View <ArrowRight size={15} aria-hidden="true" /></a>
              <button type="button" onClick={() => setReservationNotice(null)} aria-label="Dismiss booking notification"><X size={17} aria-hidden="true" /></button>
            </div>
          )}
          {children || (
            <>
              <h2>{section === 'overview' ? 'Welcome back.' : current[1]}</h2>
              <p>This React workspace is ready for your {role} tools. Your account and workspace data are connected through Supabase.</p>
              {role === 'customer' && section === 'overview' && (
                <a className="button button-primary" href="/packages">Browse packages <span>↗</span></a>
              )}
              {role === 'caterer' && section === 'overview' && (
                <a className="button button-primary" href="/dashboard/caterer/reservations">View reservations <span>↗</span></a>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
