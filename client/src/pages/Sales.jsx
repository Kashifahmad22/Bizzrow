import { useEffect, useMemo, useState, useCallback } from "react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { useDebounce } from "../hooks/useDebounce.js";
import {
  Plus,
  Search,
  ShoppingBag,
  User,
  UserPlus,
  Footprints,
  Package,
  Trash2,
  Receipt,
  CheckCircle2,
  Download,
  Send,
  RotateCcw,
  RefreshCw,
} from "lucide-react";
import { api } from "../api/client.js";
import { formatINR, formatDate, relativeTime } from "../lib/format.js";
import PageHeader from "../components/PageHeader.jsx";
import Modal from "../components/Modal.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Select from "../components/Select.jsx";

// --- shared invoice actions (used by both the list rows and the invoice view) ---
async function downloadInvoicePdf(saleId, invoiceNumber) {
  try {
    const res = await api.get(`/sales/${saleId}/invoice/pdf`, { responseType: "blob" });
    const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `Invoice-${invoiceNumber || saleId}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    toast.error(err.message || "Could not download the PDF");
  }
}

async function resendInvoiceWhatsApp(saleId) {
  try {
    const { data } = await api.post(`/sales/${saleId}/invoice/whatsapp`);
    if (data.ok) toast.success("Invoice sent on WhatsApp");
    else toast.error(data.whatsapp?.error || "WhatsApp send failed — check the WhatsApp log");
  } catch (err) {
    toast.error(err.message);
  }
}

async function sendReminderForCustomer(customerId) {
  try {
    await api.post(`/ledger/${customerId}/remind`);
    toast.success("Reminder sent on WhatsApp");
  } catch (err) {
    toast.error(err.message);
  }
}

const DATE_PRESETS = [
  { key: "all", label: "All time" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "custom", label: "Custom" },
];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Timezone-safe day boundaries (Sprint 1.1 — Issue #1): compute the user's LOCAL
// day start/end and send absolute ISO instants so the server filters consistently
// regardless of its own timezone.
function dayStartISO(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).toISOString();
}
function dayEndISO(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString();
}

// Map a preset (or custom range) to { from, to } as ISO instants.
function rangeFor(preset, customFrom, customTo) {
  const now = new Date();
  switch (preset) {
    case "today":
      return { from: dayStartISO(now), to: dayEndISO(now) };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { from: dayStartISO(y), to: dayEndISO(y) };
    }
    case "week": {
      const dow = (now.getDay() + 6) % 7; // Monday = 0
      const start = new Date(now);
      start.setDate(start.getDate() - dow);
      return { from: dayStartISO(start), to: dayEndISO(now) };
    }
    case "month":
      return { from: dayStartISO(new Date(now.getFullYear(), now.getMonth(), 1)), to: dayEndISO(now) };
    case "lastMonth": {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: dayStartISO(first), to: dayEndISO(last) };
    }
    case "custom":
      return {
        from: customFrom ? dayStartISO(new Date(`${customFrom}T00:00:00`)) : "",
        to: customTo ? dayEndISO(new Date(`${customTo}T00:00:00`)) : "",
      };
    default:
      return { from: "", to: "" };
  }
}

export default function Sales() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [invoice, setInvoice] = useState(null);
  const [filters, setFilters] = useState({ preset: "all", status: "", sort: "latest", q: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const debouncedQ = useDebounce(filters.q, 300);

  const buildParams = useCallback(() => {
    const params = { limit: 25 };
    if (filters.status) params.status = filters.status;
    if (filters.sort && filters.sort !== "latest") params.sort = filters.sort;
    if (debouncedQ.trim()) params.q = debouncedQ.trim();
    const { from, to } = rangeFor(filters.preset, filters.from, filters.to);
    if (from) params.from = from;
    if (to) params.to = to;
    return params;
  }, [filters.status, filters.sort, filters.preset, filters.from, filters.to, debouncedQ]);

  const load = useCallback(async (p = 1, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const { data } = await api.get("/sales", { params: { ...buildParams(), page: p } });
      setSales((prev) => (append ? [...prev, ...data.sales] : data.sales));
      setPage(data.page || 1);
      setHasMore((data.page || 1) < (data.pages || 1));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [buildParams]);

  useEffect(() => {
    load(1, false);
  }, [load]);

  const openInvoice = async (sale) => {
    try {
      const { data } = await api.get(`/sales/${sale._id}/invoice`);
      setInvoice(data.invoice);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const hasFilters = filters.status || filters.q || filters.preset !== "all" || filters.sort !== "latest";

  return (
    <div>
      <PageHeader
        title="Sales"
        subtitle={`${sales.length} sale${sales.length === 1 ? "" : "s"}${hasFilters ? " (filtered)" : ""}`}
        action={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4" /> New sale
          </button>
        }
      />

      <SalesFilterBar filters={filters} setFilters={setFilters} />

      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card h-20 animate-pulse" />
          ))}
        </div>
      ) : sales.length === 0 ? (
        hasFilters ? (
          <EmptyState icon={ShoppingBag} title="No matching sales" body="Try a different date range, payment status, or search term." />
        ) : (
          <EmptyState
            icon={ShoppingBag}
            title="No sales yet"
            body="Record your first sale to start tracking revenue and stock."
            action={
              <button className="btn-primary" onClick={() => setCreating(true)}>
                <Plus className="w-4 h-4" /> New sale
              </button>
            }
          />
        )
      ) : (
        <>
          <div className="card !p-0 divide-y divide-ink-200/40 overflow-hidden">
            {sales.map((s) => (
              <SaleRow key={s._id} sale={s} onView={() => openInvoice(s)} />
            ))}
          </div>
          {hasMore && (
            <div className="text-center mt-4">
              <button onClick={() => load(page + 1, true)} disabled={loadingMore} className="btn-outline">
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}

      {creating && (
        <NewSaleModal
          onClose={() => setCreating(false)}
          onCreated={(sale) => {
            setCreating(false);
            load();
            openInvoice(sale);
          }}
        />
      )}
      {invoice && <InvoiceModal invoice={invoice} onClose={() => setInvoice(null)} onChanged={load} />}
    </div>
  );
}

function SalesFilterBar({ filters, setFilters }) {
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const active = filters.q || filters.status || filters.preset !== "all" || filters.sort !== "latest";
  return (
    <div className="card mb-4 space-y-3">
      <div className="flex items-center gap-3">
        <Search className="w-4 h-4 text-ink-400 shrink-0" />
        <input
          className="flex-1 outline-none bg-transparent text-sm placeholder:text-ink-300"
          placeholder="Search by customer name…"
          value={filters.q}
          onChange={(e) => set({ q: e.target.value })}
        />
        {active && (
          <button
            onClick={() => setFilters({ preset: "all", status: "", sort: "latest", q: "", from: "", to: "" })}
            className="text-xs font-semibold text-ink-400 hover:text-rose-500"
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Select label="Date" value={filters.preset} onChange={(v) => set({ preset: v })} options={DATE_PRESETS.map((d) => ({ value: d.key, label: d.label }))} />
        <Select
          label="Payment"
          value={filters.status}
          onChange={(v) => set({ status: v })}
          options={[
            { value: "", label: "All" },
            { value: "paid", label: "Paid" },
            { value: "partial", label: "Partial" },
            { value: "unpaid", label: "Due" },
          ]}
        />
        <Select
          label="Sort"
          value={filters.sort}
          onChange={(v) => set({ sort: v })}
          options={[
            { value: "latest", label: "Latest first" },
            { value: "oldest", label: "Oldest first" },
            { value: "highest", label: "Highest amount" },
            { value: "lowest", label: "Lowest amount" },
          ]}
        />
        {filters.preset === "custom" && (
          <>
            <input type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} className="input !py-2 !w-auto text-sm" />
            <input type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} className="input !py-2 !w-auto text-sm" />
          </>
        )}
      </div>
    </div>
  );
}

// FilterSelect was replaced by the themed <Select> design-system component (Sprint 1.1 — Issue #4).

function SaleRow({ sale, onView }) {
  const statusStyles = { paid: "pill-good", partial: "pill-warn", unpaid: "pill-bad" };
  const itemsLabel = sale.items.length === 1 ? `${sale.items[0].name}` : `${sale.items.length} items`;
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-ink-50 transition">
      <button onClick={onView} className="flex items-center gap-3 flex-1 min-w-0 text-left">
        <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-500 flex items-center justify-center shrink-0">
          {sale.customerType === "walkin" ? <Footprints className="w-5 h-5" /> : <Receipt className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-ink-800 truncate">{sale.customerName}</div>
          <div className="text-xs text-ink-500 truncate">
            {itemsLabel} · {sale.invoiceNumber} · {relativeTime(sale.createdAt)}
          </div>
        </div>
      </button>
      <div className="text-right shrink-0 mr-1">
        <div className="font-bold text-ink-800">{formatINR(sale.total)}</div>
        <span className={statusStyles[sale.paymentStatus]}>{sale.paymentStatus}</span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => downloadInvoicePdf(sale._id, sale.invoiceNumber)}
          title="Download PDF"
          className="w-8 h-8 rounded-lg hover:bg-ink-100 text-ink-500 hover:text-brand-500 flex items-center justify-center"
        >
          <Download className="w-4 h-4" />
        </button>
        {sale.customerType !== "walkin" && (
          <button
            onClick={() => resendInvoiceWhatsApp(sale._id)}
            title="Resend on WhatsApp"
            className="w-8 h-8 rounded-lg hover:bg-ink-100 text-ink-500 hover:text-emerald-500 flex items-center justify-center"
          >
            <Send className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

const CUSTOMER_TYPES = [
  { key: "existing", label: "Existing", icon: User },
  { key: "new", label: "New", icon: UserPlus },
  { key: "walkin", label: "Walk-in", icon: Footprints },
];

function NewSaleModal({ onClose, onCreated }) {
  const [step, setStep] = useState(1); // 1: customer, 2: items, 3: payment
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  const [customerType, setCustomerType] = useState("existing");
  const [customer, setCustomer] = useState(null); // existing
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "", shopName: "" });
  const [walkInName, setWalkInName] = useState("");

  const [items, setItems] = useState([]);
  const [pay, setPay] = useState({ cash: "", upi: "", bank: "" });
  const [submitting, setSubmitting] = useState(false);
  const [q, setQ] = useState("");
  const [pq, setPq] = useState("");

  const debouncedQ = useDebounce(q, 250);
  const debouncedPq = useDebounce(pq, 250);

  // Customer search (Feature 4) — debounced, server-backed.
  useEffect(() => {
    (async () => {
      try {
        const params = debouncedQ.trim() ? { q: debouncedQ.trim() } : {};
        const { data } = await api.get("/customers", { params });
        setCustomers(data.customers);
      } catch (err) {
        toast.error(err.message);
      } finally {
        setLoadingData(false);
      }
    })();
  }, [debouncedQ]);

  // Product search (Feature 3) — debounced, server-backed; only in-stock items are sellable.
  useEffect(() => {
    (async () => {
      try {
        const params = { limit: 50 };
        if (debouncedPq.trim()) params.q = debouncedPq.trim();
        const { data } = await api.get("/products", { params });
        setProducts(data.products.filter((x) => x.stock > 0));
      } catch (err) {
        toast.error(err.message);
      }
    })();
  }, [debouncedPq]);

  const [billDisc, setBillDisc] = useState({ type: "amount", value: "" });

  // Client-side mirror of the server discount engine (utils/saleMath).
  const calc = useMemo(() => {
    let gross = 0;
    let itemDisc = 0;
    for (const it of items) {
      const g = it.unitPrice * it.quantity;
      const dv = Number(it.discountValue) || 0;
      const d = it.discountType === "percent" ? (g * Math.min(100, dv)) / 100 : Math.min(dv, g);
      gross += g;
      itemDisc += d;
    }
    const subtotal = Math.max(0, gross - itemDisc);
    const bv = Number(billDisc.value) || 0;
    const billAmt = billDisc.type === "percent" ? (subtotal * Math.min(100, bv)) / 100 : Math.min(bv, subtotal);
    const total = Math.max(0, subtotal - billAmt);
    return { subtotal: round2(subtotal), billAmt: round2(billAmt), totalDiscount: round2(itemDisc + billAmt), total: round2(total) };
  }, [items, billDisc]);
  const total = calc.total;
  const paidSum = (Number(pay.cash) || 0) + (Number(pay.upi) || 0) + (Number(pay.bank) || 0);
  const paid = Math.min(paidSum, total);
  const due = Math.max(0, total - paidSum);
  const change = Math.max(0, paidSum - total);

  const lineNet = (it) => {
    const g = it.unitPrice * it.quantity;
    const dv = Number(it.discountValue) || 0;
    const d = it.discountType === "percent" ? (g * Math.min(100, dv)) / 100 : Math.min(dv, g);
    return round2(g - d);
  };
  const updateItem = (productId, patch) =>
    setItems((prev) => prev.map((it) => (it.productId === productId ? { ...it, ...patch } : it)));

  const displayName =
    customerType === "existing" ? customer?.name : customerType === "new" ? newCustomer.name : walkInName || "Walk-in Customer";
  const displaySub =
    customerType === "existing" ? customer?.shopName || customer?.phone : customerType === "new" ? newCustomer.phone : "No ledger entry";

  const step1Valid =
    customerType === "existing" ? !!customer : customerType === "new" ? newCustomer.name && newCustomer.phone : true;

  const addItem = (p) => {
    setItems((prev) => {
      const existing = prev.find((x) => x.productId === p._id);
      if (existing) {
        if (existing.quantity >= existing.max) {
          toast.error(`Only ${existing.max} in stock`);
          return prev;
        }
        return prev.map((x) => (x.productId === p._id ? { ...x, quantity: x.quantity + 1 } : x));
      }
      return [...prev, { productId: p._id, name: p.name, color: p.color, size: p.size, unitPrice: p.sellingPrice, quantity: 1, max: p.stock, discountType: "amount", discountValue: 0 }];
    });
  };
  const updateQty = (productId, qty) =>
    setItems((prev) => prev.map((it) => (it.productId === productId ? { ...it, quantity: Math.max(1, Math.min(it.max, qty)) } : it)));
  const removeItem = (productId) => setItems((prev) => prev.filter((it) => it.productId !== productId));

  const markFullCash = () => setPay({ cash: String(total - (Number(pay.upi) || 0) - (Number(pay.bank) || 0)), upi: pay.upi, bank: pay.bank });

  const submit = async () => {
    if (!step1Valid || items.length === 0) return;
    if (customerType === "walkin" && due > 0) {
      toast.error("Walk-in sales must be fully paid.");
      return;
    }
    setSubmitting(true);
    const payments = [
      { method: "cash", amount: Number(pay.cash) || 0 },
      { method: "upi", amount: Number(pay.upi) || 0 },
      { method: "bank", amount: Number(pay.bank) || 0 },
    ].filter((p) => p.amount > 0);

    const payload = {
      customerType,
      items: items.map((it) => ({
        productId: it.productId,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        discountType: it.discountType,
        discountValue: Number(it.discountValue) || 0,
      })),
      billDiscount: { type: billDisc.type, value: Number(billDisc.value) || 0 },
      payments,
    };
    if (customerType === "existing") payload.customerId = customer._id;
    if (customerType === "new") payload.newCustomer = newCustomer;
    if (customerType === "walkin") payload.walkInName = walkInName;

    try {
      const { data } = await api.post("/sales", payload);
      toast.success("Sale recorded");
      onCreated(data.sale);
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
      title="New sale"
      size="xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">
            <span className="text-ink-500">Total: </span>
            <span className="font-bold text-ink-900">{formatINR(total)}</span>
            {step === 3 && due > 0 && <span className="text-rose-500 ml-2">· Due {formatINR(due)}</span>}
          </div>
          <div className="flex gap-2">
            {step > 1 && (
              <button onClick={() => setStep(step - 1)} className="btn-outline">Back</button>
            )}
            {step < 3 && (
              <button
                onClick={() => setStep(step + 1)}
                disabled={(step === 1 && !step1Valid) || (step === 2 && items.length === 0)}
                className="btn-primary"
              >
                Continue
              </button>
            )}
            {step === 3 && (
              <button onClick={submit} disabled={submitting} className="btn-primary">
                {submitting ? "Recording…" : "Record sale"}
              </button>
            )}
          </div>
        </div>
      }
    >
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-5">
        {["Customer", "Items", "Payment"].map((label, i) => {
          const idx = i + 1;
          const done = step > idx;
          const active = step === idx;
          return (
            <div key={label} className="flex items-center gap-2 flex-1">
              <div className={`flex items-center gap-2 ${active || done ? "text-brand-500 dark:text-brand-300" : "text-ink-400"}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${done ? "bg-brand-500 text-white" : active ? "bg-brand-500/15 text-brand-500 dark:text-brand-300" : "bg-ink-100"}`}>
                  {done ? <CheckCircle2 className="w-4 h-4" /> : idx}
                </div>
                <span className="text-xs font-semibold hidden sm:inline">{label}</span>
              </div>
              {i < 2 && <div className={`flex-1 h-0.5 ${done ? "bg-brand-500" : "bg-ink-100"}`} />}
            </div>
          );
        })}
      </div>

      {loadingData ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-ink-50 rounded-lg animate-pulse" />)}
        </div>
      ) : (
        <>
          {step === 1 && (
            <div>
              {/* Customer type segmented control */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                {CUSTOMER_TYPES.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setCustomerType(t.key)}
                    className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition ${
                      customerType === t.key ? "border-brand-400 bg-brand-500/10 text-brand-500 dark:text-brand-300" : "border-ink-200/60 text-ink-500 hover:bg-ink-50"
                    }`}
                  >
                    <t.icon className="w-5 h-5" />
                    <span className="text-xs font-semibold">{t.label}</span>
                  </button>
                ))}
              </div>

              {customerType === "existing" && (
                <>
                  <div className="card !p-3 mb-3 flex items-center gap-3">
                    <Search className="w-4 h-4 text-ink-400" />
                    <input className="flex-1 outline-none bg-transparent text-sm" placeholder="Search customers…" value={q} onChange={(e) => setQ(e.target.value)} />
                  </div>
                  {customers.length === 0 ? (
                    <p className="text-sm text-ink-500 text-center py-8">No customers found. Switch to "New" to create one here.</p>
                  ) : (
                    <div className="space-y-1 max-h-72 overflow-y-auto">
                      {customers.map((c) => (
                        <button
                          key={c._id}
                          onClick={() => setCustomer(c)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition ${
                            customer?._id === c._id ? "bg-brand-500/10 border-2 border-brand-400" : "hover:bg-ink-50 border-2 border-transparent"
                          }`}
                        >
                          <div className="w-9 h-9 rounded-full bg-gradient-brand text-white flex items-center justify-center font-semibold text-sm shrink-0">
                            <User className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm text-ink-800 truncate">{c.name}</div>
                            <div className="text-xs text-ink-500 truncate">{c.shopName || c.phone}</div>
                          </div>
                          {c.pendingBalance > 0 && <span className="pill-warn text-[10px]">{formatINR(c.pendingBalance)} due</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {customerType === "new" && (
                <div className="space-y-3">
                  <p className="text-sm text-ink-500">This customer will be saved to your ledger automatically.</p>
                  <div>
                    <label className="label">Name *</label>
                    <input className="input" placeholder="Customer name" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label">Phone *</label>
                      <input className="input" placeholder="+91 98765 43210" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">Shop name</label>
                      <input className="input" placeholder="optional" value={newCustomer.shopName} onChange={(e) => setNewCustomer({ ...newCustomer, shopName: e.target.value })} />
                    </div>
                  </div>
                </div>
              )}

              {customerType === "walkin" && (
                <div className="space-y-3">
                  <div className="rounded-xl bg-ink-50 border border-ink-200/50 p-4 flex items-start gap-3">
                    <Footprints className="w-5 h-5 text-ink-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-ink-500">
                      Walk-in sales aren't added to the ledger and must be fully paid. Optionally add a name for the invoice.
                    </p>
                  </div>
                  <div>
                    <label className="label">Name on invoice (optional)</label>
                    <input className="input" placeholder="Walk-in Customer" value={walkInName} onChange={(e) => setWalkInName(e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <div className="card !p-3 mb-3 flex items-center gap-3">
                  <Search className="w-4 h-4 text-ink-400" />
                  <input className="flex-1 outline-none bg-transparent text-sm" placeholder="Search products in stock…" value={pq} onChange={(e) => setPq(e.target.value)} />
                </div>
                <div className="space-y-1 max-h-80 overflow-y-auto">
                  {products.length === 0 && <p className="text-sm text-ink-500 text-center py-6">No in-stock products match.</p>}
                  {products.map((p) => (
                    <button key={p._id} onClick={() => addItem(p)} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-ink-50 text-left">
                      <div className="w-9 h-9 rounded-lg bg-brand-500/10 text-brand-500 flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden">
                        {p.image ? <img src={p.image} alt="" className="w-full h-full object-cover" /> : p.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-ink-800 truncate">{p.name}</div>
                        <div className="text-xs text-ink-500">{[p.color, p.size].filter(Boolean).join(" · ")} · {p.stock} left</div>
                      </div>
                      <div className="text-sm font-bold text-ink-700">{formatINR(p.sellingPrice)}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-2">Cart ({items.length})</h4>
                {items.length === 0 ? (
                  <div className="card text-center py-10 text-sm text-ink-400">
                    <Package className="w-8 h-8 mx-auto mb-2 text-ink-300" />
                    Tap a product to add it
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {items.map((it) => {
                      const gross = it.unitPrice * it.quantity;
                      const net = lineNet(it);
                      return (
                        <div key={it.productId} className="card !p-3">
                          <div className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-sm text-ink-800 truncate">{it.name}</div>
                              <div className="text-xs text-ink-500">{formatINR(it.unitPrice)} each</div>
                            </div>
                            <div className="flex items-center gap-1 bg-ink-50 rounded-lg px-1">
                              <button onClick={() => updateQty(it.productId, it.quantity - 1)} className="w-7 h-7 text-ink-600 hover:text-brand-500">−</button>
                              <input type="number" value={it.quantity} onChange={(e) => updateQty(it.productId, Number(e.target.value) || 1)} className="w-10 bg-transparent text-center font-bold text-sm outline-none text-ink-800" />
                              <button onClick={() => updateQty(it.productId, it.quantity + 1)} className="w-7 h-7 text-ink-600 hover:text-brand-500">+</button>
                            </div>
                            <div className="text-right w-16 shrink-0">
                              <div className="text-sm font-bold text-ink-800">{formatINR(net)}</div>
                              {net < gross && <div className="text-[10px] text-ink-400 line-through">{formatINR(gross)}</div>}
                            </div>
                            <button onClick={() => removeItem(it.productId)} className="text-rose-500 hover:bg-rose-500/10 p-1.5 rounded-lg">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-[11px] text-ink-400 w-14">Discount</span>
                            <input
                              type="number"
                              min="0"
                              value={it.discountValue || ""}
                              onChange={(e) => updateItem(it.productId, { discountValue: Number(e.target.value) || 0 })}
                              className="input !py-1 !px-2 text-xs flex-1"
                              placeholder="0"
                            />
                            <div className="flex bg-ink-50 rounded-lg overflow-hidden border border-ink-200/60">
                              {["amount", "percent"].map((t) => (
                                <button
                                  key={t}
                                  onClick={() => updateItem(it.productId, { discountType: t })}
                                  className={`px-2.5 py-1 text-xs font-semibold ${it.discountType === t ? "bg-brand-500 text-white" : "text-ink-500"}`}
                                >
                                  {t === "amount" ? "₹" : "%"}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 max-w-md mx-auto">
              <div className="card border-brand-500/20">
                <div className="text-xs text-ink-500 mb-1">Selling to</div>
                <div className="font-display font-bold text-lg text-ink-900">{displayName || "Walk-in Customer"}</div>
                <div className="text-sm text-ink-600">{displaySub}</div>
              </div>

              <div className="card">
                <div className="space-y-1.5 mb-3">
                  {items.map((it) => (
                    <div key={it.productId} className="flex items-center justify-between text-sm">
                      <span className="text-ink-700">{it.name} × {it.quantity}</span>
                      <span className="font-medium text-ink-800">{formatINR(lineNet(it))}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-ink-200/50 pt-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink-500">Subtotal</span>
                    <span className="font-medium text-ink-800">{formatINR(calc.subtotal)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-ink-500 flex-1">Bill discount</span>
                    <input type="number" min="0" value={billDisc.value} onChange={(e) => setBillDisc({ ...billDisc, value: e.target.value })} className="input !py-1 !px-2 text-xs w-24" placeholder="0" />
                    <div className="flex bg-ink-50 rounded-lg overflow-hidden border border-ink-200/60">
                      {["amount", "percent"].map((t) => (
                        <button key={t} onClick={() => setBillDisc({ ...billDisc, type: t })} className={`px-2.5 py-1 text-xs font-semibold ${billDisc.type === t ? "bg-brand-500 text-white" : "text-ink-500"}`}>{t === "amount" ? "₹" : "%"}</button>
                      ))}
                    </div>
                  </div>
                  {calc.totalDiscount > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-ink-500">Total discount</span>
                      <span className="font-medium text-emerald-500">−{formatINR(calc.totalDiscount)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <span className="font-display font-bold text-ink-900">Total</span>
                    <span className="font-display font-extrabold text-xl text-ink-900">{formatINR(total)}</span>
                  </div>
                </div>
              </div>

              {/* Split payment */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="label !mb-0">Split payment</label>
                  <button onClick={markFullCash} className="text-xs font-semibold text-brand-400 hover:text-brand-300">Fill remaining in cash</button>
                </div>
                <div className="space-y-2">
                  {[
                    { key: "cash", label: "Cash", color: "#10b981" },
                    { key: "upi", label: "UPI", color: "#3849f5" },
                    { key: "bank", label: "Bank", color: "#8b5cf6" },
                  ].map((m) => (
                    <div key={m.key} className="flex items-center gap-3">
                      <span className="flex items-center gap-2 w-20 text-sm text-ink-600">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: m.color }} />
                        {m.label}
                      </span>
                      <div className="flex-1 relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 text-sm">₹</span>
                        <input
                          type="number"
                          min="0"
                          value={pay[m.key]}
                          onChange={(e) => setPay({ ...pay, [m.key]: e.target.value })}
                          className="input !pl-7 !py-2"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="card !py-3 space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-500">Paid</span>
                  <span className="font-semibold text-emerald-500">{formatINR(paid)}</span>
                </div>
                {change > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink-500">Change to return</span>
                    <span className="font-semibold text-ink-700">{formatINR(change)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ink-700">Due</span>
                  <span className={`font-display font-extrabold text-lg ${due > 0 ? "text-rose-500" : "text-emerald-500"}`}>{formatINR(due)}</span>
                </div>
                {due > 0 && customerType !== "walkin" && (
                  <div className="text-xs text-ink-400 pt-1">{formatINR(due)} will be added to {displayName}'s pending balance.</div>
                )}
                {due > 0 && customerType === "walkin" && (
                  <div className="text-xs text-rose-500 pt-1">Walk-in sales must be fully paid before recording.</div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

function InvoiceModal({ invoice, onClose, onChanged }) {
  const methodLabel = { cash: "Cash", upi: "UPI", bank: "Bank", card: "Card", credit: "Credit", split: "Split" };
  const [returnOpen, setReturnOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const returnable = (invoice.items || []).some((it) => (it.quantity || 0) - (it.returnedQty || 0) > 0);
  useEffect(() => {
    api.get(`/sales/${invoice.saleId}/returns`).then(({ data }) => setHistory(data.records || [])).catch(() => {});
  }, [invoice.saleId]);
  return (
    <>
    <Modal
      open
      onClose={onClose}
      title="Invoice"
      size="lg"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            {returnable && (
              <button onClick={() => setReturnOpen(true)} className="btn-outline text-xs">
                <RotateCcw className="w-3.5 h-3.5" /> Return
              </button>
            )}
            {returnable && invoice.customerType !== "walkin" && (
              <button onClick={() => setReplaceOpen(true)} className="btn-outline text-xs">
                <RefreshCw className="w-3.5 h-3.5" /> Replace
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {invoice.dueAmount > 0 && invoice.customerId && (
              <button onClick={() => sendReminderForCustomer(invoice.customerId)} className="btn-outline text-xs">
                Send reminder
              </button>
            )}
            {invoice.customerType !== "walkin" && (
              <button onClick={() => resendInvoiceWhatsApp(invoice.saleId)} className="btn-outline text-xs">
                <Send className="w-3.5 h-3.5" /> Resend WhatsApp
              </button>
            )}
            <button onClick={() => downloadInvoicePdf(invoice.saleId, invoice.invoiceNumber)} className="btn-primary text-xs">
              <Download className="w-3.5 h-3.5" /> Download PDF
            </button>
          </div>
        </div>
      }
    >
      <div>
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-ink-200">
          <div className="flex items-center gap-3">
            {invoice.business?.logo && <img src={invoice.business.logo} alt="" className="w-12 h-12 rounded-xl object-cover" />}
            <div>
              <div className="font-display font-extrabold text-2xl text-ink-900">{invoice.business?.name || "Bizzrow"}</div>
              {invoice.business?.gstNumber && <div className="text-xs text-ink-500">GST: {invoice.business.gstNumber}</div>}
              {invoice.business?.phone && <div className="text-xs text-ink-500">Phone: {invoice.business.phone}</div>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-ink-500 uppercase tracking-wider font-semibold">Invoice</div>
            <div className="font-mono font-bold text-ink-900">{invoice.invoiceNumber}</div>
            <div className="text-xs text-ink-500 mt-1">{formatDate(invoice.date, { year: true })}</div>
          </div>
        </div>

        <div className="py-3">
          <div className="text-xs uppercase tracking-wider text-ink-500 font-semibold">Bill to</div>
          <div className="font-semibold text-ink-800">{invoice.customer}{invoice.customerType === "walkin" && <span className="text-ink-400 font-normal"> · walk-in</span>}</div>
          {invoice.customerPhone && <div className="text-xs text-ink-500 mt-0.5">{invoice.customerPhone}</div>}
        </div>

        <table className="w-full mt-3 text-sm">
          <thead>
            <tr className="border-b border-ink-200/60 text-left text-xs uppercase tracking-wider text-ink-500">
              <th className="py-2 font-semibold">Item</th>
              <th className="py-2 font-semibold text-right">Qty</th>
              <th className="py-2 font-semibold text-right">Rate</th>
              <th className="py-2 font-semibold text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((it, i) => (
              <tr key={i} className="border-b border-ink-200/40">
                <td className="py-2.5">
                  <div className="font-medium text-ink-800">{it.name}</div>
                  {(it.color || it.size) && <div className="text-xs text-ink-500">{[it.color, it.size].filter(Boolean).join(" · ")}</div>}
                  {it.discountAmount > 0 && (
                    <div className="text-[11px] text-emerald-500">Disc {it.discountType === "percent" ? `${it.discountValue}%` : formatINR(it.discountValue)} (−{formatINR(it.discountAmount)})</div>
                  )}
                </td>
                <td className="py-2.5 text-right text-ink-700">{it.quantity}</td>
                <td className="py-2.5 text-right text-ink-700">{formatINR(it.unitPrice)}</td>
                <td className="py-2.5 text-right font-medium text-ink-800">{formatINR(it.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 ml-auto max-w-xs space-y-1.5 text-sm">
          {invoice.totalDiscount > 0 && (
            <>
              <Row label="Subtotal" value={formatINR(invoice.subtotal)} />
              <Row label="Discount" value={`− ${formatINR(invoice.totalDiscount)}`} positive />
            </>
          )}
          <Row label="Total" value={formatINR(invoice.total)} />
          {invoice.returnedAmount > 0 && (
            <>
              <Row label="Returned" value={`− ${formatINR(invoice.returnedAmount)}`} positive />
              <Row label="Net total" value={formatINR(invoice.netTotal ?? invoice.total - invoice.returnedAmount)} bold />
            </>
          )}
          {invoice.payments?.length > 0 &&
            invoice.payments.map((p, i) => <Row key={i} label={methodLabel[p.method] || p.method} value={formatINR(p.amount)} muted />)}
          <Row label="Paid" value={formatINR(invoice.amountPaid)} positive />
          <Row label="Due" value={formatINR(invoice.dueAmount)} negative={invoice.dueAmount > 0} bold />
        </div>

        {history.length > 0 && (
          <div className="mt-5 pt-4 border-t border-ink-200/50">
            <div className="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-2">Return &amp; replacement history</div>
            <div className="space-y-1.5">
              {history.map((r) => (
                <div key={r._id} className="flex items-center justify-between text-xs">
                  <span className="text-ink-700">
                    <span className={`font-semibold ${r.type === "replacement" ? "text-grape-400" : "text-amber-500"}`}>{r.type === "replacement" ? "Replacement" : "Return"}</span>
                    {" · "}{r.items.reduce((a, i) => a + i.quantity, 0)} item(s){r.reason ? ` · ${r.reason}` : ""} · {formatDate(r.createdAt)}
                  </span>
                  <span className="text-ink-600">{r.type === "replacement" ? `Δ ${formatINR(r.priceDifference)}` : `−${formatINR(r.refundAmount)}`}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-ink-200/50 flex items-center justify-between text-xs text-ink-500">
          <span>Thank you for your business 🙏</span>
          <button onClick={() => window.print()} className="btn-outline text-xs !py-2 !px-3">Print</button>
        </div>
      </div>
    </Modal>
    {returnOpen && (
      <ReturnModal
        saleId={invoice.saleId}
        items={invoice.items}
        onClose={() => setReturnOpen(false)}
        onDone={() => { setReturnOpen(false); onClose(); onChanged && onChanged(); }}
      />
    )}
    {replaceOpen && (
      <ReplacementModal
        saleId={invoice.saleId}
        items={invoice.items}
        onClose={() => setReplaceOpen(false)}
        onDone={() => { setReplaceOpen(false); onClose(); onChanged && onChanged(); }}
      />
    )}
    </>
  );
}

function ReplacementModal({ saleId, items, onClose, onDone }) {
  const [retQtys, setRetQtys] = useState({});
  const [cart, setCart] = useState([]);
  const [pq, setPq] = useState("");
  const [products, setProducts] = useState([]);
  const [pay, setPay] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const dq = useDebounce(pq, 250);

  const returnRows = (items || [])
    .map((it) => ({ ...it, returnable: (it.quantity || 0) - (it.returnedQty || 0) }))
    .filter((it) => it.returnable > 0);

  useEffect(() => {
    (async () => {
      try {
        const params = { limit: 30 };
        if (dq.trim()) params.q = dq.trim();
        const { data } = await api.get("/products", { params });
        setProducts(data.products.filter((p) => p.stock > 0));
      } catch (err) {
        toast.error(err.message);
      }
    })();
  }, [dq]);

  const refund = returnRows.reduce((a, it) => a + (Number(retQtys[it.product]) || 0) * (it.quantity ? it.subtotal / it.quantity : 0), 0);
  const replacement = cart.reduce((a, c) => a + c.unitPrice * c.quantity, 0);
  const diff = round2(replacement - refund);

  const addCart = (p) =>
    setCart((prev) => {
      const ex = prev.find((x) => x.productId === p._id);
      if (ex) return prev.map((x) => (x.productId === p._id ? { ...x, quantity: Math.min(x.max, x.quantity + 1) } : x));
      return [...prev, { productId: p._id, name: p.name, unitPrice: p.sellingPrice, quantity: 1, max: p.stock }];
    });

  const submit = async () => {
    const returnItems = returnRows.map((it) => ({ productId: it.product, quantity: Number(retQtys[it.product]) || 0 })).filter((x) => x.quantity > 0);
    const newItems = cart.map((c) => ({ productId: c.productId, quantity: c.quantity, unitPrice: c.unitPrice }));
    if (returnItems.length === 0 || newItems.length === 0) {
      toast.error("Pick items to return and replacement items");
      return;
    }
    const payments = diff > 0 && Number(pay) > 0 ? [{ method: "cash", amount: Math.min(Number(pay), diff) }] : [];
    setSubmitting(true);
    try {
      const { data } = await api.post(`/sales/${saleId}/replace`, { returnItems, newItems, payments });
      toast.success(`Replacement done · difference ${formatINR(data.priceDifference)}`);
      onDone();
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
      title="Replace items"
      size="xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">
            <span className="text-ink-500">Difference: </span>
            <span className={`font-bold ${diff > 0 ? "text-rose-500" : "text-emerald-500"}`}>{diff > 0 ? `Customer pays ${formatINR(diff)}` : diff < 0 ? `Refund ${formatINR(-diff)}` : "Even"}</span>
          </div>
          <button onClick={submit} disabled={submitting} className="btn-primary">{submitting ? "Processing…" : "Confirm replacement"}</button>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-2">Return from this sale</h4>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {returnRows.map((it) => (
              <div key={it.product} className="flex items-center gap-2 card !p-2.5">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-ink-800 truncate">{it.name}</div>
                  <div className="text-[11px] text-ink-500">{it.returnable} returnable</div>
                </div>
                <input type="number" min="0" max={it.returnable} value={retQtys[it.product] || ""} onChange={(e) => setRetQtys({ ...retQtys, [it.product]: Math.max(0, Math.min(it.returnable, Number(e.target.value) || 0)) })} className="input !py-1.5 !w-16 text-sm text-right" placeholder="0" />
              </div>
            ))}
          </div>
          <div className="text-xs text-ink-500 mt-2">Refund value: <span className="font-semibold text-emerald-500">{formatINR(refund)}</span></div>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-2">Replacement items</h4>
          <div className="card !p-2.5 mb-2 flex items-center gap-2">
            <Search className="w-4 h-4 text-ink-400" />
            <input className="flex-1 outline-none bg-transparent text-sm" placeholder="Search products…" value={pq} onChange={(e) => setPq(e.target.value)} />
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto mb-2">
            {products.map((p) => (
              <button key={p._id} onClick={() => addCart(p)} className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-ink-50 text-left text-sm">
                <span className="text-ink-800 truncate">{p.name}</span>
                <span className="text-ink-500">{formatINR(p.sellingPrice)}</span>
              </button>
            ))}
          </div>
          {cart.map((c) => (
            <div key={c.productId} className="flex items-center gap-2 text-sm py-1">
              <span className="flex-1 truncate text-ink-800">{c.name}</span>
              <span className="text-ink-500">× {c.quantity}</span>
              <span className="font-semibold text-ink-800 w-16 text-right">{formatINR(c.unitPrice * c.quantity)}</span>
              <button onClick={() => setCart((prev) => prev.filter((x) => x.productId !== c.productId))} className="text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <div className="text-xs text-ink-500 mt-2">Replacement value: <span className="font-semibold text-ink-800">{formatINR(replacement)}</span></div>
          {diff > 0 && (
            <div className="mt-2">
              <label className="label">Customer pays now</label>
              <input type="number" min="0" max={diff} value={pay} onChange={(e) => setPay(e.target.value)} className="input !py-2" placeholder={`Up to ${formatINR(diff)}`} />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

const RETURN_REASONS = ["Defective", "Wrong item", "Customer changed mind", "Damaged", "Other"];

function ReturnModal({ saleId, items, onClose, onDone }) {
  const [qtys, setQtys] = useState({});
  const [reason, setReason] = useState("Defective");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const rows = (items || [])
    .map((it) => ({ ...it, returnable: (it.quantity || 0) - (it.returnedQty || 0) }))
    .filter((it) => it.returnable > 0);
  const totalSelected = rows.reduce((a, it) => a + (Number(qtys[it.product]) || 0), 0);

  const submit = async () => {
    const payloadItems = rows
      .map((it) => ({ productId: it.product, quantity: Number(qtys[it.product]) || 0 }))
      .filter((x) => x.quantity > 0);
    if (payloadItems.length === 0) return;
    setSubmitting(true);
    try {
      const { data } = await api.post(`/sales/${saleId}/return`, { items: payloadItems, reason, notes });
      toast.success(`Returned — ${formatINR(data.refund)} credited`);
      onDone();
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
      title="Return items"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-outline">Cancel</button>
          <button onClick={submit} disabled={submitting || totalSelected === 0} className="btn-primary">
            {submitting ? "Processing…" : "Process return"}
          </button>
        </div>
      }
    >
      <p className="text-sm text-ink-500 mb-3">Select quantities to return. Stock, ledger, and profit update automatically.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="label">Reason</label>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="input">
            {RETURN_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Notes (optional)</label>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. torn packaging" />
        </div>
      </div>
      <div className="space-y-2">
        {rows.map((it) => (
          <div key={it.product} className="flex items-center gap-3 card !p-3">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-ink-800 truncate">{it.name}</div>
              <div className="text-xs text-ink-500">{it.returnable} returnable · {formatINR(it.quantity ? it.subtotal / it.quantity : 0)} each</div>
            </div>
            <input
              type="number"
              min="0"
              max={it.returnable}
              value={qtys[it.product] || ""}
              onChange={(e) => setQtys({ ...qtys, [it.product]: Math.max(0, Math.min(it.returnable, Number(e.target.value) || 0)) })}
              className="input !py-1.5 !w-20 text-sm text-right"
              placeholder="0"
            />
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-ink-500 text-center py-4">Nothing left to return on this sale.</p>}
      </div>
    </Modal>
  );
}

function Row({ label, value, positive, negative, bold, muted }) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? "text-ink-400 text-xs pl-2" : "text-ink-500"}>{label}</span>
      <span
        className={`${bold ? "font-display font-extrabold text-lg" : muted ? "text-xs text-ink-500" : "font-medium"} ${
          positive ? "text-emerald-500" : ""
        } ${negative ? "text-rose-500" : !positive && !muted ? "text-ink-900" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
