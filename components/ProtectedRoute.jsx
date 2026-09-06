'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="loading-state" role="status" aria-live="polite">
        <span className="loading-spinner" aria-hidden="true" />
        <p>Checking your session…</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return children;
}