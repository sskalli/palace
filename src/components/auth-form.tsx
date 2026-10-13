"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function AuthForm() {
  const router = useRouter();
  const [registering, setRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (registering) {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, name, password }),
        });
        const result: unknown = await response.json();
        if (!response.ok) {
          const message =
            typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
              ? result.error
              : "Your account could not be created.";
          throw new Error(message);
        }
      }

      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) throw new Error("Email or password is incorrect.");
      router.push("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-art">
        <div className="brand"><span className="brand-mark" aria-hidden="true">🏰</span><span className="brand-name">palace</span></div>
        <div className="auth-quote">
          <blockquote>A quieter place for everything on your mind.</blockquote>
          <p>Capture a thought now. Find it again when you need it. Your notes, always yours.</p>
        </div>
        <div className="auth-footnote">A personal Markdown workspace</div>
      </section>
      <section className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit}>
          <div className="eyebrow">{registering ? "Your own little corner" : "Welcome back"}</div>
          <h1>{registering ? "Create your Palace" : "Sign in to Palace"}</h1>
          <p>{registering ? "Set up your personal space for notes." : "Pick up your thoughts right where you left them."}</p>
          {registering && (
            <div className="field">
              <label htmlFor="name">Name <span className="muted-text">— optional</span></label>
              <input id="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} />
            </div>
          )}
          <div className="field">
            <label htmlFor="email">Email address</label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete={registering ? "new-password" : "current-password"} required minLength={registering ? 8 : 1} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          {error && <div role="alert" className="auth-error">{error}</div>}
          <button className="primary-button auth-submit" type="submit" disabled={busy}>{busy ? "One moment…" : registering ? "Create account" : "Sign in"}</button>
          <button className="auth-toggle" type="button" onClick={() => { setRegistering(!registering); setError(""); }}>
            {registering ? "Already have an account? Sign in" : "New to Palace? Create an account"}
          </button>
          <p className="auth-note">Your notes are private to your account on this Palace server.</p>
        </form>
      </section>
    </main>
  );
}
