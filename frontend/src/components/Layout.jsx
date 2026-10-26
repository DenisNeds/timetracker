import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="app">
      <header className="header">
        <span className="brand">Time Tracker</span>
        <nav className="nav">
          {/* "end" so Home is only highlighted on "/" itself, not on every page */}
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/articles">Articles</NavLink>
          <NavLink to="/stats">Statistics</NavLink>
        </nav>
        <div className="account">
          <span className="username">
            {user.username}
            {user.role === 'admin' && <span className="badge">admin</span>}
          </span>
          <button type="button" className="button-secondary" onClick={logout}>
            Log out
          </button>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
