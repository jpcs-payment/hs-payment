import { readFile } from "node:fs/promises";
import sharp from "sharp";
import QRCode from "qrcode";

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
const logoPath = new URL("../jpcslogo/cropped_circle_image.png", import.meta.url);
const logoBufferPromise = readFile(logoPath).then((buffer) => sharp(buffer).resize(logoSize, logoSize, { fit: "contain" }).png().toBuffer());

const escapeXml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

const nameFontSize = (name) => {
  if (name.length > 28) return 30;
  if (name.length > 22) return 36;
  if (name.length > 16) return 42;
  return 48;
};

const textLayer = (name, ticketId) => {
  const displayName = String(name ?? "").trim().toUpperCase() || "ATTENDEE";
  const displayTicket = String(ticketId ?? "").trim() || "TICKET";
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${canvasSize}" height="${canvasSize}"><rect width="100%" height="100%" fill="#ffffff"/><text x="512" y="91" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${nameFontSize(displayName)}" font-weight="600" fill="#0B1F3A">${escapeXml(displayName)}</text><text x="512" y="140" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="400" fill="#0B1F3A">${escapeXml(displayTicket)}</text></svg>`);
};

const logoBackdrop = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${logoBackdropSize}" height="${logoBackdropSize}"><circle cx="${logoBackdropSize / 2}" cy="${logoBackdropSize / 2}" r="${logoBackdropSize / 2 - 3}" fill="#ffffff" stroke="#d9e2ef" stroke-width="5"/></svg>`);

export async function createTicketQrImage({ value, name, ticketId }) {
  const [qrBuffer, logoBuffer] = await Promise.all([
    QRCode.toBuffer(value, {
      width: qrSize,
      margin: 4,
      errorCorrectionLevel: "H",
      color: { dark: "#0B1F3A", light: "#FFFFFF" },
    }),
    logoBufferPromise,
  ]);

  return sharp(textLayer(name, ticketId))
    .composite([
      { input: qrBuffer, left: qrLeft, top: qrTop },
      { input: logoBackdrop, left: logoBackdropLeft, top: logoBackdropTop },
      { input: logoBuffer, left: logoLeft, top: logoTop },
    ])
    .png()
    .toBuffer();
}
