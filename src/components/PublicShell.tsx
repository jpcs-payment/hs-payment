import type { ReactNode } from "react";
import { OrganizationLogo } from "./OrganizationLogo";
import { LogoMarquee } from "./LogoMarquee";
import { ThemeToggle } from "./ThemeToggle";
import { BRANDING } from "../lib/branding";
import { Card, Skeleton } from "./ui";
import { useApp } from "../context/AppContext";

export function PublicShell({ children }: { children: ReactNode }) {
  const { dataLoading } = useApp();
  return (
    <div className="flex min-h-screen min-w-0 flex-col overflow-x-hidden bg-mist text-ink">
      <header className="border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex min-h-[78px] max-w-[1180px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
           {dataLoading ? <Skeleton className="h-10 w-52" /> : <OrganizationLogo surface="light" />}
           {dataLoading ? <Skeleton className="h-9 w-9 rounded-xl" /> : <ThemeToggle />}
        </div>
      </header>
      {dataLoading ? <div className="border-y border-line bg-white px-4 py-3 sm:px-6"><div className="mx-auto flex max-w-[1180px] items-center gap-3"><Skeleton className="h-9 w-9 rounded-full" /><Skeleton className="h-9 flex-1" /><Skeleton className="h-9 w-9 rounded-full" /></div></div> : <><div className="lg:hidden"><LogoMarquee /></div><div className="hidden lg:block"><LogoMarquee /></div></>}
      <main className="flex-1 px-4 py-6 sm:px-6 sm:py-10 lg:px-8">{dataLoading ? <PublicShellSkeleton /> : children}</main>
      <footer className="border-t border-line bg-white px-4 py-6 text-center text-[11px] leading-5 text-slate-400 sm:px-6 lg:px-8">{dataLoading ? <div className="mx-auto max-w-xs space-y-2"><Skeleton className="mx-auto h-3 w-28" /><Skeleton className="mx-auto h-3 w-full" /><Skeleton className="mx-auto h-3 w-4/5" /></div> : <><p className="font-semibold">JPCS-LCC @ 2026</p><p className="mt-2 break-words text-[10px] font-medium">{BRANDING.credits[0]}</p><p className="break-words text-[10px] font-medium">{BRANDING.credits[1]}</p></>}</footer>
    </div>
  );
}

function PublicShellSkeleton() {
  return <div className="mx-auto w-full max-w-[1180px] space-y-6" role="status" aria-label="Loading public payment site"><div className="space-y-3"><Skeleton className="h-9 w-72" /><Skeleton className="h-4 w-full max-w-xl" /></div><div className="flex items-center gap-3"><Skeleton className="h-1.5 min-w-0 flex-1" /><Skeleton className="h-6 w-14 rounded-full" /></div><div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"><Card className="space-y-6 p-5 sm:p-7"><div className="flex items-center gap-3"><Skeleton className="h-10 w-10 shrink-0" /><Skeleton className="h-5 w-44" /></div><div className="grid gap-5 md:grid-cols-2"><Skeleton className="h-11 md:col-span-2" /><Skeleton className="h-11 md:col-span-2" /><Skeleton className="h-11" /><Skeleton className="h-11" /><Skeleton className="h-11" /><Skeleton className="h-11" /></div><div className="flex justify-end"><Skeleton className="h-12 w-28" /></div></Card><div className="hidden space-y-6 lg:block"><Card className="overflow-hidden"><Skeleton className="h-32 rounded-none" /><div className="space-y-5 p-5"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /></div></Card><Card className="space-y-5 p-5"><Skeleton className="h-10 w-40" /><Skeleton className="h-4 w-full" /></Card></div></div><span className="sr-only">Loading public payment site</span></div>;
}
