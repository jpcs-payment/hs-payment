import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useApp } from "./context/AppContext";
import { AppShell } from "./components/AppShell";
import { PublicShell } from "./components/PublicShell";
import { PaymentPage } from "./pages/student/PaymentPage";

const AdminLoginPage = lazy(() => import("./pages/AdminLoginPage").then((module) => ({ default: module.AdminLoginPage })));
const PayersPage = lazy(() => import("./pages/admin/PayersPage").then((module) => ({ default: module.PayersPage })));
const PaymentsPage = lazy(() => import("./pages/admin/PaymentsPage").then((module) => ({ default: module.PaymentsPage })));
const OfferingsPage = lazy(() => import("./pages/admin/OfferingsPage").then((module) => ({ default: module.OfferingsPage })));
const PaymentMethodsPage = lazy(() => import("./pages/admin/PaymentMethodsPage").then((module) => ({ default: module.PaymentMethodsPage })));
const AttendancePage = lazy(() => import("./pages/admin/AttendancePage").then((module) => ({ default: module.AttendancePage })));

function AdminGuard() {
  const { session, authLoading } = useApp();
  if (authLoading) return <div className="flex min-h-screen items-center justify-center bg-mist px-4 text-sm font-semibold text-slate-500">Checking admin session...</div>;
  if (!session || session.role !== "admin") return <Navigate to="/admin/login" replace />;
  return <Outlet />;
}

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-mist px-4 text-sm font-semibold text-slate-500">Loading JPCS Payment...</div>}>
        <Routes>
          <Route path="/" element={<PublicShell><PaymentPage /></PublicShell>} />
          <Route path="/payment" element={<Navigate to="/" replace />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route element={<AdminGuard />}>
            <Route element={<AppShell />}>
              <Route path="/admin" element={<Navigate to="/admin/payers" replace />} />
              <Route path="/admin/payers" element={<PayersPage />} />
              <Route path="/admin/payments" element={<PaymentsPage />} />
              <Route path="/admin/offerings" element={<OfferingsPage />} />
              <Route path="/admin/methods" element={<PaymentMethodsPage />} />
              <Route path="/admin/attendance" element={<AttendancePage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
