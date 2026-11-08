import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Save, Image as ImageIcon, Building2, QrCode, Bell, Palette, Sun, Moon, Upload } from "lucide-react";
import { api } from "../api/client.js";
import PageHeader from "../components/PageHeader.jsx";
import BusinessLogo from "../components/BusinessLogo.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";

const DEFAULT_INVOICE_TERMS = [
  "Return or exchange requests may be considered within {returnPeriodDays} days of the invoice date, subject to the policy communicated at purchase and applicable law.",
  "Please report any damage or shortage promptly for review.",
  "Goods showing signs of use, washing, alteration, or customer-caused damage may not be eligible for return or exchange, subject to applicable law.",
  "Wholesale and retail goods are governed by the return and exchange policy communicated at purchase and applicable law.",
];

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const [business, setBusiness] = useState(user?.business || {});
  const [preferences, setPreferences] = useState(user?.preferences || {});
  const [saving, setSaving] = useState(false);
  const logoInputRef = useRef(null);
  const upiInputRef = useRef(null);

  useEffect(() => {
    setBusiness(user?.business || {});
    setPreferences(user?.preferences || {});
  }, [user]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put("/settings", {
        business: {
          ...business,
          invoiceReturnPeriodDays: Number(business.invoiceReturnPeriodDays ?? 7),
          invoiceTerms: currentInvoiceTerms,
        },
        preferences,
      });
      toast.success("Profile saved");
      refreshUser();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const currentInvoiceTerms = Array.isArray(business.invoiceTerms) && business.invoiceTerms.length
    ? business.invoiceTerms
    : DEFAULT_INVOICE_TERMS;

  const readImage = (file, maxMB, cb) => {
    if (!file) return;
    if (file.size > maxMB * 1024 * 1024) {
      toast.error(`Image must be under ${maxMB} MB`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => cb(String(reader.result));
    reader.readAsDataURL(file);
  };

  const readLogo = (file) => {
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      toast.error("Business logos must be PNG or JPG images.");
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      toast.error("Image must be under 1.5 MB");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => toast.error("Could not read the selected logo.");
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => toast.error("The selected logo is not a valid image.");
      image.onload = () => {
        const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          toast.error("Could not process the selected logo.");
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const normalized = canvas.toDataURL("image/png");
        if (normalized.length > 2 * 1024 * 1024) {
          toast.error("Processed logo must be under 1.5 MB.");
          return;
        }
        setBusiness((current) => ({ ...current, logo: normalized }));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <PageHeader title="Settings" subtitle="Your business profile, appearance, and automations." />
      <form onSubmit={onSubmit} className="space-y-4 max-w-3xl">
        {/* Business Profile */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-5 h-5 text-brand-400" />
            <h2 className="font-display font-bold text-lg text-ink-900">Business profile</h2>
          </div>

          {/* Logo */}
          <div className="flex items-center gap-4 mb-5">
            <BusinessLogo
              logo={business.logo}
              name={business.name || "Your Shop"}
              className="w-20 h-20 rounded-2xl border border-ink-200/60"
              fallbackClassName="font-display font-extrabold text-2xl text-brand-400"
            />
            <div>
              <div className="text-sm font-semibold text-ink-800 mb-1">Business logo</div>
              <p className="text-xs text-ink-500 mb-2">Shown across the app as your primary identity.</p>
              <div className="flex items-center gap-3">
                <button type="button" className="btn-outline text-sm !py-2" onClick={() => logoInputRef.current?.click()}>
                  <Upload className="w-4 h-4" /> {business.logo ? "Replace" : "Upload"}
                </button>
                {business.logo && (
                  <button type="button" onClick={() => setBusiness({ ...business, logo: "" })} className="text-xs text-rose-500 hover:underline">
                    Remove
                  </button>
                )}
              </div>
              <input ref={logoInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => readLogo(e.target.files?.[0])} />
            </div>
          </div>

          {/* Bank details */}
          <div className="card">
            <div className="mb-4">
              <h2 className="font-display font-bold text-lg text-ink-900">Bank details</h2>
              <p className="text-sm text-ink-500 mt-1">Optional details shown on invoices for this business.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                ["bankName", "Bank name", "e.g. State Bank of India", "organization"],
                ["accountHolderName", "Account holder name", "Name on the account", "name"],
                ["accountNumber", "Account number", "Enter account number", "off"],
                ["ifscCode", "IFSC code", "e.g. SBIN0001234", "off"],
                ["branchName", "Branch name", "e.g. Connaught Place", "organization"],
              ].map(([field, label, placeholder, autoComplete]) => (
                <div key={field}>
                  <label className="label" htmlFor={`bank-${field}`}>{label}</label>
                  <input
                    id={`bank-${field}`}
                    className="input"
                    value={business.bankDetails?.[field] || ""}
                    placeholder={placeholder}
                    autoComplete={autoComplete}
                    maxLength={field === "accountNumber" ? 34 : field === "ifscCode" ? 11 : 120}
                    onChange={(event) => setBusiness((current) => ({
                      ...current,
                      bankDetails: { ...current.bankDetails, [field]: event.target.value },
                    }))}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Business name</label>
              <input className="input" value={business.name || ""} onChange={(e) => setBusiness({ ...business, name: e.target.value })} placeholder="Kumar Fashion Hub" />
            </div>
            <div>
              <label className="label">Owner name</label>
              <input className="input" value={business.ownerName || ""} onChange={(e) => setBusiness({ ...business, ownerName: e.target.value })} placeholder="Rajesh Kumar" />
            </div>
            <div>
              <label className="label">Phone number</label>
              <input className="input" value={business.phone || ""} onChange={(e) => setBusiness({ ...business, phone: e.target.value })} placeholder="+91 98765 43210" />
            </div>
            <div>
              <label className="label">GST number</label>
              <input className="input" value={business.gstNumber || ""} onChange={(e) => setBusiness({ ...business, gstNumber: e.target.value })} placeholder="22AAAAA0000A1Z5" />
            </div>
            <div>
              <label className="label">UPI ID</label>
              <input className="input" value={business.upiId || ""} onChange={(e) => setBusiness({ ...business, upiId: e.target.value })} placeholder="shop@okhdfcbank" />
            </div>
            <div>
              <label className="label">Currency</label>
              <input className="input" value={business.currency || "INR"} disabled />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Address</label>
              <textarea className="input min-h-[70px]" value={business.address || ""} onChange={(e) => setBusiness({ ...business, address: e.target.value })} placeholder="Shop no., street, city, state, PIN" />
            </div>
          </div>
        </div>

        {/* Invoice policy */}
        <div className="card">
          <div className="mb-4">
            <h2 className="font-display font-bold text-lg text-ink-900">Invoice terms and conditions</h2>
            <p className="text-sm text-ink-500 mt-1">
              These terms are saved with new sales. Existing invoices keep the terms captured when they were created.
            </p>
          </div>
          <div className="max-w-xs mb-4">
            <label className="label" htmlFor="invoice-return-period">Return or exchange period (days)</label>
            <input
              id="invoice-return-period"
              className="input"
              type="number"
              min="0"
              max="365"
              step="1"
              value={business.invoiceReturnPeriodDays ?? 7}
              onChange={(e) => setBusiness({ ...business, invoiceReturnPeriodDays: e.target.value === "" ? "" : Number(e.target.value) })}
            />
            <p className="text-xs text-ink-400 mt-1">Use 0 to refer to the policy communicated at purchase without printing a number of days.</p>
          </div>
          <div className="space-y-3">
            {currentInvoiceTerms.map((term, index) => (
              <div key={`invoice-term-${index}`}>
                <div className="flex items-center justify-between mb-1">
                  <label className="label !mb-0" htmlFor={`invoice-term-${index}`}>Term {index + 1}</label>
                  {currentInvoiceTerms.length > 2 && (
                    <button
                      type="button"
                      className="text-xs text-rose-500 hover:underline"
                      onClick={() => setBusiness({
                        ...business,
                        invoiceTerms: currentInvoiceTerms.filter((_, termIndex) => termIndex !== index),
                      })}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <textarea
                  id={`invoice-term-${index}`}
                  className="input min-h-[64px]"
                  maxLength={500}
                  value={term}
                  onChange={(e) => setBusiness({
                    ...business,
                    invoiceTerms: currentInvoiceTerms.map((value, termIndex) => termIndex === index ? e.target.value : value),
                  })}
                />
              </div>
            ))}
          </div>
          {currentInvoiceTerms.length < 4 && (
            <button
              type="button"
              className="btn-outline text-sm mt-3"
              onClick={() => setBusiness({
                ...business,
                invoiceTerms: [...currentInvoiceTerms, ""],
              })}
            >
              Add a term
            </button>
          )}
          <p className="text-xs text-ink-400 mt-3">Enter 2 to 4 terms (up to 500 characters each). Use <code>{"{returnPeriodDays}"}</code> to insert the configured period.</p>
        </div>

        {/* Appearance */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Palette className="w-5 h-5 text-grape-400" />
            <h2 className="font-display font-bold text-lg text-ink-900">Appearance</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 max-w-sm">
            <ThemeOption active={theme === "dark"} onClick={() => setTheme("dark")} icon={Moon} label="Dark" hint="Premium default" />
            <ThemeOption active={theme === "light"} onClick={() => setTheme("light")} icon={Sun} label="Light" hint="Bright & clean" />
          </div>
        </div>

        {/* UPI QR */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <QrCode className="w-5 h-5 text-emerald-400" />
            <h2 className="font-display font-bold text-lg text-ink-900">UPI QR code</h2>
          </div>
          <p className="text-sm text-ink-500 mb-4">Attached to payment reminders and invoices automatically.</p>
          <div className="flex items-center gap-4">
            <div className="w-32 h-32 rounded-2xl bg-ink-50 border-2 border-dashed border-ink-200 flex items-center justify-center overflow-hidden shrink-0">
              {business.upiQr ? <img src={business.upiQr} alt="UPI QR" className="w-full h-full object-cover" /> : <ImageIcon className="w-8 h-8 text-ink-400" />}
            </div>
            <div>
              <button type="button" className="btn-outline text-sm" onClick={() => upiInputRef.current?.click()}>
                {business.upiQr ? "Replace QR" : "Upload QR"}
              </button>
              {business.upiQr && (
                <button type="button" onClick={() => setBusiness({ ...business, upiQr: "" })} className="text-xs text-rose-500 hover:underline ml-3">
                  Remove
                </button>
              )}
              <p className="text-xs text-ink-400 mt-2">PNG/JPG, under 1 MB.</p>
              <input ref={upiInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => readImage(e.target.files?.[0], 1, (d) => setBusiness((b) => ({ ...b, upiQr: d })))} />
            </div>
          </div>
        </div>

        {/* Preferences */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-5 h-5 text-amber-400" />
            <h2 className="font-display font-bold text-lg text-ink-900">Preferences</h2>
          </div>
          <div className="space-y-4">
            <Check label="Auto-send WhatsApp invoice when a sale is recorded" value={!!preferences.whatsappAutoInvoice} onChange={(v) => setPreferences({ ...preferences, whatsappAutoInvoice: v })} />
            <Check label="Enable manual WhatsApp payment reminders" value={!!preferences.whatsappReminders} onChange={(v) => setPreferences({ ...preferences, whatsappReminders: v })} />
            <div>
              <label className="label">Low-stock threshold</label>
              <input className="input max-w-[140px]" type="number" min="0" value={preferences.lowStockThreshold ?? 5} onChange={(e) => setPreferences({ ...preferences, lowStockThreshold: Number(e.target.value) })} />
              <p className="text-xs text-ink-400 mt-1">Products at or below this stock are flagged across the dashboard.</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end pb-2">
          <button type="submit" className="btn-primary" disabled={saving}>
            <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save profile"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ThemeOption({ active, onClick, icon: Icon, label, hint }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 p-3 rounded-xl border-2 transition text-left ${
        active ? "border-brand-400 bg-brand-500/10" : "border-ink-200/60 hover:bg-ink-50"
      }`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${active ? "bg-brand-500 text-white" : "bg-ink-100 text-ink-500"}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="font-semibold text-sm text-ink-800">{label}</div>
        <div className="text-xs text-ink-500">{hint}</div>
      </div>
    </button>
  );
}

function Check({ label, value, onChange }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 rounded text-brand-500 focus:ring-brand-400" />
      <span className="text-sm text-ink-700">{label}</span>
    </label>
  );
}
