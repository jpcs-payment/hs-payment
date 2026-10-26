import QRCode from "qrcode";

export const createQrDataUrl = (value: string) =>
  QRCode.toDataURL(value, {
    width: 260,
    margin: 1,
    errorCorrectionLevel: "H",
    color: {
      dark: "#0B1F3A",
      light: "#FFFFFF",
    },
  });
