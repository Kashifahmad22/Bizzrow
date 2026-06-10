import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext.jsx";
import AuthLayout, { authField, authLabel, authPrimaryBtn } from "../components/marketing/AuthLayout.jsx";

export default function ResetPassword() {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (pw.length < 6) return toast.error("Password must be at least 6 characters");
    if (pw !== pw2) return toast.error("Passwords do not match");
    setSubmitting(true);
    try {
      await resetPassword(token, pw);
      toast.success("Password updated — you're signed in");
      navigate("/app", { replace: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title={token ? "Set a new password" : "Invalid link"}
      subtitle={token ? "Choose a strong password you'll remember." : "This reset link is missing its token. Please request a new one."}
      footer={<Link to="/login" className="font-semibold text-azure-400 hover:text-azure-300">Back to sign in</Link>}
    >
      {!token ? (
        <Link to="/forgot-password" className={authPrimaryBtn}>Request new link</Link>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className={authLabel}>New password</label>
            <input className={authField} type="password" required minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 6 characters" autoComplete="new-password" />
          </div>
          <div>
            <label className={authLabel}>Confirm password</label>
            <input className={authField} type="password" required value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Re-enter password" autoComplete="new-password" />
          </div>
          <button className={authPrimaryBtn} type="submit" disabled={submitting}>
            {submitting ? "Updating…" : "Update password"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
