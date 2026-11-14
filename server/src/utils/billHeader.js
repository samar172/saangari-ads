const fs = require('fs');
const path = require('path');

// The header image at the top of a bill. Each business can upload its own in
// Business Setup (Company.billHeaderUrl); without one, the GST business uses
// the Saangari letterhead banner and the Non-GST business keeps a blank band.
const DEFAULT_GST_HEADER = path.join(__dirname, '../assets/letterhead-header.jpg');

// Width/height from a PNG or JPEG's own header (enough to keep its aspect).
function imageInfo(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { ext: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      // SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC), carry the size.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { ext: 'jpeg', height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null; // other formats (e.g. WebP) can't be placed in Excel/PDF
}

// Returns { buffer, ext, width, height } or null.
async function loadBillHeader(company, isGst) {
  let buffer = null;
  try {
    if (company?.billHeaderUrl) {
      const r = await fetch(company.billHeaderUrl);
      if (r.ok) buffer = Buffer.from(await r.arrayBuffer());
    } else if (isGst) {
      buffer = fs.readFileSync(DEFAULT_GST_HEADER);
    }
  } catch (e) { buffer = null; }
  if (!buffer) return null;
  const info = imageInfo(buffer);
  return info ? { buffer, ...info } : null;
}

module.exports = { loadBillHeader, imageInfo };
