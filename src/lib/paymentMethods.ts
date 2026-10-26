import type { PaymentMethod } from "../types";
import cashLogo from "../../cash.png";
import gcashLogo from "../../gcash.jpg";
import maribankLogo from "../../maribank.jpg";

export const paymentMethodLogos: Partial<Record<PaymentMethod, string>> = {
  Cash: cashLogo,
  GCash: gcashLogo,
  MariBank: maribankLogo,
};
