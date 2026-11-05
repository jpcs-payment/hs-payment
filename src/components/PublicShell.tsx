import type { ReactNode } from "react";
import { OrganizationLogo } from "./OrganizationLogo";
import { LogoMarquee } from "./LogoMarquee";
import { ThemeToggle } from "./ThemeToggle";
import { BRANDING } from "../lib/branding";

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen min-w-0 flex-col overflow-x-hidden bg-mist text-ink">
      <header className="border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex min-h-[78px] max-w-[1180px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <OrganizationLogo surface="light" />
          <ThemeToggle />
        </div>
      </header>
      <div className="lg:hidden">
        <LogoMarquee />
      </div>
      <div className="hidden lg:block">
        <LogoMarquee />
      </div>
      <main className="flex-1 px-4 py-6 sm:px-6 sm:py-10 lg:px-8">{children}</main>
      <footer className="border-t border-line bg-white px-4 py-6 text-center text-[11px] leading-5 text-slate-400 sm:px-6 lg:px-8"><p className="font-semibold">JPCS-LCC @ 2026</p><p className="mt-2 break-words text-[10px] font-medium">{BRANDING.credits[0]}</p><p className="break-words text-[10px] font-medium">{BRANDING.credits[1]}</p></footer>
    </div>
  );
}
