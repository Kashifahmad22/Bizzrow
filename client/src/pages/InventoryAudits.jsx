import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import api from "../api/client.js";
import PageHeader from "../components/PageHeader.jsx";
import { useFinancialMutation } from "../hooks/useFinancialMutation.js";
import { subtractQuantity } from "../lib/quantity.js";
import { invalidateProductCache } from "../lib/productCache.js";

export default function InventoryAudits() {
  const [audits, setAudits] = useState([]);
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState([]);
  const [audit, setAudit] = useState(null);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const approval = useFinancialMutation(`/inventory-audits/${audit?._id || "none"}/approve`);

  async function loadList() {
    const { data } = await api.get("/inventory-audits");
    setAudits(data.audits);
  }
  useEffect(() => {
    loadList().catch((error) => setMessage(error.message)).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    let active = true;
    api.get("/products", { params: { q: query, limit: 100 } })
      .then(({ data }) => { if (active) setProducts(data.products); })
      .catch((error) => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [query]);

  async function create(allProducts) {
    setBusy(true);
    setMessage("");
    try {
      const { data } = await api.post("/inventory-audits", allProducts ? { allProducts: true } : { productIds: selected });
      setAudit(data.audit);
      setReview(false);
      setSelected([]);
      await loadList();
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  async function open(id) {
    setBusy(true);
    setMessage("");
    try {
      const { data } = await api.get(`/inventory-audits/${id}`);
      setAudit(data.audit);
      setReview(false);
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  function updateSource(itemIndex, sourceIndex, field, value) {
    setAudit((current) => ({
      ...current,
      items: current.items.map((item, i) => i !== itemIndex ? item : {
        ...item, sources: item.sources.map((source, j) => j !== sourceIndex ? source : { ...source, [field]: value }),
      }),
    }));
    setReview(false);
  }

  async function saveReview() {
    setBusy(true);
    setMessage("");
    try {
      const body = {
        remarks: audit.remarks || "",
        revision: audit.__v,
        items: audit.items.map((item) => ({
          product: item.product,
          sources: item.sources.map((source) => ({
            batch: source.batch || null, physicalQuantity: source.physicalQuantity, reason: source.reason || "",
          })),
        })),
      };
      const { data } = await api.put(`/inventory-audits/${audit._id}`, body);
      setAudit(data.audit);
      setReview(true);
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  async function approve() {
    setMessage("");
    try {
      const response = await approval.submit({ revision: audit.__v });
      if (!response) return;
      setAudit(response.data.audit);
      setReview(false);
      invalidateProductCache();
      toast.success("Inventory audit completed");
      await loadList();
    } catch (error) { setMessage(error.message); }
  }

  return (
    <div>
      <PageHeader title="Inventory audits" subtitle="Count each batch and unbatched stock separately, then review before applying adjustments." />
      {message && <p role="alert" className="card mb-4 text-red-600">{message}</p>}
      {!audit && <>
        <div className="card mb-4 space-y-3">
          <h2 className="font-bold">Start an audit</h2>
          <input className="input" placeholder="Search products" value={query} onChange={(event) => setQuery(event.target.value)} />
          <div className="max-h-52 overflow-y-auto space-y-2">
            {products.length === 0 && <p>No products found.</p>}
            {products.map((product) => <label key={product._id} className="flex items-center gap-2">
              <input type="checkbox" checked={selected.includes(product._id)} onChange={(event) =>
                setSelected((previous) => event.target.checked ? [...previous, product._id] : previous.filter((id) => id !== product._id))} />
              <span>{product.name} — stock {product.stock}</span>
            </label>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={busy || !selected.length} onClick={() => create(false)}>Audit selected ({selected.length})</button>
            <button className="btn-outline" disabled={busy} onClick={() => create(true)}>Audit all inventory</button>
          </div>
        </div>
        <div className="card space-y-2">
          <h2 className="font-bold">Audit history</h2>
          {loading ? <p>Loading audits…</p> : audits.length === 0 ? <p>No audits yet.</p> : audits.map((entry) =>
            <button key={entry._id} className="w-full text-left border-b py-2 flex items-center justify-between gap-2" onClick={() => open(entry._id)}>
              <span>{new Date(entry.createdAt).toLocaleString()}</span>
              <span className={entry.status === "completed" ? "pill-good" : entry.status === "draft" ? "pill-warn" : "pill-info"}>{entry.status}</span>
            </button>)}
        </div>
      </>}
      {audit && <>
        <div className="flex flex-wrap gap-2 mb-4">
          <button className="btn-outline" onClick={() => { setAudit(null); setReview(false); }}>Back to audits</button>
          <span className="self-center font-semibold flex items-center gap-2">Status:{" "}
            <span className={audit.status === "completed" ? "pill-good" : audit.status === "draft" ? "pill-warn" : "pill-info"}>{audit.status}</span>
          </span>
        </div>
        <div className="space-y-4">
          {audit.items.map((item, i) => <section key={item.product} className="card space-y-3">
            <h2 className="font-bold">{item.name} — system total {item.systemStock}</h2>
            {item.sources.map((source, j) => {
              let difference = source.difference;
              try {
                if (source.physicalQuantity !== "" && source.physicalQuantity != null) {
                  difference = subtractQuantity(source.physicalQuantity, source.systemQuantity);
                }
              } catch { difference = null; }
              return <div key={source.batch || "unbatched"} className="border rounded-xl p-3 space-y-2">
                <p className="font-semibold">{source.batch ? `Batch ${source.batchCode}` : "Unbatched"} — system {source.systemQuantity}</p>
                <label className="block">Physical count
                  <input className="input mt-1" type="number" step="any" min="0" disabled={audit.status !== "draft" || review || approval.pending}
                    value={source.physicalQuantity ?? ""} onChange={(event) => updateSource(i, j, "physicalQuantity", event.target.value)} />
                </label>
                <p className="flex items-center gap-2">Difference:{" "}
                  {difference == null
                    ? <span className="pill bg-ink-100 text-ink-600">—</span>
                    : difference > 0
                      ? <span className="pill-warn">Surplus +{difference}</span>
                      : difference < 0
                        ? <span className="pill-bad">Shortage {difference}</span>
                        : <span className="pill-good">Match</span>}
                </p>
                <label className="block">Reason for discrepancy
                  <input className="input mt-1" maxLength={500} disabled={audit.status !== "draft" || review || approval.pending}
                    value={source.reason || ""} onChange={(event) => updateSource(i, j, "reason", event.target.value)} />
                </label>
                {source.adjustment && <p className="text-sm">Adjustment: {source.adjustment}</p>}
              </div>;
            })}
          </section>)}
          <label className="card block">Remarks
            <textarea className="input mt-1" maxLength={500} value={audit.remarks || ""}
              disabled={audit.status !== "draft" || review || approval.pending}
              onChange={(event) => { setAudit({ ...audit, remarks: event.target.value }); setReview(false); }} />
          </label>
          {audit.status === "draft" && <div className="flex flex-wrap gap-2">
            {!review && !approval.pending && <button className="btn-primary" disabled={busy} onClick={saveReview}>Save counts and review</button>}
            {review && !approval.pending && <button className="btn-outline" onClick={() => setReview(false)}>Edit counts</button>}
            {(review || approval.pending) && <button className="btn-primary" disabled={approval.submitting} onClick={approve}>
              {approval.submitting ? "Applying…" : approval.pending ? "Retry approval" : "Confirm and apply"}
            </button>}
            {approval.pending && <button className="btn-outline" disabled={approval.submitting} onClick={() => {
              try {
                if (approval.abandon()) {
                  setReview(false);
                  setMessage("Pending approval cleared. Reload the audit to verify its status before editing or starting a new count.");
                }
              } catch (error) { setMessage(error.message); }
            }}>Clear pending approval</button>}
          </div>}
          {review && <p>Confirm only after checking every count and reason. Changed stock will require a new audit.</p>}
          {audit.completedAt && <p>Completed {new Date(audit.completedAt).toLocaleString()}</p>}
        </div>
      </>}
    </div>
  );
}
