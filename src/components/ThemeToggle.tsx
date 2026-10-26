import { Moon, Sun } from "lucide-react";
import { cn } from "../lib/utils";
import { useTheme } from "../context/ThemeContext";

export function ThemeToggle({ surface = "light", className }: { surface?: "light" | "dark"; className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-700",
        surface === "dark" ? "border-white/15 bg-white/10 text-blue-100 hover:bg-white/15 hover:text-white" : "border-line bg-white/80 text-slate-600 hover:bg-slate-100 hover:text-navy-900",
        className,
      )}
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">{isDark ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
