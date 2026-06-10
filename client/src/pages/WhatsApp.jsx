import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { Send, MessageCircle, FileText, CheckCircle2, Info, AlertTriangle, Phone, Eye } from "lucide-react";
import { api } from "../api/client.js";
import { formatDate, relativeTime } from "../lib/format.js";
import PageHeader from "../components/PageHeader.jsx";
import Modal from "../components/Modal.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function WhatsAppPage() {
  const { user, refreshUser } = useAuth();
  const [logs, setLogs] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [allCustomers, setAllCustomers] = useState(true);
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [autoInvoice, setAutoInvoice] = useState(user?.preferences?.whatsappAutoInvoice ?? true);
  const [autoReminders, setAutoReminders] = useState(user?.preferences?.whatsappReminders ?? true);

  // Test sender
  const [test, setTest] = useState({ to: "", body: "Hello from Bizzrow 👋 This is a test message." });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const load = async () => {
    try {
      const [l, c] = await Promise.all([api.get("/whatsapp/logs"), api.get("/customers")]);
      setLogs(l.data.logs);
      setCustomers(c.data.customers);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const recipientCount = allCustomers ? customers.length : selected.size;
  const preview = useMemo(() => body.replace(/\{name\}/gi, "Rahul"), [body]);

  // Infer connection state from the most recent log.
  const notConfigured = useMemo(() => {
    const last = logs[0];
    return last && last.status === "failed" && /not configured/i.test(last.error || "");
  }, [logs]);

  const toggle = (id) => {
    setAllCustomers(false);
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const doSend = async () => {
    setSending(true);
    try {
      const payload = { body };
      if (!allCustomers && selected.size > 0) payload.customerIds = [...selected];
      const { data } = await api.post("/whatsapp/broadcast", payload);
      setConfirmOpen(false);
      if (data.sent > 0 && data.failed === 0) toast.success(`Sent to ${data.sent} customer${data.sent === 1 ? "" : "s"}`);
      else if (data.sent > 0) toast.success(`Sent ${data.sent}, ${data.failed} failed`);
      else toast.error(`All ${data.count} sends failed — check the log`);
      setBody("");
      setSelected(new Set());
      setAllCustomers(true);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  const sendTest = async () => {
    if (!test.to.trim() || !test.body.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const { data } = await api.post("/whatsapp/test", test);
      setTestResult(data);
      if (data.status === "sent") toast.success("Test message sent");
      else toast.error(data.error || "Send failed");
      load();
    } catch (err) {
      setTestResult({ status: "failed", error: err.message });
      toast.error(err.message);
    } finally {
      setTesting(false);
    }
  };

  const savePrefs = async (patch) => {
    try {
      const next = { whatsappAutoInvoice: autoInvoice, whatsappReminders: autoReminders, ...patch };
      await api.put("/settings", { preferences: next });
      if ("whatsappAutoInvoice" in patch) setAutoInvoice(patch.whatsappAutoInvoice);
      if ("whatsappReminders" in patch) setAutoReminders(patch.whatsappReminders);
      refreshUser();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <PageHeader title="WhatsApp" subtitle="Live Meta Cloud API — invoices, reminders, and broadcasts." />

      {/* Connection banner */}
      {notConfigured ? (
        <div className="card !bg-amber-500/10 !border-amber-500/20 mb-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <span className="font-semibold text-amber-700 dark:text-amber-300">WhatsApp credentials not set.</span>
            <span className="text-amber-700/90 dark:text-amber-200/80 ml-1">
              Add WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID to server/.env and restart the server. Then send a test below.
            </span>
          </div>
        </div>
      ) : (
        <div className="card !bg-emerald-500/10 !border-emerald-500/20 mb-6 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          <div className="text-sm text-emerald-700/90 dark:text-emerald-200/90">
            <span className="font-semibold text-emerald-700 dark:text-emerald-300">Connected to Meta WhatsApp Cloud API.</span>{" "}
            Every send is delivered live and recorded in the message log below.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Compose broadcast */}
        <div className="card lg:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <Send className="w-5 h-5 text-brand-400" />
            <h2 className="font-display font-bold text-lg text-ink-900">Compose broadcast</h2>
          </div>
          <textarea
            className="input min-h-[110px] !rounded-2xl"
            placeholder={`Hi {name}! 🛍️ New arrivals in store — kurtas from ₹399. Reply to order.`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={1000}
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-[11px] text-ink-400">Tip: use <code className="text-ink-500">{"{name}"}</code> to personalize.</span>
            <span className="text-[11px] text-ink-400">{body.length}/1000</span>
          </div>

          {/* Live preview */}
          {body.trim() && (
            <div className="mt-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-1.5 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" /> Preview
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 max-w-sm">
                <p className="text-sm text-ink-800 whitespace-pre-wrap">{preview}</p>
                <div className="text-[10px] text-ink-400 mt-1 text-right">Bizzrow · now</div>
              </div>
            </div>
          )}

          {/* Recipients */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-500">Recipients</h4>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setAllCustomers(true); setSelected(new Set()); }}
                  className={`text-xs px-3 py-1 rounded-full font-semibold ${allCustomers ? "bg-brand-500 text-white" : "bg-ink-100 text-ink-600"}`}
                >
                  All ({customers.length})
                </button>
                <button
                  onClick={() => setAllCustomers(false)}
                  className={`text-xs px-3 py-1 rounded-full font-semibold ${!allCustomers ? "bg-brand-500 text-white" : "bg-ink-100 text-ink-600"}`}
                >
                  Selected ({selected.size})
                </button>
              </div>
            </div>
            {!allCustomers && (
              <div className="max-h-44 overflow-y-auto border border-ink-200/60 rounded-xl divide-y divide-ink-200/40">
                {customers.length === 0 ? (
                  <p className="text-sm text-ink-500 text-center py-6">No customers yet. Add some in the Ledger page.</p>
                ) : (
                  customers.map((c) => {
                    const isSel = selected.has(c._id);
                    return (
                      <button key={c._id} onClick={() => toggle(c._id)} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-ink-50 text-left">
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${isSel ? "bg-brand-500 border-brand-500" : "border-ink-300"}`}>
                          {isSel && <CheckCircle2 className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-ink-800 truncate">{c.name}</div>
                          <div className="text-xs text-ink-500 truncate">{c.phone}</div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => setConfirmOpen(true)}
            disabled={!body.trim() || (!allCustomers && selected.size === 0) || recipientCount === 0}
            className="btn-primary w-full mt-4"
          >
            <Send className="w-4 h-4" /> Review & send ({recipientCount})
          </button>
        </div>

        {/* Right column: automations + test */}
        <div className="space-y-4">
          <div className="card">
            <h2 className="font-display font-bold text-lg text-ink-900 mb-3">Automations</h2>
            <Toggle label="Auto-send invoice" description="Send an invoice summary on WhatsApp when a sale is recorded." value={autoInvoice} onChange={(v) => savePrefs({ whatsappAutoInvoice: v })} />
            <div className="border-t border-ink-200/50 my-3" />
            <Toggle label="Payment reminders" description="Trigger reminders from the Ledger or an invoice when a balance is due." value={autoReminders} onChange={(v) => savePrefs({ whatsappReminders: v })} />
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <Phone className="w-4 h-4 text-brand-400" />
              <h2 className="font-display font-bold text-lg text-ink-900">Send test message</h2>
            </div>
            <input className="input mb-2" placeholder="+91 98765 43210" value={test.to} onChange={(e) => setTest({ ...test, to: e.target.value })} />
            <textarea className="input min-h-[64px] mb-2" value={test.body} onChange={(e) => setTest({ ...test, body: e.target.value })} />
            <button onClick={sendTest} disabled={testing || !test.to.trim()} className="btn-outline w-full">
              <Send className="w-4 h-4" /> {testing ? "Sending…" : "Send test"}
            </button>
            {testResult && (
              <div className={`mt-2 text-xs rounded-lg px-3 py-2 ${testResult.status === "sent" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : "bg-rose-500/10 text-rose-600 dark:text-rose-300"}`}>
                {testResult.status === "sent" ? `Sent ✓ ${testResult.messageId ? `(${testResult.messageId.slice(0, 18)}…)` : ""}` : `Failed: ${testResult.error}`}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Message log */}
      <div className="card !p-0 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-ink-200/60">
          <FileText className="w-4 h-4 text-ink-400" />
          <h2 className="font-display font-bold text-lg text-ink-900">Delivery log</h2>
          <span className="text-xs text-ink-400 ml-2">({logs.length})</span>
        </div>
        {loading ? (
          <div className="p-5 space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-ink-50 rounded-lg animate-pulse" />)}</div>
        ) : logs.length === 0 ? (
          <div className="p-10 text-center">
            <MessageCircle className="w-10 h-10 text-ink-300 mx-auto mb-2" />
            <p className="text-sm text-ink-500">No messages yet — record a sale, send a broadcast, or fire a test.</p>
          </div>
        ) : (
          <div className="divide-y divide-ink-200/40">
            {logs.slice(0, 60).map((l) => {
              const pill = l.status === "sent" ? "pill-good" : l.status === "failed" ? "pill-bad" : "pill-info";
              return (
                <div key={l._id} className="px-5 py-3 flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${l.status === "failed" ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500"}`}>
                    <MessageCircle className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-ink-800">{l.to}</span>
                      <span className="pill-info text-[10px] capitalize">{l.type}</span>
                      <span className={`${pill} text-[10px]`}>{l.status}</span>
                    </div>
                    <div className="text-xs text-ink-600 mt-0.5 line-clamp-2">{l.body || `[${l.type}]`}</div>
                    {l.status === "failed" && l.error && <div className="text-[11px] text-rose-500 mt-0.5">{l.error}</div>}
                    <div className="text-[10px] text-ink-400 mt-1">{relativeTime(l.createdAt)} · {formatDate(l.createdAt, { year: true })}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Send confirmation */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm broadcast"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setConfirmOpen(false)} className="btn-outline">Cancel</button>
            <button onClick={doSend} disabled={sending} className="btn-primary">
              <Send className="w-4 h-4" /> {sending ? "Sending…" : `Send to ${recipientCount}`}
            </button>
          </div>
        }
      >
        <p className="text-sm text-ink-600 mb-3">
          This will send a live WhatsApp message to <span className="font-semibold text-ink-800">{recipientCount}</span> customer{recipientCount === 1 ? "" : "s"}.
        </p>
        <div className="rounded-2xl rounded-tl-sm bg-emerald-500/10 border border-emerald-500/20 px-4 py-3">
          <p className="text-sm text-ink-800 whitespace-pre-wrap">{preview}</p>
        </div>
        <p className="text-[11px] text-ink-400 mt-2">Preview shows {"{name}"} replaced with a sample name. Each customer sees their own name.</p>
      </Modal>
    </div>
  );
}

function Toggle({ label, description, value, onChange }) {
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`w-11 h-6 rounded-full relative shrink-0 transition ${value ? "bg-brand-500" : "bg-ink-200"}`}
      >
        <motion.div animate={{ x: value ? 22 : 2 }} transition={{ type: "spring", stiffness: 500, damping: 30 }} className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow" />
      </button>
      <div>
        <div className="font-semibold text-sm text-ink-800">{label}</div>
        <div className="text-xs text-ink-500 mt-0.5">{description}</div>
      </div>
    </div>
  );
}
