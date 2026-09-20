# Inventory Management Portal

A self-contained IT inventory portal: buildings, employees, devices, security-compliance
checklists, reports, network diagrams (HLD/LLD) and an Excel/CSV importer.

**No dependencies to install.** It runs on Node.js alone — the database is a single
SQLite file created next to the app.

---

## 1. Run it

```bash
cd Inventory-Management-Portal
npm run seed      # optional: loads ~96 sample devices so you can look around
npm start
```

Open <http://localhost:3000>

| Login    | Password    | Can do                        |
|----------|-------------|-------------------------------|
| `admin`  | `admin@123` | Everything                    |
| `viewer` | `viewer@123`| View and export only          |

**Change both passwords on day one** — Users & Activity → Reset password.

Requires **Node.js 22.5 or newer** (the built-in SQLite engine). Check with `node -v`;
download from nodejs.org if needed. To use another port: `PORT=8080 npm start`.

To let others on the office LAN use it, run it on one machine and share
`http://<that-machine-ip>:3000`.

## 2. What is where

```
server.js            HTTP server + routing
lib/db.js            SQLite connection, schema bootstrap, audit log
lib/auth.js          login sessions, scrypt password hashing
lib/api.js           all REST endpoints
lib/reports.js       report definitions (add new reports here — one SQL block each)
lib/importer.js      Excel/CSV column matching, validation, commit
lib/sheet.js         dependency-free .xlsx reader and CSV reader/writer
db/schema.sql        database tables
db/seed.js           sample data generator
public/              the web UI (plain HTML/CSS/JS, no build step)
data/inventory.db    ← your live database (back this file up)
uploads/diagrams/    ← uploaded HLD/LLD files
samples/             sample Excel workbook for testing the importer
```

## 3. Modules

- **Dashboard** — device totals, donut charts by building (hover a slice for the
  device-type split) and by type, OS spread, status, compliance gauges,
  building × type matrix. Every tile and slice is clickable and filters the register.
- **Employees** — register, entry, modify/delete, devices-per-employee.
- **Devices** — register with filters and CSV export, entry, modify/delete,
  assign to user, and the compliance checklist (WiFi/Bluetooth/USB disabled,
  dual login, BIOS password, encryption, patching, and more).
- **Reports** — 17 built-in reports across Master, Security, Compliance, Allocation,
  Risk and Network groups; filter by building, download as CSV (opens in Excel), or print.
- **Network Diagrams** — upload HLD/LLD per building (PDF, Visio, image, drawio…),
  grouped by building, downloadable.
- **Import from Excel** — see below.
- **Master Data** — buildings, divisions, device types.
- **Users & Activity** — portal users and a full audit trail of every change.

## 4. Importing your real Excel file

Devices → *Import from Excel*. Pick **Devices** or **Employees**, drop your `.xlsx`
or `.csv`, and you get a preview showing exactly what will be added, what will be
updated and which rows have problems. Nothing is written until you press Import.

The importer is deliberately forgiving:

- Column headings are matched loosely — `Asset Tag`, `asset_tag`, `Asset No`,
  `Asset ID` all map to the same field. Extra columns are ignored and listed for you.
- Title/blank rows above the real header row are skipped automatically.
- `Y`, `Yes`, `TRUE`, `1` all mean yes for flag columns.
- A building name that does not exist yet is created for you.
- `Assigned To` matches an employee code, full name or email.
- Existing records are matched on **Asset Tag** (devices) or **Employee Code**
  (employees) — you choose whether they are updated or skipped.
- Compliance columns (WiFi Disabled, Bluetooth Disabled, Dual Login…) can sit in the
  same sheet as the devices; they go into the checklist automatically.

`samples/Sample-Inventory-Import.xlsx` shows the expected shape, and the
*Download column template* button gives you the full column list.

**Suggested order:** import employees first, then devices — that way the
`Assigned To` column can link straight to the right person.

## 5. Backup

Everything lives in two places: `data/inventory.db` and `uploads/`. Copy both
(with the app stopped, or at least when nobody is editing) and you have a full backup.

## 6. Extending it

- **A new report:** add one entry to `DEFS` in `lib/reports.js` — a title, a group,
  the columns and one SQL statement. It appears in the UI automatically.
- **A new device field:** add the column in `db/schema.sql`, add it to `DEV_FIELDS`
  in `lib/api.js`, to the form in `public/js/devices.js`, and (optionally) an alias
  list in `lib/importer.js` so the importer recognises it.
- **A new checklist item:** add the column to `checklists` in `db/schema.sql`,
  to `CHK_FIELDS` in `lib/api.js`, and to `CHECK_LABELS` in `public/js/devices.js`.

## 7. Moving to a bigger database later

The app talks to SQLite through a thin wrapper (`lib/db.js`) with plain SQL.
If the client later wants SQL Server / MySQL / PostgreSQL, that one file and the
`schema.sql` types are what change — the API and UI stay as they are. SQLite itself
handles a few hundred thousand rows and a small team comfortably.

## 8. Security notes for production

- Change the default passwords; create one account per person.
- Run it behind HTTPS (a reverse proxy such as nginx or IIS) if it leaves the LAN.
- `data/.session-secret` signs login cookies — keep it, don't commit it anywhere public.
- Every create/update/delete/import is written to the audit log.
