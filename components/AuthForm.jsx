'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

function getApiErrorMessage(error) {
  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (typeof error?.message === 'string' && error.message.trim()) {
    return error.message;
  }

  if (typeof error?.data?.error === 'string' && error.data.error.trim()) {
    return error.data.error;
  }

  if (
    typeof error?.data?.error?.message === 'string' &&
    error.data.error.message.trim()
  ) {
    return error.data.error.message;
  }

  return 'Something went wrong. Please try again.';
}

export default function AuthForm({ mode }) {
  const router = useRouter();
  const { login, signup } = useAuth();
  const isSignup = mode === 'signup';

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;

    setFormData((current) => ({
      ...current,
      [name]: value,
    }));

    setFieldErrors((current) => {
      if (!current[name]) {
        return current;
      }

      const next = { ...current };
      delete next[name];
      return next;
    });

    if (apiError) {
      setApiError('');
    }
  }

  function validate() {
    const errors = {};
    const email = formData.email.trim();

    if (isSignup && !formData.name.trim()) {
      errors.name = 'Name is required.';
    }

    if (!email) {
      errors.email = 'Email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Enter a valid email address.';
    }

    if (!formData.password) {
      errors.password = 'Password is required.';
    }

    if (isSignup) {
      if (!formData.confirmPassword) {
        errors.confirmPassword = 'Please confirm your password.';
      } else if (formData.password !== formData.confirmPassword) {
        errors.confirmPassword = 'Passwords do not match.';
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (submitting || !validate()) {
      return;
    }

    setSubmitting(true);
    setApiError('');

    try {
      const credentials = {
        email: formData.email.trim(),
        password: formData.password,
      };

      if (isSignup) {
        await signup({
          ...credentials,
          name: formData.name.trim(),
        });
      } else {
        await login(credentials);
      }

      router.replace('/dashboard');
      router.refresh();
    } catch (error) {
      setApiError(getApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      {apiError ? (
        <div className="form-error" role="alert" aria-live="polite">
          {apiError}
        </div>
      ) : null}

      {isSignup ? (
        <div className="form-field">
          <label htmlFor="auth-name">Name</label>
          <input
            id="auth-name"
            name="name"
            type="text"
            value={formData.name}
            onChange={handleChange}
            autoComplete="name"
            disabled={submitting}
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? 'auth-name-error' : undefined}
            required
          />
          {fieldErrors.name ? (
            <p id="auth-name-error" className="field-error">
              {fieldErrors.name}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="form-field">
        <label htmlFor="auth-email">Email address</label>
        <input
          id="auth-email"
          name="email"
          type="email"
          value={formData.email}
          onChange={handleChange}
          autoComplete="email"
          inputMode="email"
          disabled={submitting}
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={fieldErrors.email ? 'auth-email-error' : undefined}
          required
        />
        {fieldErrors.email ? (
          <p id="auth-email-error" className="field-error">
            {fieldErrors.email}
          </p>
        ) : null}
      </div>

      <div className="form-field">
        <label htmlFor="auth-password">Password</label>
        <input
          id="auth-password"
          name="password"
          type="password"
          value={formData.password}
          onChange={handleChange}
          autoComplete={isSignup ? 'new-password' : 'current-password'}
          disabled={submitting}
          aria-invalid={Boolean(fieldErrors.password)}
          aria-describedby={
            fieldErrors.password ? 'auth-password-error' : undefined
          }
          required
        />
        {fieldErrors.password ? (
          <p id="auth-password-error" className="field-error">
            {fieldErrors.password}
          </p>
        ) : null}
      </div>

      {isSignup ? (
        <div className="form-field">
          <label htmlFor="auth-confirm-password">Confirm password</label>
          <input
            id="auth-confirm-password"
            name="confirmPassword"
            type="password"
            value={formData.confirmPassword}
            onChange={handleChange}
            autoComplete="new-password"
            disabled={submitting}
            aria-invalid={Boolean(fieldErrors.confirmPassword)}
            aria-describedby={
              fieldErrors.confirmPassword
                ? 'auth-confirm-password-error'
                : undefined
            }
            required
          />
          {fieldErrors.confirmPassword ? (
            <p id="auth-confirm-password-error" className="field-error">
              {fieldErrors.confirmPassword}
            </p>
          ) : null}
        </div>
      ) : null}

      <button
        className="button button-primary button-full"
        type="submit"
        disabled={submitting}
      >
        {submitting
          ? isSignup
            ? 'Creating account…'
            : 'Signing in…'
          : isSignup
            ? 'Create account'
            : 'Sign in'}
      </button>

      <p className="auth-switch">
        {isSignup ? 'Already have an account?' : 'New to Newflows?'}{' '}
        <Link href={isSignup ? '/login' : '/signup'}>
          {isSignup ? 'Sign in' : 'Create an account'}
        </Link>
      </p>
    </form>
  );
}