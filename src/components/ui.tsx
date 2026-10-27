import { useEffect, useState, type ButtonHTMLAttributes, type ChangeEvent, type ReactNode } from "react";
import { Check, Loader2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { cn } from "../lib/utils";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "dark";
type ButtonSize = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children?: ReactNode;
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-navy-900 text-white shadow-sm hover:bg-navy-800 focus-visible:ring-navy-800",
  secondary: "bg-navy-50 text-navy-900 hover:bg-navy-100 focus-visible:ring-navy-700",
  outline: "border border-line bg-white text-ink hover:border-navy-300 hover:bg-navy-50 focus-visible:ring-navy-700",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-navy-900 focus-visible:ring-navy-700",
  danger: "bg-coral text-white shadow-sm hover:bg-red-700 focus-visible:ring-coral",
  dark: "bg-navy-950 text-white shadow-sm hover:bg-navy-800 focus-visible:ring-white",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-sm",
  icon: "h-10 w-10 p-0",
};

let dialogLockCount = 0;
let previousBodyOverflow = "";
let previousBodyPaddingRight = "";

const lockDialogScroll = () => {
  if (dialogLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    previousBodyPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
  }
  dialogLockCount += 1;
};

const unlockDialogScroll = () => {
  dialogLockCount = Math.max(0, dialogLockCount - 1);
  if (dialogLockCount === 0) {
    document.body.style.overflow = previousBodyOverflow;
    document.body.style.paddingRight = previousBodyPaddingRight;
  }
};

export function Button({ className, variant = "primary", size = "md", loading = false, disabled, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-2xl border border-line bg-white shadow-soft", className)}>{children}</section>;
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("block animate-pulse rounded-xl bg-slate-200/80", className)} />;
}

export function PageSkeleton({ label = "Loading" }: { label?: string }) {
  return <div className="mx-auto w-full max-w-[1400px] space-y-6" role="status" aria-label={label}><div className="flex items-end justify-between gap-4"><div className="w-full max-w-xl space-y-3"><Skeleton className="h-3 w-28" /><Skeleton className="h-9 w-64" /><Skeleton className="h-4 w-full max-w-md" /></div><Skeleton className="h-10 w-32" /></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div><Skeleton className="h-16 w-full" /><Skeleton className="h-80 w-full" /><span className="sr-only">{label}</span></div>;
}

export function AdminPageSkeleton({ page = "", label = "Loading admin page" }: { page?: string; label?: string }) {
  const pageKey = page.includes("/admin/payers")
    ? "payers"
    : page.includes("/admin/payments")
      ? "payments"
      : page.includes("/admin/offerings")
        ? "offerings"
        : page.includes("/admin/reports")
          ? "reports"
          : page.includes("/admin/attendance")
            ? "attendance"
            : page.includes("/admin/methods")
              ? "methods"
              : page.includes("/admin/archive")
                ? "archive"
                : "payments";

  const stats = (count: number) => <div className={`grid grid-cols-2 gap-2.5 sm:gap-4 ${count === 3 ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}>{Array.from({ length: count }, (_, index) => <Skeleton key={index} className="h-20 sm:h-24" />)}</div>;
  const rows = (count = 5) => <Card className="overflow-hidden"><Skeleton className="h-11 rounded-none" /><div className="divide-y divide-line p-4">{Array.from({ length: count }, (_, index) => <div key={index} className="flex items-center gap-3 py-3"><Skeleton className="h-9 w-9 shrink-0 rounded-xl" /><div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-3 w-1/3" /><Skeleton className="h-3 w-2/3" /></div><Skeleton className="h-8 w-20" /></div>)}</div></Card>;
  const header = (action = true) => <div className="flex items-end justify-between gap-4"><div className="space-y-3"><Skeleton className="h-8 w-40" /><Skeleton className="h-4 w-64 max-w-full" /></div>{action ? <Skeleton className="h-10 w-28" /> : null}</div>;

  return (
    <div className="mx-auto w-full max-w-[1450px] space-y-5" role="status" aria-label={label}>
      {pageKey === "payers" ? <>{header()} {stats(4)}<Card className="p-4"><div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]"><Skeleton className="h-11" /><Skeleton className="h-11" /></div></Card>{rows()}</> : null}
      {pageKey === "payments" ? <>{header()} {stats(4)}<Skeleton className="h-14 w-full rounded-2xl" /><Card className="p-4"><div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_150px]"><Skeleton className="h-11" /><Skeleton className="h-11" /><Skeleton className="h-11" /></div></Card><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-[270px] rounded-3xl" />)}</div></> : null}
      {pageKey === "offerings" ? <>{header()} {stats(3)}<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-[310px] rounded-3xl" />)}</div></> : null}
      {pageKey === "methods" ? <>{header()}<Card className="overflow-hidden"><Skeleton className="h-32 rounded-none" /><div className="p-4"><Skeleton className="h-8 w-2/3" /></div></Card><div className="grid gap-4 md:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-64" />)}</div></> : null}
      {pageKey === "reports" ? <>{header()} {stats(4)}<Skeleton className="h-64 w-full" /><Card className="p-4"><div className="grid gap-3 sm:grid-cols-3"><Skeleton className="h-11" /><Skeleton className="h-11" /><Skeleton className="h-11" /></div></Card><Skeleton className="h-96 w-full" /></> : null}
      {pageKey === "attendance" ? <>{header(false)} {stats(4)}<div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]"><Skeleton className="h-[430px]" /><div className="space-y-5"><Skeleton className="h-48" /><Skeleton className="h-48" /></div></div><Card className="p-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Skeleton className="h-11" /><Skeleton className="h-11" /><Skeleton className="h-11" /><Skeleton className="h-11" /><Skeleton className="h-11" /></div></Card><Skeleton className="h-80 w-full" /></> : null}
      {pageKey === "archive" ? <>{header(false)}<Skeleton className="h-56 w-full" /><Skeleton className="h-56 w-full" /></> : null}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide", className)}>{children}</span>;
}

export function Avatar({ initials, color = "#163A63", size = "md" }: { initials: string; color?: string; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-8 w-8 text-[10px]", md: "h-10 w-10 text-xs", lg: "h-14 w-14 text-sm" };
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-xl font-bold text-white", sizes[size])} style={{ backgroundColor: color }}>
      {initials}
    </span>
  );
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    lockDialogScroll();
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      unlockDialogScroll();
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" };

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain touch-pan-y" role="presentation">
      <button className="absolute inset-0 cursor-default animate-dialog-backdrop bg-navy-950/55 backdrop-blur-[2px]" aria-label="Close dialog" onClick={onClose} />
      <div className="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
        <div className={cn("relative z-10 my-auto max-h-[calc(100dvh-1rem)] w-full animate-dialog-panel overflow-y-auto overscroll-contain rounded-t-3xl bg-white shadow-float sm:max-h-[92dvh] sm:rounded-3xl", widths[size])} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
            <div>
              <h2 id="dialog-title" className="text-base font-bold text-navy-900">{title}</h2>
              {description ? <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p> : null}
            </div>
            <button className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-navy-900" onClick={onClose} aria-label="Close dialog">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-5 sm:p-6">{children}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  danger = false,
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title} size="sm">
      <div className="space-y-5">
        <p className="text-sm leading-6 text-slate-600">{description}</p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={danger ? "danger" : "primary"} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </Dialog>
  );
}

export function FieldLabel({ children, required = false }: { children: ReactNode; required?: boolean }) {
  return <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.08em] text-slate-500">{children}{required ? <span className="ml-1 text-coral">*</span> : null}</label>;
}

export function Input({ className, onChange, type, value, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  const isNumberInput = type === "number";
  const [showEmptyNumber, setShowEmptyNumber] = useState(false);

  useEffect(() => {
    const numericValue = Number(value);
    if (isNumberInput && showEmptyNumber && Number.isFinite(numericValue) && numericValue !== 0) setShowEmptyNumber(false);
  }, [isNumberInput, showEmptyNumber, value]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (isNumberInput) setShowEmptyNumber(event.target.value === "");
    onChange?.(event);
  };

  return <input className={cn("h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-navy-700 focus:ring-2 focus:ring-navy-700/10", className)} type={type} value={isNumberInput && showEmptyNumber ? "" : value} onChange={handleChange} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("min-h-28 w-full resize-y rounded-xl border border-line bg-white px-3.5 py-3 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-navy-700 focus:ring-2 focus:ring-navy-700/10", className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn("h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm text-ink outline-none transition focus:border-navy-700 focus:ring-2 focus:ring-navy-700/10", className)} {...props} />;
}

export function CheckIcon() {
  return <Check className="h-4 w-4" />;
}
