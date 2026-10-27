import { Download, Search } from "lucide-react";
import { Button, Card, FieldLabel, Input, Select } from "./ui";

interface AttendanceFiltersProps {
  eventFilter: string;
  events: string[];
  query: string;
  dateFrom: string;
  dateTo: string;
  timeFrom: string;
  timeTo: string;
  resultCount: number;
  onEventChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onTimeFromChange: (value: string) => void;
  onTimeToChange: (value: string) => void;
  onExport: () => void;
  onExportPdf: () => void;
}

export function ResponsiveAttendanceFilters({
  eventFilter,
  events,
  query,
  dateFrom,
  dateTo,
  timeFrom,
  timeTo,
  resultCount,
  onEventChange,
  onQueryChange,
  onDateFromChange,
  onDateToChange,
  onTimeFromChange,
  onTimeToChange,
  onExport,
  onExportPdf,
}: AttendanceFiltersProps) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Attendance report</p>
          <h3 className="mt-1 text-base font-extrabold text-navy-900">Filters</h3>
          <p className="mt-1 text-xs text-slate-500">{resultCount} matching ticket{resultCount === 1 ? "" : "s"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="min-w-0 flex-1 sm:flex-none" variant="outline" size="sm" onClick={onExport} disabled={!resultCount}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
          <Button className="min-w-0 flex-1 sm:flex-none" variant="outline" size="sm" onClick={onExportPdf} disabled={!resultCount}>
            <Download className="h-3.5 w-3.5" /> Export PDF
          </Button>
        </div>
      </div>
      <div className="mt-4 grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-7">
        <div className="min-w-0 lg:col-span-2">
          <FieldLabel>Search</FieldLabel>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <Input className="min-w-0 pl-10" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Student, email, reference, ticket" />
          </div>
        </div>
        <div className="min-w-0">
          <FieldLabel>Type</FieldLabel>
          <Select className="min-w-0" value={eventFilter} onChange={(event) => onEventChange(event.target.value)}>
            {events.map((event) => <option key={event}>{event}</option>)}
          </Select>
        </div>
        <div className="min-w-0">
          <FieldLabel>Date from</FieldLabel>
          <Input className="min-w-0" type="date" value={dateFrom} onChange={(event) => onDateFromChange(event.target.value)} />
        </div>
        <div className="min-w-0">
          <FieldLabel>Date to</FieldLabel>
          <Input className="min-w-0" type="date" value={dateTo} onChange={(event) => onDateToChange(event.target.value)} />
        </div>
        <div className="min-w-0">
          <FieldLabel>Time from</FieldLabel>
          <Input className="min-w-0" type="time" value={timeFrom} onChange={(event) => onTimeFromChange(event.target.value)} />
        </div>
        <div className="min-w-0">
          <FieldLabel>Time to</FieldLabel>
          <Input className="min-w-0" type="time" value={timeTo} onChange={(event) => onTimeToChange(event.target.value)} />
        </div>
      </div>
    </Card>
  );
}
