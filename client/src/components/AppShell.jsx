import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Package,
  Wallet,
  ShoppingBag,
  Sparkles,
  MessageCircle,
  Settings as SettingsIcon,
  LogOut,
  Menu,
  Sun,
  Moon,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { initials } from "../lib/format.js";
import clsx from "clsx";

const NAV = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/app/sales", label: "Sales", icon: ShoppingBag },
  { to: "/app/products", label: "Products", icon: Package },
  { to: "/app/ledger", label: "Ledger", icon: Wallet },
  { to: "/app/ai", label: "Intelligence", icon: Sparkles },
  { to: "/app/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { to: "/app/settings", label: "Settings", icon: SettingsIcon },
];

const BOTTOM_NAV = NAV.slice(0, 5); // 5 most used for mobile bottom bar

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const doLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-bg flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-surface border-r border-ink-200/70 sticky top-0 h-screen">
        <div className="px-5 py-5 border-b border-ink-200/60">
          <BrandIdentity business={user?.business} />
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map((item) => (
            <SidebarLink key={item.to} {...item} />
          ))}
        </nav>
        <SidebarFooter user={user} onLogout={doLogout} />
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur border-b border-ink-200/60 lg:hidden safe-top">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              className="p-2 -ml-2 rounded-lg hover:bg-ink-100"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="w-6 h-6 text-ink-700" />
            </button>
            <BrandIdentity business={user?.business} compact />
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 px-4 lg:px-8 py-6 pb-28 lg:pb-8 max-w-6xl mx-auto w-full">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur border-t border-ink-200/60 safe-bottom">
          <div className="flex items-center justify-around px-2 pt-2">
            {BOTTOM_NAV.map((item) => (
              <BottomLink key={item.to} {...item} />
            ))}
          </div>
        </nav>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-ink-900/50" onClick={() => setDrawerOpen(false)}>
          <motion.div
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            className="bg-surface w-72 h-full p-4 shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <BrandIdentity business={user?.business} />
            <nav className="mt-6 space-y-1 flex-1">
              {NAV.map((item) => (
                <SidebarLink key={item.to} {...item} onClick={() => setDrawerOpen(false)} />
              ))}
            </nav>
            <SidebarFooter
              user={user}
              onLogout={() => {
                setDrawerOpen(false);
                doLogout();
              }}
            />
          </motion.div>
        </div>
      )}
    </div>
  );
}

/** Business logo / name is the PRIMARY identity. Bizzrow is a subtle wordmark. */
function BrandIdentity({ business, compact }) {
  const name = business?.name || "Your Shop";
  return (
    <div className="flex items-center gap-3 min-w-0">
      {business?.logo ? (
        <img
          src={business.logo}
          alt={name}
          className="w-10 h-10 rounded-xl object-cover border border-ink-200/60 shrink-0"
        />
      ) : (
        <div className="w-10 h-10 rounded-xl bg-gradient-brand flex items-center justify-center shadow-glow shrink-0">
          <span className="text-white font-extrabold text-sm">{initials(name)}</span>
        </div>
      )}
      {!compact && (
        <div className="leading-tight min-w-0">
          <div className="font-extrabold text-ink-900 font-display text-base truncate">{name}</div>
          <div className="text-[9px] uppercase tracking-[0.2em] text-ink-400 font-semibold">
            Bizzrow OS
          </div>
        </div>
      )}
    </div>
  );
}

function ThemeToggle({ className }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      onClick={toggle}
      title={isDark ? "Switch to light" : "Switch to dark"}
      aria-label="Toggle theme"
      className={clsx(
        "w-9 h-9 rounded-xl flex items-center justify-center bg-ink-100 text-ink-600 hover:text-ink-900 hover:bg-ink-200 transition",
        className
      )}
    >
      {isDark ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
    </button>
  );
}

function SidebarLink({ to, label, icon: Icon, end, onClick }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        clsx(
          "flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition",
          isActive
            ? "bg-brand-500/10 text-brand-500 dark:text-brand-300"
            : "text-ink-500 hover:bg-ink-100 hover:text-ink-800"
        )
      }
    >
      <Icon className="w-5 h-5" />
      <span>{label}</span>
    </NavLink>
  );
}

function BottomLink({ to, label, icon: Icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        clsx(
          "flex-1 flex flex-col items-center gap-1 py-2 rounded-xl transition relative",
          isActive ? "text-brand-500 dark:text-brand-300" : "text-ink-400 hover:text-ink-600"
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={clsx("w-5 h-5", isActive && "stroke-[2.5]")} />
          <span className="text-[10px] font-semibold tracking-wide">{label}</span>
          {isActive && (
            <motion.div
              layoutId="bottomNavIndicator"
              className="absolute -top-0.5 w-8 h-1 rounded-full bg-brand-500"
            />
          )}
        </>
      )}
    </NavLink>
  );
}

function SidebarFooter({ user, onLogout }) {
  if (!user) return null;
  return (
    <div className="p-3 border-t border-ink-200/60">
      <div className="p-3 rounded-xl bg-ink-50 border border-ink-200/50 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gradient-brand text-white flex items-center justify-center font-semibold text-xs shrink-0">
          {initials(user.business?.ownerName || user.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm text-ink-800 truncate">
            {user.business?.ownerName || user.name}
          </div>
          <div className="text-xs text-ink-500 truncate">{user.email}</div>
        </div>
        <button
          onClick={onLogout}
          className="p-2 rounded-lg hover:bg-ink-200 text-ink-500 hover:text-rose-500"
          title="Log out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center justify-between mt-2 px-1">
        <span className="text-[10px] uppercase tracking-widest text-ink-400 font-semibold">Bizzrow</span>
        <ThemeToggle />
      </div>
    </div>
  );
}
