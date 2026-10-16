import { useState, type FormEvent } from "react";
import { ArrowLeft, Camera, CheckCircle2, LockKeyhole, X } from "lucide-react";
import {
  apiUrl,
  createItem,
  getAccessToken,
  loginUser,
  registerUser,
  resendVerificationCode,
  verifyEmail,
} from "../lib/api";
import "./PortalDialog.css";

export type DialogMode = "login" | "register" | "report";

type PortalDialogProps = {
  mode: DialogMode;
  reportType?: "Lost" | "Found";
  oauthError?: string;
  onClose: () => void;
  onSuccess: () => void;
};

export default function PortalDialog({
  mode: initialMode,
  reportType = "Lost",
  oauthError,
  onClose,
  onSuccess,
}: PortalDialogProps) {
  const returnToReport = initialMode === "report";
  const [mode, setMode] = useState<DialogMode | "verify">(
    initialMode === "report" && !getAccessToken() ? "login" : initialMode,
  );
  const [itemType, setItemType] = useState<"lost" | "found">(
    reportType.toLowerCase() as "lost" | "found",
  );
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Electronics");
  const [location, setLocation] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(oauthError ?? "");
  const [busy, setBusy] = useState(false);

  function clearFeedback() {
    setError("");
    setMessage("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    setBusy(true);

    try {
      if (mode === "register") {
        const result = await registerUser({ full_name: fullName, email, password });
        setMessage(result.message);
        setMode("verify");
      } else if (mode === "verify") {
        const result = await verifyEmail({ email, otp });
        setMessage(result.message);
        setPassword("");
        setOtp("");
        setMode("login");
      } else if (mode === "login") {
        await loginUser(email, password);
        if (returnToReport) {
          setMode("report");
          setMessage("You’re signed in. Complete your report below.");
        } else {
          onSuccess();
        }
      } else {
        await createItem({
          title,
          description,
          category,
          location,
          item_type: itemType,
          image,
        });
        onSuccess();
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleResendCode() {
    clearFeedback();
    setBusy(true);
    try {
      const result = await resendVerificationCode(email);
      setMessage(result.message);
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : "Could not resend the code.");
    } finally {
      setBusy(false);
    }
  }

  const heading =
    mode === "register" ? "Create your account"
      : mode === "verify" ? "Verify your email"
        : mode === "report" ? `Report a ${itemType} item`
          : "Welcome back";

  const intro =
    mode === "register" ? "Join your campus community and help items find their way home."
      : mode === "verify" ? `Enter the six-digit code sent to ${email}.`
        : mode === "report" ? "Share a few details so the right item can find its way home."
          : "Log in to manage your reports and claims.";

  return (
    <div className="portal-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="portal-dialog" role="dialog" aria-modal="true" aria-labelledby="portal-dialog-title">
        <button className="portal-dialog-close" type="button" onClick={onClose} aria-label="Close dialog">
          <X size={20} />
        </button>
        <div className="portal-dialog-mark"><LockKeyhole size={22} /></div>
        <p className="portal-dialog-eyebrow">CAMPUSLOOP · YOUR CAMPUS COMMUNITY</p>
        <h2 id="portal-dialog-title">{heading}</h2>
        <p className="portal-dialog-intro">{intro}</p>

        {(mode === "login" || mode === "register") && (
          <>
            <button
              className="google-signin-button"
              type="button"
              onClick={() => {
                window.location.assign(apiUrl(`/auth/google?mode=${mode}`));
              }}
            >
              <span className="google-signin-icon" aria-hidden="true">G</span>
              {mode === "register" ? "Sign up with Google" : "Continue with Google"}
            </button>

            <div className="google-signin-divider">
              <span>or continue with email</span>
            </div>
          </>
        )}

        {error && <div className="portal-dialog-alert portal-dialog-alert-error" role="alert">{error}</div>}
        {message && <div className="portal-dialog-alert portal-dialog-alert-success" role="status"><CheckCircle2 size={17} />{message}</div>}

        <form className="portal-dialog-form" onSubmit={handleSubmit}>
          {mode === "register" && (
            <label>
              Full name
              <input autoComplete="name" required minLength={2} maxLength={100} value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your full name" />
            </label>
          )}

          {(mode === "login" || mode === "register") && (
            <label>
              Email address
              <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
            </label>
          )}

          {(mode === "login" || mode === "register") && (
            <label>
              Password
              <input type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} required minLength={mode === "register" ? 8 : undefined} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "register" ? "At least 8 characters" : "Enter your password"} />
            </label>
          )}

          {mode === "verify" && (
            <>
              <label>
                Six-digit verification code
                <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" />
              </label>
              <button className="portal-dialog-text-button" type="button" onClick={handleResendCode} disabled={busy}>
                Resend verification code
              </button>
            </>
          )}

          {mode === "report" && (
            <>
              <div className="portal-dialog-type-toggle" role="group" aria-label="Report type">
                <button type="button" className={itemType === "lost" ? "selected" : ""} onClick={() => setItemType("lost")}>I lost it</button>
                <button type="button" className={itemType === "found" ? "selected" : ""} onClick={() => setItemType("found")}>I found it</button>
              </div>
              <label>
                Item title
                <input required minLength={2} maxLength={150} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Black wireless headphones" />
              </label>
              <label>
                Category
                <select required value={category} onChange={(event) => setCategory(event.target.value)}>
                  <option>Electronics</option>
                  <option>Books & stationery</option>
                  <option>Bags</option>
                  <option>Clothing</option>
                  <option>Keys & cards</option>
                  <option>Accessories</option>
                  <option>Other</option>
                </select>
              </label>
              <label>
                Campus location
                <input required minLength={2} maxLength={150} value={location} onChange={(event) => setLocation(event.target.value)} placeholder="e.g. Library, second floor" />
              </label>
              <label>
                Description
                <textarea required minLength={5} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the item and any details that may help identify it." />
              </label>
              <label className="portal-dialog-upload">
                <Camera size={18} />
                <span>{image ? image.name : "Add a photo (optional, up to 5 MB)"}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  if (file && file.size > 5 * 1024 * 1024) {
                    setError("The image must be 5 MB or smaller.");
                    setImage(null);
                    event.target.value = "";
                  } else {
                    setError("");
                    setImage(file);
                  }
                }} />
              </label>
            </>
          )}

          <button className="button button-primary portal-dialog-submit" type="submit" disabled={busy}>
            {busy ? "Please wait…" : mode === "register" ? "Create account"
              : mode === "verify" ? "Verify email"
                : mode === "report" ? "Publish report"
                  : "Log in"}
          </button>
        </form>

        <div className="portal-dialog-switch">
          {mode === "login" && (
            <span>New to CampusLoop? <button type="button" onClick={() => { clearFeedback(); setMode("register"); }}>Create an account</button></span>
          )}
          {mode === "register" && (
            <span>Already registered? <button type="button" onClick={() => { clearFeedback(); setMode("login"); }}>Log in</button></span>
          )}
          {mode === "verify" && (
            <button type="button" onClick={() => { clearFeedback(); setMode("register"); }}><ArrowLeft size={14} /> Back to registration</button>
          )}
          {mode === "report" && (
            <span>Need a different account? <button type="button" onClick={() => { clearFeedback(); setMode("login"); }}>Switch account</button></span>
          )}
        </div>
      </section>
    </div>
  );
}
