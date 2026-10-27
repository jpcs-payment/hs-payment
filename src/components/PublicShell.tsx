import type { ReactNode } from "react";
import { OrganizationLogo } from "./OrganizationLogo";
import { ThemeToggle } from "./ThemeToggle";
import { BRANDING } from "../lib/branding";

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-mist text-ink">
      <header className="border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex min-h-[78px] max-w-[1180px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <OrganizationLogo surface="light" />
          <ThemeToggle />
        </div>
      </header>
      <main className="px-4 py-6 sm:px-6 sm:py-10 lg:px-8">{children}</main>
      <footer className="border-t border-line bg-white px-4 py-6 text-center text-[11px] leading-5 text-slate-400 sm:px-6 lg:px-8"><p className="font-semibold">JPCS-LCC @ 2026</p><p className="mt-1 break-words text-[10px] font-medium">{BRANDING.projectLead}</p></footer>
    </div>
  );
}
