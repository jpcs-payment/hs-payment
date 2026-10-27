import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { Archive, BarChart3, ChevronLeft, ChevronRight, LogOut, MoreHorizontal, ReceiptText, RefreshCw, ScanLine, Search, Settings2, Tags, UsersRound } from "lucide-react";
import { useApp } from "../context/AppContext";
import { formatCurrency } from "../lib/utils";
import { AdminPageSkeleton, Avatar, Button, Input } from "./ui";
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
  { label: "Types", to: "/admin/offerings", icon: Tags },
  { label: "Reports", to: "/admin/reports", icon: BarChart3 },
  { label: "Attendance", to: "/admin/attendance", icon: ScanLine },
  { label: "Methods", to: "/admin/methods", icon: Settings2 },
  { label: "Archive", to: "/admin/archive", icon: Archive },
];

const mobilePrimaryNavigation = navigation.slice(0, 4);
const mobileMoreNavigation = navigation.slice(4);

const pageTitles: Array<[string, string]> = [
  ["/admin/payers", "Payers"],
  ["/admin/payments", "Payments"],
  ["/admin/offerings", "Types"],
  ["/admin/reports", "Reports"],
  ["/admin/attendance", "Attendance"],
  ["/admin/methods", "Methods"],
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const title = pageTitles.find(([path]) => location.pathname.startsWith(path))?.[1] ?? "Admin";
  const moreActive = mobileMoreNavigation.some((item) => location.pathname.startsWith(item.to));
  const pendingReviewCount = data.payments.filter((payment) => payment.status === "Pending" && payment.paymentState !== "Unpaid").length;

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);
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

  if (dataLoading) return <div className="min-h-screen bg-mist px-4 py-8 sm:px-6 lg:px-8"><AdminPageSkeleton page={location.pathname} label="Loading admin workspace" /></div>;
  if (dataError) return <div className="flex min-h-screen items-center justify-center bg-mist px-4"><div className="w-full max-w-md rounded-3xl border border-red-100 bg-white p-7 text-center shadow-soft"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-coral">Workspace unavailable</p><h1 className="mt-2 text-xl font-extrabold text-navy-900">The admin data could not load</h1><p className="mt-2 break-words text-sm leading-6 text-slate-500">{dataError}</p><div className="mt-5 flex justify-center gap-2"><Button variant="outline" onClick={() => void retryData()}>Retry</Button><Button variant="ghost" onClick={handleLogout}>Sign out</Button></div></div></div>;

  const renderSidebar = () => {
    const compact = collapsed;
    return (
      <aside className={`flex h-full ${compact ? "w-[76px]" : "w-[248px]"} flex-col overflow-hidden bg-navy-900 text-white`}>
        <div className={`flex h-[76px] shrink-0 items-center ${compact ? "justify-center" : "px-5"}`}>
          <button className="flex items-center gap-3" onClick={() => navigate("/admin/payments")} aria-label="Go to payments"><OrganizationLogo surface="dark" compact={compact} subtitle="non members payment" /></button>
        </div>
        <div className="px-3 pb-4">
          {!compact ? <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-blue-100/45">Operations</p> : null}
          <nav className="space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              return <NavLink key={item.to} to={item.to} className={({ isActive }) => `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? "bg-white text-navy-900 shadow-sm" : "text-blue-100/70 hover:bg-white/10 hover:text-white"} ${compact ? "justify-center" : ""}`} title={compact ? item.label : undefined}><Icon className="h-[18px] w-[18px] shrink-0" />{!compact ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}{item.to === "/admin/payments" && pendingReviewCount ? <span className={`${compact ? "absolute -right-1 -top-1" : "ml-auto"} flex h-5 min-w-5 items-center justify-center rounded-full bg-coral px-1.5 text-[10px] font-extrabold text-white`} aria-label={`${pendingReviewCount} payments awaiting review`}>{pendingReviewCount}</span> : null}</NavLink>;
            })}
          </nav>
        </div>
        <div className="mt-auto shrink-0 p-3">
          {!compact ? <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-2.5 py-2.5"><Avatar initials={(session?.adminName ?? "AD").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()} color="#245486" size="sm" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{session?.adminName ?? "JPCS Admin"}</p><p className="truncate text-[10px] text-blue-100/50">{session?.adminEmail ?? "Operations admin"}</p></div><button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-blue-100/60 transition hover:bg-white/10 hover:text-white" onClick={handleLogout} aria-label="Sign out" title="Sign out"><LogOut className="h-4 w-4" /></button></div> : <button className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-blue-100/60 transition hover:bg-white/10 hover:text-white" onClick={handleLogout} aria-label="Sign out" title="Sign out"><LogOut className="h-4 w-4" /></button>}
        </div>
      </aside>
    );
  };

  return (
    <div className="admin-shell min-h-screen overflow-x-hidden bg-mist text-ink">
      <div className="flex min-h-screen">
        <div className={`hidden shrink-0 xl:block ${collapsed ? "w-[76px]" : "w-[248px]"}`} />
        <div className="fixed inset-y-0 left-0 z-40 hidden xl:block">{renderSidebar()}</div>
        <div className="flex min-w-0 flex-1 flex-col">
           <header className="sticky top-0 z-30 flex min-h-[76px] flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-white/90 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
             <div className="flex min-w-0 items-center gap-2"><button className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-slate-500 transition hover:border-navy-300 hover:bg-navy-50 hover:text-navy-900 xl:flex" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}</button><div className="min-w-0"><h1 className="truncate text-lg font-extrabold tracking-tight text-navy-900">{title}</h1></div></div>
              <div className="relative order-3 basis-full xl:order-none xl:basis-auto"><div className="relative w-full xl:w-[360px]"><Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" /><Input className="pl-10 pr-3" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setSearchQuery(""); }} placeholder="Search payers, payments, types" aria-label="Search admin records" />{searchQuery.trim() ? <div className="absolute left-0 right-0 top-[3.25rem] z-50 overflow-hidden rounded-2xl border border-line bg-white p-1.5 shadow-float">{searchResults.length ? searchResults.map((result, index) => <button key={`${result.to}-${result.label}-${index}`} className="flex w-full min-w-0 items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-mist" onClick={() => { navigate(result.to); setSearchQuery(""); }}><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-700"><Search className="h-3.5 w-3.5" /></span><span className="min-w-0"><span className="block break-words text-xs font-bold text-navy-900">{result.label}</span><span className="mt-0.5 block break-words text-[10px] text-slate-500">{result.detail}</span></span></button>) : <p className="px-3 py-4 text-center text-xs text-slate-500">No matching records.</p>}</div> : null}</div></div>
               <div className="flex items-center gap-2 sm:gap-3"><ThemeToggle iconOnly /><button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-white/80 text-slate-600 transition hover:bg-slate-100 hover:text-navy-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-700" onClick={() => window.location.reload()} aria-label="Refresh site" title="Refresh site"><RefreshCw className="h-3.5 w-3.5" /></button><Avatar initials={(session?.adminName ?? "AD").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()} color="#163A63" size="sm" /></div>
            </header>
            <main className="flex-1 px-4 pt-6 pb-28 sm:px-6 sm:pt-8 sm:pb-28 xl:px-8 xl:pb-8"><Outlet /></main>
            <footer className="border-t border-line px-4 pt-5 pb-24 text-center text-[11px] leading-5 text-slate-400 sm:px-6 xl:px-8 xl:py-5"><p className="font-semibold">JPCS-LCC @ 2026</p><p className="mt-2 break-words text-[10px] font-medium">{BRANDING.credits[0]}</p><p className="break-words text-[10px] font-medium">{BRANDING.credits[1]}</p></footer>
            <nav className="fixed bottom-3 left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 xl:hidden" aria-label="Admin mobile navigation">
             {moreOpen ? <div className="absolute bottom-[calc(100%+0.75rem)] right-0 w-56 rounded-2xl border border-line bg-white p-2 shadow-float">
               <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">More admin tools</p>
               <div className="space-y-1">
                 {mobileMoreNavigation.map((item) => {
                   const Icon = item.icon;
                   return <NavLink key={item.to} to={item.to} onClick={() => setMoreOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold transition ${isActive ? "bg-navy-900 text-white" : "text-navy-800 hover:bg-navy-50"}`}><Icon className="h-4 w-4 shrink-0" />{item.label}</NavLink>;
                 })}
               </div>
             </div> : null}
             <div className="rounded-[1.75rem] border border-white/15 bg-navy-900/95 px-2 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-float backdrop-blur">
               <div className="grid grid-cols-5 gap-1">
                 {mobilePrimaryNavigation.map((item) => {
                   const Icon = item.icon;
                   return <NavLink key={item.to} to={item.to} className={({ isActive }) => `flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-center transition ${isActive ? "bg-white text-navy-900 shadow-sm" : "text-blue-100/70 hover:bg-white/10 hover:text-white"}`}><Icon className="h-4 w-4 shrink-0" /><span className="max-w-full break-words text-[9px] font-bold leading-3">{item.label}</span></NavLink>;
                 })}
                 <button type="button" className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-center transition ${moreActive || moreOpen ? "bg-white text-navy-900 shadow-sm" : "text-blue-100/70 hover:bg-white/10 hover:text-white"}`} onClick={() => setMoreOpen((value) => !value)} aria-expanded={moreOpen} aria-haspopup="menu"><MoreHorizontal className="h-4 w-4 shrink-0" /><span className="max-w-full break-words text-[9px] font-bold leading-3">More</span></button>
               </div>
             </div>
           </nav>
         </div>
      </div>
    </div>
  );
}
