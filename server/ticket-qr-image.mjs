import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import QRCode from "qrcode";
import satori from "satori";

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
const nameTextTop = 29;
const ticketTextTop = 97;
const logoPath = join(process.cwd(), "jpcslogo", "cropped_circle_image.png");
const fontFiles = [
  [400, "geist-latin-400-normal.woff2"],
  [400, "geist-latin-ext-400-normal.woff2"],
  [400, "geist-vietnamese-400-normal.woff2"],
  [400, "geist-cyrillic-400-normal.woff2"],
  [400, "geist-cyrillic-ext-400-normal.woff2"],
  [600, "geist-latin-600-normal.woff2"],
  [600, "geist-latin-ext-600-normal.woff2"],
  [600, "geist-vietnamese-600-normal.woff2"],
  [600, "geist-cyrillic-600-normal.woff2"],
  [600, "geist-cyrillic-ext-600-normal.woff2"],
].map(([weight, fileName]) => ({
  name: "Geist",
  path: join(process.cwd(), "node_modules", "@fontsource", "geist", "files", fileName),
  style: "normal",
  weight,
}));
const logoBufferPromise = readFile(logoPath).then((buffer) => sharp(buffer).resize(logoSize, logoSize, { fit: "contain" }).png().toBuffer());
const fontsReadyPromise = Promise.all(fontFiles.map(async ({ name, path, style, weight }) => ({
  data: await readFile(path),
  name,
  style,
  weight,
})));

const nameFontSize = (name) => {
  if (name.length > 28) return 30;
  if (name.length > 22) return 36;
  if (name.length > 16) return 42;
  return 48;
};

const textLayer = async ({ text, fontSize, fontWeight, height, top }) => {
  const fonts = await fontsReadyPromise;
  const svg = await satori({
    type: "div",
    props: {
      children: text,
      style: {
        alignItems: "center",
        color: "#0B1F3A",
        display: "flex",
        fontFamily: "Geist",
        fontSize,
        fontWeight,
        height,
        justifyContent: "center",
        lineHeight: 1,
        overflow: "hidden",
        whiteSpace: "nowrap",
        width: canvasWidth,
      },
    },
  }, {
    height,
    fonts,
    width: canvasWidth,
  });
  if (!svg.includes("<path")) throw new Error("The ticket text could not be converted to glyph paths.");
  return { input: Buffer.from(svg), left: 0, top };
};

const createTextLayers = (name, ticketId) => {
  const displayName = String(name ?? "").trim().toUpperCase() || "ATTENDEE";
  const displayTicket = String(ticketId ?? "").trim() || "TICKET";
  return Promise.all([
    textLayer({ text: displayName, fontSize: nameFontSize(displayName), fontWeight: 600, height: 94, top: nameTextTop }),
    textLayer({ text: displayTicket, fontSize: 30, fontWeight: 400, height: 58, top: ticketTextTop }),
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
