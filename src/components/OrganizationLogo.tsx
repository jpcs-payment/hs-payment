import jpcsLogo from "../../jpcslogo/cropped_circle_image.png";
import { BRANDING } from "../lib/branding";

export function OrganizationLogo({ surface = "dark", compact = false }: { surface?: "dark" | "light"; compact?: boolean }) {
  const isDarkSurface = surface === "dark";
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-transparent">
        <img src={jpcsLogo} alt={`${BRANDING.organization} logo`} className="h-full w-full rounded-full object-contain" />
      </span>
      {!compact ? <span className="text-left"><span className={`block text-sm font-extrabold tracking-tight ${isDarkSurface ? "text-white" : "text-navy-900"}`}>{BRANDING.organization}</span><span className={`block text-[9px] font-semibold uppercase tracking-[0.16em] ${isDarkSurface ? "text-blue-100/55" : "text-slate-400"}`}>{BRANDING.systemName}</span></span> : null}
    </div>
  );
}
