import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { useAuth } from "./context/AuthContext.jsx";
import AppShell from "./components/AppShell.jsx";

// Route-level code splitting: each page loads on demand so the initial bundle
// stays small (heavy dependencies like recharts only ship with their pages).
const Landing = lazy(() => import("./pages/Landing.jsx"));
const Privacy = lazy(() => import("./pages/Privacy.jsx"));
const Terms = lazy(() => import("./pages/Terms.jsx"));
const Login = lazy(() => import("./pages/Login.jsx"));
const Register = lazy(() => import("./pages/Register.jsx"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword.jsx"));
const ResetPassword = lazy(() => import("./pages/ResetPassword.jsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const Products = lazy(() => import("./pages/Products.jsx"));
const Ledger = lazy(() => import("./pages/Ledger.jsx"));
const Sales = lazy(() => import("./pages/Sales.jsx"));
const AIInsights = lazy(() => import("./pages/AIInsights.jsx"));
const WhatsAppPage = lazy(() => import("./pages/WhatsApp.jsx"));
const Settings = lazy(() => import("./pages/Settings.jsx"));
const InventoryAudits = lazy(() => import("./pages/InventoryAudits.jsx"));

function RouteFallback() {
  return (
    <div className="h-screen flex items-center justify-center bg-bg">
      <div className="w-10 h-10 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
    </div>
  );
}

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg">
        <div className="w-10 h-10 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/app" replace />;
  return children;
}

export default function App() {
  return (
    <>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
        {/* Public marketing site */}
        <Route path="/" element={<Landing />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />

        {/* Auth */}
        <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
        <Route path="/signup" element={<PublicOnly><Register /></PublicOnly>} />
        {/* Backward compatibility: old /register links */}
        <Route path="/register" element={<Navigate to="/signup" replace />} />
        <Route path="/forgot-password" element={<PublicOnly><ForgotPassword /></PublicOnly>} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Authenticated application — now under /app */}
        <Route
          path="/app"
          element={
            <Protected>
              <AppShell />
            </Protected>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="products" element={<Products />} />
          <Route path="inventory-audits" element={<InventoryAudits />} />
          <Route path="ledger" element={<Ledger />} />
          <Route path="sales" element={<Sales />} />
          <Route path="ai" element={<AIInsights />} />
          <Route path="whatsapp" element={<WhatsAppPage />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Route>

        {/* Anything else → marketing home */}
        <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Analytics />
    </>
  );
}
