import AdminDashboard from './pages/AdminDashboard.jsx';
import Book from './pages/Book.jsx';
import CatererDashboard from './pages/CatererDashboard.jsx';
import CatererProfile from './pages/CatererProfile.jsx';
import CustomerDashboard from './pages/CustomerDashboard.jsx';
import CustomerMessages from './pages/CustomerMessages.jsx';
import CatererEarnings from './pages/CatererEarnings.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import ManageServices from './pages/ManageServices.jsx';
import PackageDetails from './pages/PackageDetails.jsx';
import Packages from './pages/Packages.jsx';
import Register from './pages/Register.jsx';
import ViewReservations from './pages/ViewReservations.jsx';
import AdminUsers from './pages/AdminUsers.jsx';
import AdminActivity from './pages/AdminActivity.jsx';
import AdminCaterManagement from './pages/AdminCaterManagement.jsx';
import AdminReports from './pages/AdminReports.jsx';
import AiGeneratedPhoto from './pages/AiGeneratedPhoto.jsx';

export default function App() {
  const path = window.location.pathname;

  if (path === '/login') return <Login />;
  if (path === '/forgot-password') return <ForgotPassword />;
  if (path === '/reset-password') return <ResetPassword />;
  if (path === '/register') return <Register />;
  if (path === '/packages') return <Packages />;
  if (path.startsWith('/packages/')) return <PackageDetails />;
  if (path === '/book') return <Book />;
  if (path === '/dashboard/customer' || path === '/dashboard/venue') return <CustomerDashboard />;
  if (path === '/dashboard/messages') return <CustomerMessages />;
  if (path === '/dashboard/caterer') return <CatererDashboard />;
  if (path === '/dashboard/caterer/profile') return <CatererProfile />;
  if (path === '/dashboard/caterer/services') return <ManageServices />;
  if (path === '/dashboard/caterer/ai-photos') return <AiGeneratedPhoto />;
  if (path === '/dashboard/caterer/reservations') return <ViewReservations />;
  if (path === '/dashboard/caterer/earnings') return <CatererEarnings />;
  if (path === '/dashboard/admin') return <AdminDashboard />;
  if (path === '/dashboard/admin/cater-management') return <AdminCaterManagement />;
  if (path === '/dashboard/admin/reports') return <AdminReports />;
  if (path === '/dashboard/admin/users') return <AdminUsers />;
  if (path === '/dashboard/admin/activity') return <AdminActivity />;

  return <Home />;
}
