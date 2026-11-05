import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import QRCode from "qrcode";

const canvasWidth = 900;
const canvasHeight = 1000;
const qrSize = 760;
const qrLeft = Math.round((canvasWidth - qrSize) / 2);
const qrTop = 218;
const logoSize = 154;
const logoBackdropSize = 178;
const logoLeft = Math.round((canvasWidth - logoSize) / 2);
const logoTop = qrTop + Math.round(qrSize / 2) - Math.round(logoSize / 2) - 12;
const logoBackdropLeft = Math.round((canvasWidth - logoBackdropSize) / 2);
const logoBackdropTop = qrTop + Math.round(qrSize / 2) - Math.round(logoBackdropSize / 2) - 12;
const logoPath = new URL("../jpcslogo/cropped_circle_image.png", import.meta.url);
const fontPath = fileURLToPath(new URL("../node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2", import.meta.url));
const logoBufferPromise = readFile(logoPath).then((buffer) => sharp(buffer).resize(logoSize, logoSize, { fit: "contain" }).png().toBuffer());
const fontReadyPromise = readFile(fontPath);

const escapePango = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const nameFontSize = (name) => {
  if (name.length > 28) return 30;
  if (name.length > 22) return 36;
  if (name.length > 16) return 42;
  return 48;
};

const textLayer = async ({ text, font, height, top }) => {
  await fontReadyPromise;
  const buffer = await sharp({
    text: {
      text: `<span foreground="#0B1F3A">${escapePango(text)}</span>`,
      font,
      fontfile: fontPath,
      width: canvasWidth - 32,
      height,
      align: "centre",
      rgba: true,
      wrap: "none",
    },
  }).png().toBuffer();
  const { width = canvasWidth } = await sharp(buffer).metadata();
  return { input: buffer, left: Math.max(0, Math.round((canvasWidth - width) / 2)), top };
};

const createTextLayers = (name, ticketId) => {
  const displayName = String(name ?? "").trim().toUpperCase() || "ATTENDEE";
  const displayTicket = String(ticketId ?? "").trim() || "TICKET";
  return Promise.all([
    textLayer({ text: displayName, font: `Geist Variable SemiBold ${nameFontSize(displayName)}`, height: 94, top: 16 }),
    textLayer({ text: displayTicket, font: "Geist Variable Medium 30", height: 58, top: 106 }),
  ]);
};

const logoBackdrop = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${logoBackdropSize}" height="${logoBackdropSize}"><circle cx="${logoBackdropSize / 2}" cy="${logoBackdropSize / 2}" r="${logoBackdropSize / 2 - 3}" fill="#ffffff" stroke="#d9e2ef" stroke-width="5"/></svg>`);

export async function createTicketQrImage({ value, name, ticketId }) {
  const [qrBuffer, logoBuffer, [nameLayer, ticketLayer]] = await Promise.all([
    QRCode.toBuffer(value, {
      width: qrSize,
      margin: 4,
      errorCorrectionLevel: "H",
      color: { dark: "#0B1F3A", light: "#FFFFFF" },
    }),
    logoBufferPromise,
    createTextLayers(name, ticketId),
  ]);

  return sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([
      nameLayer,
      ticketLayer,
      { input: qrBuffer, left: qrLeft, top: qrTop },
      { input: logoBackdrop, left: logoBackdropLeft, top: logoBackdropTop },
      { input: logoBuffer, left: logoLeft, top: logoTop },
    ])
    .png()
    .toBuffer();
}
