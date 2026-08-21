import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { AuthError, validateNewPassword } from "../services/auth";
import { Icon } from "./Icon";

type Mode = "login" | "register" | "forgot" | "phone" | "phone-code";

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
  const { signIn, signUp, resetPassword, signInWithProvider, sendPhoneOtp, verifyPhoneOtp, configured } = useAuth();
  const [mode, setMode] = useState<Mode>("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
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
    if (!emailValid && mode !== "phone" && mode !== "phone-code") {
      setError("That email address doesn't look right.");
      return;
    }
    if (mode === "phone") {
      setBusy(true);
      try {
        await sendPhoneOtp(phone);
        setMode("phone-code");
        setNotice("We sent a verification code to your phone.");
      } catch (err) {
        setError(friendlyError(err));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (mode === "phone-code") {
      if (!/^\d{6}$/.test(otp.trim())) {
        setError("Enter the 6-digit verification code.");
        return;
      }
      setBusy(true);
      try {
        await verifyPhoneOtp(phone, otp);
        onAuthed?.();
        onClose();
      } catch (err) {
        setError(friendlyError(err));
      } finally {
        setBusy(false);
      }
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
        : mode === "forgot"
          ? "Reset your password"
          : mode === "phone-code"
            ? "Enter your code"
            : "Sign in with your phone";

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
            {mode !== "phone" && mode !== "phone-code" && <label className="field">
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
            </label>}
            {(mode === "phone" || mode === "phone-code") && <label className="field">
              <span>Phone number</span>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+14155552671" autoComplete="tel" disabled={mode === "phone-code"} required />
            </label>}
            {mode === "phone-code" && <label className="field">
              <span>Verification code</span>
              <input inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" autoComplete="one-time-code" required />
            </label>}
            {mode !== "forgot" && mode !== "phone" && mode !== "phone-code" && (
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  minLength={mode === "register" ? 8 : 1}
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
                  minLength={8}
                  maxLength={72}
                  required
                />
              </label>
            )}

            {mode === "register" && (
              <p className="auth__password-note">
                Use 8+ characters with uppercase, lowercase, a number and a symbol.
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
                    : mode === "forgot"
                      ? "Send reset link"
                      : mode === "phone"
                        ? "Send code"
                        : "Verify code"}
            </button>
          </form>

          {(mode === "login" || mode === "register") && (
            <div className="auth__providers">
              <button type="button" className="btn btn--ghost btn--full" onClick={() => void signInWithProvider("google")}>Continue with Google</button>
              <button type="button" className="btn btn--ghost btn--full" onClick={() => void signInWithProvider("apple")}>Continue with Apple</button>
              <button type="button" className="btn btn--ghost btn--full" onClick={() => { setError(""); setNotice(""); setMode("phone"); }}>Continue with phone</button>
            </div>
          )}

          {mode === "login" && (
            <button className="auth__switch" onClick={() => setMode("forgot")}>
              Forgot your password?
            </button>
          )}

          <div className="auth__switch">
            {mode === "phone-code" ? (
              <button onClick={() => setMode("phone")}>Use a different number</button>
            ) : mode === "phone" ? (
              <button onClick={() => setMode("login")}>Back to email sign in</button>
            ) : mode === "register" ? (
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
