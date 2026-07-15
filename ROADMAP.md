# Saangri CRM — Roadmap v2

Feature set requested by the client (WhatsApp, Jul 2026), broken into shippable
phases. Each phase is self-contained: schema → API → UI → verify.

**Status: ✅ all phases 1–9 shipped and verified** (backend smoke test + Playwright
UI pass, zero console errors). Details per phase below.

---

## Phase 1 — Data model foundation

Everything below depends on these tables/columns, so they land first in one
`prisma db push`. All additions are nullable or defaulted, so existing rows
survive (no reseed).

| Change | Why |
|---|---|
| `model Category { id, name @unique, sortOrder, active }` | Client-managed booking categories |
| `Order.categoryId Int?` | Which category this order belongs to |
| `enum PhotoKind { GPS NORMAL NEWSPAPER }` | Three photos per monitoring day |
| `MonitoringPhoto.kind PhotoKind @default(NORMAL)` + `@@unique([bookingId, phase, kind])` | One photo per (line, phase, kind); re-upload replaces |
| `Payment.tdsApplicable / tdsPct / tdsAmount / netReceived` | TDS deducted at source |
| `Booking.displayNotes String?` | Free-text note carried onto the billing plan |
| `Booking.stoppedAt / stopReason` + `BookingStatus.STOPPED` | Immediate stop of a live display |
| `model SiteShift { bookingId, fromSiteId, toSiteId, reason, shiftedAt, byId }` | Audit trail for moving a booking to another site |

Also: `recomputeOrderTotals()` in `utils/pricing.js` so an order can be
re-priced from its **existing line subtotals** (needed after a stop or shift,
where dates change after the order was created).

---

## Phase 2 — Booking categories

Client wants to add categories themselves (institute, hospital, coaching,
events, …) rather than have them hard-coded.

- `GET /api/categories` (active by default, `?all=true` for admins)
- `POST` / `PATCH` / `DELETE` — Manager + Super Admin. Delete is a soft
  deactivate if any order references it.
- Seed: Institute, Hospital, Coaching, Events, Retail, Real Estate,
  Automobile, FMCG, Government, Political, Other.
- **UI:** `/categories` page (Manager only) to add/rename/deactivate.
  Category dropdown on the booking form; category chip on the order detail;
  revenue-by-category row in Reports.

---

## Phase 3 — Book straight from the inventory grid

- **Select mode** on the Inventory dashboard: a toggle turns tiles into
  checkboxes. Clicking tiles builds a selection (ring + ✓ badge). Without it,
  a click still opens the site detail modal.
- A sticky action bar appears at the bottom:
  `N sites selected → [Book] [Quotation] [Clear]`
- **Quotation button** in the toolbar next to *New Booking*, and a
  **Vacant only** filter so the quotation flow shows available sites plus any
  custom-picked ones.
- `/new-booking?siteIds=1,2,3&mode=quotation` seeds the line-items and makes
  *Save as Quotation* the primary action.
- Fixes a latent bug: the form only fetched AVAILABLE sites in REGULAR mode, so
  a pre-seeded booked site rendered as a blank row. Now it fetches all sites and
  filters the *picker* only.

---

## Phase 4 — Three photos per monitoring day

Each of Start / Mid / End needs a **GPS photo, a normal photo and a newspaper
photo** — 9 photos per site line.

- Upload takes `kind` alongside `phase`. Re-uploading the same
  (line, phase, kind) replaces the file on disk and the row.
- Order detail renders a **3 × 3 grid**: phases across, kinds down, with an
  empty dashed cell where a photo is missing.
- A phase reminder now auto-closes only when **every active line of the order
  has all three kinds** for that phase — not on the first photo. (Manual
  "mark done" still works.)

---

## Phase 5 — Loose bookings skip the proof-of-display gate

Loose bookings are 1–2 day displays with no monitoring cycle, so requiring a
photo before invoicing blocks them.

- The photo gate in `POST /api/invoices` applies only if the order has at least
  one **REGULAR** line. An all-LOOSE order invoices immediately.

---

## Phase 6 — Notification centre

A strip at the top of every page (so it's on the dashboard too) summarising
what needs attention, colour-coded by severity.

`GET /api/notifications` composes two sources into one feed:

| Source | Critical | Pending | Info |
|---|---|---|---|
| Open monitoring reminders | overdue | due today | due within 7 days |
| Orders with a balance due | >30 days old | >7 days old | newer |

Response: `{ counts: { critical, pending, info, total }, items: [...] }`.
Each item carries `orderId`, so clicking it opens that order.

**UI:** collapsed pill `🔴 2 · 🟡 3 · 🔵 5` that expands into a grouped list.
Polls every 60 s and drives the sidebar badge (replacing `/reminders/count`).

---

## Phase 7 — TDS on payment collection

Clients often deduct TDS at source, so the cash received is less than the
amount that settles against the invoice.

- On *Record payment*: **TDS applicable?** → rate (1 / 2 / 5 / 10 %).
- `tdsAmount = round(amount × pct / 100)`, `netReceived = amount − tdsAmount`.
- **`amount` (gross) is what reduces the balance due** — the TDS is remitted to
  the government on the client's behalf, so the order is settled for the full
  amount. `netReceived` is what actually hit the bank.
- Ledger credits the gross and names the TDS in the narration.
- Payment rows show gross, a `TDS 2%` chip, and net received.
- Reports gain a `TDS deducted` tile.

---

## Phase 8 — Line-item operations

Per site line, inside the order detail → Sites tab.

1. **Site shifting** — move the line to a different site (client's hoarding got
   blocked, permission revoked, etc.). Conflict-checks the target for the same
   dates, frees the old site if nothing else holds it, records a `SiteShift`
   row with the reason. Shift history renders on the line.
2. **Immediate stop** — end the display today: `endDate = today`, status
   `STOPPED`, site released to AVAILABLE, and the line + **whole order are
   re-priced** so billing reflects only the days actually displayed.
3. **Display notes** — free text per line, editable inline, printed under the
   line on both the **quotation PDF and the tax invoice PDF** (the billing
   plan).

Manager / Finance / Super Admin only.

---

## Phase 9 — Verify & document

- Backend smoke test through the whole flow (category → grid booking →
  9 photos → notifications → TDS payment → shift → stop → invoice).
- Playwright pass over the real UI, asserting zero console errors.
- Update `README.md` with the new concepts.

---

## Deliberately out of scope (for now)

- WhatsApp / email push for reminders — needs a provider account + credentials.
- Bulk Excel site importer.
- A standalone company-wide Payments page (payments live inside the order).
