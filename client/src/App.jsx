import { Routes, Route, Navigate } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { useAuth } from "./context/AuthContext.jsx";
import AppShell from "./components/AppShell.jsx";

import Landing from "./pages/Landing.jsx";
import Privacy from "./pages/Privacy.jsx";
import Terms from "./pages/Terms.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Products from "./pages/Products.jsx";
import Ledger from "./pages/Ledger.jsx";
import Sales from "./pages/Sales.jsx";
import AIInsights from "./pages/AIInsights.jsx";
import WhatsAppPage from "./pages/WhatsApp.jsx";
import Settings from "./pages/Settings.jsx";

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
      <Analytics />
    </>
  );
}
