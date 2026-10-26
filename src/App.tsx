import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useApp } from "./context/AppContext";
import { AppShell } from "./components/AppShell";
import { PublicShell } from "./components/PublicShell";
import { ThemeToggle } from "./components/ThemeToggle";
import { PaymentPage } from "./pages/student/PaymentPage";

const AdminLoginPage = lazy(() => import("./pages/AdminLoginPage").then((module) => ({ default: module.AdminLoginPage })));
const PayersPage = lazy(() => import("./pages/admin/PayersPage").then((module) => ({ default: module.PayersPage })));
const PaymentsPage = lazy(() => import("./pages/admin/PaymentsPage").then((module) => ({ default: module.PaymentsPage })));
const OfferingsPage = lazy(() => import("./pages/admin/OfferingsPage").then((module) => ({ default: module.OfferingsPage })));
const ReportsPage = lazy(() => import("./pages/admin/ReportsPage").then((module) => ({ default: module.ReportsPage })));
const PaymentMethodsPage = lazy(() => import("./pages/admin/PaymentMethodsPage").then((module) => ({ default: module.PaymentMethodsPage })));
const AttendancePage = lazy(() => import("./pages/admin/AttendancePage").then((module) => ({ default: module.AttendancePage })));
const ArchivePage = lazy(() => import("./pages/admin/ArchivePage").then((module) => ({ default: module.ArchivePage })));

function AdminGuard() {
  const { session, authLoading } = useApp();
  if (authLoading) return <AdminLoadingScreen label="Checking admin session" />;
  if (!session || session.role !== "admin") return <Navigate to="/admin/login" replace />;
  return <Outlet />;
}

function AdminLoginThemeToggle() {
  const location = useLocation();
  return location.pathname === "/admin/login" ? <div className="fixed right-4 top-4 z-20"><ThemeToggle surface="dark" /></div> : null;
}

function AdminLoadingScreen({ label }: { label: string }) {
  return <div className="min-h-screen bg-mist px-4 py-8"><div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center"><div className="w-full space-y-5"><div className="h-10 w-48 animate-pulse rounded-xl bg-white/80" /><div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]"><div className="h-52 animate-pulse rounded-3xl bg-navy-900/10" /><div className="space-y-4"><div className="h-8 w-2/3 animate-pulse rounded-xl bg-white" /><div className="h-4 w-full animate-pulse rounded-lg bg-white" /><div className="h-4 w-5/6 animate-pulse rounded-lg bg-white" /><div className="h-40 animate-pulse rounded-3xl bg-white" /></div></div><p className="text-center text-xs font-semibold text-slate-400">{label}</p></div></div></div>;
}

export function App() {
  return (
    <BrowserRouter>
      <AdminLoginThemeToggle />
      <Suspense fallback={<AdminLoadingScreen label="Loading JPCS Payment" />}>
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
              <Route path="/admin/reports" element={<ReportsPage />} />
              <Route path="/admin/methods" element={<PaymentMethodsPage />} />
              <Route path="/admin/attendance" element={<AttendancePage />} />
              <Route path="/admin/archive" element={<ArchivePage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
