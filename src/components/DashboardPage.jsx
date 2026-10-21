import { useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Bell,
  Building2,
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  ClipboardList,
  CreditCard,
  CircleDollarSign,
  Flag,
  Images,
  LifeBuoy,
  LockKeyhole,
  MessageCircle,
  Moon,
  Package,
  Settings,
  ShieldCheck,
  Sun,
  Star,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react';
import { API_BASE, requestJson } from '../lib/api';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

const dashboardSections = {
  customer: [['overview', 'Dashboard', '/dashboard/customer'], ['packages', 'Explore caterers', '/packages'], ['messages', 'Messages', '/dashboard/messages'], ['support', 'Help & Support', '/dashboard/customer/support'], ['settings', 'Settings', '/dashboard/customer/settings']],
  caterer: [['overview', 'Dashboard', '/dashboard/caterer'], ['reservations', 'Reservations', '/dashboard/caterer/reservations'], ['services', 'Manage services', '/dashboard/caterer/services'], ['ai-photos', 'AI generated photo', '/dashboard/caterer/ai-photos'], ['reviews', 'Reviews & ratings', '/dashboard/caterer/reviews'], ['earnings', 'Earnings', '/dashboard/caterer/earnings'], ['messages', 'Messages', '/dashboard/messages'], ['profile', 'Business profile', '/dashboard/caterer/profile']],
  admin: [['overview', 'Dashboard', '/dashboard/admin'], ['cater-management', 'Cater Management', '/dashboard/admin/cater-management'], ['customer-management', 'Customer Management', '/dashboard/admin/customers'], ['reports', 'Reports & complaints', '/dashboard/admin/reports'], ['users', 'User management', '/dashboard/admin/users'], ['activity', 'Activity log', '/dashboard/admin/activity']],
};

const dashboardTitles = { customer: 'Customer', caterer: 'Caterer', admin: 'Admin' };
const navigationIcons = {
  overview: Activity,
  packages: Package,
  messages: MessageCircle,
  support: LifeBuoy,
  settings: Settings,
  reservations: CalendarDays,
  services: ClipboardList,
  'ai-photos': Images,
  reviews: ShieldCheck,
  earnings: WalletCards,
  profile: UserRound,
  'cater-management': Building2,
  'customer-management': UsersRound,
  reports: Flag,
  users: UsersRound,
  activity: Activity,
};
const dashboardProfileCache = new Map();
const dashboardProfileCacheDuration = 30_000;

function getInitialTheme() {
  try {
    return localStorage.getItem('caterai-theme') === 'dark' ? 'dark' : 'light';
  } catch (error) {
    console.warn('Failed to read the saved theme preference:', error);
    return 'light';
  }
}

function getDashboardProfileStorageKey(role) {
  return `caterai-dashboard-profile-${role}`;
}

function clearCachedDashboardProfile(role) {
  dashboardProfileCache.delete(role);
  try {
    sessionStorage.removeItem(getDashboardProfileStorageKey(role));
  } catch (error) {
    console.warn('Failed to clear the cached dashboard profile:', error);
  }
}

function storeCachedDashboardProfile(role, profile) {
  try {
    sessionStorage.setItem(getDashboardProfileStorageKey(role), JSON.stringify(profile));
  } catch (error) {
    console.warn('Failed to persist the cached dashboard profile:', error);
  }
}

function getCachedDashboardProfile(role) {
  const cached = dashboardProfileCache.get(role);
  if (cached && Date.now() - cached.cachedAt < dashboardProfileCacheDuration) return cached.profile;
  let stored;
  try {
    stored = sessionStorage.getItem(getDashboardProfileStorageKey(role));
  } catch (error) {
    console.warn('Failed to read the cached dashboard profile:', error);
    return null;
  }
  if (!stored) return null;
  try {
    const profile = JSON.parse(stored);
    if (!profile || typeof profile.displayName !== 'string' || typeof profile.displayEmail !== 'string' || !profile.userId) {
      clearCachedDashboardProfile(role);
      return null;
    }
    dashboardProfileCache.set(role, { profile, cachedAt: Date.now() });
    return profile;
  } catch (error) {
    if (error instanceof SyntaxError) {
      clearCachedDashboardProfile(role);
      return null;
    }
    throw error;
  }
}

function getInitials(name) {
  if (!name) return 'C';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'C';
}

export default function DashboardPage({ role, section = 'overview', children, balanceReminders = [] }) {
  const [initialProfile] = useState(() => getCachedDashboardProfile(role));
  const [displayName, setDisplayName] = useState(initialProfile?.displayName || '');
  const [displayEmail, setDisplayEmail] = useState(initialProfile?.displayEmail || '');
  const [profileImage, setProfileImage] = useState('');
  const [authChecked, setAuthChecked] = useState(Boolean(initialProfile));
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadReservations, setUnreadReservations] = useState(0);
  const [unreadReviews, setUnreadReviews] = useState(0);
  const [pendingPayoutCount, setPendingPayoutCount] = useState(0);
  const [pendingAccountCount, setPendingAccountCount] = useState(0);
  const [pendingCustomerCount, setPendingCustomerCount] = useState(0);
  const [openReportCount, setOpenReportCount] = useState(0);
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [theme, setTheme] = useState(getInitialTheme);
  const [reservationNotice, setReservationNotice] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(initialProfile?.userId || null);
  const [currentCustomerId, setCurrentCustomerId] = useState(initialProfile?.customerId || null);
  const [currentCatererId, setCurrentCatererId] = useState(initialProfile?.catererId || null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const sections = dashboardSections[role];
  const current = sections.find(([key]) => key === section) || sections[0];
  const totalUnread = unreadMessages + unreadNotifications + unreadReservations + unreadReviews;
  const profileImageSrc = profileImage
    ? (profileImage.startsWith('http') ? profileImage : `${API_BASE}${profileImage}`)
    : '';
  const notificationHref = role === 'customer'
    ? '/dashboard/customer?notifications=1'
    : role === 'caterer'
      ? '/dashboard/caterer/reservations'
      : '/dashboard/admin/reports';
  const notificationCount = role === 'admin'
    ? openReportCount
    : totalUnread + (role === 'customer' ? balanceReminders.length : 0);
  const notificationItems = role === 'customer'
    ? [
      ...balanceReminders.map((reminder) => ({
        id: reminder.id,
        title: 'Balance payment due',
        message: reminder.message,
        href: '/dashboard/customer?notifications=1',
        icon: CircleDollarSign,
        tone: 'payout',
        count: 1,
      })),
      ...(unreadNotifications > 0 ? [{
        id: 'customer-bookings',
        title: `${unreadNotifications} booking update${unreadNotifications === 1 ? '' : 's'}`,
        message: 'Check the latest status of your catering reservations.',
        href: '/dashboard/customer?notifications=1',
        icon: CalendarDays,
        tone: 'booking',
        count: unreadNotifications,
      }] : []),
      ...(unreadMessages > 0 ? [{
        id: 'customer-messages',
        title: `${unreadMessages} unread message${unreadMessages === 1 ? '' : 's'}`,
        message: 'A caterer sent you a message.',
        href: '/dashboard/messages',
        icon: MessageCircle,
        tone: 'message',
        count: unreadMessages,
      }] : []),
    ]
    : role === 'caterer'
      ? [
        ...(unreadReservations > 0 ? [{
          id: 'caterer-bookings',
          title: `${unreadReservations} new booking request${unreadReservations === 1 ? '' : 's'}`,
          message: reservationNotice?.packageName
            ? `${reservationNotice.customerName || 'A customer'} booked ${reservationNotice.packageName}.`
            : 'Review your new reservation requests.',
          href: '/dashboard/caterer/reservations',
          icon: CalendarDays,
          tone: 'booking',
          count: unreadReservations,
        }] : []),
        ...(unreadReviews > 0 ? [{
          id: 'caterer-reviews',
          title: `${unreadReviews} new customer review${unreadReviews === 1 ? '' : 's'}`,
          message: 'See the latest ratings and feedback on your packages.',
          href: '/dashboard/caterer/reviews',
          icon: Star,
          tone: 'review',
          count: unreadReviews,
        }] : []),
        ...(unreadMessages > 0 ? [{
          id: 'caterer-messages',
          title: `${unreadMessages} unread message${unreadMessages === 1 ? '' : 's'}`,
          message: 'A customer is waiting for your reply.',
          href: '/dashboard/messages',
          icon: MessageCircle,
          tone: 'message',
          count: unreadMessages,
        }] : []),
        ...(pendingPayoutCount > 0 ? [{
          id: 'caterer-payouts',
          title: `${pendingPayoutCount} payout${pendingPayoutCount === 1 ? '' : 's'} to review`,
          message: 'Check your payout requests and earnings.',
          href: '/dashboard/caterer/earnings',
          icon: CreditCard,
          tone: 'payout',
          count: pendingPayoutCount,
        }] : []),
      ]
      : [
        ...(openReportCount > 0 ? [{
          id: 'admin-reports',
          title: `${openReportCount} open report${openReportCount === 1 ? '' : 's'}`,
          message: 'Customer reports need your attention.',
          href: '/dashboard/admin/reports',
          icon: Flag,
          tone: 'report',
          count: openReportCount,
        }] : []),
        ...(pendingCustomerCount > 0 ? [{
          id: 'admin-customers',
          title: `${pendingCustomerCount} customer account${pendingCustomerCount === 1 ? '' : 's'} to review`,
          message: 'Review pending customer confirmations.',
          href: '/dashboard/admin/customers',
          icon: UsersRound,
          tone: 'account',
          count: pendingCustomerCount,
        }] : []),
        ...(pendingAccountCount > 0 ? [{
          id: 'admin-caterers',
          title: `${pendingAccountCount} caterer account${pendingAccountCount === 1 ? '' : 's'} to review`,
          message: 'Review pending caterer verification requests.',
          href: '/dashboard/admin/users',
          icon: Building2,
          tone: 'account',
          count: pendingAccountCount,
        }] : []),
      ];

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
    if (role !== 'caterer') return undefined;
    let active = true;
    requestJson('/backend/subscription_api.php')
      .then((result) => {
        if (active) setHasActiveSubscription(result.active === true);
      })
      .catch((error) => {
        console.error('Caterer subscription status could not be loaded:', error);
      });
    return () => {
      active = false;
    };
  }, [role]);

  useEffect(() => {
    if (!notificationsOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!event.target.closest?.('.dashboard-notification-wrap')) setNotificationsOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setNotificationsOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [notificationsOpen]);

  useEffect(() => {
    const updateCardSpotlight = (event) => {
      if (!(event.target instanceof Element)) return;
      const card = event.target.closest('.admin-stat, .stat-card, .admin-chart-panel, .admin-analytics, .system-health-panel, .caterer-dashboard-panel, .customer-profile-card, .table-card, .customer-settings-card, .customer-support-card');
      if (!card) return;
      const bounds = card.getBoundingClientRect();
      card.style.setProperty('--spotlight-x', `${event.clientX - bounds.left}px`);
      card.style.setProperty('--spotlight-y', `${event.clientY - bounds.top}px`);
    };
    document.addEventListener('pointermove', updateCardSpotlight, { passive: true });
    return () => document.removeEventListener('pointermove', updateCardSpotlight);
  }, []);

  useEffect(() => {
    let active = true;
    const redirectToLogin = () => {
      if (window.location.pathname !== '/login') window.location.replace('/login');
    };
    const clearCachedProfile = () => {
      clearCachedDashboardProfile(role);
    };
    const checkSession = async () => {
      if (!isSupabaseConfigured) {
        clearCachedProfile();
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
        const verifiedProfile = {
          displayName: profile.display_name || (role === 'admin' ? 'Admin' : role === 'caterer' ? 'Caterer' : 'Customer'),
          displayEmail: authData.user.email || '',
          userId: profile.user_id,
          customerId: profile.customer_id || null,
          catererId: profile.caterer_id || null,
        };
        dashboardProfileCache.set(role, { profile: verifiedProfile, cachedAt: Date.now() });
        storeCachedDashboardProfile(role, verifiedProfile);
        setDisplayName(verifiedProfile.displayName);
        setDisplayEmail(verifiedProfile.displayEmail);
        setCurrentUserId(verifiedProfile.userId);
        setCurrentCustomerId(verifiedProfile.customerId);
        setCurrentCatererId(verifiedProfile.catererId);
        setAuthChecked(true);
      } catch {
        clearCachedProfile();
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
      if (event === 'SIGNED_OUT') {
        clearCachedProfile();
        redirectToLogin();
      }
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

    let active = true;
    let requestPending = false;
    let lastAttemptAt = 0;
    const recordActivity = async () => {
      if (!active || document.visibilityState !== 'visible' || requestPending || Date.now() - lastAttemptAt < 60_000) return;
      requestPending = true;
      lastAttemptAt = Date.now();
      try {
        const { error } = await supabase.rpc('record_my_activity');
        if (error) console.error('Failed to record account activity:', error);
      } catch (error) {
        console.error('Failed to record account activity:', error);
      } finally {
        requestPending = false;
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') recordActivity();
    };

    recordActivity();
    const interval = window.setInterval(recordActivity, 60_000);
    window.addEventListener('focus', recordActivity);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', recordActivity);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [authChecked, currentUserId, role]);

  useEffect(() => {
    if (!authChecked || role !== 'caterer' || !currentUserId) return undefined;
    let active = true;
    const loadProfileImage = async () => {
      const { data, error } = await supabase
        .from('caterers')
        .select('profile_image')
        .eq('user_id', currentUserId)
        .maybeSingle();
      if (error) {
        console.error('Failed to load caterer profile photo:', error);
        return;
      }
      if (active) setProfileImage(data?.profile_image || '');
    };
    const handleProfileImageUpdated = (event) => {
      if (typeof event.detail === 'string') setProfileImage(event.detail);
      else loadProfileImage();
    };
    loadProfileImage();
    window.addEventListener('caterer-profile-image-updated', handleProfileImageUpdated);
    return () => {
      active = false;
      window.removeEventListener('caterer-profile-image-updated', handleProfileImageUpdated);
    };
  }, [authChecked, currentUserId, role]);

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
      const reservations = (data || []).filter((item) => !(
        item.reservation_status === 'pending' && item.payment_status === 'pending'
      ));
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
    if (!authChecked || role !== 'caterer' || !currentCatererId) return undefined;
    let active = true;
    const loadUnreadReviews = async () => {
      const { data, error } = await supabase.rpc('get_unread_caterer_reviews_count');
      if (active && !error) setUnreadReviews(Number(data || 0));
    };
    loadUnreadReviews();
    const timer = setInterval(loadUnreadReviews, 15000);
    const channel = supabase
      .channel(`caterer-review-notifications-${currentCatererId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reviews', filter: `caterer_id=eq.${currentCatererId}` }, loadUnreadReviews)
      .subscribe();
    window.addEventListener('caterer-reviews-seen', loadUnreadReviews);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('caterer-reviews-seen', loadUnreadReviews);
      supabase.removeChannel(channel);
    };
  }, [authChecked, currentCatererId, role]);

  useEffect(() => {
    if (!authChecked || role !== 'caterer' || !currentCatererId) return undefined;
    let active = true;
    const loadPendingPayouts = async () => {
      const { data, error } = await supabase.rpc('get_caterer_earnings');
      if (!active || error) return;
      const payouts = data?.payouts || [];
      setPendingPayoutCount(payouts.filter((payout) => payout.payout_status === 'pending').length);
    };
    loadPendingPayouts();
    const timer = setInterval(loadPendingPayouts, 15000);
    window.addEventListener('focus', loadPendingPayouts);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', loadPendingPayouts);
    };
  }, [authChecked, currentCatererId, role]);

  useEffect(() => {
    if (!authChecked || role !== 'admin') return undefined;
    let active = true;
    const loadAdminCounts = async () => {
      const [accountsResult, reportsResult] = await Promise.all([
        supabase.rpc('get_admin_accounts'),
        supabase.from('customer_reports').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_review']),
      ]);
      if (!active) return;
      if (!accountsResult.error) {
        const accounts = accountsResult.data || [];
        const pendingCustomers = accounts.filter((user) => (
          user.role === 'customer' && !user.customer_verified && !user.rejection_reason
        )).length;
        const pendingCaterers = accounts.filter((user) => (
          user.role === 'caterer' && user.caterer_verification_submitted === true && !user.caterer_verified && !user.rejection_reason
        )).length;
        setPendingCustomerCount(pendingCustomers);
        setPendingAccountCount(pendingCaterers);
      }
      if (!reportsResult.error) setOpenReportCount(reportsResult.count || 0);
    };
    loadAdminCounts();
    const timer = setInterval(loadAdminCounts, 15000);
    const channel = supabase
      .channel('admin-navigation-counts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, loadAdminCounts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, loadAdminCounts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'caterers' }, loadAdminCounts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_reports' }, loadAdminCounts)
      .subscribe();
    return () => {
      active = false;
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [authChecked, role]);

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
      dashboardProfileCache.clear();
      Object.keys(dashboardSections).forEach(clearCachedDashboardProfile);
      window.location.replace('/login');
    }
  }

  if (!authChecked) return <main className={`dashboard-page${role === 'customer' ? ' dashboard-page-customer' : ''}${role === 'caterer' ? ' dashboard-page-caterer' : ''}${role === 'admin' ? ' dashboard-page-admin' : ''}`}><div className="dashboard-auth-loading">Checking your session...</div></main>;

  return (
    <main className={`dashboard-page${role === 'customer' ? ' dashboard-page-customer' : ''}${role === 'caterer' ? ' dashboard-page-caterer' : ''}${role === 'admin' ? ' dashboard-page-admin' : ''}`}>
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
          <nav className="dashboard-breadcrumb" aria-label="Breadcrumb">
            <a href={role === 'customer' ? '/dashboard/customer' : `/dashboard/${role}`}>Workspace</a>
            <ChevronRight size={15} aria-hidden="true" />
            <span aria-current="page">{current[1]}</span>
          </nav>
        </div>

        <div className="dashboard-header-right">
          <div className="dashboard-notification-wrap">
            <button
              className="dashboard-header-icon"
              type="button"
              aria-label={notificationCount ? `${notificationCount} new notifications` : 'Notifications'}
              aria-expanded={notificationsOpen}
              aria-controls="dashboard-notifications-popover"
              onClick={() => setNotificationsOpen((open) => !open)}
            >
              <Bell size={18} aria-hidden="true" />
              {notificationCount > 0 && <span className="dashboard-header-badge">{notificationCount > 99 ? '99+' : notificationCount}</span>}
            </button>
            {notificationsOpen && (
              <section className="dashboard-notifications-popover" id="dashboard-notifications-popover" aria-label="Notifications">
                <header className="dashboard-notifications-heading">
                  <div>
                    <h2>Notifications</h2>
                    <p>{notificationCount ? `${notificationCount} new update${notificationCount === 1 ? '' : 's'}` : 'You are all caught up'}</p>
                  </div>
                  <span className="dashboard-notifications-tab">All</span>
                </header>
                {notificationItems.length ? (
                  <div className="dashboard-notifications-list">
                    {notificationItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <a
                          className={`dashboard-notification-item tone-${item.tone}`}
                          href={item.href}
                          key={item.id}
                          onClick={() => setNotificationsOpen(false)}
                        >
                          <span className="dashboard-notification-avatar" aria-hidden="true"><Icon size={18} /></span>
                          <span className="dashboard-notification-copy">
                            <strong>{item.title}</strong>
                            <span>{item.message}</span>
                            <small>Open {item.href.includes('messages') ? 'messages' : 'details'}</small>
                          </span>
                          <span className="dashboard-notification-count" aria-label={`${item.count} notifications`}>{item.count > 99 ? '99+' : item.count}</span>
                        </a>
                      );
                    })}
                  </div>
                ) : (
                  <div className="dashboard-notifications-empty">
                    <span className="dashboard-notifications-empty-icon"><Bell size={20} aria-hidden="true" /></span>
                    <strong>No new notifications</strong>
                    <p>We’ll let you know when there’s something to check.</p>
                  </div>
                )}
                <a className="dashboard-notifications-footer" href={notificationHref} onClick={() => setNotificationsOpen(false)}>
                  View {role === 'customer' ? 'booking updates' : role === 'caterer' ? 'workspace updates' : 'reports'}
                  <ChevronRight size={15} aria-hidden="true" />
                </a>
              </section>
            )}
          </div>
          <button
            className="dashboard-header-icon"
            type="button"
            onClick={() => setTheme((currentTheme) => currentTheme === 'light' ? 'dark' : 'light')}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
          </button>
          <div className="dashboard-user-pill" aria-label="Signed in user">
            {profileImageSrc ? <img className="dashboard-user-avatar dashboard-user-avatar-image" src={profileImageSrc} alt="Profile" onError={() => setProfileImage('')} /> : <div className="dashboard-user-avatar" aria-hidden="true">{getInitials(displayName)}</div>}
            <div className="dashboard-user-meta">
              <strong>{displayName || 'Customer'}</strong>
              <small>{displayEmail || 'customer@caterai.com'}</small>
            </div>
          </div>
        </div>
      </header>

      {menuOpen && <button className="dashboard-menu-backdrop" aria-label="Close dashboard menu" onClick={() => setMenuOpen(false)} type="button" />}

      <div className="dashboard-shell">
        <aside id="dashboard-navigation" className={menuOpen ? 'dashboard-nav open' : 'dashboard-nav'} aria-label="Dashboard navigation">
          <a className="dashboard-nav-brand" href="/">
            <span className="dashboard-nav-brand-mark">C</span>
            <span>CaterAI</span>
          </a>
          <div className="dashboard-menu-account">
            <div className="dashboard-user-pill" aria-label="Signed in user">
              {profileImageSrc ? <img className="dashboard-user-avatar dashboard-user-avatar-image" src={profileImageSrc} alt="Profile" onError={() => setProfileImage('')} /> : <div className="dashboard-user-avatar" aria-hidden="true">{getInitials(displayName)}</div>}
              <div className="dashboard-user-meta">
                <strong>{displayName || 'Customer'}</strong>
                <small>{displayEmail || 'customer@caterai.com'}</small>
              </div>
            </div>
          </div>
          {sections.map(([key, label, href]) => (
            <a className={section === key ? 'active' : ''} href={href} key={key} onClick={() => {
              setMenuOpen(false);
            }}>
              {(() => {
                const Icon = navigationIcons[key] || Activity;
                return <Icon className="dashboard-nav-icon" size={17} aria-hidden="true" />;
              })()}
              <span className="dashboard-nav-label">{label}</span>
              {role === 'caterer' && !hasActiveSubscription && ['services', 'ai-photos'].includes(key) && <LockKeyhole className="dashboard-nav-lock" size={13} aria-label="Subscription required" />}
              {key === 'customer-management' && pendingCustomerCount > 0 && <span className="message-badge" aria-label={`${pendingCustomerCount} pending customer confirmations`}>{pendingCustomerCount > 99 ? '99+' : pendingCustomerCount}</span>}
              {key === 'reservations' && unreadReservations > 0 && <span className="message-badge">{unreadReservations > 99 ? '99+' : unreadReservations}</span>}
              {key === 'reviews' && unreadReviews > 0 && <span className="message-badge" aria-label={`${unreadReviews} unread reviews`}>{unreadReviews > 99 ? '99+' : unreadReviews}</span>}
              {key === 'earnings' && pendingPayoutCount > 0 && <span className="message-badge" aria-label={`${pendingPayoutCount} payouts awaiting request`}>{pendingPayoutCount > 99 ? '99+' : pendingPayoutCount}</span>}
              {key === 'messages' && unreadMessages > 0 && <span className="message-badge">{unreadMessages > 99 ? '99+' : unreadMessages}</span>}
              {key === 'users' && pendingAccountCount > 0 && <span className="message-badge" aria-label={`${pendingAccountCount} pending account approvals`}>{pendingAccountCount > 99 ? '99+' : pendingAccountCount}</span>}
              {key === 'reports' && openReportCount > 0 && <span className="message-badge" aria-label={`${openReportCount} open or in-review reports`}>{openReportCount > 99 ? '99+' : openReportCount}</span>}
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
