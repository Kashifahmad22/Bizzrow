import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, Check, CheckCircle2, Boxes, ShoppingCart, Wallet, ScanLine,
  MessageCircle, HeartPulse, Sparkles, BarChart3, FileText, Bell, ShieldCheck,
  Smartphone, Notebook, Table, Coins, Keyboard, Package, Upload, ListChecks,
  Percent, Zap, Phone, Mail, TrendingUp, Users, Minus, Plus,
} from "lucide-react";
import Navbar from "../components/marketing/Navbar.jsx";
import Footer from "../components/marketing/Footer.jsx";
import { BRAND, demoMailto, salesMailto, contactMailto } from "../lib/brand.js";

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */
function Reveal({ children, delay = 0, className = "" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function Eyebrow({ children }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-azure-400">
      <span className="h-px w-6 bg-azure-500/60" />
      {children}
    </span>
  );
}

function SectionHead({ eyebrow, title, sub, center = true }) {
  return (
    <div className={`max-w-2xl ${center ? "mx-auto text-center" : ""}`}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="mt-4 font-display font-extrabold text-3xl sm:text-4xl lg:text-[2.7rem] leading-[1.08] text-white">
        {title}
      </h2>
      {sub && <p className="mt-4 text-lg text-slate-400 leading-relaxed">{sub}</p>}
    </div>
  );
}

// Premium browser frame for product screenshots.
function BrowserFrame({ src, alt, className = "" }) {
  return (
    <div className={`rounded-2xl overflow-hidden border border-white/10 bg-navy-800 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.8)] ${className}`}>
      <div className="flex items-center gap-1.5 px-4 h-9 bg-navy-850 border-b border-white/5">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-400/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/70" />
        <span className="ml-3 h-4 w-48 rounded bg-white/5 hidden sm:block" />
      </div>
      <img src={src} alt={alt} loading="lazy" className="w-full block" />
    </div>
  );
}

// Phone frame for the WhatsApp mobile screenshots.
function PhoneFrame({ src, alt, className = "" }) {
  return (
    <div className={`relative mx-auto w-[230px] rounded-[2.2rem] border border-white/15 bg-navy-850 p-2 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.85)] ${className}`}>
      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-20 h-4 rounded-b-2xl bg-navy-950 z-10" />
      <div className="rounded-[1.7rem] overflow-hidden">
        <img src={src} alt={alt} loading="lazy" className="w-full block" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function Landing() {
  return (
    <div className="min-h-screen bg-navy-950 text-slate-200 antialiased overflow-x-hidden">
      <Navbar />
      <Hero />
      <IndustryStrip />
      <Problem />
      <Features />
      <Solutions />
      <OcrSection />
      <WhatsAppSection />
      <AiSection />
      <Showcase />
      <Pricing />
      <TrustSection />
      <Faq />
      <FinalCta />
      <Contact />
      <Footer />
    </div>
  );
}

/* ----------------------------- Hero ------------------------------- */
function Hero() {
  return (
    <section className="relative pt-32 sm:pt-40 pb-20 overflow-hidden">
      {/* backdrop */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-navy-950" />
        <div className="absolute -top-40 right-[-10%] w-[680px] h-[680px] rounded-full bg-azure-500/20 blur-[140px]" />
        <div className="absolute top-40 left-[-15%] w-[520px] h-[520px] rounded-full bg-azure-700/20 blur-[140px]" />
        <div
          className="absolute inset-0 opacity-[0.25]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, #000 40%, transparent 80%)",
            WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, #000 40%, transparent 80%)",
          }}
        />
      </div>

      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs font-medium text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Built for retailers, wholesalers &amp; distributors
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.05 }}
            className="mt-6 font-display font-extrabold text-4xl sm:text-6xl leading-[1.05] tracking-tight text-white"
          >
            Business management <br className="hidden sm:block" />
            as simple as <span className="text-azure-400">WhatsApp.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.12 }}
            className="mt-6 text-lg sm:text-xl text-slate-400 leading-relaxed max-w-2xl mx-auto"
          >
            Manage inventory, sales, customer dues, OCR imports, WhatsApp invoices,
            collections and business insights — from one platform built for retailers
            and wholesalers.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.19 }}
            className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3"
          >
            <Link
              to="/signup"
              className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-azure-500 hover:bg-azure-600 text-white font-semibold shadow-[0_14px_40px_-12px_rgba(26,116,249,0.8)] transition active:scale-[0.98]"
            >
              Start Free
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition" />
            </Link>
            <a
              href={demoMailto}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-white font-semibold transition"
            >
              Book Demo
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-500"
          >
            <span className="inline-flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-400" /> Free to start</span>
            <span className="inline-flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-400" /> No credit card</span>
            <span className="inline-flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-400" /> Works on any device</span>
          </motion.div>
        </div>

        {/* Hero product shot */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.25 }}
          className="relative mt-16 max-w-5xl mx-auto"
        >
          <div className="absolute -inset-x-10 -top-10 bottom-0 bg-azure-500/10 blur-3xl rounded-full -z-10" />
          <BrowserFrame src="/marketing/dashboard.png" alt="Bizzrow dashboard with business health and AI intelligence" />
        </motion.div>
      </div>
    </section>
  );
}

/* ----------------------- Industry strip --------------------------- */
function IndustryStrip() {
  const items = ["Retail", "Wholesale", "Garments", "Hardware", "FMCG", "Distributors", "SMEs"];
  return (
    <section className="py-10 border-y border-white/5 bg-navy-900/50">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Built for the way Indian businesses actually operate
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
          {items.map((i) => (
            <span key={i} className="text-slate-300/70 font-display font-bold text-lg sm:text-xl">
              {i}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------- Problem ------------------------------ */
function Problem() {
  const pains = [
    { icon: Notebook, t: "Notebook ledgers", d: "Dues scattered across paper registers that are easy to lose and impossible to total." },
    { icon: Table, t: "Excel sheets", d: "Stock and sales in spreadsheets nobody updates after a busy day." },
    { icon: MessageCircle, t: "WhatsApp chaos", d: "Invoices and reminders typed by hand, one customer at a time." },
    { icon: Package, t: "Manual stock tracking", d: "No idea what's running out until a customer asks for it." },
    { icon: Coins, t: "Manual due tracking", d: "Outstanding payments forgotten, follow-ups missed, cash stuck." },
    { icon: Keyboard, t: "Manual product entry", d: "Hours lost typing supplier invoices into the system, line by line." },
  ];
  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <SectionHead
            eyebrow="The real problem"
            title={<>Most businesses don't need more software.<br className="hidden sm:block" /> They need less manual work.</>}
            sub="Bizzrow replaces the notebook, the spreadsheet and the copy-paste — with one system that keeps every number in sync."
          />
        </Reveal>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {pains.map((p, i) => (
            <Reveal key={p.t} delay={i * 0.05}>
              <div className="h-full rounded-2xl border border-white/10 bg-white/[0.03] p-6 hover:bg-white/[0.05] transition">
                <div className="w-11 h-11 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                  <p.icon className="w-5 h-5 text-rose-300" />
                </div>
                <h3 className="mt-4 font-display font-bold text-lg text-white">{p.t}</h3>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">{p.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------- Features ----------------------------- */
function Features() {
  const feats = [
    { icon: Boxes, t: "Smart inventory", d: "Track stock, low-stock alerts, fast/slow movers and inventory value — updated on every sale and return." },
    { icon: ShoppingCart, t: "Fast billing", d: "Create sales in seconds with discounts, split payments and sequential GST-ready invoices." },
    { icon: Wallet, t: "Customer ledger", d: "Every customer's purchases, payments and outstanding balance in one running statement." },
    { icon: ScanLine, t: "OCR invoice import", d: "Upload a supplier invoice and let Bizzrow draft your products automatically." },
    { icon: MessageCircle, t: "WhatsApp invoices", d: "Send invoices and payment reminders straight to customers on WhatsApp." },
    { icon: HeartPulse, t: "Business health", d: "A single score across revenue, collections, inventory and dues — with what to fix next." },
    { icon: Sparkles, t: "AI insights", d: "Action-first intelligence: who to follow up, what to restock, what's slowing down." },
    { icon: BarChart3, t: "Analytics", d: "Daily, weekly, monthly and custom views of revenue, profit and collections." },
    { icon: FileText, t: "PDF invoices", d: "Professional, branded PDF invoices and ledger statements, ready to share." },
  ];
  return (
    <section id="features" className="py-24 scroll-mt-24 bg-navy-900/40 border-y border-white/5">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <SectionHead
            eyebrow="Features"
            title="One platform for your whole operation"
            sub="Everything a growing business needs to run sales, stock, dues and customers — without juggling five tools."
          />
        </Reveal>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {feats.map((f, i) => (
            <Reveal key={f.t} delay={(i % 3) * 0.05}>
              <div className="group h-full rounded-2xl border border-white/10 bg-navy-850/60 p-6 hover:border-azure-500/40 hover:bg-navy-800/60 transition">
                <div className="w-11 h-11 rounded-xl bg-azure-500/15 border border-azure-500/25 flex items-center justify-center group-hover:scale-105 transition">
                  <f.icon className="w-5 h-5 text-azure-300" />
                </div>
                <h3 className="mt-4 font-display font-bold text-lg text-white">{f.t}</h3>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">{f.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------- Solutions ---------------------------- */
function Solutions() {
  const rows = [
    { t: "Retail stores", d: "Counter billing, low-stock alerts and daily collection at a glance.", icon: ShoppingCart },
    { t: "Wholesalers & distributors", d: "Credit sales, customer ledgers and outstanding recovery on autopilot.", icon: Wallet },
    { t: "Garment businesses", d: "Size/colour variants, fast-moving styles and seasonal stock control.", icon: Boxes },
    { t: "Hardware stores", d: "Large catalogues imported from supplier invoices with OCR in minutes.", icon: ScanLine },
    { t: "FMCG & grocery", d: "High-volume billing, margin tracking and restock-before-stockout alerts.", icon: TrendingUp },
    { t: "Growing SMEs", d: "One source of truth for revenue, profit, dues and business health.", icon: HeartPulse },
  ];
  return (
    <section id="solutions" className="py-24 scroll-mt-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <SectionHead eyebrow="Solutions" title="Made for your kind of business" sub="The same Bizzrow, tuned to how different businesses sell, stock and collect." />
        </Reveal>
        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((r, i) => (
            <Reveal key={r.t} delay={(i % 3) * 0.05}>
              <div className="h-full rounded-2xl border border-white/10 bg-white/[0.03] p-6 flex gap-4">
                <div className="shrink-0 w-11 h-11 rounded-xl bg-azure-500/15 border border-azure-500/25 flex items-center justify-center">
                  <r.icon className="w-5 h-5 text-azure-300" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-lg text-white">{r.t}</h3>
                  <p className="mt-1.5 text-sm text-slate-400 leading-relaxed">{r.d}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- OCR -------------------------------- */
function OcrSection() {
  const steps = [
    { icon: Upload, t: "Upload invoice", d: "Snap or upload a supplier bill — PDF or photo." },
    { icon: Sparkles, t: "Gemini extraction", d: "AI reads product names, quantities and rates." },
    { icon: ListChecks, t: "Review products", d: "Check the draft list — edit anything in one tap." },
    { icon: Percent, t: "Set margin", d: "Apply your selling margin across items instantly." },
    { icon: Boxes, t: "Inventory ready", d: "Approved products go live in your catalogue." },
  ];
  return (
    <section className="py-24 bg-navy-900/40 border-y border-white/5">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <SectionHead
            eyebrow="OCR import"
            title="Add inventory by uploading invoices"
            sub="Stop typing products manually. Upload supplier invoices and let Bizzrow create inventory in minutes."
          />
        </Reveal>

        <div className="mt-16 relative">
          {/* connector line */}
          <div className="hidden lg:block absolute top-[34px] left-[10%] right-[10%] h-px bg-gradient-to-r from-transparent via-azure-500/40 to-transparent" />
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
            {steps.map((s, i) => (
              <Reveal key={s.t} delay={i * 0.08} className="relative">
                <div className="flex flex-col items-center text-center">
                  <div className="relative w-[68px] h-[68px] rounded-2xl bg-navy-850 border border-azure-500/30 flex items-center justify-center shadow-[0_10px_30px_-12px_rgba(26,116,249,0.6)]">
                    <s.icon className="w-7 h-7 text-azure-300" />
                    <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-azure-500 text-white text-xs font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                  </div>
                  <h3 className="mt-4 font-display font-bold text-white">{s.t}</h3>
                  <p className="mt-1.5 text-sm text-slate-400 leading-relaxed">{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        <Reveal delay={0.1}>
          <p className="mt-12 text-center text-sm text-slate-500">
            Powered by Google Gemini vision. You always review before anything is saved — nothing is added to your inventory automatically.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------- WhatsApp ------------------------------ */
function WhatsAppSection() {
  const points = [
    { icon: FileText, t: "Invoice delivery", d: "Every sale can send a clean PDF invoice to the customer on WhatsApp." },
    { icon: Bell, t: "Payment reminders", d: "Gentle, automatic nudges for due amounts — no awkward phone calls." },
    { icon: Coins, t: "Outstanding reminders", d: "Recover pending balances with one-tap reminders from the ledger." },
  ];
  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid lg:grid-cols-2 gap-14 items-center">
          <Reveal>
            <Eyebrow>WhatsApp</Eyebrow>
            <h2 className="mt-4 font-display font-extrabold text-3xl sm:text-4xl leading-tight text-white">
              Invoices and reminders delivered directly on WhatsApp
            </h2>
            <p className="mt-4 text-lg text-slate-400 leading-relaxed">
              Your customers already live on WhatsApp. Bizzrow sends invoices and
              collects dues right where they'll actually see them — over the real
              Meta WhatsApp Cloud API.
            </p>
            <div className="mt-8 space-y-5">
              {points.map((p) => (
                <div key={p.t} className="flex gap-4">
                  <div className="shrink-0 w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                    <p.icon className="w-5 h-5 text-emerald-300" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{p.t}</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">{p.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="relative">
              <div className="absolute inset-0 bg-emerald-500/10 blur-3xl rounded-full -z-10" />
              <div className="flex items-end justify-center gap-4">
                <PhoneFrame src="/marketing/whatsapp-invoice.png" alt="WhatsApp invoice delivery" className="translate-y-4" />
                <PhoneFrame src="/marketing/whatsapp-reminders.png" alt="WhatsApp payment reminders" className="hidden sm:block" />
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.05}>
          <div className="mt-16">
            <BrowserFrame src="/marketing/whatsapp.png" alt="Bizzrow WhatsApp control panel — broadcasts and automations" className="max-w-4xl mx-auto" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ----------------------------- AI --------------------------------- */
function AiSection() {
  const insights = [
    { icon: Coins, text: "Recover ₹42,500 from 4 customers", tone: "text-amber-300 bg-amber-500/10 border-amber-500/20" },
    { icon: Package, text: "Restock Peri Peri Makhana before stockout", tone: "text-azure-300 bg-azure-500/10 border-azure-500/20" },
    { icon: TrendingUp, text: "Identify slow-moving inventory", tone: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20" },
  ];
  return (
    <section className="py-24 bg-navy-900/40 border-y border-white/5">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid lg:grid-cols-2 gap-14 items-center">
          <Reveal className="lg:order-2">
            <Eyebrow>Business intelligence</Eyebrow>
            <h2 className="mt-4 font-display font-extrabold text-3xl sm:text-4xl leading-tight text-white">
              Insights that tell you what action to take next
            </h2>
            <p className="mt-4 text-lg text-slate-400 leading-relaxed">
              Bizzrow doesn't just show charts. It reads your real numbers and tells
              you exactly what to do — who to follow up with, what to restock, and
              where money is leaking.
            </p>
            <div className="mt-8 space-y-3">
              {insights.map((i) => (
                <div key={i.text} className={`flex items-center gap-3 rounded-xl border p-3.5 ${i.tone}`}>
                  <i.icon className="w-5 h-5 shrink-0" />
                  <span className="font-medium text-white/90">{i.text}</span>
                </div>
              ))}
            </div>
            <div className="mt-8 flex items-center gap-3 text-sm text-slate-400">
              <HeartPulse className="w-5 h-5 text-azure-300" />
              A single Business Health score keeps your whole operation honest.
            </div>
          </Reveal>

          <Reveal delay={0.1} className="lg:order-1">
            <div className="relative">
              <div className="absolute inset-0 bg-azure-500/10 blur-3xl rounded-full -z-10" />
              <BrowserFrame src="/marketing/dashboard.png" alt="Bizzrow business health score and AI intelligence panel" />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* --------------------------- Showcase ----------------------------- */
function Showcase() {
  const tabs = [
    { key: "dashboard", label: "Dashboard", src: "/marketing/dashboard.png", alt: "Bizzrow dashboard" },
    { key: "sales", label: "Sales", src: "/marketing/sales.png", alt: "Bizzrow sales" },
    { key: "ledger", label: "Ledger", src: "/marketing/ledger.png", alt: "Bizzrow customer ledger" },
    { key: "whatsapp", label: "WhatsApp", src: "/marketing/whatsapp.png", alt: "Bizzrow WhatsApp panel" },
  ];
  const [active, setActive] = useState("dashboard");
  const cur = tabs.find((t) => t.key === active) || tabs[0];
  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <SectionHead eyebrow="Product tour" title="Real screens. Real data. No mockups." sub="This is the actual product — the same dark, fast, focused interface you'll use every day." />
        </Reveal>

        <Reveal delay={0.05}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setActive(t.key)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                  active === t.key
                    ? "bg-azure-500 text-white shadow-[0_8px_24px_-10px_rgba(26,116,249,0.8)]"
                    : "bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Reveal>

        <motion.div
          key={cur.key}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="mt-8 max-w-5xl mx-auto"
        >
          <BrowserFrame src={cur.src} alt={cur.alt} />
        </motion.div>

        <Reveal delay={0.05}>
          <div className="mt-6 flex items-center justify-center gap-2 text-sm text-slate-500">
            <Smartphone className="w-4 h-4 text-azure-300" />
            Installs as an app on mobile and desktop (PWA) — works full-screen with a home-screen icon.
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------- Pricing ------------------------------ */
function Pricing() {
  const [annual, setAnnual] = useState(false);
  const plans = [
    {
      name: "Starter", price: 299, tagline: "For small businesses finding their feet.",
      features: ["Inventory", "Sales", "Customer Ledger", "PDF Invoices", "Basic Analytics"],
      highlight: false,
    },
    {
      name: "Growth", price: 399, tagline: "For businesses ready to collect faster.",
      features: ["Everything in Starter", "WhatsApp Invoices", "WhatsApp Reminders", "OCR Product Import", "Business Health", "Advanced Analytics"],
      highlight: true,
    },
    {
      name: "Business", price: 499, tagline: "For operations that run on insight.",
      features: ["Everything in Growth", "Gemini Business Intelligence", "Priority Support", "Future Premium Features"],
      highlight: false,
    },
  ];
  const monthly = (p) => (annual ? Math.round(p * 0.8) : p);
  return (
    <section id="pricing" className="py-24 scroll-mt-24 bg-navy-900/40 border-y border-white/5">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <SectionHead eyebrow="Pricing" title="Simple, honest pricing" sub="Pick a plan that fits today. Upgrade any time as you grow." />
        </Reveal>

        <Reveal delay={0.05}>
          <div className="mt-8 flex items-center justify-center gap-3">
            <span className={`text-sm font-medium ${!annual ? "text-white" : "text-slate-500"}`}>Monthly</span>
            <button
              onClick={() => setAnnual((v) => !v)}
              className="relative w-14 h-7 rounded-full bg-white/10 border border-white/15 transition"
              aria-label="Toggle annual pricing"
            >
              <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-azure-500 transition-transform ${annual ? "translate-x-7" : ""}`} />
            </button>
            <span className={`text-sm font-medium ${annual ? "text-white" : "text-slate-500"}`}>
              Annual <span className="text-emerald-300">save 20%</span>
            </span>
          </div>
        </Reveal>

        <div className="mt-12 grid gap-6 lg:grid-cols-3 max-w-5xl mx-auto items-start">
          {plans.map((p, i) => (
            <Reveal key={p.name} delay={i * 0.07}>
              <div
                className={`relative h-full rounded-2xl p-7 border transition ${
                  p.highlight
                    ? "border-azure-500/50 bg-gradient-to-b from-azure-500/[0.12] to-navy-850 shadow-[0_30px_80px_-30px_rgba(26,116,249,0.6)] lg:-mt-3"
                    : "border-white/10 bg-navy-850/60"
                }`}
              >
                {p.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-azure-500 text-white text-xs font-bold shadow">
                    Most Popular
                  </span>
                )}
                <h3 className="font-display font-bold text-xl text-white">{p.name}</h3>
                <p className="mt-1 text-sm text-slate-400 h-10">{p.tagline}</p>
                <div className="mt-4 flex items-end gap-1.5">
                  <span className="font-display font-extrabold text-4xl text-white">₹{monthly(p.price)}</span>
                  <span className="text-slate-400 mb-1.5 text-sm">/month</span>
                </div>
                <p className="mt-1 text-xs text-slate-500 h-4">
                  {annual ? `Billed annually · ₹${monthly(p.price) * 12}/year` : "Billed monthly"}
                </p>

                <a
                  href={demoMailto}
                  className={`mt-6 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold transition active:scale-[0.98] ${
                    p.highlight
                      ? "bg-azure-500 hover:bg-azure-600 text-white shadow-[0_12px_32px_-12px_rgba(26,116,249,0.8)]"
                      : "bg-white/5 hover:bg-white/10 text-white border border-white/15"
                  }`}
                >
                  Book Demo
                </a>

                <ul className="mt-7 space-y-3">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-slate-300">
                      <CheckCircle2 className="w-5 h-5 text-azure-400 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.05}>
          <p className="mt-10 text-center text-sm text-slate-400">
            Questions about plans?{" "}
            <a href={salesMailto} className="font-semibold text-azure-400 hover:text-azure-300">Contact Sales</a>
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------- Trust --------------------------------- */
function TrustSection() {
  const cards = [
    { icon: ShieldCheck, t: "Your data, secured", d: "Private accounts, encrypted passwords and token-based sign-in. Your business data is yours alone." },
    { icon: Zap, t: "Fast where it matters", d: "Built for busy counters — billing, search and reminders that keep up with a real shop." },
    { icon: Users, t: "Shaped by real shops", d: "Every feature is informed by how retailers, garment sellers and hardware stores actually work." },
  ];
  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <SectionHead
            eyebrow="Why Bizzrow"
            title="Built using feedback from real businesses"
            sub="No vanity metrics, no inflated claims — just software designed around the daily reality of Indian retail and wholesale."
          />
        </Reveal>
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {cards.map((c, i) => (
            <Reveal key={c.t} delay={i * 0.06}>
              <div className="h-full rounded-2xl border border-white/10 bg-white/[0.03] p-7 text-center">
                <div className="mx-auto w-12 h-12 rounded-xl bg-azure-500/15 border border-azure-500/25 flex items-center justify-center">
                  <c.icon className="w-6 h-6 text-azure-300" />
                </div>
                <h3 className="mt-4 font-display font-bold text-lg text-white">{c.t}</h3>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">{c.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={0.05}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            {["Retail", "Garments", "Hardware", "FMCG"].map((x) => (
              <span key={x} className="px-4 py-2 rounded-full border border-white/10 bg-white/[0.04] text-sm font-medium text-slate-300">
                {x}
              </span>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ----------------------------- FAQ -------------------------------- */
function Faq() {
  const faqs = [
    { q: "How does inventory management work?", a: "Add products manually or import them from supplier invoices. Stock updates automatically on every sale, return and replacement, with low-stock and fast/slow-mover alerts so you restock at the right time." },
    { q: "How do I record sales?", a: "Create a sale in seconds — add items, apply item or bill discounts, split payments across cash/UPI/card, and generate a sequential invoice. Walk-in and registered customers are both supported." },
    { q: "What is OCR product import?", a: "Upload a supplier invoice (PDF or photo) and Bizzrow uses Google Gemini vision to draft your products — names, quantities and rates. You review and set margins before anything is saved. Nothing is added automatically." },
    { q: "How are WhatsApp invoices and reminders sent?", a: "Bizzrow connects to the official Meta WhatsApp Cloud API. You can send PDF invoices on each sale and trigger payment or outstanding reminders from the ledger — delivered right to the customer's chat." },
    { q: "How does pricing work?", a: "Three simple monthly plans — Starter ₹299, Growth ₹399 and Business ₹499 — with 20% off on annual billing. Start free, then pick a plan. There's no online checkout; book a demo or contact sales to get set up." },
    { q: "Is my business data secure?", a: "Each account is private and isolated. Passwords are encrypted and sign-in uses secure tokens. Your sales, customers and ledgers are only ever visible to you." },
    { q: "Can I use Bizzrow on my phone?", a: "Yes. Bizzrow is mobile-first and works on any modern browser — phone, tablet or desktop — so you can bill and check dues from anywhere in the shop." },
    { q: "Can I install it like an app (PWA)?", a: "Yes. Open Bizzrow in your browser and choose 'Add to Home Screen' (or 'Install') to run it full-screen like a native app, with a home-screen icon." },
  ];
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="py-24 scroll-mt-24 bg-navy-900/40 border-y border-white/5">
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <Reveal>
          <SectionHead eyebrow="FAQ" title="Questions, answered" sub="Everything you need to know before you start." />
        </Reveal>
        <div className="mt-12 space-y-3">
          {faqs.map((f, i) => (
            <Reveal key={f.q} delay={Math.min(i, 4) * 0.04}>
              <div className="rounded-2xl border border-white/10 bg-navy-850/60 overflow-hidden">
                <button
                  onClick={() => setOpen(open === i ? -1 : i)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <span className="font-semibold text-white">{f.q}</span>
                  <span className="shrink-0 w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-azure-300">
                    {open === i ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  </span>
                </button>
                {open === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    className="px-5 pb-5 -mt-1 text-sm text-slate-400 leading-relaxed"
                  >
                    {f.a}
                  </motion.div>
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------- Final CTA ---------------------------- */
function FinalCta() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-azure-500/30 bg-gradient-to-br from-navy-800 to-navy-900 px-6 py-16 sm:px-16 text-center">
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-azure-500/20 blur-[120px]" />
            <div className="relative">
              <h2 className="font-display font-extrabold text-3xl sm:text-4xl lg:text-5xl text-white leading-tight">
                Ready to simplify your <br className="hidden sm:block" /> business operations?
              </h2>
              <p className="mt-4 text-lg text-slate-300 max-w-xl mx-auto">
                Join the businesses replacing notebooks and spreadsheets with one calm, reliable system.
              </p>
              <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  to="/signup"
                  className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-azure-500 hover:bg-azure-600 text-white font-semibold shadow-[0_14px_40px_-12px_rgba(26,116,249,0.8)] transition active:scale-[0.98]"
                >
                  Start Free <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition" />
                </Link>
                <a
                  href={demoMailto}
                  className="w-full sm:w-auto inline-flex items-center justify-center px-7 py-3.5 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-white font-semibold transition"
                >
                  Book Demo
                </a>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------- Contact ------------------------------ */
function Contact() {
  return (
    <section id="contact" className="py-24 scroll-mt-24 bg-navy-900/40 border-t border-white/5">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <SectionHead eyebrow="Contact" title="Talk to a human" sub="Have a question or want a guided walkthrough? We're a message away." />
        </Reveal>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 max-w-3xl mx-auto">
          <Reveal>
            <a href={`tel:${BRAND.phoneDial}`} className="group block rounded-2xl border border-white/10 bg-navy-850/60 p-7 hover:border-azure-500/40 transition">
              <div className="w-12 h-12 rounded-xl bg-azure-500/15 border border-azure-500/25 flex items-center justify-center">
                <Phone className="w-6 h-6 text-azure-300" />
              </div>
              <h3 className="mt-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Call us</h3>
              <p className="mt-1 font-display font-bold text-xl text-white group-hover:text-azure-300 transition">{BRAND.phoneDisplay}</p>
            </a>
          </Reveal>
          <Reveal delay={0.07}>
            <a href={contactMailto} className="group block rounded-2xl border border-white/10 bg-navy-850/60 p-7 hover:border-azure-500/40 transition">
              <div className="w-12 h-12 rounded-xl bg-azure-500/15 border border-azure-500/25 flex items-center justify-center">
                <Mail className="w-6 h-6 text-azure-300" />
              </div>
              <h3 className="mt-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Email us</h3>
              <p className="mt-1 font-display font-bold text-xl text-white group-hover:text-azure-300 transition">{BRAND.email}</p>
            </a>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
