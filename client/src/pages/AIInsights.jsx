import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import {
  Sparkles,
  RefreshCw,
  TrendingUp,
  AlertTriangle,
  ShoppingBag,
  Package,
  Users,
  ShieldCheck,
  TriangleAlert,
  Rocket,
  BrainCircuit,
} from "lucide-react";
import { api } from "../api/client.js";
import { relativeTime } from "../lib/format.js";
import PageHeader from "../components/PageHeader.jsx";
import EmptyState from "../components/EmptyState.jsx";

const KIND_META = {
  daily_summary: { icon: TrendingUp, label: "Business pulse", color: "brand" },
  top_sellers: { icon: ShoppingBag, label: "Top performers", color: "emerald" },
  slow_movers: { icon: Package, label: "Slow movers", color: "amber" },
  reorder_suggestion: { icon: Package, label: "Reorder signals", color: "brand" },
  customer_signal: { icon: Users, label: "Customer activity", color: "brand" },
  low_stock_alert: { icon: AlertTriangle, label: "Inventory warnings", color: "rose" },
  marketing_copy: { icon: Sparkles, label: "Marketing", color: "brand" },
  health_strength: { icon: ShieldCheck, label: "Strengths", color: "emerald" },
  health_risk: { icon: TriangleAlert, label: "Payment & risk", color: "amber" },
  growth_opportunity: { icon: Rocket, label: "Growth opportunities", color: "brand" },
};

const TONE = {
  brand: "bg-brand-500/10 text-brand-700 dark:text-brand-300 border-brand-500/20",
  emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  rose: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
};

const ICON_COLOR = {
  brand: "text-brand-400",
  emerald: "text-emerald-500",
  amber: "text-amber-500",
  rose: "text-rose-500",
};

// Display order so the most strategic signals lead.
const ORDER = [
  "daily_summary",
  "health_strength",
  "health_risk",
  "growth_opportunity",
  "top_sellers",
  "slow_movers",
  "reorder_suggestion",
  "low_stock_alert",
  "customer_signal",
  "marketing_copy",
];

export default function AIInsights() {
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/ai/insights");
      setInsights(data.insights);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      // Refresh operational insights + the health narrative together.
      const [ins] = await Promise.all([
        api.post("/ai/insights/refresh"),
        api.post("/business-health/refresh").catch(() => null),
      ]);
      // Re-pull everything so health narrative rows show too.
      await load();
      toast.success(`Generated ${ins.data.insights.length} signals`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRefreshing(false);
    }
  };

  const grouped = insights.reduce((acc, ins) => {
    (acc[ins.kind] = acc[ins.kind] || []).push(ins);
    return acc;
  }, {});
  const orderedKinds = Object.keys(grouped).sort((a, b) => {
    const ia = ORDER.indexOf(a);
    const ib = ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  return (
    <div>
      <PageHeader
        title="Intelligence Engine"
        subtitle="Your business, continuously analyzed — strengths, risks, and what to act on next."
        action={
          <button onClick={refresh} disabled={refreshing} className="btn-primary">
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Analyzing…" : "Refresh"}
          </button>
        }
      />

      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card bg-gradient-brand text-white border-0 mb-6 relative overflow-hidden">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0">
            <BrainCircuit className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h2 className="font-display font-bold text-xl">Bizzrow Intelligence Engine</h2>
            <p className="text-white/85 text-sm mt-1 max-w-xl">
              Not a chatbot — a quiet analyst reading your sales, stock, payments, and customers to surface what matters: what's selling, who owes you, what's about to run out, and where to grow.
            </p>
          </div>
        </div>
        <div className="absolute -right-10 -bottom-10 w-40 h-40 rounded-full bg-white/10 blur-2xl pointer-events-none" />
      </motion.div>

      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="card h-20 animate-pulse" />)}</div>
      ) : insights.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No signals generated yet"
          body="Refresh to analyze your business data. Make sure you have a few products and sales recorded first."
          action={
            <button onClick={refresh} disabled={refreshing} className="btn-primary">
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Analyzing…" : "Generate now"}
            </button>
          }
        />
      ) : (
        <div className="space-y-6">
          {orderedKinds.map((kind) => {
            const meta = KIND_META[kind] || { icon: Sparkles, label: kind, color: "brand" };
            const Icon = meta.icon;
            return (
              <section key={kind}>
                <div className="flex items-center gap-2 mb-3">
                  <Icon className={`w-4 h-4 ${ICON_COLOR[meta.color]}`} />
                  <h3 className="font-semibold text-sm text-ink-700">{meta.label}</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {grouped[kind].map((ins, i) => (
                    <motion.div
                      key={ins._id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className={`border rounded-2xl p-4 ${TONE[ins.severity] || TONE[meta.color] || TONE.brand}`}
                    >
                      {ins.title && ins.title !== "Strength" && ins.title !== "Risk" && ins.title !== "Opportunity" && (
                        <div className="font-display font-bold text-base">{ins.title}</div>
                      )}
                      <div className="text-sm opacity-95 leading-snug">{ins.body}</div>
                      <div className="text-[10px] opacity-60 mt-2 uppercase tracking-wider">{relativeTime(ins.createdAt)}</div>
                    </motion.div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
