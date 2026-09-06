'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function AppHeader() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState('');

  const handleLogout = async () => {
    if (loggingOut) return;

    setLoggingOut(true);
    setError('');

    try {
      await logout();
      router.replace('/login');
      router.refresh();
    } catch (logoutError) {
      setError(logoutError?.message || 'Unable to log out. Please try again.');
      setLoggingOut(false);
    }
  };

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link href="/" className="app-brand" aria-label="Newflows home">
          <span className="app-brand-mark" aria-hidden="true">
            N
          </span>
          <span>Newflows</span>
        </Link>

        <nav className="app-navigation" aria-label="Primary navigation">
          <Link href="/dashboard" className="nav-link">
            Dashboard
          </Link>
        </nav>

        <div className="app-header-account">
          {error && (
            <span className="header-error" role="alert">
              {error}
            </span>
          )}

          {user && (
            <span className="current-user" title={user.email || user.name}>
              <span className="current-user-avatar" aria-hidden="true">
                {(user.name || user.email || 'U').charAt(0).toUpperCase()}
              </span>
              <span className="current-user-name">{user.name || user.email}</span>
            </span>
          )}

          <button
            type="button"
            className="button button-secondary"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? 'Logging out…' : 'Log out'}
          </button>
        </div>
      </div>
    </header>
  );
}