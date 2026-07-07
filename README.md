# Saangri Advertising — Billboard CRM

Outdoor-media inventory & booking management for Saangri Advertising (Bikaner).
Manages unipoles, gantries, kiosks and hoardings: availability grid with hover
detail cards, multi-site **orders/quotations** for one client (rental + printing
+ mounting + add-ons), regular + loose/waitlist bookings, Ops monitoring photos
with in-app Start/Mid/End reminders, proper GST (CGST+SGST / IGST) invoicing,
printing-partner directory, payments/ledger, PPTX/Excel/PDF exports, and
role-based analytics.

## Key concepts
- **Order (quotation):** one client, many site line-items, plus order-level
  printing (partner · no. of prints · rate), mounting (30-day), add-ons,
  description and booking date. Save as a **Quotation** (downloadable PDF) or
  **Confirm** directly. One tax invoice per order.
- **GST:** intra-state orders split tax into CGST 9% + SGST 9%; inter-state use
  IGST 18%. Reports break down tax collected.
- **Monitoring reminders:** ticking Monitoring → Start / Mid / End creates in-app
  reminders on each phase's date (bell badge + Reminders page). Uploading the
  Ops photo for a phase auto-closes its reminder.
- **Payments:** record part-payments per order (Payments tab); balance due and
  client ledger update automatically.

## Stack
- **Backend:** Node.js + Express + Prisma + PostgreSQL
- **Frontend:** React + Vite + Tailwind + Recharts
- **Auth:** JWT, 5 roles (Sales, Manager, Ops, Finance, Super Admin)

## Data
Seeded from `Bikaner SAANGARI MASTER DATA.xlsx` — 171 sites across 4 zones
(170 unipoles + 1 hoarding), with location, size, coordinates and monthly rate.

## Running locally

Prerequisites: PostgreSQL running locally, Node 18+.

```bash
# 1. Backend
cd server
npm install
npx prisma db push          # create tables
npm run seed                # load users + 171 sites from master data
npm run dev                 # http://localhost:4000

# 2. Frontend (separate terminal)
cd client
npm install
npm run dev                 # http://localhost:5173
```

Open http://localhost:5173 and sign in with a demo account (see below).

### Demo accounts (password: `password123`)
| Role        | Email                 | Can do |
|-------------|-----------------------|--------|
| Super Admin | admin@saangri.com     | Everything |
| Manager     | manager@saangri.com   | Team bookings, exports, reports, site rates |
| Sales       | sales@saangri.com     | New bookings (own), quotes |
| Ops / Field | ops@saangri.com       | Upload geo-tagged monitoring photos |
| Finance     | finance@saangri.com   | Invoices, ledger, payments, reports |

## Key business rules (from the client's process flow)
- **Booking types:** *Regular* only allows available sites; *Loose* allows any
  site and parks conflicts as **WAITLIST** (manually released later).
- **Proof-of-display gate:** an invoice cannot be generated until at least one
  Ops monitoring photo is uploaded for the booking.
- **Invoice numbering:** separate GST (`GST/FY/nnnn`) and Non-GST (`NGST/FY/nnnn`)
  sequences, per financial year (Apr–Mar).
- **Site state machine:** AVAILABLE → TENTATIVE → BOOKED → (LIVE once photo'd).
- **Ledger:** each invoice debits the client; payments credit them.

## Structure
```
server/
  prisma/schema.prisma   # data model
  prisma/seed.js         # users + sites from master data
  prisma/sites.json      # generated from the Excel master data
  src/routes/            # auth, users, sites, clients, bookings, photos,
                         # invoices, exports (pptx/xlsx), reports
client/
  src/pages/             # Inventory, NewBooking, Bookings, Clients,
                         # Invoices, Reports, Users, Login
  src/components/         # Layout, shared UI
```

## Notes
- Monitoring photos are stored on disk under `server/uploads/`.
- `server/.env` holds `DATABASE_URL` and `JWT_SECRET` — change the secret for production.
- Roles map 1:1 to the Roles & Permissions matrix in the wireframe workbook.
