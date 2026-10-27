import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./ui";

export function Pagination({
  page,
  pageCount,
  onPageChange,
  totalItems,
  pageSize,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  pageSize: number;
}) {
  const currentPage = Math.min(Math.max(page, 1), pageCount);
  const start = totalItems ? (currentPage - 1) * pageSize + 1 : 0;
  const end = totalItems ? Math.min(currentPage * pageSize, totalItems) : 0;

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-line px-5 py-4 sm:flex-row sm:px-6">
      <p className="text-[11px] font-semibold text-slate-500">
        Showing {start}-{end} of {totalItems}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Previous
        </Button>
        <span className="text-[11px] font-bold text-navy-800" aria-current="page">Page {currentPage} of {pageCount}</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= pageCount}
          aria-label="Next page"
        >
          Next <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
