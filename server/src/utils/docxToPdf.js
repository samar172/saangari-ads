// Convert a .docx buffer to PDF with LibreOffice (headless), so the quotation
// PDF is the exact Word letter — letterhead, table, T&C and signature.
// Needs `soffice` on the PATH (apt: libreoffice-writer). Throws if missing.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const CANDIDATES = [process.env.SOFFICE_PATH, 'soffice', '/usr/bin/soffice', '/opt/homebrew/bin/soffice', '/Applications/LibreOffice.app/Contents/MacOS/soffice'].filter(Boolean);

function run(bin, args, timeout) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout }, (err, stdout, stderr) => (err ? reject(Object.assign(err, { stderr })) : resolve(stdout)));
  });
}

// One conversion at a time — LibreOffice dislikes parallel runs on one profile.
let queue = Promise.resolve();

async function convertOnce(buffer) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'q2pdf-'));
  const src = path.join(dir, 'quotation.docx');
  fs.writeFileSync(src, buffer);
  // Private profile dir so it never collides with a desktop LibreOffice.
  const profile = `-env:UserInstallation=file://${path.join(dir, 'profile')}`;
  try {
    let lastErr;
    for (const bin of CANDIDATES) {
      try {
        await run(bin, [profile, '--headless', '--convert-to', 'pdf', '--outdir', dir, src], 60000);
        const out = path.join(dir, 'quotation.pdf');
        if (fs.existsSync(out)) return fs.readFileSync(out);
      } catch (e) { lastErr = e; if (e.code !== 'ENOENT') break; }
    }
    throw lastErr || new Error('PDF conversion failed');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function docxToPdf(buffer) {
  const job = queue.then(() => convertOnce(buffer));
  queue = job.catch(() => {});
  return job;
}

module.exports = { docxToPdf };
