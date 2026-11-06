import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import sharp from "sharp";
import {
  BinaryBitmap,
  HybridBinarizer,
  QRCodeReader,
  RGBLuminanceSource,
} from "@zxing/library";
import { createTicketAttachments } from "../server/email-core.mjs";

const attendeeName = "Mauhay, Nicko Andrei L";
const ticketId = "TKT-26AEA73A34";
const ticketQrValue = `JPCS-LCC-TICKET:${ticketId}`;

const findInkBounds = async (buffer, region) => {
  const { data, info } = await sharp(buffer).extract(region).raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let maxX = -1;
  let minY = info.height;
  let maxY = -1;
  let inkPixels = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const index = (y * info.width + x) * info.channels;
      if (data[index] >= 120 || data[index + 1] >= 140 || data[index + 2] >= 170) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      inkPixels += 1;
    }
  }
  return {
    height: maxY - minY + 1,
    inkPixels,
    width: maxX - minX + 1,
  };
};

const decodeQr = async (buffer) => {
  const { data, info } = await sharp(buffer).greyscale().raw().toBuffer({ resolveWithObject: true });
  const source = new RGBLuminanceSource(new Uint8ClampedArray(data), info.width, info.height);
  return new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(source))).getText();
};

test("generates a readable PNG attachment with a scannable QR ticket", async () => {
  const attachments = await createTicketAttachments({
    attendees: [{
      id: "attendee-1",
      name: attendeeName,
      position: 1,
      ticketId,
      ticketQrValue,
    }],
    generateQr: true,
  });

  assert.equal(attachments?.length, 1);
  assert.equal(attachments[0].name, "mauhay-nicko-andrei-l.png");

  const buffer = Buffer.from(attachments[0].content, "base64");
  const metadata = await sharp(buffer).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 900);
  assert.equal(metadata.height, 1000);
  assert.equal(metadata.channels, 4);
  assert.equal(metadata.isProgressive, false);

  const nameBounds = await findInkBounds(buffer, { left: 0, top: 29, width: 900, height: 70 });
  const ticketBounds = await findInkBounds(buffer, { left: 0, top: 97, width: 900, height: 58 });
  assert.ok(nameBounds.inkPixels > 1000, "attendee name has no rendered ink");
  assert.ok(nameBounds.width > 400 && nameBounds.height > 20, "attendee name did not render as readable text");
  assert.ok(ticketBounds.inkPixels > 300, "ticket number has no rendered ink");
  assert.ok(ticketBounds.width > 150 && ticketBounds.height > 10, "ticket number did not render as readable text");
  assert.equal(await decodeQr(buffer), ticketQrValue);

  const outputPath = process.env.TICKET_TEST_OUTPUT ?? join(tmpdir(), `jpcs-ticket-${ticketId}.png`);
  await writeFile(outputPath, buffer);
  console.log(`Generated attachment: ${outputPath}`);
});
