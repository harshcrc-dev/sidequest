import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { AuthError, validateNewPassword } from "../services/auth";

export function ResetPassword() {
  const { user, loading, configured, updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const passwordError = validateNewPassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await updatePassword(password);
      setSaved(true);
    } catch (caught) {
      setError(
        caught instanceof AuthError
          ? caught.message
          : "We couldn't update your password. Request a new reset link and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const goHome = () => window.location.assign("/");

  return (
    <main className="reset-page">
      <button className="reset-page__brand" onClick={goHome}>SIDEQUEST</button>
      <section className="reset-card" aria-labelledby="reset-title">
        <p className="eyebrow">Account recovery</p>
        <h1 id="reset-title">Choose a new password</h1>
        {saved ? (
          <>
            <p>Your password has been updated. You can return and sign in.</p>
            <button className="btn btn--accent btn--lg btn--full" onClick={goHome}>
              Return to Sidequest
            </button>
          </>
        ) : !configured ? (
          <p className="auth__error">Accounts are not configured for this environment.</p>
        ) : loading ? (
          <p role="status">Checking your recovery link...</p>
        ) : !user ? (
          <>
            <p className="auth__error">
              This recovery link is invalid or has expired. Request a new one from the sign-in screen.
            </p>
            <button className="btn btn--forest btn--full" onClick={goHome}>
              Back to sign in
            </button>
          </>
        ) : (
          <form onSubmit={submit}>
            <label className="field">
              <span>New password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                minLength={12}
                maxLength={72}
                required
                autoFocus
              />
            </label>
            <label className="field">
              <span>Confirm password</span>
              <input
                type="password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="new-password"
                minLength={12}
                maxLength={72}
                required
              />
            </label>
            <p className="auth__password-note">
              Use 12+ characters with uppercase, lowercase, a number and a symbol.
            </p>
            {error && <p className="auth__error" role="alert">{error}</p>}
            <button className="btn btn--accent btn--lg btn--full" disabled={busy}>
              {busy ? "Updating..." : "Update password"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}