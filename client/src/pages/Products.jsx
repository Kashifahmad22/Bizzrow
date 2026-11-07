import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { Plus, Search, Edit2, Trash2, Package, Image as ImageIcon, Sparkles, Upload, ScanLine, PencilLine, Check, X, Download, Copy } from "lucide-react";
import { api } from "../api/client.js";
import { useFinancialMutation } from "../hooks/useFinancialMutation.js";
import { useDebounce } from "../hooks/useDebounce.js";
import { duplicatePairKey, normalizeDuplicateGroups } from "../lib/duplicateReview.js";
import { formatINR } from "../lib/format.js";
import PageHeader from "../components/PageHeader.jsx";
import Modal from "../components/Modal.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Select from "../components/Select.jsx";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const newBatchCode = () => `B-${window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`;

const EMPTY_FORM = {
  _id: null,
  name: "",
  category: "Apparel",
  brand: "",
  color: "",
  size: "",
  sku: "",
  barcode: "",
  unit: "pcs",
  gstPct: "",
  hsn: "",
  marginPct: "",
  costPrice: "",
  sellingPrice: "",
  wholesalePrice: "",
  retailPrice: "",
  stock: "",
  image: "",
};

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [qtyFilter, setQtyFilter] = useState("any");
  const [customQty, setCustomQty] = useState("");
  const [sort, setSort] = useState("newest");
  const [editing, setEditing] = useState(null);
  const [chooser, setChooser] = useState(false);
  const [importing, setImporting] = useState(false);
  const [duplicateReview, setDuplicateReview] = useState(false);
  const [batchProduct, setBatchProduct] = useState(null);
  const debouncedQ = useDebounce(q, 300);
  const debouncedQty = useDebounce(customQty, 400);

  const load = useCallback(async (p = 1, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const params = { page: p, limit: 24, sort };
      if (debouncedQ.trim()) params.q = debouncedQ.trim();
      if (status !== "all") params.status = status;
      const maxQty = qtyFilter === "custom" ? Number(debouncedQty) : qtyFilter === "any" ? 0 : Number(qtyFilter);
      if (maxQty > 0) params.maxQty = maxQty;
      const { data } = await api.get("/products", { params });
      setProducts((prev) => (append ? [...prev, ...data.products] : data.products));
      setTotal(data.total ?? data.products.length);
      setPage(data.page || 1);
      setHasMore((data.page || 1) < (data.pages || 1));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [debouncedQ, status, qtyFilter, debouncedQty, sort]);

  useEffect(() => {
    load(1, false);
  }, [load]);

  const onDelete = async (p) => {
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/products/${p._id}`);
      toast.success("Product deleted");
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const exportProducts = async () => {
    try {
      const { data, headers } = await api.get("/products/export.csv", { responseType: "blob" });
      const disposition = headers["content-disposition"] || "";
      const filename = disposition.match(/filename="([^"]+)"/i)?.[1]
        || `bizzrow-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Inventory exported");
    } catch (err) {
      toast.error(err.message || "Could not export products");
    }
  };

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle={`${total} item${total === 1 ? "" : "s"} in your catalog`}
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <button className="btn-outline text-xs" onClick={exportProducts}>
              <Download className="w-4 h-4" /> Export Products
            </button>
            <button className="btn-outline text-xs" onClick={() => setDuplicateReview(true)}>
              <Copy className="w-4 h-4" /> Review Duplicates
            </button>
            <button className="btn-primary" onClick={() => setChooser(true)}>
              <Plus className="w-4 h-4" /> Add product
            </button>
          </div>
        }
      />

      {/* Search bar */}
      <div className="card p-3 mb-3 flex items-center gap-3">
        <Search className="w-4 h-4 text-ink-400 ml-1" />
        <input
          className="flex-1 outline-none bg-transparent text-sm placeholder:text-ink-300"
          placeholder="Search by name, SKU, barcode, brand, color, size…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {/* Inventory controls */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Select
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "All" },
            { value: "low", label: "Low stock" },
            { value: "out", label: "Out of stock" },
            { value: "fast", label: "Fast moving" },
            { value: "slow", label: "Slow moving" },
          ]}
        />
        <Select
          label="Quantity"
          value={qtyFilter}
          onChange={setQtyFilter}
          options={[
            { value: "any", label: "Any" },
            { value: "10", label: "Less than 10" },
            { value: "25", label: "Less than 25" },
            { value: "50", label: "Less than 50" },
            { value: "custom", label: "Custom" },
          ]}
        />
        {qtyFilter === "custom" && (
          <input type="number" min="1" value={customQty} onChange={(e) => setCustomQty(e.target.value)} placeholder="Qty <" className="input !py-2 !w-28 text-sm" />
        )}
        <Select
          label="Sort"
          value={sort}
          onChange={setSort}
          options={[
            { value: "newest", label: "Newest" },
            { value: "oldest", label: "Oldest" },
            { value: "stock_desc", label: "Stock high → low" },
            { value: "stock_asc", label: "Stock low → high" },
            { value: "best", label: "Best selling" },
            { value: "least", label: "Least selling" },
          ]}
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="card h-56 animate-pulse" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          icon={Package}
          title={q || status !== "all" || qtyFilter !== "any" ? "No matching products" : "No products yet"}
          body={q || status !== "all" || qtyFilter !== "any" ? "Try a different search or filter." : "Add your first product to start tracking stock and sales."}
          action={
            !q && status === "all" && qtyFilter === "any" && (
              <button className="btn-primary" onClick={() => setChooser(true)}>
                <Plus className="w-4 h-4" /> Add product
              </button>
            )
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <AnimatePresence>
              {products.map((p) => (
                <ProductCard
                  key={p._id}
                  product={p}
                  onEdit={() => setEditing({
                    ...EMPTY_FORM,
                    ...p,
                    costPrice: p.costPrice == null ? "" : String(p.costPrice),
                    sellingPrice: String(p.wholesalePrice ?? p.sellingPrice),
                    wholesalePrice: String(p.wholesalePrice ?? p.sellingPrice),
                    retailPrice: String(p.retailPrice ?? (Number(p.sellingPrice) * 2)),
                    stock: String(p.stock),
                  })}
                  onDelete={() => onDelete(p)}
                  onBatches={() => setBatchProduct(p)}
                />
              ))}
            </AnimatePresence>
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

      <ProductModal editing={editing} setEditing={setEditing} onSaved={load} />

      {chooser && (
        <MethodChooser
          onClose={() => setChooser(false)}
          onManual={() => { setChooser(false); setEditing({ ...EMPTY_FORM }); }}
          onImport={() => { setChooser(false); setImporting(true); }}
        />
      )}
      {importing && <ImportModal onClose={() => setImporting(false)} onSaved={load} />}
      {duplicateReview && (
        <DuplicateReviewModal
          onClose={() => setDuplicateReview(false)}
          onDeleted={() => load()}
        />
      )}
      {batchProduct && (
        <BatchDetailsModal
          product={batchProduct}
          onClose={() => setBatchProduct(null)}
          onSaved={() => { load(); }}
        />
      )}
    </div>
  );
}

function DuplicateReviewModal({ onClose, onDeleted }) {
  const [duplicates, setDuplicates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [canonicalByPair, setCanonicalByPair] = useState({});
  const [deletingId, setDeletingId] = useState("");

  const loadDuplicates = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/products/duplicates");
      setDuplicates(normalizeDuplicateGroups(data.duplicates || []));
    } catch (err) {
      setError(err.message || "Could not load duplicate review");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDuplicates();
  }, [loadDuplicates]);

  const deleteDuplicate = async (product, pair) => {
    const description = [
      `Product: ${product.name}`,
      `Product ID: ${product.productId}`,
      product.sku && `SKU ${product.sku}`,
      product.barcode && `barcode ${product.barcode}`,
      `${product.stock} ${product.unit || "units"} in stock`,
    ].filter(Boolean).join(" · ");
    if (!window.confirm(`Permanently delete this duplicate? This cannot be undone.\n\n${description}\n\nDeletion is allowed only if it has no stock, batches, or transaction history.`)) return;

    setDeletingId(product.productId);
    try {
      const { data } = await api.delete(`/products/${product.productId}`);
      toast.success(data.message || `Deleted ${product.name}`);
      const pairKey = duplicatePairKey(pair);
      setCanonicalByPair((current) => {
        const next = { ...current };
        delete next[pairKey];
        return next;
      });
      await loadDuplicates();
      onDeleted();
    } catch (err) {
      toast.error(err.message || "Could not delete duplicate product");
    } finally {
      setDeletingId("");
    }
  };

  return (
    <Modal open onClose={onClose} title="Potential duplicate products" size="xl">
      <p className="text-sm text-ink-500 mb-4">
        Review both records, choose which one to keep, then explicitly confirm deletion of the other. Deletion is blocked for products with stock, batches, sales, returns, or replacement history.
      </p>
      {loading ? (
        <div className="text-sm text-ink-500 py-8 text-center">Checking products…</div>
      ) : error ? (
        <div className="py-4 text-center">
          <p role="alert" className="text-sm text-rose-500 mb-3">{error}</p>
          <button type="button" className="btn-outline" onClick={loadDuplicates}>Retry</button>
        </div>
      ) : duplicates.length === 0 ? (
        <div className="text-sm text-ink-500 py-8 text-center">No exact duplicate indicators found.</div>
      ) : (
        <div className="space-y-3">
          {duplicates.map((pair) => {
            const pairKey = duplicatePairKey(pair);
            const canonicalId = canonicalByPair[pairKey];
            return (
              <section key={pairKey} className="rounded-xl border border-ink-200/60 p-3">
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {pair.matchingFields.map((field) => <span key={field} className="pill-warn">{field}</span>)}
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {pair.products.map((product) => {
                    const isCanonical = canonicalId === product.productId;
                    const hasCanonical = Boolean(canonicalId);
                    return (
                      <div key={product.productId} className={`rounded-lg p-3 ${isCanonical ? "border border-emerald-300 bg-emerald-50/60" : "bg-ink-50/70"}`}>
                        <div className="font-semibold text-sm text-ink-800">{product.name || "Unnamed product"}</div>
                        <div className="text-xs text-ink-500 mt-1">
                          {[product.sku && `SKU ${product.sku}`, product.barcode && `Barcode ${product.barcode}`, product.size, product.color].filter(Boolean).join(" · ") || "No variant or identifier"}
                        </div>
                        <div className="text-[10px] text-ink-400 mt-1 break-all">ID: {product.productId}</div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-3 text-xs">
                          <span className="text-ink-500">Stock</span><strong className="text-ink-800">{product.stock} {product.unit}</strong>
                          <span className="text-ink-500">Wholesale</span><strong className="text-ink-800">{formatINR(product.wholesalePrice)}</strong>
                          <span className="text-ink-500">Retail</span><strong className="text-ink-800">{formatINR(product.retailPrice)}</strong>
                          <span className="text-ink-500">Cost</span><strong className="text-ink-800">{product.costPrice == null ? "Unknown" : formatINR(product.costPrice)}</strong>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className={isCanonical ? "btn-primary text-xs" : "btn-outline text-xs"}
                            disabled={Boolean(deletingId)}
                            onClick={() => setCanonicalByPair((current) => ({ ...current, [pairKey]: product.productId }))}
                          >
                            {isCanonical ? "Keeping this product" : "Keep this product"}
                          </button>
                          {!isCanonical && (
                            <button
                              type="button"
                              className="btn-outline text-xs text-rose-600"
                              disabled={!hasCanonical || Boolean(deletingId)}
                              title={!hasCanonical ? "Choose which product to keep first" : "Permanently delete this unused duplicate"}
                              onClick={() => deleteDuplicate(product, pair)}
                            >
                              {deletingId === product.productId ? "Deleting…" : "Delete This Duplicate"}
                            </button>
                          )}
                          {!hasCanonical && (
                            <span className="text-[11px] text-ink-500">
                              Choose which product to retain before deleting.
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

function BatchDetailsModal({ product, onClose, onSaved }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const batchMutation = useFinancialMutation(`/products/${product._id}/batches`);
  const adjustmentMutation = useFinancialMutation(`/products/${product._id}/stock-adjustments`);
  const [adjustmentForm, setAdjustmentForm] = useState({ batchId: "", delta: "", reason: "" });
  const [adjustments, setAdjustments] = useState([]);
  const [moreAdjustments, setMoreAdjustments] = useState(false);
  const [form, setForm] = useState({
    batchCode: newBatchCode(),
    purchaseDate: new Date().toISOString().slice(0, 10),
    quantityReceived: "",
    costPrice: "",
    supplierName: "",
    purchaseReference: "",
    notes: "",
  });

  const loadDetails = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [batchResponse, adjustmentResponse] = await Promise.all([
        api.get(`/products/${product._id}/batches`),
        api.get(`/products/${product._id}/stock-adjustments`),
      ]);
      setDetails(batchResponse.data);
      setAdjustments(adjustmentResponse.data.adjustments);
      setMoreAdjustments(adjustmentResponse.data.hasMore);
    } catch (err) {
      setLoadError(err.message || "Could not load batch details");
    } finally {
      setLoading(false);
    }
  }, [product._id]);

  useEffect(() => { loadDetails(); }, [loadDetails]);

  const addBatch = async (event) => {
    event.preventDefault();
    if (batchMutation.submitting) return;
    try {
      const { data } = await batchMutation.submit({
        ...form,
        quantityReceived: Number(form.quantityReceived),
        costPrice: form.costPrice === "" ? null : Number(form.costPrice),
      });
      toast.success(`Purchase batch ${data.batch.batchCode} added to stock`);
      setForm((current) => ({ ...current, batchCode: newBatchCode(), quantityReceived: "", costPrice: "", supplierName: "", purchaseReference: "", notes: "" }));
      await loadDetails();
      onSaved();
    } catch (err) {
      toast.error(err.message || "Could not add purchase batch");
    }
  };

  const submitAdjustment = async (event) => {
    event.preventDefault();
    if (adjustmentMutation.submitting) return;
    try {
      await adjustmentMutation.submit({
        batchId: adjustmentForm.batchId || null,
        delta: Number(adjustmentForm.delta),
        reason: adjustmentForm.reason,
      });
      toast.success("Stock adjustment recorded");
      setAdjustmentForm({ batchId: "", delta: "", reason: "" });
      await loadDetails();
      onSaved();
    } catch (error) {
      toast.error(error.message || "Could not adjust stock");
    }
  };

  return (
    <Modal open onClose={onClose} title={`Stock batches · ${product.name}`} size="xl">
      {loading ? (
        <div className="text-sm text-ink-500 py-6 text-center">Loading stock batches…</div>
      ) : loadError && !details ? (
        <div className="py-6 text-center">
          <p role="alert" className="text-sm text-rose-600 mb-3">{loadError}</p>
          <button type="button" className="btn-outline" onClick={loadDetails}>Retry</button>
        </div>
      ) : details && (
        <>
          {loadError && (
            <p role="alert" className="text-sm text-rose-600 mb-3">
              {loadError} The displayed batch information may be out of date.
              <button type="button" className="underline ml-1" onClick={loadDetails}>Retry</button>
            </p>
          )}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="rounded-lg bg-ink-50 p-3"><div className="text-xs text-ink-500">Total stock</div><div className="font-bold text-ink-900">{details.stock}</div></div>
            <div className="rounded-lg bg-ink-50 p-3"><div className="text-xs text-ink-500">Purchase batches</div><div className="font-bold text-ink-900">{details.batches.length}</div></div>
            <div className="rounded-lg bg-ink-50 p-3"><div className="text-xs text-ink-500">Legacy / unbatched</div><div className="font-bold text-ink-900">{details.legacyUnbatchedStock}</div></div>
          </div>
          {details.inconsistent && (
            <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 mb-4">
              Batch remaining quantities exceed total product stock. Stock changes are blocked until inventory is reconciled.
            </div>
          )}
          {details.batches.length === 0 ? (
            <p className="text-sm text-ink-500 py-3">
              No purchase batches recorded. Existing stock remains legacy/unbatched; no purchase dates or costs have been inferred.
            </p>
          ) : (
            <div className="overflow-x-auto mb-5">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-ink-200 text-left text-xs text-ink-500">
                  <th className="py-2 pr-3">Purchase date</th><th className="py-2 pr-3">Batch</th><th className="py-2 pr-3 text-right">Received</th><th className="py-2 pr-3 text-right">Remaining</th><th className="py-2 pr-3 text-right">Cost</th><th className="py-2">Supplier / reference</th>
                </tr></thead>
                <tbody>
                  {details.batches.map((batch) => (
                    <tr key={batch._id} className="border-b border-ink-200/40">
                      <td className="py-2 pr-3 whitespace-nowrap">{new Date(batch.purchaseDate).toLocaleDateString()}</td>
                      <td className="py-2 pr-3">{batch.batchCode}</td>
                      <td className="py-2 pr-3 text-right">{batch.quantityReceived}</td>
                      <td className="py-2 pr-3 text-right font-semibold">{batch.remainingQuantity}</td>
                      <td className="py-2 pr-3 text-right">{batch.costPrice == null ? "Unknown" : formatINR(batch.costPrice)}</td>
                      <td className="py-2">{[batch.supplierName, batch.purchaseReference].filter(Boolean).join(" · ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <form onSubmit={submitAdjustment} className="border-t border-ink-200/60 pt-4 mb-5">
            <h4 className="font-semibold text-sm text-ink-800 mb-2">Correct stock</h4>
            <p className="text-xs text-ink-500 mb-3">Choose the affected stock and enter a signed quantity and reason. Batch increases only reverse recorded reductions; new purchases need a new batch.</p>
            {adjustmentMutation.pending && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 mb-3">
                Retry with unchanged details or refresh stock before discarding the pending request.
                <button type="button" className="underline ml-1" disabled={adjustmentMutation.submitting} onClick={() => {
                  if (window.confirm("Discard the pending adjustment? It may already have been applied. Refresh stock before continuing.")) adjustmentMutation.abandon();
                }}>Discard pending request</button>
              </div>
            )}
            <div className="grid sm:grid-cols-3 gap-3">
              <label className="text-xs text-ink-500">Stock source
                <select className="input mt-1" value={adjustmentForm.batchId} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, batchId: e.target.value })}>
                  <option value="">Legacy / unbatched</option>
                  {details.batches.map((batch) => <option key={batch._id} value={batch._id}>{batch.batchCode} ({batch.remainingQuantity} remaining)</option>)}
                </select>
              </label>
              <label className="text-xs text-ink-500">Change (+ or -)
                <input className="input mt-1" type="number" step="any" value={adjustmentForm.delta} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, delta: e.target.value })} required />
              </label>
              <label className="text-xs text-ink-500">Reason
                <input className="input mt-1" maxLength="500" value={adjustmentForm.reason} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, reason: e.target.value })} required />
              </label>
            </div>
            <button type="submit" className="btn-outline mt-3" disabled={adjustmentMutation.submitting || details.inconsistent}>
              {adjustmentMutation.submitting ? "Recording…" : "Record stock correction"}
            </button>
            {adjustments.length > 0 && (
              <div className="mt-3 text-xs text-ink-500">
                <strong>Recent corrections</strong>
                {adjustments.map((entry) => <div key={entry._id} className="mt-1">{new Date(entry.createdAt).toLocaleString()} · {entry.batch ? (details.batches.find((batch) => batch._id === entry.batch)?.batchCode || "Batch") : "Legacy"} · {entry.delta > 0 ? "+" : ""}{entry.delta} · {entry.reason}</div>)}
                {moreAdjustments && <div className="mt-1">Showing the latest 100 corrections; older records are retained.</div>}
              </div>
            )}
          </form>
          <form onSubmit={addBatch} className="border-t border-ink-200/60 pt-4">
            <h4 className="font-semibold text-sm text-ink-800 mb-3">Add a stock purchase</h4>
            {batchMutation.pending && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 mb-3">
                A batch request is pending. Retry with the same details to safely complete it, or discard the pending request before starting a different batch.
                <button
                  type="button"
                  className="underline font-semibold ml-1"
                  disabled={batchMutation.submitting}
                  onClick={() => {
                    if (!window.confirm("Discard the pending batch request? If the previous request reached the server, its batch may already have been added. Refresh batch details before submitting another purchase.")) return;
                    try {
                      batchMutation.abandon();
                      toast.success("Pending batch request discarded");
                    } catch (error) {
                      toast.error(error.message);
                    }
                  }}
                >
                  Discard pending request
                </button>
              </div>
            )}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <label className="text-xs text-ink-500">Purchase date<input className="input mt-1" type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} required /></label>
              <label className="text-xs text-ink-500">Quantity received<input className="input mt-1" type="number" min="0.001" step="any" value={form.quantityReceived} onChange={(e) => setForm({ ...form, quantityReceived: e.target.value })} required /></label>
              <label className="text-xs text-ink-500">Cost per unit (optional)<input className="input mt-1" type="number" min="0" step="0.01" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} /></label>
              <label className="text-xs text-ink-500">Batch identifier (optional)<input className="input mt-1" value={form.batchCode} onChange={(e) => setForm({ ...form, batchCode: e.target.value })} maxLength="60" /></label>
              <label className="text-xs text-ink-500">Supplier (optional)<input className="input mt-1" value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} /></label>
              <label className="text-xs text-ink-500">Purchase reference (optional)<input className="input mt-1" value={form.purchaseReference} onChange={(e) => setForm({ ...form, purchaseReference: e.target.value })} /></label>
            </div>
            <label className="block text-xs text-ink-500 mt-3">Notes (optional)<input className="input mt-1" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
            <button type="submit" className="btn-primary mt-3" disabled={batchMutation.submitting || details.inconsistent}>
              {batchMutation.submitting ? "Adding batch…" : "Add batch and update stock"}
            </button>
          </form>
        </>
      )}
    </Modal>
  );
}

function MethodChooser({ onClose, onManual, onImport }) {
  return (
    <Modal open onClose={onClose} title="Add product" size="md">
      <p className="text-sm text-ink-500 mb-4">How would you like to add products?</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <button onClick={onManual} className="card text-left hover:-translate-y-0.5 transition border-ink-200/60">
          <div className="w-11 h-11 rounded-xl bg-brand-500/10 text-brand-500 flex items-center justify-center mb-3"><PencilLine className="w-5 h-5" /></div>
          <div className="font-display font-bold text-ink-900">Manual entry</div>
          <p className="text-xs text-ink-500 mt-1">Type in product details with automatic margin → selling price.</p>
        </button>
        <button onClick={onImport} className="card text-left hover:-translate-y-0.5 transition border-ink-200/60">
          <div className="w-11 h-11 rounded-xl bg-grape-500/10 text-grape-400 flex items-center justify-center mb-3"><ScanLine className="w-5 h-5" /></div>
          <div className="font-display font-bold text-ink-900 flex items-center gap-2">Import supplier invoice</div>
          <p className="text-xs text-ink-500 mt-1">Upload a PDF or photo — we extract the items for your review.</p>
        </button>
      </div>
    </Modal>
  );
}

function ProductCard({ product, onEdit, onDelete, onBatches }) {
  const wholesalePrice = Number(product.wholesalePrice ?? product.sellingPrice) || 0;
  const retailPrice = Number(product.retailPrice ?? wholesalePrice * 2) || 0;
  const margin = wholesalePrice - (Number(product.costPrice) || 0);
  const marginPct = wholesalePrice && product.costPrice != null ? Math.round((margin / wholesalePrice) * 100) : null;
  const lowStock = product.stock <= 5;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="card !p-0 overflow-hidden group"
    >
      <div className="aspect-square bg-gradient-to-br from-brand-500/10 to-ink-100 relative">
        {product.image ? (
          <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="font-display font-extrabold text-3xl text-brand-300">
              {product.name?.slice(0, 2).toUpperCase()}
            </span>
          </div>
        )}
        {lowStock && (
          <span className="absolute top-2 left-2 pill-warn">
            {product.stock === 0 ? "Out of stock" : `Low: ${product.stock} left`}
          </span>
        )}
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
          <button
            onClick={onEdit}
            className="w-7 h-7 rounded-lg bg-surface/95 hover:bg-surface text-ink-700 flex items-center justify-center shadow"
            title="Edit"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="w-7 h-7 rounded-lg bg-surface/95 hover:bg-surface text-rose-500 flex items-center justify-center shadow"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="p-3">
        <div className="font-semibold text-sm text-ink-800 truncate">{product.name}</div>
        <div className="text-xs text-ink-500 mt-0.5 truncate">
          {[product.color, product.size].filter(Boolean).join(" · ") || product.category}
        </div>
        <div className="flex items-end justify-between mt-2">
          <div>
            <div className="font-bold text-ink-900">Wholesale {formatINR(wholesalePrice)}</div>
            <div className="text-xs text-ink-600">Retail {formatINR(retailPrice)}</div>
            {marginPct != null && <div className="text-[11px] text-emerald-600 font-medium">{marginPct}% margin</div>}
          </div>
          <div className="text-right">
            <div className={`text-sm font-bold ${lowStock ? "text-amber-600" : "text-ink-700"}`}>
              {product.stock}
            </div>
            <div className="text-[11px] text-ink-400">in stock</div>
          </div>
        </div>
        <button type="button" onClick={onBatches} className="btn-outline text-xs w-full mt-3 !py-1.5">
          Purchase batches
        </button>
      </div>
    </motion.div>
  );
}

function ProductModal({ editing, setEditing, onSaved }) {
  const [submitting, setSubmitting] = useState(false);
  const [marketing, setMarketing] = useState(null);
  const isEdit = !!editing?._id;

  if (!editing) return null;

  const update = (patch) => setEditing({ ...editing, ...patch });

  const onImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) {
      toast.error("Image must be smaller than 1.5 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update({ image: String(reader.result) });
    reader.readAsDataURL(file);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const payload = {
      ...editing,
      costPrice: editing.costPrice === "" ? null : Number(editing.costPrice),
      sellingPrice: Number(editing.wholesalePrice || editing.sellingPrice),
      wholesalePrice: Number(editing.wholesalePrice || editing.sellingPrice),
      retailPrice: Number(editing.retailPrice || (Number(editing.wholesalePrice || editing.sellingPrice) * 2)),
      stock: Number(editing.stock || 0),
      gstPct: Number(editing.gstPct) || 0,
      marginPct: Number(editing.marginPct) || 0,
    };
    if (isEdit) delete payload.stock;
    try {
      if (isEdit) {
        await api.put(`/products/${editing._id}`, payload);
        toast.success("Product updated");
      } else {
        await api.post("/products", payload);
        toast.success("Product added");
      }
      onSaved();
      setEditing(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const generateMarketing = async () => {
    if (!isEdit) {
      toast.error("Save the product first, then generate marketing copy.");
      return;
    }
    try {
      const { data } = await api.post("/ai/marketing", { productId: editing._id });
      setMarketing(data.message);
    } catch (err) {
      toast.error(err.message);
    }
  };

  // Cost + Margin% <-> Selling price, two-way auto-calc.
  const setCost = (v) => update({ costPrice: v });
  const setMargin = (v) => {
    const m = Number(v) || 0;
    const cost = Number(editing.costPrice) || 0;
    const previousWholesale = Number(editing.wholesalePrice || editing.sellingPrice) || 0;
    const nextWholesale = cost > 0 ? round2(cost * (1 + m / 100)) : previousWholesale;
    const updateData = {
      marginPct: v,
      sellingPrice: String(nextWholesale),
      wholesalePrice: String(nextWholesale),
    };
    if (!editing.retailPrice || Number(editing.retailPrice) === round2(previousWholesale * 2)) {
      updateData.retailPrice = String(round2(nextWholesale * 2));
    }
    update(updateData);
  };
  const setSelling = (v) => {
    const s = Number(v) || 0;
    const cost = Number(editing.costPrice) || 0;
    update({
      sellingPrice: v,
      wholesalePrice: v,
      marginPct: cost > 0 ? String(round2(((s - cost) / cost) * 100)) : editing.marginPct,
    });
  };

  const wholesalePrice = Number(editing.wholesalePrice || editing.sellingPrice || 0);
  const retailPrice = Number(editing.retailPrice || wholesalePrice * 2);
  const margin = wholesalePrice - Number(editing.costPrice || 0);
  const marginPct = wholesalePrice ? Math.round((margin / wholesalePrice) * 100) : 0;

  return (
    <Modal
      open={!!editing}
      onClose={() => setEditing(null)}
      title={isEdit ? "Edit product" : "Add product"}
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          {isEdit && (
            <button type="button" onClick={generateMarketing} className="btn-ghost text-xs">
              <Sparkles className="w-3.5 h-3.5" /> AI marketing copy
            </button>
          )}
          <div className="flex-1" />
          <button type="button" onClick={() => setEditing(null)} className="btn-outline">
            Cancel
          </button>
          <button form="product-form" type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Saving…" : isEdit ? "Save changes" : "Add product"}
          </button>
        </div>
      }
    >
      <form id="product-form" onSubmit={onSubmit} className="space-y-4">
        {/* Image upload */}
        <div className="flex items-start gap-4">
          <label className="w-24 h-24 rounded-xl bg-ink-50 border-2 border-dashed border-ink-200 flex items-center justify-center cursor-pointer hover:bg-ink-100 transition overflow-hidden shrink-0">
            {editing.image ? (
              <img src={editing.image} alt="" className="w-full h-full object-cover" />
            ) : (
              <ImageIcon className="w-6 h-6 text-ink-400" />
            )}
            <input type="file" accept="image/*" onChange={onImage} className="hidden" />
          </label>
          <div className="flex-1">
            <label className="label">Name *</label>
            <input
              className="input"
              placeholder="Cotton Round Neck T-Shirt"
              value={editing.name}
              onChange={(e) => update({ name: e.target.value })}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Category</label>
            <input className="input" placeholder="Apparel" value={editing.category} onChange={(e) => update({ category: e.target.value })} />
          </div>
          <div>
            <label className="label">Brand</label>
            <input className="input" placeholder="optional" value={editing.brand} onChange={(e) => update({ brand: e.target.value })} />
          </div>
          <div>
            <label className="label">Color</label>
            <input className="input" placeholder="Navy Blue" value={editing.color} onChange={(e) => update({ color: e.target.value })} />
          </div>
          <div>
            <label className="label">Size</label>
            <input className="input" placeholder="M / L / XL" value={editing.size} onChange={(e) => update({ size: e.target.value })} />
          </div>
          <div>
            <label className="label">SKU</label>
            <input className="input" placeholder="optional" value={editing.sku} onChange={(e) => update({ sku: e.target.value })} />
          </div>
          <div>
            <label className="label">Barcode</label>
            <input className="input" placeholder="optional" value={editing.barcode} onChange={(e) => update({ barcode: e.target.value })} />
          </div>
          <div>
            <label className="label">HSN</label>
            <input className="input" placeholder="optional" value={editing.hsn} onChange={(e) => update({ hsn: e.target.value })} />
          </div>
          <div>
            <label className="label">Unit</label>
            <input className="input" placeholder="pcs / box / kg" value={editing.unit} onChange={(e) => update({ unit: e.target.value })} />
          </div>
          <div>
            <label className="label">GST %</label>
            <input className="input" type="number" step="0.01" min="0" placeholder="0" value={editing.gstPct} onChange={(e) => update({ gstPct: e.target.value })} />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="label">Cost ₹</label>
            <input className="input" type="number" step="0.01" min="0" value={editing.costPrice} onChange={(e) => setCost(e.target.value)} placeholder="Unknown" />
          </div>
          <div>
            <label className="label">Margin %</label>
            <input className="input" type="number" step="0.01" placeholder="0" value={editing.marginPct} onChange={(e) => setMargin(e.target.value)} />
          </div>
          <div>
            <label className="label">Wholesale ₹ *</label>
            <input className="input" type="number" step="0.01" min="0" required value={editing.wholesalePrice || editing.sellingPrice} onChange={(e) => setSelling(e.target.value)} />
          </div>
          <div>
            <label className="label">Retail ₹ *</label>
            <input className="input" type="number" step="0.01" min="0" required value={editing.retailPrice} onChange={(e) => update({ retailPrice: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{isEdit ? "Total stock" : "Opening stock"}</label>
            <input
              className="input"
              type="number"
              min="0"
              value={editing.stock}
              onChange={(e) => update({ stock: e.target.value })}
              readOnly={isEdit}
            />
            {isEdit && <p className="text-[11px] text-ink-400 mt-1">Use Purchase batches to add new stock.</p>}
          </div>
        </div>

        {wholesalePrice > 0 && editing.costPrice !== "" && (
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 flex items-center justify-between">
            <div className="text-xs text-emerald-700 dark:text-emerald-300 font-semibold">Profit per unit</div>
            <div className="text-emerald-700 dark:text-emerald-300 font-bold">
              {formatINR(margin)} <span className="text-xs font-medium opacity-80">({marginPct}%)</span>
            </div>
          </div>
        )}

        {marketing && (
          <div className="rounded-xl bg-brand-500/10 border border-brand-500/20 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-brand-500 dark:text-brand-300" />
              <div className="text-xs font-semibold text-brand-700 dark:text-brand-300">AI marketing copy (WhatsApp-ready)</div>
            </div>
            <p className="text-sm text-ink-700 whitespace-pre-wrap">{marketing}</p>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(marketing);
                toast.success("Copied to clipboard");
              }}
              className="btn-outline text-xs mt-3"
            >
              Copy
            </button>
          </div>
        )}
      </form>
    </Modal>
  );
}

const applyMarginToRow = (row, m) => {
  const cost = Number(row.costPrice) || 0;
  const mp = Number(m) || 0;
  if (cost <= 0) return { ...row, marginPct: m };
  const previousWholesale = Number(row.wholesalePrice ?? row.sellingPrice) || 0;
  const wholesalePrice = round2(cost * (1 + mp / 100));
  const retailWasDefault = !Number(row.retailPrice) || Number(row.retailPrice) === round2(previousWholesale * 2);
  return {
    ...row,
    marginPct: m,
    sellingPrice: wholesalePrice,
    wholesalePrice,
    ...(retailWasDefault ? { retailPrice: round2(wholesalePrice * 2) } : {}),
  };
};

function ImportModal({ onClose, onSaved }) {
  const [step, setStep] = useState("upload"); // upload | review
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({});
  const [globalMargin, setGlobalMargin] = useState("");
  const [committing, setCommitting] = useState(false);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast.error("File must be under 4 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      setBusy(true);
      try {
        const { data } = await api.post("/products/import/extract", { file: String(reader.result), mimeType: file.type });
        const ex = data.extraction || {};
        const mapped = (ex.items || []).map((it) => ({
          name: it.name || "",
          category: "Apparel",
          unit: it.unit || "pcs",
          hsn: it.hsn || "",
          gstPct: it.gstPct || 0,
          quantity: it.quantity || 1,
          costPrice: it.costPrice || 0,
          marginPct: "",
          sellingPrice: it.costPrice || 0,
          wholesalePrice: it.costPrice || 0,
          retailPrice: (it.costPrice || 0) * 2,
          approved: !!it.name && (it.costPrice || 0) > 0,
        }));
        setRows(mapped);
        setMeta({ supplier: ex.supplier, invoiceNumber: ex.invoiceNumber, invoiceDate: ex.invoiceDate });
        if (mapped.length === 0) toast.error("No products could be read. Try a clearer photo or PDF.");
        setStep("review");
      } catch (err) {
        toast.error(err.message || "Extraction failed");
      } finally {
        setBusy(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const setRow = (i, patch) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const applyGlobalMargin = () => setRows((prev) => prev.map((r) => applyMarginToRow(r, globalMargin)));

  const approvedRows = rows.filter((r) => r.approved && r.name && Number(r.sellingPrice) > 0);
  const attention = rows.filter((r) => !r.name || Number(r.sellingPrice) <= 0).length;

  const commit = async () => {
    if (approvedRows.length === 0) {
      toast.error("Approve at least one valid product");
      return;
    }
    setCommitting(true);
    try {
      const products = approvedRows.map((r) => ({
        name: r.name,
        category: r.category || "Apparel",
        unit: r.unit,
        hsn: r.hsn,
        gstPct: Number(r.gstPct) || 0,
        marginPct: Number(r.marginPct) || 0,
        costPrice: r.costPrice === "" || r.costPrice == null ? null : Number(r.costPrice),
        sellingPrice: Number(r.sellingPrice) || 0,
        wholesalePrice: Number(r.wholesalePrice ?? r.sellingPrice) || 0,
        retailPrice: Number(r.retailPrice || (Number(r.sellingPrice) * 2)),
        stock: Number(r.quantity) || 0,
      }));
      const { data } = await api.post("/products/import/commit", { products });
      toast.success(`Created ${data.created} product${data.created === 1 ? "" : "s"}`);
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCommitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Import supplier invoice"
      size="xl"
      footer={
        step === "review" ? (
          <div className="flex items-center justify-between gap-3 w-full">
            <div className="text-xs text-ink-500">
              {rows.length} extracted · <span className="text-emerald-500 font-semibold">{approvedRows.length} approved</span>
              {attention > 0 && <span className="text-amber-500 font-semibold"> · {attention} need attention</span>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep("upload")} className="btn-outline">Back</button>
              <button onClick={commit} disabled={committing || approvedRows.length === 0} className="btn-primary">
                {committing ? "Creating…" : `Create ${approvedRows.length} products`}
              </button>
            </div>
          </div>
        ) : null
      }
    >
      {step === "upload" && (
        <div className="text-center py-8">
          <label className="block max-w-sm mx-auto cursor-pointer">
            <div className="rounded-2xl border-2 border-dashed border-ink-200 bg-ink-50 py-12 px-6 hover:bg-ink-100 transition">
              <Upload className="w-10 h-10 text-brand-400 mx-auto mb-3" />
              <div className="font-semibold text-ink-800">{busy ? "Reading invoice…" : "Upload a supplier invoice"}</div>
              <p className="text-xs text-ink-500 mt-1">PDF, photo, or camera capture · under 4 MB</p>
            </div>
            <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={onFile} disabled={busy} />
          </label>
          <p className="text-xs text-ink-400 mt-4 max-w-md mx-auto">Bizzrow reads the line items with AI. Nothing is added to your inventory until you review and confirm.</p>
        </div>
      )}

      {step === "review" && (
        <div>
          {meta.supplier && (
            <div className="text-sm text-ink-600 mb-3">
              <span className="font-semibold text-ink-800">{meta.supplier}</span>
              {meta.invoiceNumber ? ` · #${meta.invoiceNumber}` : ""} {meta.invoiceDate ? `· ${meta.invoiceDate}` : ""}
            </div>
          )}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-xs text-ink-500">Apply margin to all:</span>
            <input type="number" value={globalMargin} onChange={(e) => setGlobalMargin(e.target.value)} className="input !py-1.5 !w-24 text-sm" placeholder="30" />
            <button onClick={applyGlobalMargin} className="btn-outline text-xs">Apply %</button>
          </div>
          <div className="space-y-2 max-h-[26rem] overflow-y-auto pr-1">
            {rows.map((r, i) => {
              const issue = !r.name || Number(r.sellingPrice) <= 0;
              return (
                <div key={i} className={`rounded-xl border p-3 ${r.approved ? "border-emerald-500/30 bg-emerald-500/5" : issue ? "border-amber-500/30 bg-amber-500/5" : "border-ink-200/60"}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[11px] text-ink-400 w-12">#{i + 1}/{rows.length}</span>
                    <input className="input !py-1.5 text-sm flex-1" value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} placeholder="Product name" />
                    <button onClick={() => setRow(i, { approved: !r.approved })} title={r.approved ? "Approved" : "Approve"} className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${r.approved ? "bg-emerald-500 text-white" : "bg-ink-100 text-ink-500"}`}>
                      {r.approved ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                    <Field label="Qty" value={r.quantity} onChange={(v) => setRow(i, { quantity: v })} />
                    <Field label="Cost ₹" value={r.costPrice} onChange={(v) => setRow(i, applyMarginToRow({ ...r, costPrice: v }, r.marginPct))} />
                    <Field label="GST %" value={r.gstPct} onChange={(v) => setRow(i, { gstPct: v })} />
                    <Field label="Margin %" value={r.marginPct} onChange={(v) => setRow(i, applyMarginToRow(r, v))} />
                    <Field label="Wholesale ₹" value={r.wholesalePrice ?? r.sellingPrice} onChange={(v) => setRow(i, { sellingPrice: v, wholesalePrice: v, marginPct: Number(r.costPrice) > 0 ? round2(((Number(v) - Number(r.costPrice)) / Number(r.costPrice)) * 100) : r.marginPct })} />
                    <Field label="Retail ₹" value={r.retailPrice} onChange={(v) => setRow(i, { retailPrice: v })} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Field({ label, value, onChange }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">{label}</label>
      <input type="number" className="input !py-1.5 text-sm" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
