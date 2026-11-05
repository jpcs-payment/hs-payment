import QRCode from "qrcode";
import jpcsLogo from "../../jpcslogo/cropped_circle_image.png";

const canvasSize = 1024;
const qrSize = 760;
const qrLeft = Math.round((canvasSize - qrSize) / 2);
const qrTop = 218;
const logoSize = 154;
const logoBackdropSize = 178;
const logoLeft = Math.round((canvasSize - logoSize) / 2);
const logoTop = qrTop + Math.round(qrSize / 2) - Math.round(logoSize / 2) - 12;
const logoBackdropLeft = Math.round((canvasSize - logoBackdropSize) / 2);
const logoBackdropTop = qrTop + Math.round(qrSize / 2) - Math.round(logoBackdropSize / 2) - 12;

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

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error("The QR logo could not be loaded."));
  image.src = src;
});

const nameFontSize = (name: string) => name.length > 28 ? 30 : name.length > 22 ? 36 : name.length > 16 ? 42 : 48;

export const createBrandedQrDataUrl = async (value: string, name: string, ticketId: string) => {
  const displayName = name.trim();
  const displayTicket = ticketId.trim();
  const [qrDataUrl, logo] = await Promise.all([
    QRCode.toDataURL(value, {
      width: qrSize,
      margin: 4,
      errorCorrectionLevel: "H",
      color: { dark: "#0B1F3A", light: "#FFFFFF" },
    }),
    loadImage(jpcsLogo),
  ]);
  const qr = await loadImage(qrDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The QR canvas could not be created.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvasSize, canvasSize);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#0B1F3A";
  context.font = `600 ${nameFontSize(displayName)}px Arial, Helvetica, sans-serif`;
  context.fillText(displayName.toUpperCase() || "ATTENDEE", canvasSize / 2, 76);
  context.font = "400 30px Arial, Helvetica, sans-serif";
  context.fillText(displayTicket || "TICKET", canvasSize / 2, 126);
  context.imageSmoothingEnabled = false;
  context.drawImage(qr, qrLeft, qrTop, qrSize, qrSize);
  context.imageSmoothingEnabled = true;
  context.beginPath();
  context.arc(canvasSize / 2, logoBackdropTop + logoBackdropSize / 2, logoBackdropSize / 2 - 3, 0, Math.PI * 2);
  context.fillStyle = "#ffffff";
  context.fill();
  context.lineWidth = 5;
  context.strokeStyle = "#d9e2ef";
  context.stroke();
  context.drawImage(logo, logoLeft, logoTop, logoSize, logoSize);
  return canvas.toDataURL("image/png");
};
