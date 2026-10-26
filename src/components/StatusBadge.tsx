import { Badge } from "./ui";
import type { PaymentStatus } from "../types";
import { statusTone } from "../lib/utils";

const styles = {
  warning: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
  success: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
  danger: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
};

export function StatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge className={styles[statusTone[status]]}>{status}</Badge>;
}

export function DemoBadge() {
  return <Badge className="bg-[#eaf0f8] text-navy-800 ring-1 ring-inset ring-[#cbd8e8]">JPCS - LCC</Badge>;
}
