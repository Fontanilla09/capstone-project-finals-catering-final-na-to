import { useEffect, useState } from 'react';
import { API_BASE, requestJson } from '../lib/api';

const dashboardSections = {
  customer: [['overview', 'Overview', '/dashboard/customer'], ['packages', 'Explore caterers', '/packages'], ['messages', 'Messages', '/dashboard/messages'], ['visualizer', 'Venue visualizer', '/dashboard/venue']],
  caterer: [['overview', 'Overview', '/dashboard/caterer'], ['profile', 'Business profile', '/dashboard/caterer/profile'], ['services', 'Manage services', '/dashboard/caterer/services'], ['reservations', 'Reservations', '/dashboard/caterer/reservations'], ['earnings', 'Earnings', '/dashboard/caterer/earnings'], ['messages', 'Messages', '/dashboard/messages']],
  admin: [['overview', 'Overview', '/dashboard/admin'], ['users', 'User management', '/dashboard/admin/users'], ['activity', 'Activity log', '/dashboard/admin/activity']],
};

const dashboardTitles = { customer: 'Customer dashboard', caterer: 'Caterer dashboard', admin: 'Admin dashboard' };

export default function DashboardPage({ role, section = 'overview', children }) {
  const [displayName, setDisplayName] = useState('');
  const [unreadMessages, setUnreadMessages] = useState(0);
  const sections = dashboardSections[role];
  const current = sections.find(([key]) => key === section) || sections[0];
  useEffect(() => { if (role === 'customer') requestJson('/backend/session_api.php').then((data) => setDisplayName(data.name || '')).catch(() => {}); }, [role]);
  useEffect(() => { if (!['customer', 'caterer'].includes(role)) return undefined; const loadUnread = () => requestJson('/backend/dashboard_api.php?action=unread_messages').then((data) => setUnreadMessages(data.unread_count || 0)).catch(() => {}); loadUnread(); const timer = setInterval(loadUnread, 3000); return () => clearInterval(timer); }, [role, section]);
  async function signOut() { await fetch(`${API_BASE}/backend/logout_api.php`, { credentials: 'include' }); window.location.href = '/login'; }
  return <main className="dashboard-page"><nav className="packages-nav"><div className="dashboard-brand-group"><a className="brand" href="/">Cater<span>AI</span></a>{role === 'customer' && <a className="profile-link" href="/dashboard/customer" aria-label="Open customer profile"><span className="profile-icon" aria-hidden="true">👤</span><span>{displayName || 'Profile'}</span></a>}</div><button className="text-link" onClick={signOut} type="button">Sign out</button></nav><section className="dashboard-content"><p className="eyebrow">CaterAI workspace</p><h1>{dashboardTitles[role]}</h1><div className="dashboard-layout"><aside className="dashboard-nav">{sections.map(([key, label, href]) => <a className={section === key ? 'active' : ''} href={href} key={key}>{label}{key === 'messages' && unreadMessages > 0 && <span className="message-badge">{unreadMessages > 99 ? '99+' : unreadMessages}</span>}</a>)}</aside><article className="dashboard-panel"><p className="eyebrow">{current[1]}</p>{children || <><h2>{section === 'overview' ? 'Welcome back.' : current[1]}</h2><p>This React workspace is ready for your {role} tools. Your existing PHP session and database remain connected through the API layer.</p>{role === 'customer' && section === 'overview' && <a className="button button-primary" href="/packages">Browse packages <span>↗</span></a>}{role === 'caterer' && section === 'overview' && <a className="button button-primary" href="/dashboard/caterer/reservations">View reservations <span>↗</span></a>}</>}</article></div></section></main>;
}
