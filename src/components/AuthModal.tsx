import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { AuthError, validateNewPassword } from "../services/auth";
import { Icon } from "./Icon";

type Mode = "login" | "register" | "forgot";

function friendlyError(err: unknown): string {
  if (err instanceof AuthError) return err.message;
  return "Something went wrong. Please try again.";
}

export function AuthModal({
  onClose,
  onAuthed,
  reason,
}: {
  onClose: () => void;
  onAuthed?: () => void;
  reason?: string;
}) {
  const { signIn, signUp, resetPassword, configured } = useAuth();
  const [mode, setMode] = useState<Mode>("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [busy, onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    setNotice("");

    if (!configured) {
      setError("Accounts aren't set up yet. Add your Supabase keys to enable sign in.");
      return;
    }
    if (!emailValid) {
      setError("That email address doesn't look right.");
      return;
    }
    if (mode !== "forgot" && !password) {
      setError("Password is required.");
      return;
    }
    if (mode === "register" && validateNewPassword(password)) {
      setError(validateNewPassword(password) ?? "Choose a stronger password.");
      return;
    }
    if (mode === "register" && password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "register") {
        const { authenticated } = await signUp(name, email, password);
        if (authenticated) {
          onAuthed?.();
          onClose();
        } else {
          setMode("login");
          setPassword("");
          setConfirmation("");
          setNotice("Account created. Confirm your email, then sign in to save sidequests.");
        }
      } else if (mode === "login") {
        await signIn(email, password);
        onAuthed?.();
        onClose();
      } else {
        await resetPassword(email);
        setNotice("If that email has an account, a reset link is on its way.");
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const title =
    mode === "register"
      ? "Create your account"
      : mode === "login"
        ? "Welcome back"
        : "Reset your password";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal auth"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal__close" onClick={onClose} aria-label="Close">
          <Icon name="close" size={18} />
        </button>
        <div className="auth__aside" aria-hidden>
          <div className="auth__aside-inner">
            <span className="eyebrow" style={{ color: "rgba(255,255,255,0.7)" }}>
              Sidequest
            </span>
            <h2>
              Your life is the main quest.
              <br />
              The weekend is the sidequest.
            </h2>
          </div>
        </div>

        <div className="auth__form">
          <h3 id="auth-title">{title}</h3>
          <p className="auth__reason">
            {mode === "forgot"
              ? "Enter your email and we'll send you a reset link."
              : (reason ?? "Save, share and personalise your sidequests.")}
          </p>

          <form onSubmit={submit}>
            {mode === "register" && (
              <label className="field">
                <span>Name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex"
                  autoComplete="name"
                />
              </label>
            )}
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                  maxLength={254}
                required
              />
            </label>
            {mode !== "forgot" && (
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  minLength={mode === "register" ? 12 : 1}
                  maxLength={72}
                  required
                />
              </label>
            )}
            {mode === "register" && (
              <label className="field">
                <span>Confirm password</span>
                <input
                  type="password"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={72}
                  required
                />
              </label>
            )}

            {mode === "register" && (
              <p className="auth__password-note">
                Use 12+ characters with uppercase, lowercase, a number and a symbol.
              </p>
            )}

            {error && <div className="auth__error" role="alert">{error}</div>}
            {notice && <div className="auth__reason" role="status">{notice}</div>}

            <button className="btn btn--accent btn--lg btn--full" disabled={busy}>
              {busy
                ? "One moment…"
                : mode === "register"
                  ? "Create account"
                  : mode === "login"
                    ? "Sign in"
                    : "Send reset link"}
            </button>
          </form>

          {mode === "login" && (
            <button className="auth__switch" onClick={() => setMode("forgot")}>
              Forgot your password?
            </button>
          )}

          <div className="auth__switch">
            {mode === "register" ? (
              <>
                Already have an account?{" "}
                <button onClick={() => setMode("login")}>Sign in</button>
              </>
            ) : (
              <>
                {mode === "forgot" ? "Remembered it? " : "New here? "}
                <button onClick={() => setMode(mode === "forgot" ? "login" : "register")}>
                  {mode === "forgot" ? "Back to sign in" : "Create one"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
