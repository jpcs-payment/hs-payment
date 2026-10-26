import type { LucideIcon } from "lucide-react";
import { SearchX } from "lucide-react";

export function EmptyState({ icon: Icon = SearchX, title, description }: { icon?: LucideIcon; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-slate-50/60 px-6 py-14 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-navy-700 shadow-sm ring-1 ring-line">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="text-sm font-bold text-navy-900">{title}</h3>
      <p className="mt-2 max-w-sm text-xs leading-5 text-slate-500">{description}</p>
    </div>
  );
}
