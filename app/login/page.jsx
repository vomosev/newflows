import AuthForm from "../../components/AuthForm";

export const metadata = {
  title: "Log in | Newflows",
  description: "Log in to manage your projects and tasks with Newflows.",
};

export default function LoginPage() {
  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="login-heading">
        <div className="auth-brand">
          <span className="auth-brand-mark" aria-hidden="true">
            N
          </span>
          <span>Newflows</span>
        </div>

        <div className="auth-heading">
          <h1 id="login-heading">Welcome back</h1>
          <p>Log in to continue managing your projects and tasks.</p>
        </div>

        <AuthForm mode="login" />
      </section>
    </main>
  );
}