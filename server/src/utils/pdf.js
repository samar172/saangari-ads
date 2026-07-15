// Render the per-line annotations that belong on the billing plan: the display
// note the team wrote, and a flag when the display was stopped early.
// Returns the new y cursor.
function writeLineNotes(doc, line, x, y) {
  const notes = [];
  if (line.displayNotes) notes.push(line.displayNotes);
  if (line.status === 'STOPPED') {
    const on = line.stoppedAt ? new Date(line.stoppedAt).toLocaleDateString('en-IN') : '';
    notes.push(`Display stopped${on ? ` on ${on}` : ''}${line.stopReason ? ` — ${line.stopReason}` : ''}. Billed for ${line.days} day${line.days === 1 ? '' : 's'}.`);
  }
  if (notes.length === 0) return y;

  const width = 360;
  for (const note of notes) {
    // Standard PDF fonts are WinAnsi-encoded — arrows like ↳ render as garbage.
    const text = `» ${note}`;
    doc.font('Helvetica-Oblique').fontSize(7).fillColor('#666').text(text, x, y, { width });
    y += doc.heightOfString(text, { width }) + 2;
  }
  doc.font('Helvetica').fillColor('#333');
  return y;
}

module.exports = { writeLineNotes };
