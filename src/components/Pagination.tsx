import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./ui";

export function Pagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-line px-5 py-4 sm:flex-row sm:px-6">
      <p className="text-[11px] font-semibold text-slate-500">
        Page {page} of {pageCount}
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </Button>
        <span
          className="flex h-9 min-w-9 items-center justify-center rounded-xl bg-navy-900 px-3 text-xs font-bold text-white"
          aria-current="page"
        >
          {page}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
        >
          Next <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
