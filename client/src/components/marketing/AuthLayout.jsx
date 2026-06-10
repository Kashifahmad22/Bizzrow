import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ScanLine, MessageCircle, HeartPulse, ArrowLeft, Check } from "lucide-react";
import BrandLogo from "../BrandLogo.jsx";
import { BRAND } from "../../lib/brand.js";

// Shared field styling so every auth screen looks identical to the marketing site.
export const authField =
  "w-full px-4 py-3 rounded-xl bg-navy-850 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-azure-500/60 focus:border-transparent transition";
export const authLabel =
  "block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5";
export const authPrimaryBtn =
  "w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-azure-500 hover:bg-azure-600 text-white font-semibold shadow-[0_12px_32px_-12px_rgba(26,116,249,0.8)] transition active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed";

const HIGHLIGHTS = [
  { icon: MessageCircle, t: "WhatsApp invoices & reminders" },
  { icon: ScanLine, t: "OCR supplier-invoice import" },
  { icon: HeartPulse, t: "Live business health & insights" },
];

/**
 * Split-screen auth shell shared by Login / Signup / Forgot / Reset so users
 * never feel they've left the Bizzrow ecosystem. Left = brand panel (desktop),
 * right = the form passed in as children.
 */
export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen bg-navy-950 text-slate-200 flex">
      {/* Brand panel */}
      <aside className="hidden lg:flex flex-col w-[46%] xl:w-1/2 relative overflow-hidden p-12 xl:p-16 border-r border-white/10">
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-br from-navy-900 via-navy-950 to-navy-900" />
          <div className="absolute -top-32 -left-20 w-[480px] h-[480px] rounded-full bg-azure-500/20 blur-[130px]" />
          <div className="absolute bottom-0 right-0 w-[420px] h-[420px] rounded-full bg-azure-700/20 blur-[130px]" />
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
              maskImage: "radial-gradient(ellipse 70% 70% at 30% 30%, #000 30%, transparent 75%)",
              WebkitMaskImage: "radial-gradient(ellipse 70% 70% at 30% 30%, #000 30%, transparent 75%)",
            }}
          />
        </div>

        <BrandLogo size={34} />

        <div className="mt-auto">
          <motion.h2
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="font-display font-extrabold text-4xl xl:text-[2.9rem] leading-[1.08] text-white"
          >
            Run your business <br /> with calm.
          </motion.h2>
          <p className="mt-4 text-lg text-slate-400 max-w-md leading-relaxed">{BRAND.tagline}</p>

          <ul className="mt-9 space-y-3.5 max-w-md">
            {HIGHLIGHTS.map((h) => (
              <li key={h.t} className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl bg-azure-500/15 border border-azure-500/25 flex items-center justify-center">
                  <h.icon className="w-4 h-4 text-azure-300" />
                </span>
                <span className="text-slate-200 font-medium">{h.t}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-12 text-sm text-slate-500 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" /> Trusted by retailers, wholesalers &amp; distributors.
        </p>
      </aside>

      {/* Form panel */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="w-full max-w-md"
        >
          <div className="lg:hidden mb-8 flex justify-center">
            <BrandLogo size={34} />
          </div>

          <div className="rounded-2xl border border-white/10 bg-navy-900/70 backdrop-blur-xl p-7 sm:p-8 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
            <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-white">{title}</h1>
            {subtitle && <p className="text-slate-400 mt-1.5 text-sm">{subtitle}</p>}
            <div className="mt-7">{children}</div>
          </div>

          {footer && <div className="mt-6 text-center text-sm text-slate-400">{footer}</div>}

          <div className="mt-6 text-center">
            <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition">
              <ArrowLeft className="w-4 h-4" /> Back to home
            </Link>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
