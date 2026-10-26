import { useOutletContext } from 'react-router';
import { PAGE_LABELS } from './pageLabels.js';

// 75 -> "1m 15s", 3725 -> "1h 02m 05s"
function formatDuration(totalSeconds) {
  const total = Math.floor(totalSeconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (h > 0) return `${h}h ${pad(m)}m ${pad(s)}s`;
  if (m > 0) return `${m}m ${pad(s)}s`;
  return `${s}s`;
}

// One user's time per page, as bars showing each page's share of their total
function UserStats({ user, showName }) {
  return (
    <section className="card user-stats">
      <div className="user-stats-header">
        <h2>{showName ? user.username : 'Your time'}</h2>
        <span className="total">{formatDuration(user.totalSeconds)}</span>
      </div>
      <ul className="page-bars">
        {Object.entries(user.pages).map(([page, { seconds, active }]) => {
          const share = user.totalSeconds > 0 ? (seconds / user.totalSeconds) * 100 : 0;
          return (
            <li key={page} className={active ? 'active' : undefined}>
              <span className="page-name">
                {PAGE_LABELS[page]}
                {active && <span className="live" title="On this page right now">live</span>}
              </span>
              <span className="bar">
                <span className="bar-fill" style={{ width: `${share}%` }} />
              </span>
              <span className="seconds">{formatDuration(seconds)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// The numbers come from the server over the WebSocket once a second;
// this page only displays them. An admin gets every user, a user only themselves.
export default function Stats() {
  const { stats } = useOutletContext();

  if (!stats) {
    return <p className="muted">Loading statistics…</p>;
  }

  const isAdmin = stats.scope === 'all';
  return (
    <div className="stats">
      <h1>{isAdmin ? `All users (${stats.users.length})` : 'Statistics'}</h1>
      {stats.users.map((user) => (
        <UserStats key={user.userId} user={user} showName={isAdmin} />
      ))}
    </div>
  );
}
