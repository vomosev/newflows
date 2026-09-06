import AuthForm from '../../components/AuthForm';

export const metadata = {
  title: 'Create Account | Newflows',
  description: 'Create your Newflows account to start managing projects and tasks.',
};

export default function SignupPage() {
  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="signup-heading">
        <div className="auth-brand">
          <span className="auth-brand-mark" aria-hidden="true">
            N
          </span>
          <span>Newflows</span>
        </div>

        <div className="auth-heading">
          <p className="eyebrow">Get started</p>
          <h1 id="signup-heading">Create your account</h1>
          <p>Organize projects, prioritize tasks, and keep work moving forward.</p>
        </div>

        <AuthForm mode="signup" />
      </section>
    </main>
  );
}