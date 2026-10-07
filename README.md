# Coral Auto Spa

Marketing site for Coral Auto Spa, a premium mobile auto detailing business.
Static front end served by a dependency-free Node server, built to run on Replit.

## Running it

```bash
npm start
```

Then open http://localhost:3000. Use `npm run dev` for auto-restart while editing.

## Running on Replit

1. Import this repository into a Replit Node.js Repl (or upload the folder).
2. Press **Run**. `.replit` already sets the run command, the `nodejs-20` module and
   maps internal port 3000 to external port 80.
3. Press **Deploy** and choose **Autoscale**. No build step and no dependencies,
   so the deploy is just `npm start`.

The server binds `0.0.0.0` and reads `process.env.PORT`, which is what Replit expects.

## Admin portal

`/admin` is the back office: job tracker, CRM, calendar, social media planner,
business directory, finances, inventory, tasks and settings. Same zero-dependency
stack as the site, so it deploys with it.

**Sign in.** Set `ADMIN_PASSWORD` in the environment (Replit: the Secrets tab)
and restart. Without it the server uses the development password `coral-admin`
and prints a warning on boot and a banner in the portal. Sessions are HttpOnly
cookies that last 30 days; ten wrong passwords from one IP locks login for
15 minutes.

**Where the data lives.** One JSON file, `data/db.json`, gitignored. Writes are
atomic (temp file + rename) and coalesced. On a host with an ephemeral
filesystem the file resets on redeploy, so use *Settings → Download backup*
before deploying and *Restore from file* after, or move `lib/db.js` to a real
database when the time comes. The API surface it exposes is small on purpose.

**Website bookings become leads.** `POST /api/booking` still appends to
`bookings.log`, and now also matches or creates a customer (by email or phone)
and creates a job in the **New lead** column. On boot the server imports any
lines in `bookings.log` it has not seen, so nothing from before the portal
existed is lost.

### Sections

| Section | What it does |
| --- | --- |
| Dashboard | Revenue this month vs last, jobs in the next 7 days, open leads, money owed, this week's schedule, tasks, planned posts, low stock, activity feed |
| Leads | Every new request with call / text / email links, photos, and one-click **Quote sent**, **Book it** (date, time, agreed price) or decline. Quotes awaiting the customer are listed underneath |
| Jobs | Pipeline board (drag and drop, or the arrows) through New → Quoted → Scheduled → In progress → Completed → Paid, plus a filterable list. Each job has a detail page, status steps, **Mark paid** (amount, method, date) and a printable invoice/receipt |
| Calendar | Month view of jobs, social posts and task due dates. Click a day to add any of them. Agenda of the next two weeks below |
| Customers | Lifetime value, job history, vehicles, tags, notes, follow-up tasks. Created automatically from bookings; renames flow through to their jobs |
| Tasks | Open / done, grouped by overdue, today, this week, later. Tasks can hang off a job or a customer and show on those pages too |
| Social media | Scheduled / Ideas / Posted, by platform, with content-pillar balance for the month. A job page can spawn a before-and-after post. **Copy caption** puts caption + hashtags on the clipboard |
| Directory | Suppliers, vendors, referral partners, dealerships, property managers, fleet accounts, with contact details, rating, referral terms and total spend |
| Finance | Revenue collected, expenses, profit and margin by month; six-month trend; unpaid jobs; payments by method; spend by category; expense log |
| Inventory | Stock levels with − / + buttons, reorder thresholds, supplier link, stock value. Low items float to the top and appear on the dashboard |
| Settings | Business profile (goes on invoices), team members (assignable on jobs and tasks), services and prices, add-ons, the drop-down lists, backup and restore |

### API

Everything under `/api/admin` needs the session cookie except `POST /login`.

```
POST   /api/admin/login            { password }
POST   /api/admin/logout
GET    /api/admin/me
GET    /api/admin/bootstrap        every collection + settings in one payload
GET    /api/admin/export           same, as a download
POST   /api/admin/import           replace all business data from a backup
GET|PUT /api/admin/settings
GET    /api/admin/uploads/:file    customer photos (not reachable publicly)
GET|POST        /api/admin/:collection
GET|PATCH|DELETE /api/admin/:collection/:id
POST   /api/admin/jobs/:id/status  { status }
```

Collections: `customers`, `jobs`, `directory`, `posts`, `expenses`, `inventory`,
`tasks`, and read-only `activity`.

### Code

```
lib/db.js               JSON store: list/get/insert/update/remove, settings,
                        activity log, snapshot/restore
lib/admin.js            sessions, login throttle, lead intake, the routes above
public/admin/index.html shell + icon sprite + login + modal
public/admin/admin.css  portal styles, shares the site's brand tokens
public/admin/admin.js   the app: one state object, hash router, a schema-driven
                        form builder (FIELDS) and one render function per section
```

To add a field to any record type, add it to `FIELDS` in `admin.js`; the
create/edit dialogs, validation and save are generated from that list.

## Layout

```
public/
  index.html            single page: hero, the detail, pricing, about,
                        process, gallery, guarantee, FAQ, booking, footer.
                        Opens with an inline SVG sprite that every icon
                        on the page references.
  assets/css/styles.css design tokens and all component styles
  assets/js/main.js     sticky header, sliding nav pill, mobile menu,
                        scroll reveal, FAQ accordion, three-step booking
                        wizard, photo attachments, booking submit
  assets/img/           brand badges and photography
server.js               static file server + POST /api/booking + /api/admin
lib/                    admin portal: JSON store and API (see above)
data/                   db.json for the portal (gitignored)
uploads/                customer-submitted photos (gitignored, served only to
                        signed-in admins)
scripts/
  process_assets.py     logo knockout + hero crops
  add_guarantee.py      guarantee badge
  add_packages.py       legacy package badges (no longer used on the site)
  add_stock.py          crops the licensed stock photography
  make_responsive.py    builds the -sm variants used by srcset
```

## Brand

Defined as custom properties at the top of `styles.css`.

| Token | Value | Use |
| --- | --- | --- |
| `--navy-950` / `--navy-900` | `#030a15` / `#061224` | Dark sections, header |
| `--cyan-500` / `--cyan-400` | `#21c4f0` / `#45d8ff` | Primary buttons, accents |
| `--sun-400` | `#ffb347` | Review stars |
| `--paper` | `#f5f8fb` | Light section background |

Type: **Archivo** 900 italic at 122% width for display headings, **Archivo** 800
italic at 112% for buttons so they match the headings, **Inter** for body copy,
**Caveat** for the handwritten marks.

Icons are one inline SVG sprite at the top of `index.html`. Every icon is a
`<use href="#i-name">` at a single 1.6 stroke weight, sized by the parent's
`font-size`. To add one, add a `<symbol>` to the sprite and reference it.

## Images

### Brand badges

`scripts/process_assets.py` handles the main logo and the hero crops.
`add_guarantee.py` and `add_packages.py` do the badges. All of them flood-fill
the white background inward from the edges only, so the white inside the
letterforms survives. Outputs are transparent WebP.

Badges: `logo`, `guarantee`, `pkg-gold`, `pkg-platinum`, `pkg-mvp`.

### Photography

The hero and the palm backdrop are your own generated images.

The four service-card photos and four of the gallery tiles are stock from
**Unsplash**, cropped by `scripts/add_stock.py`. The Unsplash License permits
free commercial use with no attribution required. The original downloads are
not in this repo; the script reads them from a scratch directory, so re-running
it needs the sources re-downloaded. The committed WebP files are what the site
serves.

If you would rather not rely on stock, replace these four files with your own
job photos at 900x675 and re-run `make_responsive.py`:

```
card-exterior.webp   card-interior.webp   card-full.webp   card-addons.webp
```

### Responsive variants

Every large image has a `-sm` companion built by `scripts/make_responsive.py`,
wired up through `srcset`/`sizes` in the markup. Widths are picked so a DPR-2
phone actually selects the small file: the browser needs roughly the CSS
display width times two, and a variant below that is ignored. A first-time
phone visitor pulls about 697KB of imagery instead of about 1.3MB.

**After regenerating any image, bump the `?v=` on the CSS and JS links and be
aware that images are served with a one-week cache.** Returning visitors keep
the old file until it expires. If that matters for a launch, rename the image
or add a query string to its `src`.

## The offer

The site sells **one** service:

**Full Interior & Exterior Detail — starting at $100.**

Exterior: complete hand wash and dry, wheels, tires and wheel wells, exterior
windows, exterior trim, tire dressing.

Interior: trash removed and blown out, deep vacuum of seats, carpets, mats and
trunk, dashboard, center console, cupholders, vents, door panels, door jambs,
interior windows, detailing brushes through the tight spots.

Explicitly outside the base price: shampooing, stain extraction and heavy steam
cleaning.

### Add-ons

| Add-on | Price |
| --- | --- |
| Seat shampoo & stain removal | $15 per seat |
| Carpet shampoo | Quoted |
| Heavy stain removal | Quoted |
| Excessive pet hair | Quoted |
| Excessive sand | Quoted |
| Odor treatment | Quoted |
| Extremely dirty vehicle | Quoted |

The page states throughout that the final price depends on vehicle size and
condition, and is confirmed with the customer before any work starts.

### Kept for later

The Gold / Platinum / MVP badge artwork is still in `assets/img/` (`pkg-*.webp`)
and `scripts/add_packages.py` still builds it, even though nothing references it
now. It is there for if the business ever does move to tiers. Nothing on the
live page links to it.

### Not offered

Paint correction, machine polishing and ceramic coating are deliberately absent,
and the FAQ says so plainly. Do not add them back until the equipment and the
intent are actually there. The stock photo of a detailer using a machine
polisher was removed for the same reason.

## Booking form

A three-step wizard, so the first thing anyone sees is three easy fields:

1. **Your Details** — name, phone, email
2. **Vehicle & Time** — vehicle, service address, preferred date and time
3. **Condition** — add-ons, seat count, free-text condition, photo upload

Each step validates before it will advance, with inline messages under the
offending field. Completed steps can be revisited from the numbered bar. The
final submit re-checks every step, not just the visible one.

`POST /api/booking` takes JSON, creates a lead in the admin portal (see above)
and appends a line to `bookings.log`.

### Photo uploads

Photos are read in the browser, sent as data URLs inside the JSON body, and
written to `uploads/` by the server under a name the server chooses. The client
filename is never trusted.

Limits, enforced on both sides: up to 5 files, 5MB each, JPG/PNG/WebP only, and
a 30MB cap on the whole request body.

`uploads/` sits outside `public/`, so photos are **not** reachable over HTTP,
and it is gitignored so customer photos never reach the repo. If you move the
site to a host with an ephemeral filesystem, uploads will not survive restarts —
send them somewhere durable at that point.

## Still to add

Nothing on the site is invented, but two things are simply missing:

- **Phone number and email.** The fabricated ones were removed. The booking
  form is currently the only way to make contact. `index.html` has a commented
  block in the booking section showing where to add real details, and the
  `#i-phone` / `#i-mail` symbols will need adding back to the sprite.
- **Social links.** Removed rather than left pointing at `#`. There is a comment
  in the footer showing how to restore them.

Claims the site does make, all of which need to stay true: locally owned,
insured, serving Southwest Florida, arrives with its own water and power,
confirms the price before starting, and inspects the vehicle with the customer
before leaving.

Customer reviews were removed entirely. Add them back only when they are real.

## Mobile

Checked at 375, 820 and 1440 px. What the build does for phones:

- Form controls are 16px so iOS Safari does not zoom the page on focus
- Hero height uses `dvh` where supported, so the shrinking browser chrome does
  not clip it
- Tap targets are at least 44px tall under `pointer: coarse`
- Hover lifts are disabled under `hover: none`, so nothing sticks after a tap
- The header respects `env(safe-area-inset-*)` on notched devices
- Responsive `srcset` as described above

## Cache headers

Images are served with a one-week cache. HTML, CSS and JS use `no-cache` so a
redeploy shows up immediately. CSS and JS links also carry a `?v=` query, so bump
that number when you change either file.
