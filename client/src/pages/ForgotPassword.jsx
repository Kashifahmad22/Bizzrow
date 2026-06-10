import { useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext.jsx";
import AuthLayout, { authField, authLabel, authPrimaryBtn } from "../components/marketing/AuthLayout.jsx";

export default function ForgotPassword() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const data = await requestPasswordReset(email);
      setSent(true);
      if (data?.devLink) setDevLink(data.devLink);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title={sent ? "Check your email" : "Forgot password?"}
      subtitle={sent ? undefined : "Enter your account email and we'll send a secure reset link."}
      footer={<Link to="/login" className="font-semibold text-azure-400 hover:text-azure-300">Back to sign in</Link>}
    >
      {!sent ? (
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className={authLabel}>Email</label>
            <input
              className={authField}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@business.com"
              autoComplete="email"
            />
          </div>
          <button className={authPrimaryBtn} type="submit" disabled={submitting}>
            {submitting ? "Sending…" : "Send reset link"}
          </button>
        </form>
      ) : (
        <>
          <p className="text-slate-400 text-sm leading-relaxed">
            If an account exists for <b className="text-white">{email}</b>, a reset link is on its way.
            It expires in 1 hour and can be used once.
          </p>
          {devLink && (
            <div className="mt-4 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs">
              <div className="font-semibold text-amber-300 mb-1">Dev mode — email not configured</div>
              <a href={devLink} className="text-azure-300 break-all">{devLink}</a>
            </div>
          )}
        </>
      )}
    </AuthLayout>
  );
}
