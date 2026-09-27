import { useEffect, useState } from 'react';
import { API_BASE } from '../lib/api';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

const dashboardSections = {
  customer: [['overview', 'Overview', '/dashboard/customer'], ['packages', 'Explore caterers', '/packages'], ['messages', 'Messages', '/dashboard/messages'], ['visualizer', 'Venue visualizer', '/dashboard/venue']],
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
  const [currentUserId, setCurrentUserId] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const sections = dashboardSections[role];
  const current = sections.find(([key]) => key === section) || sections[0];

  useEffect(() => {
    let active = true;
    const checkSession = async () => {
      if (!isSupabaseConfigured) {
        window.location.href = '/login';
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
        setProfileImage('');
        setAuthChecked(true);
      } catch {
        window.location.href = '/login';
      }
    };
    const handleExpired = () => { window.location.href = '/login'; };
    checkSession();
    const timer = setInterval(checkSession, 30000);
    window.addEventListener('auth-expired', handleExpired);
    return () => { active = false; clearInterval(timer); window.removeEventListener('auth-expired', handleExpired); };
  }, [role]);

  useEffect(() => {
    if (!authChecked || !currentUserId || !['customer', 'caterer'].includes(role)) return undefined;
    const loadUnread = async () => {
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
  }, [authChecked, currentUserId, role, section]);

  async function signOut() {
    await supabase?.auth.signOut();
    window.location.href = '/login';
  }

  if (!authChecked) return <main className="dashboard-page"><div className="dashboard-auth-loading">Checking your session...</div></main>;

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div className="dashboard-header-left">
          <button className="dashboard-menu-toggle" aria-expanded={menuOpen} aria-label="Open dashboard menu" onClick={() => setMenuOpen((open) => !open)} type="button">
            &#9776;
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

      <div className="dashboard-shell">
        <aside className={menuOpen ? 'dashboard-nav open' : 'dashboard-nav'} aria-label="Dashboard navigation">
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
            <a className={section === key ? 'active' : ''} href={href} key={key} onClick={() => setMenuOpen(false)}>
              {label}
              {key === 'messages' && unreadMessages > 0 && <span className="message-badge">{unreadMessages > 99 ? '99+' : unreadMessages}</span>}
            </a>
          ))}
          <button className="dashboard-menu-signout" onClick={signOut} type="button">Sign out</button>
        </aside>

        <section className="dashboard-content-panel">
          <div className="dashboard-panel-header">
            <span className="dashboard-panel-kicker">{current[1]}</span>
          </div>
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
