import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { BarChart3, ChevronLeft, ChevronRight, Download, Menu, ReceiptText, ScanLine, Settings2, Tags, UsersRound, X } from "lucide-react";
import { useApp } from "../context/AppContext";
import { downloadPaymentCsv } from "../lib/export";
import { Avatar, Button } from "./ui";
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
];

const pageTitles: Array<[string, string]> = [
  ["/admin/payers", "Payers"],
  ["/admin/payments", "Payments"],
  ["/admin/offerings", "Payment types"],
  ["/admin/reports", "Reports"],
  ["/admin/attendance", "Attendance scanner"],
  ["/admin/methods", "Payment methods"],
];

export function AppShell() {
  const { data, logout, session } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const title = pageTitles.find(([path]) => location.pathname.startsWith(path))?.[1] ?? "Admin workspace";

  const handleLogout = () => {
    logout();
    navigate("/admin/login", { replace: true });
  };

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
          <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-line bg-white/90 px-4 backdrop-blur sm:px-6 lg:px-8">
            <div className="flex items-center gap-3"><button className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-navy-900 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu className="h-5 w-5" /></button><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Admin workspace</p><h1 className="mt-0.5 text-lg font-extrabold tracking-tight text-navy-900">{title}</h1></div></div>
             <div className="flex items-center gap-2 sm:gap-3"><Button className="inline-flex" variant="outline" size="sm" onClick={() => downloadPaymentCsv(data.payments)} disabled={!data.payments.length} aria-label="Export payment report as CSV"><Download className="h-3.5 w-3.5" /><span className="hidden sm:inline">Export CSV</span></Button><ThemeToggle /><span className="hidden text-right text-[10px] font-semibold leading-4 text-slate-400 lg:block">Supabase connected<br />Brevo email delivery</span><Avatar initials={(session?.adminName ?? "AD").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()} color="#163A63" size="sm" /></div>
          </header>
          <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10"><Outlet /></main>
          <footer className="border-t border-line px-4 py-5 text-center text-[11px] leading-5 text-slate-400 sm:px-6 lg:px-10">{BRANDING.organization} · {BRANDING.systemName}<span className="mx-1 hidden sm:inline">·</span><span className="block break-words sm:inline">{BRANDING.projectLead}</span></footer>
        </div>
      </div>
    </div>
  );
}
