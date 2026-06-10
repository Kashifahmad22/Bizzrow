import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Save, Image as ImageIcon, Building2, QrCode, Bell, Palette, Sun, Moon, Upload } from "lucide-react";
import { api } from "../api/client.js";
import PageHeader from "../components/PageHeader.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { initials } from "../lib/format.js";

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
      await api.put("/settings", { business, preferences });
      toast.success("Profile saved");
      refreshUser();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

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
            <div className="w-20 h-20 rounded-2xl overflow-hidden shrink-0 border border-ink-200/60 bg-ink-50 flex items-center justify-center">
              {business.logo ? (
                <img src={business.logo} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <span className="font-display font-extrabold text-2xl text-brand-400">{initials(business.name || "SV")}</span>
              )}
            </div>
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
              <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => readImage(e.target.files?.[0], 1.5, (d) => setBusiness((b) => ({ ...b, logo: d })))} />
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
