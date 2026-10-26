import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';
import { useTracker } from '../tracking/useTracker.js';
import { PAGE_LABELS } from '../pages/pageLabels.js';

// What the small indicator in the header says for each tracker status
function statusText(status, page) {
  switch (status) {
    case 'tracking': return `Tracking: ${PAGE_LABELS[page]}`;
    case 'idle': return 'Paused: no activity';
    case 'inactive': return 'Paused: another tab is active';
    case 'paused': return 'Paused: window not in focus';
    case 'offline': return 'Reconnecting…';
    default: return 'Connecting…';
  }
}

export default function Layout() {
  const { user, logout, sessionEnded } = useAuth();
  // The layout is only shown to logged-in users, so tracking runs exactly
  // while someone is logged in, on every page.
  const { page, status, stats } = useTracker(sessionEnded);

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
      <p className={`tracker-status tracker-status-${status}`}>
        <span className="dot" />
        {statusText(status, page)}
      </p>
      <main className="main">
        {/* the pages read the live stats with useOutletContext() */}
        <Outlet context={{ stats }} />
      </main>
    </div>
  );
}
