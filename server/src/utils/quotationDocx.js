const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { financialYear } = require('./counters');

// Quotation letter as an editable Word file, built on the sales team's own
// letterhead document (server/src/assets/quotation-template.docx). The template
// is their real quotation.docx with the body emptied to {{BODY}} — header/footer
// banners, fonts, the bullet list style and the signature image all come from it
// unchanged, so the output matches the letters they send today. The paragraph
// XML below mirrors their latest letter (BKN/2026-27/PR/152) run for run.
const TEMPLATE = path.join(__dirname, '../assets/quotation-template.docx');

const LETTER = {
  signatory: 'Anant Pareek',
  signatoryTitle: 'Business Head',
  legalName: 'Saangari Ads Private Limited',
  phone: '+91-988-988-1751, 9468942994',
};

// Text area width in twips (page 12240 − left 567 − right 474), used for the
// right-aligned "Date:-" tab stop on the reference line.
const TEXT_WIDTH = 11199;

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const B = '<w:b/><w:bCs/>';
const run = (text, rPr = '') => `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
const para = (pPr, runs = '') => `<w:p><w:pPr>${pPr}</w:pPr>${runs}</w:p>`;
const TIGHT = '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>';
const empty = (rPr = B) => para(`${TIGHT}<w:rPr>${rPr}</w:rPr>`);

// Body paragraph with the leading space + tab indent the reference letters use.
const bodyPara = (text) => para(`${TIGHT}<w:jc w:val="both"/>`, `<w:r><w:t xml:space="preserve"> </w:t></w:r><w:r><w:tab/><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`);

// One bulleted T&C line (numId 3 is the bullet list defined in the template).
const bullet = (runs) => para(
  '<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="3"/></w:numPr><w:autoSpaceDE w:val="0"/><w:autoSpaceDN w:val="0"/><w:adjustRightInd w:val="0"/>' + TIGHT + '<w:jc w:val="both"/>',
  runs,
);

const titleCase = (s) => String(s || '').toLowerCase().replace(/(^|[\s_/-])(\w)/g, (m, sep, c) => (sep === '_' ? ' ' : sep) + c.toUpperCase());
const money = (n) => Math.round(Number(n) || 0).toLocaleString('en-IN');
const ddmmyyyy = (d) => {
  const x = new Date(d);
  return `${String(x.getDate()).padStart(2, '0')}-${String(x.getMonth() + 1).padStart(2, '0')}-${x.getFullYear()}`;
};
const pad2 = (n) => String(n).padStart(2, '0');

// How a line is quoted: regular lines at their per-month rent, loose (day)
// lines at the total for their run. `dur` is the label used to decide whether
// the whole table shares one duration.
function quoteLine(it) {
  const days = Math.max(1, it.days || 1);
  if (it.type === 'LOOSE' || days < 30) {
    return { dur: `${pad2(days)} Days`, perMonth: false, amount: it.subtotal };
  }
  const months = days / 30;
  const dur = Number.isInteger(months) ? `${pad2(months)} Month${months > 1 ? 's' : ''}` : `${days} Days`;
  return { dur, perMonth: true, amount: Math.round((it.subtotal * 30) / days) };
}

// Lines worth quoting: everything still in play, or — for a cancelled
// campaign — every line, so its letter can still be reprinted.
function quotedItems(order) {
  const live = order.items.filter((it) => !['CANCELLED', 'WAITLIST'].includes(it.status));
  return live.length ? live : order.items;
}

function rateTable(order, gst) {
  const items = quotedItems(order);
  const rows = items.map((it) => ({ it, q: quoteLine(it) }));
  const durations = [...new Set(rows.map((r) => r.q.dur))];
  const kinds = [...new Set(rows.map((r) => r.q.perMonth))];
  const shared = durations.length <= 1 && kinds.length <= 1;
  const perMonth = kinds[0] !== false;

  // One shared duration → the reference layout: # | Inventory | Cost Per Site
  // Per Month (with the duration under it when it isn't a single month).
  // Mixed durations get an explicit Duration column instead.
  let costHead;
  if (shared) {
    const d = durations[0];
    costHead = perMonth
      ? ['Cost Per Site Per Month', d && d !== '01 Month' ? `(${d})` : '']
      : ['Cost Per Site', d ? `(${d})` : ''];
  } else {
    costHead = ['Cost Per Site', ''];
  }
  const cols = shared ? [534, 4110, 1701] : [534, 3600, 1300, 1701];
  const width = cols.reduce((a, b) => a + b, 0);

  const cellRPr = `${B}<w:sz w:val="20"/><w:szCs w:val="18"/>`;
  const cell = (w, lines, extraRPr = '') => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>${
    (Array.isArray(lines) ? lines : [lines]).map((t) => para(`<w:jc w:val="center"/><w:rPr>${cellRPr}</w:rPr>`, t ? run(t, extraRPr + cellRPr) : '')).join('')
  }</w:tc>`;

  const head = shared
    ? [cell(cols[0], '#'), cell(cols[1], 'Inventory'), cell(cols[2], costHead)]
    : [cell(cols[0], '#'), cell(cols[1], 'Inventory'), cell(cols[2], 'Duration'), cell(cols[3], costHead)];

  const suffix = gst ? '+ GST' : '';
  const body = rows.map(({ it, q }, i) => {
    const price = `${money(q.amount)}${suffix}${!shared && q.perMonth ? ' / month' : ''}`;
    const loc = it.site?.location || it.site?.code || '';
    const calibri = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:color w:val="000000"/>';
    const cells = shared
      ? [cell(cols[0], String(i + 1)), cell(cols[1], loc, calibri), cell(cols[2], price)]
      : [cell(cols[0], String(i + 1)), cell(cols[1], loc, calibri), cell(cols[2], q.dur), cell(cols[3], price)];
    return `<w:tr><w:trPr><w:trHeight w:val="276"/></w:trPr>${cells.join('')}</w:tr>`;
  });

  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="${width}" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>`
    + `<w:tblGrid>${cols.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`
    + `<w:tr><w:trPr><w:trHeight w:val="247"/></w:trPr>${head.join('')}</w:tr>${body.join('')}</w:tbl>`;
}

// Printing & mounting per site, grouped by media type — "2000/- (Unipole) &
// 2500 (Gantry)". Uses the campaign's own charge when it has one, else each
// site's listed printing + mounting cost.
function printMountRates(order) {
  const items = quotedItems(order);
  const units = Number(order.noOfPrints) > 0 ? Number(order.noOfPrints) : items.length;
  const orderPerSite = !order.chargesPerSite && units > 0 ? Math.round(((order.printingTotal || 0) + (order.mountingCost || 0)) / units) : 0;
  const byType = new Map();
  for (const it of items) {
    const type = it.site?.type || 'SITE';
    const listed = Math.round((it.site?.printingCost || 0) + (it.site?.mountingCost || 0));
    // Per-site campaigns carry each site's own charge.
    const own = order.chargesPerSite ? Math.round((it.printCharge || 0) + (it.mountCharge || 0)) : 0;
    const amt = own || orderPerSite || listed;
    if (amt > 0 && !byType.has(type)) byType.set(type, amt);
  }
  return [...byType.entries()].map(([code, amt]) => ({ code, amt }));
}

function buildBody(order, { mediaLabels = {} } = {}) {
  const gst = order.taxCategory === 'GST';
  const fy = financialYear(new Date(order.bookingDate || order.createdAt || Date.now()));
  const ref = `BKN/${fy}/PR/${Number(String(order.orderNo).replace(/\D/g, '')) || order.id}`;
  const out = [];

  // S No. … Date:- (date pushed to the right margin with a right tab stop)
  out.push(para(
    `<w:tabs><w:tab w:val="right" w:pos="${TEXT_WIDTH}"/></w:tabs><w:spacing w:after="0"/><w:rPr>${B}</w:rPr>`,
    run(`S No. ${ref}`, B) + `<w:r><w:rPr>${B}</w:rPr><w:tab/></w:r>` + run(`Date:-  ${ddmmyyyy(order.bookingDate || order.createdAt || Date.now())}`, B),
  ));
  out.push(empty());

  // Addressee: contact person, firm, then the address — as in the letters.
  const c = order.client || {};
  const addr = [];
  if (c.company && c.name && c.company.trim().toLowerCase() !== c.name.trim().toLowerCase()) addr.push(c.name);
  addr.push(c.company || c.name);
  if (c.address) addr.push(...String(c.address).split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
  for (const line of addr.filter(Boolean)) out.push(para(`${TIGHT}<w:rPr>${B}</w:rPr>`, run(line, B)));
  out.push(empty());

  out.push(para(`${TIGHT}<w:rPr>${B}</w:rPr>`, run('Dear Sir,', B)));
  out.push(bodyPara(`We hope this letter finds you well. On behalf of ${LETTER.legalName}, we are excited to introduce ourselves as a fresh and dynamic player in the outdoor advertising industry.`));
  out.push(bodyPara(`As a professional and innovative company, we specialize in providing top-notch advertisement sites/unipoles that can elevate your brand's visibility and reach. Our team of creative experts is dedicated to transforming your brand with innovative ideas, cutting-edge designs, and strategic placements.`));
  out.push(bodyPara(`We understand the importance of effective advertising in today's competitive market. We would be delighted to provide you with a personalized quotation for our advertisement sites/unipoles. Please find comprehensive quote outlining our services and pricing.`));
  out.push(empty());

  out.push(rateTable(order, gst));

  const small = `${B}<w:sz w:val="16"/><w:szCs w:val="14"/>`;
  out.push(para(`${TIGHT}<w:ind w:left="7200" w:firstLine="720"/><w:rPr>${small}</w:rPr>`));
  if (gst) out.push(para(`${TIGHT}<w:ind w:left="7200" w:firstLine="720"/><w:rPr>${B}</w:rPr>`, run('*GST Applicable 18%', small)));

  // Terms and Conditions
  const tcFont = '<w:rFonts w:ascii="CIDFont+F2" w:hAnsi="CIDFont+F2" w:cs="CIDFont+F2"/><w:sz w:val="20"/>';
  out.push(para(`<w:autoSpaceDE w:val="0"/><w:autoSpaceDN w:val="0"/><w:adjustRightInd w:val="0"/>${TIGHT}<w:rPr>${tcFont}</w:rPr>`, run('Terms and Conditions:', tcFont)));

  const rates = printMountRates(order).map((r) => ({ amt: r.amt, type: mediaLabels[r.code] || titleCase(r.code) }));
  if (rates.length) {
    const head = rates.map((r, i) => (i === 0 ? `${r.amt}/- (${r.type})` : `${r.amt} (${r.type})`)).join(' & ');
    out.push(bullet(
      run(`Printing & Mounting Cost would be ${head} per site.`, B)
      + run(' In case if the Flex gets torn during the campaign by strom or hurricane, the reprinting and mounting cost will be borne by your company.'),
    ));
    out.push(bullet(run(`Design changes will be subject to additional cost, printing & Mounting (${rates.map((r) => r.amt).join('/')} Per Site), which will be borne by your company.`)));
  } else {
    out.push(bullet(run('Design changes will be subject to additional cost, which will be borne by your company.')));
  }
  out.push(bullet(run(`Payment terms: - ${order.paymentTerms === 'POSTPAID' ? 'Monthly basis.' : 'Advance basis.'}`)));
  // The business's own standing terms (Businesses → Terms & Conditions), one bullet per line.
  for (const t of String(order.company?.termsAndConditions || '').split(/\r?\n/).map((s) => s.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim()).filter(Boolean)) {
    out.push(bullet(run(t)));
  }
  out.push(para(`<w:pStyle w:val="ListParagraph"/><w:autoSpaceDE w:val="0"/><w:autoSpaceDN w:val="0"/><w:adjustRightInd w:val="0"/>${TIGHT}<w:jc w:val="both"/><w:rPr><w:sz w:val="12"/><w:szCs w:val="10"/></w:rPr>`));

  out.push(para(`${TIGHT}<w:jc w:val="both"/>`,
    `<w:r><w:t xml:space="preserve"> </w:t></w:r><w:r><w:tab/><w:t xml:space="preserve">${esc(`If you require any further information or would like to discuss how ${LETTER.legalName} can help amplify your brand's presence, please do not hesitate to contact us. Thank you for considering ${LETTER.legalName} as your advertising partner. We look forward to the opportunity to work with you and help your brand shine.`)}</w:t></w:r>`));
  out.push(para(`${TIGHT}<w:jc w:val="both"/>`));
  out.push(para(`${TIGHT}<w:jc w:val="both"/>`));

  // Best regards, with the signature floated behind the name (rId11 = signature).
  const sig = '<w:r><w:rPr><w:b/><w:bCs/><w:noProof/><w:lang w:eastAsia="en-IN"/></w:rPr><w:drawing><wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="251691520" behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>6367145</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>71120</wp:posOffset></wp:positionV><wp:extent cx="664845" cy="419735"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="44" name="Signature"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="signature.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId11" cstate="print"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm rot="889101"><a:off x="0" y="0"/><a:ext cx="664845" cy="419735"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>';
  const right = (rPr = B) => `${TIGHT}<w:jc w:val="right"/><w:rPr>${rPr}</w:rPr>`;
  out.push(para(right(`${B}<w:sz w:val="24"/><w:szCs w:val="22"/>`), sig + run('  Best regards,', B)));
  out.push(para(right(`${B}<w:sz w:val="24"/><w:szCs w:val="22"/>`)));
  out.push(para(right(), run(LETTER.signatory, B)));
  out.push(para(right(), run(LETTER.signatoryTitle, B)));
  out.push(para(right(), run(LETTER.legalName, B)));
  out.push(para(right(`${B}<w:sz w:val="20"/><w:szCs w:val="18"/>`), run(LETTER.phone, `${B}<w:sz w:val="20"/><w:szCs w:val="18"/>`)));
  out.push(empty(`${B}<w:sz w:val="20"/><w:szCs w:val="18"/>`));

  return { xml: out.join(''), ref };
}

// Returns { buffer, ref } — the filled .docx and its S No. reference.
async function buildQuotationDocx(order, opts = {}) {
  const zip = await JSZip.loadAsync(fs.readFileSync(TEMPLATE));
  const docXml = await zip.file('word/document.xml').async('string');
  const { xml, ref } = buildBody(order, opts);
  zip.file('word/document.xml', docXml.replace('{{BODY}}', () => xml));
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return { buffer, ref };
}

module.exports = { buildQuotationDocx };
