"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function AuthForm() {
  const router = useRouter();
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "");
    const result = creatingAccount
      ? await authClient.signUp.email({ email, password, name })
      : await authClient.signIn.email({ email, password });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Unable to sign in. Please try again.");
      return;
    }
    router.refresh();
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="brand-mark">P</div>
        <p className="eyebrow">A quiet place for your thoughts</p>
        <h1>{creatingAccount ? "Create your Palace" : "Welcome back"}</h1>
        <p className="auth-copy">
          Keep your notes close, connected, and yours.
        </p>
        <form onSubmit={submit} className="auth-form">
          {creatingAccount && (
            <label>
              Your name
              <input name="name" autoComplete="name" required maxLength={100} />
            </label>
          )}
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={creatingAccount ? "new-password" : "current-password"}
              minLength={10}
              required
            />
            {creatingAccount && (
              <span className="field-hint">Use at least 10 characters.</span>
            )}
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button auth-submit" disabled={pending}>
            {pending
              ? "Please wait…"
              : creatingAccount
                ? "Create account"
                : "Sign in"}
          </button>
        </form>
        <button
          className="text-button auth-switch"
          onClick={() => {
            setError("");
            setCreatingAccount((value) => !value);
          }}
          type="button"
        >
          {creatingAccount
            ? "Already have an account? Sign in"
            : "New to Palace? Create an account"}
        </button>
      </div>
      <p className="auth-footer">Your notes belong to you.</p>
    </main>
  );
}
