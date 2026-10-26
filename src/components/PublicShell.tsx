import type { ReactNode } from "react";
import { LockKeyhole } from "lucide-react";
import { OrganizationLogo } from "./OrganizationLogo";
import { ThemeToggle } from "./ThemeToggle";
import { BRANDING } from "../lib/branding";

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-mist text-ink">
      <header className="border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex min-h-[78px] max-w-[1180px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <OrganizationLogo surface="light" />
          <div className="flex items-center gap-3"><div className="hidden text-right text-[10px] font-semibold leading-4 text-slate-400 sm:block">Secure payment submission<br />No account required</div><ThemeToggle /></div>
        </div>
      </header>
      <main className="px-4 py-6 sm:px-6 sm:py-10 lg:px-8">{children}</main>
      <footer className="border-t border-line bg-white px-4 py-6 text-center text-[11px] leading-5 text-slate-400 sm:px-6 lg:px-8"><p>{BRANDING.organization} · {BRANDING.fullOrganization} · {BRANDING.systemName}</p><p className="mt-1 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1"><LockKeyhole className="h-3 w-3" />No account is required. Transaction updates are sent by email.</p><p className="mt-2 break-words text-[10px] font-semibold text-slate-400">{BRANDING.projectLead}</p></footer>
    </div>
  );
}
