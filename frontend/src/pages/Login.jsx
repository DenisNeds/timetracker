import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';

// One form for both logging in and registering; a link switches the mode.
export default function Login() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isLogin = mode === 'login';

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await (isLogin ? login : register)(username, password);
      // App re-renders with the user and shows the home page
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  function switchMode() {
    // Start the other form empty, so login details don't carry over into registering
    setMode(isLogin ? 'register' : 'login');
    setUsername('');
    setPassword('');
    setError('');
  }

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={handleSubmit}>
        <h1>{isLogin ? 'Log in' : 'Create account'}</h1>

        <label>
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            required
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={submitting}>
          {isLogin ? 'Log in' : 'Register'}
        </button>

        <p className="switch">
          {isLogin ? 'No account yet?' : 'Already have an account?'}{' '}
          <button type="button" className="link" onClick={switchMode}>
            {isLogin ? 'Register' : 'Log in'}
          </button>
        </p>
      </form>
    </div>
  );
}
