import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  TrendingUp,
  Wallet,
  Boxes,
  IndianRupee,
  Plus,
  Sparkles,
  RefreshCw,
  ArrowRight,
  ShoppingBag,
  Users,
  Package,
  Activity,
  Zap,
  Snail,
  AlertTriangle,
  Ban,
  ShieldCheck,
  TriangleAlert,
  Rocket,
} from "lucide-react";
import { api } from "../api/client.js";
import Modal from "../components/Modal.jsx";
import { formatINR, formatINRCompact, formatDate, relativeTime, initials } from "../lib/format.js";
import { useAuth } from "../context/AuthContext.jsx";
import HealthGauge from "../components/HealthGauge.jsx";

const CHART = {
  grid: "rgba(148,163,184,0.16)",
  tick: "#94a3b8",
  tooltip: {
    background: "rgb(var(--surface))",
    border: "1px solid rgba(148,163,184,0.25)",
    borderRadius: 12,
    fontSize: 12,
    color: "rgb(var(--ink-800))",
  },
};

const SUBSCORE_LABELS = {
  inventory: "Inventory",
  cashFlow: "Cash Flow",
  payment: "Payment",
  sales: "Sales",
  productPerformance: "Products",
  customer: "Customers",
};

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshingAI, setRefreshingAI] = useState(false);
  const [refreshingHealth, setRefreshingHealth] = useState(false);
  const [detail, setDetail] = useState(null);

  const loadDashboard = async () => {
    const { data } = await api.get("/dashboard/summary");
    setData(data);
  };
  const loadHealth = async () => {
    const { data } = await api.get("/business-health/score");
    setHealth(data);
  };

  useEffect(() => {
    Promise.allSettled([loadDashboard(), loadHealth()])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const refreshAI = async () => {
    setRefreshingAI(true);
    try {
      await api.post("/ai/insights/refresh");
      await loadDashboard();
      toast.success("Intelligence refreshed");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRefreshingAI(false);
    }
  };

  const refreshHealth = async () => {
    setRefreshingHealth(true);
    try {
      const { data } = await api.post("/business-health/refresh");
      setHealth(data);
      toast.success("Health score updated");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRefreshingHealth(false);
    }
  };

  if (loading) return <Loader />;
  if (!data) return null;

  const { summary, collection, inventory, series, insights, recentSales, recentCustomers, topSellers } = data;

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-ink-500 text-sm">
            {greeting()}, <span className="font-semibold text-ink-700">{(user?.business?.ownerName || user?.name)?.split(" ")[0]}</span>
          </p>
          <h1 className="font-display font-extrabold text-2xl lg:text-3xl text-ink-900 mt-0.5">
            {user?.business?.name || "Your Shop"}
          </h1>
        </div>
        <Link to="/app/sales" className="btn-primary">
          <Plus className="w-4 h-4" /> New sale
        </Link>
      </div>

      {/* SECTION 1 — KPI row (clickable → analytics) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Revenue (month)" value={formatINRCompact(summary.salesThisMonth)} sub={`${summary.salesCountThisMonth} orders · ${formatINRCompact(summary.profitThisMonth || 0)} profit`} icon={TrendingUp} tone="brand" onClick={() => setDetail("revenue")} />
        <Kpi label="Collected today" value={formatINRCompact(summary.collectionToday)} sub={`${summary.salesCountToday} sales`} icon={IndianRupee} tone="emerald" onClick={() => setDetail("collection")} />
        <Kpi label="Pending payments" value={formatINRCompact(summary.pendingPayments)} sub={`${summary.customersOwing} customers owe`} icon={Wallet} tone="amber" alert={summary.pendingPayments > 0} onClick={() => setDetail("outstanding")} />
        <Kpi label="Inventory value" value={formatINRCompact(summary.inventoryValue)} sub={`${inventory.counts.total} products`} icon={Boxes} tone="grape" onClick={() => setDetail("inventory")} />
      </div>
      {detail && <KpiDetailModal metric={detail} onClose={() => setDetail(null)} />}

      {/* SECTION 2 — Business Health + AI Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <HealthCard health={health} onRefresh={refreshHealth} refreshing={refreshingHealth} />
        <AIInsightsCard insights={insights} onRefresh={refreshAI} refreshing={refreshingAI} />
      </div>

      {/* Action center — deterministic, action-oriented insights */}
      <ActionCenter />

      {/* SECTION 3 — Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TrendCard series={series} />
        <CollectionCard collection={collection} />
      </div>

      {/* Inventory intelligence */}
      <InventoryIntelligence inventory={inventory} topSellers={topSellers} />

      {/* SECTION 4 — Recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RecentSales sales={recentSales} />
        <RecentCustomers customers={recentCustomers} />
      </div>
    </div>
  );
}

/* ---------- Section 1 ---------- */

const KPI_TONES = {
  brand: "bg-brand-500/10 text-brand-500",
  emerald: "bg-emerald-500/10 text-emerald-500",
  amber: "bg-amber-500/10 text-amber-500",
  grape: "bg-grape-500/10 text-grape-500",
};

function Kpi({ label, value, sub, icon: Icon, tone = "brand", alert, onClick }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className="card text-left w-full transition hover:-translate-y-0.5 hover:shadow-soft cursor-pointer"
    >
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${KPI_TONES[tone]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex items-center gap-1.5">
          {alert && <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />}
          <ArrowRight className="w-3.5 h-3.5 text-ink-300" />
        </div>
      </div>
      <div className="mt-3 font-display font-extrabold text-xl lg:text-2xl text-ink-900">{value}</div>
      <div className="text-xs text-ink-500 mt-0.5">{label}</div>
      {sub && <div className="text-[11px] text-ink-400 mt-0.5">{sub}</div>}
    </motion.button>
  );
}

const PRESETS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "lastMonth", label: "Last month" },
];
function presetRange(preset) {
  const now = new Date();
  const s = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).toISOString();
  const e = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString();
  switch (preset) {
    case "today": return { from: s(now), to: e(now) };
    case "yesterday": { const y = new Date(now); y.setDate(y.getDate() - 1); return { from: s(y), to: e(y) }; }
    case "week": { const dow = (now.getDay() + 6) % 7; const a = new Date(now); a.setDate(a.getDate() - dow); return { from: s(a), to: e(now) }; }
    case "month": return { from: s(new Date(now.getFullYear(), now.getMonth(), 1)), to: e(now) };
    case "lastMonth": { const f = new Date(now.getFullYear(), now.getMonth() - 1, 1); const l = new Date(now.getFullYear(), now.getMonth(), 0); return { from: s(f), to: e(l) }; }
    default: return {};
  }
}

const METRIC_TITLE = { revenue: "Revenue & profit", collection: "Collections", outstanding: "Outstanding", inventory: "Inventory" };

function KpiDetailModal({ metric, onClose }) {
  const [preset, setPreset] = useState("month");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const ranged = metric === "revenue" || metric === "collection";

  useEffect(() => {
    setLoading(true);
    const params = { metric };
    if (ranged) Object.assign(params, presetRange(preset));
    api.get("/dashboard/analytics", { params })
      .then(({ data }) => setData(data))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [metric, preset, ranged]);

  return (
    <Modal open onClose={onClose} title={METRIC_TITLE[metric] || "Analytics"} size="lg">
      {ranged && (
        <div className="flex flex-wrap gap-2 mb-4">
          {PRESETS.map((p) => (
            <button key={p.key} onClick={() => setPreset(p.key)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${preset === p.key ? "bg-brand-500 text-white" : "bg-ink-50 text-ink-600 hover:bg-ink-100"}`}>{p.label}</button>
          ))}
        </div>
      )}
      {loading || !data ? (
        <div className="grid grid-cols-2 gap-3">{[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-ink-50 rounded-xl animate-pulse" />)}</div>
      ) : metric === "revenue" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Revenue" value={formatINR(data.revenue)} />
            <Stat label="Profit" value={formatINR(data.profit)} tone="emerald" />
            <Stat label="Orders" value={data.orders} />
            <Stat label="Avg order value" value={formatINR(data.avgOrderValue)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <RecordList title="Top products" rows={(data.topProducts || []).map((p) => ({ label: p.name, value: formatINR(p.revenue) }))} empty="No product sales yet." />
            <RecordList title="Top customers" rows={(data.topCustomers || []).map((c) => ({ label: c.name, value: formatINR(c.revenue) }))} empty="No customer sales yet." />
          </div>
        </div>
      ) : metric === "collection" ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-ink-500">Total collected in range</span>
            <span className="font-display font-extrabold text-lg text-ink-900">{formatINR(data.total)}</span>
          </div>
          {(data.records || []).length === 0 ? (
            <p className="text-sm text-ink-500 py-6 text-center">No collections in this range.</p>
          ) : (
            <div className="border border-ink-200/60 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-ink-50 text-left text-xs uppercase tracking-wider text-ink-500">
                    <th className="py-2 px-3 font-semibold">Customer</th>
                    <th className="py-2 px-3 font-semibold">Method</th>
                    <th className="py-2 px-3 font-semibold">Date</th>
                    <th className="py-2 px-3 font-semibold text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.records.map((r, i) => (
                    <tr key={i} className="border-t border-ink-200/40">
                      <td className="py-2 px-3 text-ink-800">{r.customer}<div className="text-[10px] text-ink-400">{r.reference}</div></td>
                      <td className="py-2 px-3 text-ink-600 capitalize">{r.method}</td>
                      <td className="py-2 px-3 text-ink-500 whitespace-nowrap">{formatDate(r.date)}</td>
                      <td className="py-2 px-3 text-right font-semibold text-emerald-500">{formatINR(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : metric === "outstanding" ? (
        <div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Stat label="Total due" value={formatINR(data.totalDue)} tone="amber" />
            <Stat label="Overdue (30d+)" value={formatINR(data.overdue)} tone="rose" />
            <Stat label="Recent" value={formatINR(data.upcoming)} />
          </div>
          {(data.records || []).length === 0 ? (
            <p className="text-sm text-ink-500 py-4 text-center">No outstanding dues. 🎉</p>
          ) : (
            <div className="border border-ink-200/60 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-ink-50 text-left text-xs uppercase tracking-wider text-ink-500">
                    <th className="py-2 px-3 font-semibold">Customer</th>
                    <th className="py-2 px-3 font-semibold">Days</th>
                    <th className="py-2 px-3 font-semibold">Risk</th>
                    <th className="py-2 px-3 font-semibold text-right">Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {data.records.map((c) => {
                    const rc = c.risk === "High" ? "text-rose-500 bg-rose-500/10" : c.risk === "Medium" ? "text-amber-500 bg-amber-500/10" : "text-emerald-500 bg-emerald-500/10";
                    return (
                      <tr key={c._id} className="border-t border-ink-200/40">
                        <td className="py-2 px-3 text-ink-800">{c.name}<div className="text-[10px] text-ink-400">{c.shopName || c.phone}</div></td>
                        <td className="py-2 px-3 text-ink-500">{c.daysOutstanding != null ? `${c.daysOutstanding}d` : "—"}</td>
                        <td className="py-2 px-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${rc}`}>{c.risk}</span></td>
                        <td className="py-2 px-3 text-right font-bold text-rose-500">{formatINR(c.pendingBalance)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Stat label="Inventory value" value={formatINR(data.value)} />
            <Stat label="Healthy" value={data.distribution.healthy} tone="emerald" />
            <Stat label="Low stock" value={data.distribution.low} tone="amber" />
            <Stat label="Out of stock" value={data.distribution.out} tone="rose" />
          </div>
          {data.lowStock.length > 0 && (
            <>
              <div className="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-2">Low / out of stock</div>
              <div className="divide-y divide-ink-200/40 mb-3">
                {data.lowStock.map((p) => (
                  <div key={p._id} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-ink-800 truncate">{p.name}</span>
                    <span className={`font-bold ${p.stock === 0 ? "text-rose-500" : "text-amber-500"}`}>{p.stock} left</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {data.dead.length > 0 && (
            <>
              <div className="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-2">Dead inventory (45d+ no sale)</div>
              <div className="divide-y divide-ink-200/40">
                {data.dead.map((p) => (
                  <div key={p._id} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-ink-800 truncate">{p.name}</span>
                    <span className="text-ink-500">{p.stock} units</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value, tone }) {
  const c = tone === "emerald" ? "text-emerald-500" : tone === "amber" ? "text-amber-500" : tone === "rose" ? "text-rose-500" : "text-ink-900";
  return (
    <div className="rounded-xl bg-ink-50/60 border border-ink-200/50 p-3">
      <div className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">{label}</div>
      <div className={`font-display font-extrabold text-lg mt-1 ${c}`}>{value}</div>
    </div>
  );
}

function RecordList({ title, rows, empty }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-2">{title}</div>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-400 py-2">{empty}</p>
      ) : (
        <div className="divide-y divide-ink-200/40">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between py-2 text-sm">
              <span className="text-ink-800 truncate">{r.label}</span>
              <span className="font-semibold text-ink-700 shrink-0">{r.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Section 2: Health ---------- */

function HealthCard({ health, onRefresh, refreshing }) {
  const h = health?.health;
  const narrative = health?.narrative || { strengths: [], risks: [], opportunities: [] };
  const insufficient = !h || h.insufficientData;
  const tone = h?.category?.tone || "info";
  const sub = h?.subScores || {};
  const hasNarrative = narrative.strengths.length || narrative.risks.length || narrative.opportunities.length;

  return (
    <div className="card lg:col-span-2">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-emerald-500" />
          <h2 className="font-display font-bold text-lg text-ink-900">Business Health</h2>
        </div>
        <button onClick={onRefresh} disabled={refreshing} className="btn-ghost px-2.5 py-1.5 text-xs">
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Analyzing…" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-center">
        {/* Gauge */}
        <div className="flex justify-center py-2">
          <HealthGauge score={insufficient ? null : h.overall} tone={tone} label={h?.category?.label} size={170} />
        </div>

        {/* Sub-scores */}
        <div className="space-y-2.5">
          {insufficient ? (
            <p className="text-sm text-ink-500">
              Add a few products and record some sales — your health score and AI analysis unlock automatically.
            </p>
          ) : (
            Object.keys(SUBSCORE_LABELS).map((key) =>
              sub[key] == null ? null : <SubScoreBar key={key} label={SUBSCORE_LABELS[key]} value={sub[key]} />
            )
          )}
        </div>
      </div>

      {/* Strengths / Risks / Opportunities */}
      {!insufficient && (
        <div className="mt-4 pt-4 border-t border-ink-200/50">
          {!hasNarrative ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-ink-500">Generate an AI read on what's strong and what needs attention.</p>
              <button onClick={onRefresh} disabled={refreshing} className="btn-primary text-xs shrink-0">
                <Sparkles className="w-3.5 h-3.5" /> Analyze
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <NarrativeList icon={ShieldCheck} title="Strengths" items={narrative.strengths} tone="good" />
              <NarrativeList icon={TriangleAlert} title="Risks" items={narrative.risks} tone="warn" />
              <NarrativeList icon={Rocket} title="Opportunities" items={narrative.opportunities} tone="info" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SubScoreBar({ label, value }) {
  const color = value >= 75 ? "bg-emerald-500" : value >= 60 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-ink-600 font-medium">{label}</span>
        <span className="text-ink-800 font-bold">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

const NARRATIVE_TONE = {
  good: "text-emerald-500",
  warn: "text-amber-500",
  info: "text-brand-400",
};

function NarrativeList({ icon: Icon, title, items, tone }) {
  return (
    <div>
      <div className={`flex items-center gap-1.5 mb-1.5 ${NARRATIVE_TONE[tone]}`}>
        <Icon className="w-3.5 h-3.5" />
        <span className="text-xs font-bold uppercase tracking-wider">{title}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-ink-400">—</p>
      ) : (
        <ul className="space-y-1">
          {items.map((t, i) => (
            <li key={i} className="text-xs text-ink-600 leading-snug">• {t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Section 2: AI Insights ---------- */

const SEVERITY_STYLES = {
  good: "border-emerald-500/20 bg-emerald-500/5",
  info: "border-brand-500/20 bg-brand-500/5",
  warn: "border-amber-500/20 bg-amber-500/5",
  critical: "border-rose-500/20 bg-rose-500/5",
};

function AIInsightsCard({ insights, onRefresh, refreshing }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-brand-400" />
          <h2 className="font-display font-bold text-lg text-ink-900">Intelligence</h2>
        </div>
        <button onClick={onRefresh} disabled={refreshing} className="btn-ghost px-2.5 py-1.5 text-xs">
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Thinking…" : "Refresh"}
        </button>
      </div>
      {!insights || insights.length === 0 ? (
        <div className="text-center py-8">
          <Sparkles className="w-8 h-8 text-brand-400/60 mx-auto mb-2" />
          <p className="text-sm text-ink-500">No signals yet.</p>
          <button onClick={onRefresh} className="btn-primary mt-3 text-xs">Generate now</button>
        </div>
      ) : (
        <div className="space-y-2.5 max-h-[19rem] overflow-y-auto no-scrollbar">
          {insights.slice(0, 6).map((ins, i) => (
            <motion.div
              key={ins._id || i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`border rounded-xl px-3 py-2.5 ${SEVERITY_STYLES[ins.severity] || SEVERITY_STYLES.info}`}
            >
              <div className="font-semibold text-xs text-ink-800">{ins.title}</div>
              <div className="text-xs mt-0.5 text-ink-600">{ins.body}</div>
            </motion.div>
          ))}
          <Link to="/app/ai" className="block text-center text-xs font-semibold text-brand-400 hover:text-brand-300 pt-1">
            Open Intelligence Engine →
          </Link>
        </div>
      )}
    </div>
  );
}

/* ---------- Section 3: Analytics ---------- */

function TrendCard({ series }) {
  return (
    <div className="card lg:col-span-2">
      <div className="mb-4">
        <h2 className="font-display font-bold text-lg text-ink-900">Revenue & collection</h2>
        <p className="text-xs text-ink-500">Last 14 days</p>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 5, right: 10, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3849f5" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#3849f5" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="col" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d) => formatDate(d)} tick={{ fontSize: 11, fill: CHART.tick }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: CHART.tick }} axisLine={false} tickLine={false} width={52} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
            <Tooltip contentStyle={CHART.tooltip} labelStyle={{ color: "rgb(var(--ink-500))" }} formatter={(v, n) => [formatINR(v), n === "revenue" ? "Revenue" : "Collected"]} labelFormatter={(d) => formatDate(d, { year: true })} />
            <Area type="monotone" dataKey="revenue" stroke="#3849f5" strokeWidth={2.5} fill="url(#rev)" />
            <Area type="monotone" dataKey="collected" stroke="#10b981" strokeWidth={2} fill="url(#col)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-4 mt-2 text-xs text-ink-500">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-brand-500" /> Revenue</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Collected</span>
      </div>
    </div>
  );
}

const METHOD_COLORS = { cash: "#10b981", upi: "#3849f5", bank: "#8b5cf6", card: "#f59e0b", credit: "#94a3b8" };

function CollectionCard({ collection }) {
  const today = collection?.today || {};
  const month = collection?.month || {};
  const methods = ["cash", "upi", "bank"];
  const pieData = methods
    .map((m) => ({ name: m.toUpperCase(), key: m, value: month[m] || 0 }))
    .filter((d) => d.value > 0);
  const monthTotal = month.total || 0;

  return (
    <div className="card">
      <h2 className="font-display font-bold text-lg text-ink-900 mb-1">Collection</h2>
      <p className="text-xs text-ink-500 mb-3">Today by method</p>

      {/* Today's collection breakdown */}
      <div className="space-y-2 mb-4">
        <CollectRow label="Cash" value={today.cash || 0} color={METHOD_COLORS.cash} />
        <CollectRow label="UPI" value={today.upi || 0} color={METHOD_COLORS.upi} />
        <CollectRow label="Bank" value={today.bank || 0} color={METHOD_COLORS.bank} />
        <div className="flex items-center justify-between pt-2 border-t border-ink-200/50">
          <span className="text-sm font-bold text-ink-800">Total</span>
          <span className="font-display font-extrabold text-ink-900">{formatINR(today.total || 0)}</span>
        </div>
      </div>

      {/* Month donut */}
      <div className="pt-3 border-t border-ink-200/50">
        <p className="text-xs text-ink-500 mb-2">This month's mix</p>
        {monthTotal === 0 ? (
          <p className="text-xs text-ink-400 py-4 text-center">No collections yet this month.</p>
        ) : (
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" innerRadius={28} outerRadius={44} paddingAngle={2} stroke="none">
                    {pieData.map((d) => (
                      <Cell key={d.key} fill={METHOD_COLORS[d.key]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={CHART.tooltip} formatter={(v) => formatINR(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-1.5">
              {pieData.map((d) => (
                <div key={d.key} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-ink-600">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: METHOD_COLORS[d.key] }} />
                    {d.name}
                  </span>
                  <span className="font-semibold text-ink-800">{Math.round((d.value / monthTotal) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CollectRow({ label, value, color }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-sm text-ink-600">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="font-semibold text-ink-800">{formatINR(value)}</span>
    </div>
  );
}

/* ---------- Inventory intelligence ---------- */

function InventoryIntelligence({ inventory, topSellers }) {
  const c = inventory.counts;
  const tiles = [
    { label: "Fast moving", value: c.fast, icon: Zap, tone: "emerald", list: inventory.fast },
    { label: "Slow moving", value: c.slow, icon: Snail, tone: "amber", list: inventory.slow },
    { label: "Low stock", value: c.low, icon: AlertTriangle, tone: "rose", list: inventory.low },
    { label: "Dead stock", value: c.dead, icon: Ban, tone: "grape", list: inventory.dead },
  ];
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Boxes className="w-5 h-5 text-grape-400" />
          <h2 className="font-display font-bold text-lg text-ink-900">Inventory intelligence</h2>
        </div>
        <Link to="/app/products" className="text-xs font-semibold text-brand-400">Manage <ArrowRight className="inline w-3 h-3" /></Link>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <InvTile key={t.label} {...t} />
        ))}
      </div>
    </div>
  );
}

const INV_TONES = {
  emerald: "bg-emerald-500/10 text-emerald-500",
  amber: "bg-amber-500/10 text-amber-500",
  rose: "bg-rose-500/10 text-rose-500",
  grape: "bg-grape-500/10 text-grape-400",
};

function InvTile({ label, value, icon: Icon, tone, list }) {
  return (
    <div className="rounded-xl border border-ink-200/50 bg-ink-50/40 p-3">
      <div className="flex items-center justify-between">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${INV_TONES[tone]}`}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="font-display font-extrabold text-xl text-ink-900">{value}</span>
      </div>
      <div className="text-xs font-semibold text-ink-700 mt-2">{label}</div>
      <div className="mt-1 space-y-0.5">
        {(list || []).slice(0, 2).map((p) => (
          <div key={p._id} className="text-[11px] text-ink-400 truncate">{p.name}</div>
        ))}
        {(!list || list.length === 0) && <div className="text-[11px] text-ink-400">—</div>}
      </div>
    </div>
  );
}

/* ---------- Section 4: Recent activity ---------- */

function RecentSales({ sales }) {
  const statusStyles = { paid: "pill-good", partial: "pill-warn", unpaid: "pill-bad" };
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-5 h-5 text-brand-400" />
          <h2 className="font-display font-bold text-lg text-ink-900">Recent sales</h2>
        </div>
        <Link to="/app/sales" className="text-xs font-semibold text-brand-400">All <ArrowRight className="inline w-3 h-3" /></Link>
      </div>
      {!sales || sales.length === 0 ? (
        <p className="text-sm text-ink-500 py-6 text-center">No sales yet.</p>
      ) : (
        <div className="divide-y divide-ink-200/40">
          {sales.map((s) => (
            <div key={s._id} className="flex items-center justify-between py-2.5">
              <div className="min-w-0">
                <div className="font-semibold text-sm text-ink-800 truncate">{s.customerName}</div>
                <div className="text-xs text-ink-500">{s.invoiceNumber} · {relativeTime(s.createdAt)}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-bold text-ink-800 text-sm">{formatINR(s.total)}</div>
                <span className={statusStyles[s.paymentStatus]}>{s.paymentStatus}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RecentCustomers({ customers }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-grape-400" />
          <h2 className="font-display font-bold text-lg text-ink-900">Recent customers</h2>
        </div>
        <Link to="/app/ledger" className="text-xs font-semibold text-brand-400">Ledger <ArrowRight className="inline w-3 h-3" /></Link>
      </div>
      {!customers || customers.length === 0 ? (
        <p className="text-sm text-ink-500 py-6 text-center">No customers yet.</p>
      ) : (
        <div className="divide-y divide-ink-200/40">
          {customers.map((c) => (
            <div key={c._id} className="flex items-center gap-3 py-2.5">
              <div className="w-9 h-9 rounded-full bg-gradient-brand text-white flex items-center justify-center font-semibold text-xs shrink-0">
                {initials(c.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-ink-800 truncate">{c.name}</div>
                <div className="text-xs text-ink-500 truncate">{c.shopName || c.phone}</div>
              </div>
              {c.pendingBalance > 0 ? (
                <span className="pill-warn">{formatINR(c.pendingBalance)}</span>
              ) : (
                <span className="pill-good">Settled</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Loader ---------- */

function Loader() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-48 bg-ink-100 rounded-lg animate-pulse" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <div key={i} className="card h-28 animate-pulse" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card h-72 animate-pulse lg:col-span-2" />
        <div className="card h-72 animate-pulse" />
      </div>
    </div>
  );
}

function ActionCenter() {
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get("/business-health/actions")
      .then(({ data }) => setActions(data.actions || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  if (loading || actions.length === 0) return null;
  const tone = {
    urgent: { chip: "bg-rose-500/15 text-rose-400 border-rose-500/30", dot: "bg-rose-500" },
    important: { chip: "bg-amber-500/15 text-amber-400 border-amber-500/30", dot: "bg-amber-500" },
    opportunity: { chip: "bg-brand-500/15 text-brand-300 border-brand-500/30", dot: "bg-brand-500" },
  };
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-5 h-5 text-amber-400" />
        <h2 className="font-display font-bold text-lg text-ink-900">Action center</h2>
        <span className="text-xs text-ink-400">· what to do next</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
        {actions.map((a, i) => {
          const t = tone[a.priority] || tone.opportunity;
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="flex items-start gap-3 rounded-xl border border-ink-200/50 bg-ink-50/40 p-3">
              <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${t.dot}`} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink-800">{a.title || a.action}</div>
                {a.metrics?.length > 0 && (
                  <div className="text-xs mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    {a.metrics.map((m, j) => (
                      <span key={j}><span className="text-ink-400">{m.label}:</span> <span className="text-ink-600 font-medium">{m.value}</span></span>
                    ))}
                  </div>
                )}
                {a.title && a.action && <div className="text-xs font-semibold text-brand-400 mt-1.5">→ {a.action}</div>}
                {!a.title && a.reason && <div className="text-xs text-ink-500 mt-0.5">{a.reason}</div>}
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border shrink-0 ${t.chip}`}>{a.priority}</span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
