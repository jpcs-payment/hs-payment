import type { PaymentMethod } from "../types";
import gcashLogo from "../../gcash.jpg";
import maribankLogo from "../../maribank.jpg";

export const paymentMethodLogos: Partial<Record<PaymentMethod, string>> = {
  GCash: gcashLogo,
  MariBank: maribankLogo,
};
