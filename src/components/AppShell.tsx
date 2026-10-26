import { useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { Archive, BarChart3, ChevronLeft, ChevronRight, Download, Menu, ReceiptText, ScanLine, Search, Settings2, Tags, UsersRound, X } from "lucide-react";
import { useApp } from "../context/AppContext";
import { downloadPaymentCsv } from "../lib/export";
import { formatCurrency } from "../lib/utils";
import { Avatar, Button, Input, PageSkeleton } from "./ui";
import { OrganizationLogo } from "./OrganizationLogo";
import { ThemeToggle } from "./ThemeToggle";
import { BRANDING } from "../lib/branding";

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

const navigation: NavItem[] = [
  { label: "Payers", to: "/admin/payers", icon: UsersRound },
  { label: "Payments", to: "/admin/payments", icon: ReceiptText },
  { label: "Payment types", to: "/admin/offerings", icon: Tags },
  { label: "Reports", to: "/admin/reports", icon: BarChart3 },
  { label: "Attendance scanner", to: "/admin/attendance", icon: ScanLine },
  { label: "Payment methods", to: "/admin/methods", icon: Settings2 },
  { label: "Archive", to: "/admin/archive", icon: Archive },
];

const pageTitles: Array<[string, string]> = [
  ["/admin/payers", "Payers"],
  ["/admin/payments", "Payments"],
  ["/admin/offerings", "Payment types"],
  ["/admin/reports", "Reports"],
  ["/admin/attendance", "Attendance scanner"],
  ["/admin/methods", "Payment methods"],
  ["/admin/archive", "Archive"],
];

interface SearchResult {
  label: string;
  detail: string;
  to: string;
}

export function AppShell() {
  const { data, logout, session, dataLoading, dataError, retryData } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const title = pageTitles.find(([path]) => location.pathname.startsWith(path))?.[1] ?? "Admin workspace";
  const searchResults = useMemo<SearchResult[]>(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    const payers = data.students
      .filter((student) => !student.archivedAt && `${student.name} ${student.email} ${student.yearLevel} ${student.strand ?? ""} ${student.course ?? ""}`.toLowerCase().includes(query))
      .slice(0, 4)
      .map((student) => ({ label: student.name, detail: `${student.email} · Payer`, to: "/admin/payers" }));
    const payments = data.payments
      .filter((payment) => `${payment.reference} ${payment.ticketId ?? ""} ${payment.studentName} ${payment.email} ${payment.offeringName}`.toLowerCase().includes(query))
      .slice(0, 4)
      .map((payment) => ({ label: payment.reference, detail: `${payment.studentName} · ${formatCurrency(payment.amount)}`, to: "/admin/payments" }));
    const offerings = data.offerings
      .filter((offering) => !offering.archivedAt && `${offering.name} ${offering.slug} ${offering.description}`.toLowerCase().includes(query))
      .slice(0, 4)
      .map((offering) => ({ label: offering.name, detail: `${formatCurrency(offering.amount)} · Payment type`, to: "/admin/offerings" }));
    return [...payers, ...payments, ...offerings].slice(0, 8);
  }, [data, searchQuery]);

  const handleLogout = () => {
    logout();
    navigate("/admin/login", { replace: true });
  };

  if (dataLoading) return <div className="min-h-screen bg-mist px-4 py-8 sm:px-6 lg:px-10"><PageSkeleton label="Loading admin workspace" /></div>;
  if (dataError) return <div className="flex min-h-screen items-center justify-center bg-mist px-4"><div className="w-full max-w-md rounded-3xl border border-red-100 bg-white p-7 text-center shadow-soft"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-coral">Workspace unavailable</p><h1 className="mt-2 text-xl font-extrabold text-navy-900">The admin data could not load</h1><p className="mt-2 break-words text-sm leading-6 text-slate-500">{dataError}</p><div className="mt-5 flex justify-center gap-2"><Button variant="outline" onClick={() => void retryData()}>Retry</Button><Button variant="ghost" onClick={handleLogout}>Sign out</Button></div></div></div>;

  const renderSidebar = (mobile = false) => {
    const compact = mobile ? false : collapsed;
    return (
      <aside className={`flex h-full ${mobile ? "w-[280px]" : compact ? "w-[76px]" : "w-[248px]"} flex-col overflow-hidden bg-navy-900 text-white`}>
        <div className={`flex h-[76px] shrink-0 items-center ${compact ? "justify-center" : "justify-between px-5"}`}>
          <button className="flex items-center gap-3" onClick={() => navigate("/admin/payments")} aria-label="Go to payments"><OrganizationLogo surface="dark" compact={compact} /></button>
          {!mobile ? <button className="hidden rounded-lg p-1.5 text-blue-100/60 transition hover:bg-white/10 hover:text-white lg:block" onClick={() => setCollapsed((value) => !value)} aria-label={compact ? "Expand sidebar" : "Collapse sidebar"}>{compact ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}</button> : null}
        </div>
        <div className="px-3 pb-4">
          {!compact ? <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-blue-100/45">Operations</p> : null}
          <nav className="space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              return <NavLink key={item.to} to={item.to} onClick={() => setMobileOpen(false)} className={({ isActive }) => `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? "bg-white text-navy-900 shadow-sm" : "text-blue-100/70 hover:bg-white/10 hover:text-white"} ${compact ? "justify-center" : ""}`} title={compact ? item.label : undefined}><Icon className="h-[18px] w-[18px] shrink-0" />{!compact ? <span className="truncate">{item.label}</span> : null}</NavLink>;
            })}
          </nav>
        </div>
        <div className="mt-auto shrink-0 p-3">
          {!compact ? <div className="flex items-center gap-3 border-t border-white/10 px-2 pt-3"><Avatar initials={(session?.adminName ?? "AD").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()} color="#245486" size="sm" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{session?.adminName ?? "JPCS Admin"}</p><p className="truncate text-[10px] text-blue-100/50">{session?.adminEmail ?? "Operations admin"}</p></div><button className="rounded-lg p-1.5 text-blue-100/50 hover:bg-white/10 hover:text-white" onClick={handleLogout} aria-label="Sign out">Sign out</button></div> : <button className="mx-auto flex rounded-lg p-2 text-xs text-blue-100/60 hover:bg-white/10 hover:text-white" onClick={handleLogout} aria-label="Sign out">Exit</button>}
        </div>
      </aside>
    );
  };

  return (
    <div className="min-h-screen bg-mist text-ink">
      <div className="flex min-h-screen">
        <div className={`hidden shrink-0 lg:block ${collapsed ? "w-[76px]" : "w-[248px]"}`} />
        <div className="fixed inset-y-0 left-0 z-40 hidden lg:block">{renderSidebar()}</div>
        {mobileOpen ? <div className="fixed inset-0 z-40 lg:hidden"><button className="absolute inset-0 bg-navy-950/55" aria-label="Close navigation" onClick={() => setMobileOpen(false)} /><div className="relative h-full">{renderSidebar(true)}<button className="absolute right-3 top-5 rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X className="h-5 w-5" /></button></div></div> : null}
        <div className="flex min-w-0 flex-1 flex-col">
           <header className="sticky top-0 z-30 flex min-h-[76px] flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-white/90 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
             <div className="flex min-w-0 items-center gap-3"><button className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-navy-900 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu className="h-5 w-5" /></button><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Admin workspace</p><h1 className="mt-0.5 truncate text-lg font-extrabold tracking-tight text-navy-900">{title}</h1></div></div>
              <div className="relative order-3 basis-full xl:order-none xl:basis-auto"><div className="relative w-full xl:w-[360px]"><Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" /><Input className="pl-10 pr-3" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setSearchQuery(""); }} placeholder="Search payers, payments, types" aria-label="Search admin records" />{searchQuery.trim() ? <div className="absolute left-0 right-0 top-[3.25rem] z-50 overflow-hidden rounded-2xl border border-line bg-white p-1.5 shadow-float">{searchResults.length ? searchResults.map((result, index) => <button key={`${result.to}-${result.label}-${index}`} className="flex w-full min-w-0 items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-mist" onClick={() => { navigate(result.to); setSearchQuery(""); }}><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-700"><Search className="h-3.5 w-3.5" /></span><span className="min-w-0"><span className="block break-words text-xs font-bold text-navy-900">{result.label}</span><span className="mt-0.5 block break-words text-[10px] text-slate-500">{result.detail}</span></span></button>) : <p className="px-3 py-4 text-center text-xs text-slate-500">No matching records.</p>}</div> : null}</div></div>
              <div className="flex items-center gap-2 sm:gap-3"><Button className="inline-flex" variant="outline" size="sm" onClick={() => downloadPaymentCsv(data.payments)} disabled={!data.payments.length} aria-label="Export payment report as CSV"><Download className="h-3.5 w-3.5" /><span className="hidden sm:inline">Export CSV</span></Button><ThemeToggle /><span className="hidden text-right text-[10px] font-semibold leading-4 text-slate-400 lg:block">Supabase connected<br />Brevo email delivery</span><Avatar initials={(session?.adminName ?? "AD").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()} color="#163A63" size="sm" /></div>
          </header>
          <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10"><Outlet /></main>
          <footer className="border-t border-line px-4 py-5 text-center text-[11px] leading-5 text-slate-400 sm:px-6 lg:px-10">{BRANDING.organization} · {BRANDING.systemName}<span className="mx-1 hidden sm:inline">·</span><span className="block break-words sm:inline">{BRANDING.projectLead}</span></footer>
        </div>
      </div>
    </div>
  );
}
