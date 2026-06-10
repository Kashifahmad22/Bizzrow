import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { Plus, Search, Phone, Send, Wallet, Users, ChevronRight, IndianRupee, FileText, Download } from "lucide-react";
import { api } from "../api/client.js";
import { useDebounce } from "../hooks/useDebounce.js";
import { formatINR, formatDate, initials, relativeTime } from "../lib/format.js";
import PageHeader from "../components/PageHeader.jsx";
import Modal from "../components/Modal.jsx";
import EmptyState from "../components/EmptyState.jsx";

export default function Ledger() {
  const [customers, setCustomers] = useState([]);
  const [summary, setSummary] = useState({ totalCustomers: 0, totalPending: 0, owing: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all"); // all | pending
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState(null);
  const debouncedQ = useDebounce(q, 300);

  const load = useCallback(async (p = 1, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const params = { page: p, limit: 25 };
      if (debouncedQ.trim()) params.q = debouncedQ.trim();
      const { data } = await api.get("/customers", { params });
      setCustomers((prev) => (append ? [...prev, ...data.customers] : data.customers));
      if (data.summary) setSummary(data.summary);
      setPage(data.page || 1);
      setHasMore((data.page || 1) < (data.pages || 1));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [debouncedQ]);

  useEffect(() => {
    load(1, false);
  }, [load]);

  // "Pending only" filters the currently loaded page client-side.
  const filtered = useMemo(() => {
    if (filter === "pending") return customers.filter((c) => c.pendingBalance > 0);
    return customers;
  }, [customers, filter]);

  return (
    <div>
      <PageHeader
        title="Ledger"
        subtitle={`${summary.totalCustomers} customers · ${formatINR(summary.totalPending)} pending`}
        action={
          <button className="btn-primary" onClick={() => setAdding(true)}>
            <Plus className="w-4 h-4" /> Add customer
          </button>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <StatCard label="Customers" value={summary.totalCustomers} icon={Users} />
        <StatCard label="Pending balance" value={formatINR(summary.totalPending)} icon={Wallet} tone="amber" />
        <StatCard label="Owing" value={summary.owing} icon={IndianRupee} tone="rose" />
      </div>

      {/* Filter + search */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="card p-3 flex items-center gap-3 flex-1">
          <Search className="w-4 h-4 text-ink-400 ml-1" />
          <input
            className="flex-1 outline-none bg-transparent text-sm placeholder:text-ink-300"
            placeholder="Search by name, phone, shop…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <FilterPill active={filter === "all"} onClick={() => setFilter("all")}>All</FilterPill>
          <FilterPill active={filter === "pending"} onClick={() => setFilter("pending")}>Pending only</FilterPill>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card h-20 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={q || filter !== "all" ? "No matching customers" : "No customers yet"}
          body={q || filter !== "all" ? "Adjust your filter or search." : "Add your first customer to start tracking balances."}
          action={
            !q && filter === "all" && (
              <button className="btn-primary" onClick={() => setAdding(true)}>
                <Plus className="w-4 h-4" /> Add customer
              </button>
            )
          }
        />
      ) : (
        <>
          <div className="card !p-0 divide-y divide-ink-100 overflow-hidden">
            {filtered.map((c) => (
              <CustomerRow key={c._id} customer={c} onOpen={() => setViewing(c)} />
            ))}
          </div>
          {hasMore && filter !== "pending" && (
            <div className="text-center mt-4">
              <button onClick={() => load(page + 1, true)} disabled={loadingMore} className="btn-outline">
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}

      {adding && <CustomerModal onClose={() => setAdding(false)} onSaved={load} />}
      {viewing && <LedgerDrawer customer={viewing} onClose={() => setViewing(null)} onChange={load} />}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone = "brand" }) {
  const tones = {
    brand: "bg-brand-500/10 text-brand-500",
    amber: "bg-amber-500/10 text-amber-500",
    rose: "bg-rose-500/10 text-rose-500",
  };
  return (
    <div className="card flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tones[tone]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-xs text-ink-500">{label}</div>
        <div className="font-display font-extrabold text-lg text-ink-900">{value}</div>
      </div>
    </div>
  );
}

function FilterPill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition ${
        active ? "bg-brand-500 text-white shadow-glow" : "bg-surface text-ink-600 border border-ink-200 hover:bg-ink-50"
      }`}
    >
      {children}
    </button>
  );
}

function CustomerRow({ customer, onOpen }) {
  const pending = customer.pendingBalance > 0;
  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-ink-50 transition text-left"
    >
      <div className="w-10 h-10 rounded-full bg-gradient-brand text-white flex items-center justify-center font-semibold text-sm shrink-0">
        {initials(customer.name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-ink-800 truncate">{customer.name}</div>
        <div className="text-xs text-ink-500 truncate flex items-center gap-2">
          {customer.shopName && <span>{customer.shopName}</span>}
          {customer.shopName && <span>·</span>}
          <span>{customer.phone}</span>
        </div>
      </div>
      <div className="text-right shrink-0">
        {pending ? (
          <>
            <div className="text-sm font-bold text-rose-600">{formatINR(customer.pendingBalance)}</div>
            <div className="text-[10px] text-ink-400">pending</div>
          </>
        ) : (
          <span className="pill-good">Settled</span>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-ink-300" />
    </button>
  );
}

function CustomerModal({ onClose, onSaved, initial = null }) {
  const [form, setForm] = useState(
    initial || { name: "", phone: "", shopName: "", address: "", notes: "" }
  );
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (initial?._id) {
        await api.put(`/customers/${initial._id}`, form);
        toast.success("Customer updated");
      } else {
        await api.post("/customers", form);
        toast.success("Customer added");
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={initial?._id ? "Edit customer" : "Add customer"}
      footer={
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-outline">Cancel</button>
          <button form="customer-form" type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Saving…" : "Save"}
          </button>
        </div>
      }
    >
      <form id="customer-form" onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label">Name *</label>
          <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Rajesh Kumar" />
        </div>
        <div>
          <label className="label">Phone *</label>
          <input className="input" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 9876543210" />
        </div>
        <div>
          <label className="label">Shop / business name</label>
          <input className="input" value={form.shopName} onChange={(e) => setForm({ ...form, shopName: e.target.value })} placeholder="Kumar Garments" />
        </div>
        <div>
          <label className="label">Address</label>
          <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="optional" />
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea className="input min-h-[80px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="optional" />
        </div>
      </form>
    </Modal>
  );
}

function LedgerDrawer({ customer, onClose, onChange }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [reminding, setReminding] = useState(false);
  const [currentCustomer, setCurrentCustomer] = useState(customer);
  const [showStatement, setShowStatement] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get(`/ledger/${customer._id}`);
      setEntries(data.entries);
      setCurrentCustomer(data.customer);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer._id]);

  const recordPayment = async (e) => {
    e.preventDefault();
    const amount = Number(payAmount);
    if (!amount || amount <= 0) return;
    setPaying(true);
    try {
      await api.post(`/ledger/${customer._id}/payment`, { amount, note: payNote });
      toast.success(`Recorded payment of ${formatINR(amount)}`);
      setPayAmount("");
      setPayNote("");
      await load();
      onChange();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPaying(false);
    }
  };

  const sendReminder = async () => {
    setReminding(true);
    try {
      await api.post(`/ledger/${customer._id}/remind`);
      toast.success("Reminder sent on WhatsApp");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setReminding(false);
    }
  };

  return (
    <>
    <Modal
      open
      onClose={onClose}
      title="Customer ledger"
      size="lg"
    >
      {/* Customer summary */}
      <div className="flex items-start gap-4 pb-4 border-b border-ink-100">
        <div className="w-14 h-14 rounded-full bg-gradient-brand text-white flex items-center justify-center font-bold text-lg shrink-0">
          {initials(currentCustomer.name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-extrabold text-lg text-ink-900">{currentCustomer.name}</div>
          {currentCustomer.shopName && <div className="text-sm text-ink-600">{currentCustomer.shopName}</div>}
          <a href={`tel:${currentCustomer.phone}`} className="text-xs text-brand-500 dark:text-brand-300 inline-flex items-center gap-1 mt-1">
            <Phone className="w-3 h-3" /> {currentCustomer.phone}
          </a>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-ink-500">Pending</div>
          <div className={`font-display font-extrabold text-xl ${currentCustomer.pendingBalance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
            {formatINR(currentCustomer.pendingBalance)}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 my-4">
        <Mini label="Total purchased" value={formatINR(currentCustomer.totalPurchased)} />
        <Mini label="Total paid" value={formatINR(currentCustomer.totalPaid)} />
        <Mini label="Last purchase" value={currentCustomer.lastPurchaseAt ? relativeTime(currentCustomer.lastPurchaseAt) : "—"} />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <form onSubmit={recordPayment} className="card !p-3 flex items-center gap-2">
          <IndianRupee className="w-4 h-4 text-ink-400 ml-1 shrink-0" />
          <input
            className="flex-1 outline-none bg-transparent text-sm"
            type="number"
            placeholder="Record payment"
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
            min="1"
          />
          <button type="submit" className="btn-primary !py-1.5 !px-3 text-xs" disabled={paying || !payAmount}>
            {paying ? "…" : "Record"}
          </button>
        </form>
        <button
          onClick={sendReminder}
          disabled={currentCustomer.pendingBalance <= 0 || reminding}
          className="btn-outline justify-center"
        >
          <Send className="w-4 h-4" />
          {reminding ? "Sending…" : "Send reminder (WhatsApp)"}
        </button>
      </div>

      <button onClick={() => setShowStatement(true)} className="btn-ghost w-full mb-4">
        <FileText className="w-4 h-4" /> View ledger statement
      </button>

      {/* Transaction history */}
      <div>
        <h4 className="font-semibold text-sm text-ink-700 mb-2">Transactions</h4>
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-ink-50 rounded-lg animate-pulse" />)}
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-ink-500 text-center py-6">No transactions yet.</p>
        ) : (
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {entries.map((e) => (
              <motion.div
                key={e._id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-ink-50"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink-800 truncate">{e.note}</div>
                  <div className="text-[11px] text-ink-400">{formatDate(e.createdAt, { year: true })}</div>
                </div>
                <div className={`text-sm font-bold ${e.amount > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                  {e.amount > 0 ? "+" : ""}{formatINR(e.amount)}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </Modal>
    {showStatement && <StatementModal customer={currentCustomer} onClose={() => setShowStatement(false)} />}
    </>
  );
}

function StatementModal({ customer, onClose }) {
  const [preset, setPreset] = useState("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [stmt, setStmt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const computeRange = () => {
    const now = new Date();
    const sToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    switch (preset) {
      case "today":
        return { from: fmt(sToday), to: fmt(sToday) };
      case "week": {
        const dow = (now.getDay() + 6) % 7;
        const s = new Date(sToday);
        s.setDate(s.getDate() - dow);
        return { from: fmt(s), to: fmt(now) };
      }
      case "month":
        return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmt(now) };
      case "lastMonth": {
        const f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const l = new Date(now.getFullYear(), now.getMonth(), 0);
        return { from: fmt(f), to: fmt(l) };
      }
      case "custom":
        return { from, to };
      default:
        return { from: "", to: "" };
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const { from: f, to: t } = computeRange();
      const params = {};
      if (f) params.from = f;
      if (t) params.to = t;
      const { data } = await api.get(`/ledger/${customer._id}/statement`, { params });
      setStmt(data.statement);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, from, to]);

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const { from: f, to: t } = computeRange();
      const params = {};
      if (f) params.from = f;
      if (t) params.to = t;
      const res = await api.get(`/ledger/${customer._id}/statement/pdf`, { params, responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `Statement-${(customer.name || "customer").replace(/\s+/g, "-")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.message || "Could not download the statement");
    } finally {
      setDownloading(false);
    }
  };

  const PRESETS = [
    ["today", "Today"],
    ["week", "This week"],
    ["month", "This month"],
    ["lastMonth", "Last month"],
    ["all", "All time"],
    ["custom", "Custom"],
  ];

  return (
    <Modal
      open
      onClose={onClose}
      title="Ledger statement"
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-outline">Close</button>
          <button onClick={downloadPdf} disabled={downloading || !stmt} className="btn-primary">
            <Download className="w-4 h-4" /> {downloading ? "Preparing…" : "Download PDF"}
          </button>
        </div>
      }
    >
      <div className="flex items-center gap-3 pb-3 mb-3 border-b border-ink-200/50">
        <div className="w-10 h-10 rounded-full bg-gradient-brand text-white flex items-center justify-center font-semibold text-sm shrink-0">
          {initials(customer.name)}
        </div>
        <div className="min-w-0">
          <div className="font-display font-bold text-ink-900 truncate">{customer.name}</div>
          {customer.phone && <div className="text-xs text-ink-500">{customer.phone}</div>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {PRESETS.map(([k, l]) => (
          <button
            key={k}
            onClick={() => setPreset(k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${preset === k ? "bg-brand-500 text-white" : "bg-ink-50 text-ink-600 hover:bg-ink-100"}`}
          >
            {l}
          </button>
        ))}
      </div>
      {preset === "custom" && (
        <div className="flex gap-2 mb-4">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input !py-2 text-sm" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input !py-2 text-sm" />
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-ink-50 rounded-lg animate-pulse" />)}</div>
      ) : !stmt ? null : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-ink-50 rounded-xl p-3">
              <div className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">Opening balance</div>
              <div className="font-bold text-ink-800">{formatINR(stmt.openingBalance)}</div>
            </div>
            <div className="bg-ink-50 rounded-xl p-3">
              <div className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">Closing balance</div>
              <div className={`font-bold ${stmt.closingBalance > 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatINR(stmt.closingBalance)}</div>
            </div>
          </div>
          {stmt.entries.length === 0 ? (
            <p className="text-sm text-ink-500 text-center py-6">No transactions in this period.</p>
          ) : (
            <div className="border border-ink-200/60 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-ink-50 text-left text-xs uppercase tracking-wider text-ink-500">
                    <th className="py-2 px-3 font-semibold">Date</th>
                    <th className="py-2 px-3 font-semibold">Particulars</th>
                    <th className="py-2 px-3 font-semibold text-right">Amount</th>
                    <th className="py-2 px-3 font-semibold text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {stmt.entries.map((e) => (
                    <tr key={e._id} className="border-t border-ink-200/40">
                      <td className="py-2 px-3 text-ink-500 whitespace-nowrap">{formatDate(e.date)}</td>
                      <td className="py-2 px-3 text-ink-800">{e.note}</td>
                      <td className={`py-2 px-3 text-right font-medium ${e.amount > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                        {e.amount > 0 ? "+" : ""}{formatINR(e.amount)}
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-ink-800">{formatINR(e.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-ink-400 mt-3">Statements can be shared on WhatsApp in a future update.</p>
        </>
      )}
    </Modal>
  );
}

function Mini({ label, value }) {
  return (
    <div className="bg-ink-50 rounded-xl p-3">
      <div className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">{label}</div>
      <div className="font-bold text-ink-800 text-sm mt-1">{value}</div>
    </div>
  );
}
