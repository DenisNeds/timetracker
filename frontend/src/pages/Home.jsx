import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Home() {
  const { user } = useAuth();

  return (
    <article className="card prose">
      <h1>Welcome, {user.username}</h1>
      <p>
        This app records how much time you spend on each of its pages. The
        server keeps the clock, not your browser, so the numbers stay correct
        even if you close the tab or lose your connection.
      </p>
      <h2>What counts as time on a page</h2>
      <ul>
        <li>The time starts when you open a page and stops when you leave it.</li>
        <li>
          Time only counts while you're actually looking at the app: not while
          another tab is open, the window is minimized, or you're using another
          program.
        </li>
        <li>
          If you stop using the page for a while (no mouse, keyboard, scrolling or
          touch), the clock stops at your last activity and starts again when you
          come back.
        </li>
        <li>
          With several tabs open, only the one you used last counts, so time is
          never counted twice.
        </li>
        <li>Logging out stops the clock. Your totals are still there when you log back in.</li>
      </ul>
      <p>
        Have a look at the <Link to="/articles">articles</Link>, then check your
        numbers on the <Link to="/stats">statistics</Link> page.
      </p>
    </article>
  );
}
