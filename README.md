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

At `/admin`. Four groups in the sidebar:

| Group | Pages |
| --- | --- |
| Overview | Dashboard, Calendar |
| Customers | Leads, Customers, Subscriptions |
| Work | Jobs, Tasks |
| Business | Finance, Inventory, Social media, Directory, Settings |

### Subscriptions and MRR

`/admin#/subscriptions` is the membership list, grouped by status, with monthly
recurring revenue across the top. MRR counts only memberships marked **Active**.

Status means exactly this:

| Status | Meaning |
| --- | --- |
| Requested | Came in from the website. Nothing is being collected. |
| Active | You are collecting the monthly payment, however you collect it. |
| Paused | Temporarily not billing, still a member. |
| Cancelled | Ended. |

The site still cannot charge a card, so "Active" is a statement about what you
are collecting, not something the software does. Marking a membership Active or
Paused tags the customer as a Member in the CRM and links the two records, so
the customer page and the subscription page never disagree.

### Crew

Team members live in Settings → Team. Once they exist, every job can be
assigned to one, and the assignee shows on the job board card, the jobs list,
the dashboard agenda and the calendar tooltip. The calendar has a crew filter,
including an "Unassigned" option for finding work nobody has picked up.

### Linking a job to an existing customer

The job form's Customer dropdown lists everyone in the CRM, so a job that never
came through the website can be attached to the right person. Choosing
"+ New customer" creates the record inline. The same applies to memberships.

### Access

**The portal currently has no password. Anyone who can reach the URL is in.**

That is deliberate, but know what it covers: the portal reads and writes
customer records including names, phone numbers, email addresses and home
addresses, serves customer-uploaded vehicle photos, and can export or overwrite
the entire database. On a deployed site all of that is public to anyone who
finds the link, and a search engine or a shared screenshot is enough.

Access is controlled by one environment variable:

| `ADMIN_PASSWORD` | Behaviour |
| --- | --- |
| not set | No login. The portal opens straight to the dashboard. |
| set | Password login, HttpOnly session cookie for 30 days, 10 failed attempts per IP per 15 minutes. |

To require a login again, set `ADMIN_PASSWORD` and restart. On Replit that is
the Secrets tab. Nothing else needs changing: the login screen, sessions and
throttling are all still in place and switch back on by themselves.

While the portal is open, the server prints a warning on boot and the portal
shows a standing banner at the top of every page. The sign-out button is hidden,
because there is no session to end.

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

### Job videos

Seven vertical clips from real jobs live in `public/assets/video/`. The
originals were HEVC `.MOV` straight off a phone (1080x1920, 66MB total).
HEVC in MP4 does not play reliably outside Safari, so they are re-encoded to
H.264 at 540x960, which every browser handles. Portrait is kept — that is how
they were shot.

`scripts/process_videos.sh` does the conversion and pulls a poster from about
45% into each clip, because the first frame of a phone video is usually
mid-motion. It uses `avconvert`, which ships with macOS, so there is no ffmpeg
dependency. Re-run it with the originals in `~/Downloads`, or pass another
directory as the first argument. Add a new clip by adding a line to the
`CLIPS` list in that script and a `video.<slug>` caption to both languages in
`lib/i18n.js`.

Nothing downloads until someone taps a clip. The page loads only the posters
(344KB for all seven); the video itself is fetched on the tap, one at a time,
and tapping the playing clip stops it. That matters because the clips total
35MB and most visitors will watch none of them.

The server serves video with byte-range support (`Accept-Ranges`, 206
responses, suffix ranges and 416 for unsatisfiable ones). Without it a browser
cannot seek, and some refuse to start playback at all.

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

## What the site sells

One detailing package, two ways to book it.

| | Price |
| --- | --- |
| **Monthly membership** | **$100/month** — one full interior & exterior detail each month, one enrolled vehicle |
| One-time, inside and out | From $120 |
| Interior only | From $80 |
| Exterior only | From $65 |

Booking the two halves separately comes to $145, so the $120 combo saves $25.
A member saves $20 a visit against the $120 starting price, and member pricing
applies from the first visit — nobody pays $120 before enrolling.

All four numbers live in **`lib/pricing.js`** and nowhere else. The page, the
booking form, the dictionary and the admin catalogue all read from it, so
changing a price is a one-line edit.

### Included in every detail

Exterior: hand wash and dry, wheels, tires, wheel wells, exterior windows,
trim, tire dressing, and a **spray-wax finish**.

Interior: trash out, blown through, deep vacuum of seats, carpets, mats and
trunk, dashboard, console, cupholders, vents, door panels, door jambs,
interior glass, detailing brushes through the tight spots.

### Deliberately NOT included

Seat shampooing, carpet extraction and stain-removal treatments are add-ons.
The site says so three times: in the detail section, in the add-on list and in
its own FAQ entry. "Deep vacuum" is never allowed to read as "shampoo".

Spray wax is described as a spray-wax finish. It is not polishing, paint
correction or a ceramic coating, and the FAQ says plainly that those are not
offered.

Clay bar is an add-on, quoted. Its copy says it lifts bonded contaminants so
the paint feels smoother, that the spray wax follows it, and that it is not
machine polishing and will not remove scratches or every water spot.

## Booking, membership and reminders

### What actually happens when someone books

Everything that arrives from the site is a **request**, not a confirmed
appointment. `lib/booking.js` records it with `status: "requested"`, and it
stays that way until someone confirms it in the admin portal. That is the
point: a preferred time has to be checked against the real calendar before it
becomes a booking.

The time dropdown only ever offers genuinely open slots. `lib/scheduling.js`
works them out from the business hours in settings, minus existing
appointments, minus anything less than an hour away. Confirmed work always
blocks a slot; an unconfirmed request holds its slot for 48 hours so two people
cannot ask for the same time, then releases it so an abandoned request cannot
wall off a slot forever.

Confirming is a real action, not a status edit:

```
POST /api/admin/appointments/:id/confirm      { date?, time?, force? }
POST /api/admin/appointments/:id/reschedule   { date, time }
POST /api/admin/appointments/:id/cancel       { reason? }
GET  /api/admin/appointments/:id/reminders
```

Confirm refuses a slot that clashes with another confirmed appointment unless
you pass `force`. Confirming is also what schedules the reminders.

### MEMBERSHIP STATUS — read this before launch

**The site cannot currently take a recurring payment.** No payment provider is
connected, and no card details are collected anywhere on this site.

What the membership flow does today:

1. Shows the $100/month offer, the terms, and a required agreement checkbox.
2. Records a membership with `status: "requested"` and
   `billingStatus: "not_set_up"`, with a timestamp of when they agreed and the
   price they agreed to.
3. Tells the customer, in their language, that we will confirm the first visit
   and set up billing **before anything is charged**.

It never shows a successful subscription, because there isn't one. The customer
record stays `isMember: false` until billing genuinely exists.

To make it real you need a payment provider — Stripe Checkout in subscription
mode is the natural fit, since card details go to Stripe and never touch this
server. When that is wired up, two rules from the brief have to be honoured in
code:

- **Never charge twice for the same visit.** The join page has an "I've already
  paid for today's detail" checkbox, stored as `alreadyPaidToday`. When it is
  set, the first billing date must be a month out, not today.
- **Reuse a saved card only after they agree to recurring billing.** The
  agreement timestamp is already recorded; do not create a subscription without
  one.

### In-person signup

`/join` (`/unirse` works too) is a short, mobile-first page for signing someone
up while you are standing with them. `/join?qr=1` shows a QR code pointing at
`/join` for them to scan — generate it on your phone, let them finish on theirs.

The QR encoder is `lib/qr.js`, written from the ISO spec with no dependencies.
`node scripts/qr_verify.js --page` builds a self-test page that decodes its own
output; the encoder was verified by decoding, not by eye.

### Text reminders

Three per confirmed appointment, in the customer's language:

| | When |
| --- | --- |
| First | 7 days before, same time of day |
| Second | 2 days before, same time of day |
| Third | 3 hours before, but never earlier than 7:30am |

A 9am appointment gets its last reminder at 7:30am, not 6am.

The week and two-day reminders use calendar arithmetic, not "minus 7×24 hours".
Subtracting fixed milliseconds across a daylight-saving change drags the
reminder an hour off, so a 10am appointment would get its week-before text at
9am. `scripts/` has no test runner, but the DST cases are worth re-checking by
hand if you touch `lib/scheduling.js`.

Reminders are rows in the database with a UTC fire time, so a restart or
redeploy does not lose them. A ticker checks every minute. Rescheduling an
appointment cancels its pending reminders and rebuilds them; cancelling an
appointment cancels them outright. Anything more than six hours late is dropped
rather than sent.

**Sending is not connected.** `lib/sms.js` talks to Twilio over plain HTTPS and
needs three environment variables:

```
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_FROM          your sending number, e.g. +12395550142
```

Without all three, reminders are still scheduled and queued but recorded with
status `simulated` — never `sent`. The server says so on boot. Note that
business texting to US numbers also needs A2P 10DLC registration through
Twilio before messages will deliver reliably.

Customers opt in during booking; the checkbox is on by default and the hint
mentions message rates and STOP. No opt-in means no reminders get scheduled at
all.

## English and Spanish

A flag switch sits in the top corner on every screen size, and on `/join`.

Both dictionaries are injected into the page by the server, so switching is
instant and there is no flash of the wrong language. The choice is remembered
in `localStorage` and mirrored into a cookie, so the server renders the right
`<html lang>` on the next visit. `?lang=es` on any URL forces a language, which
is useful for a link you hand to a customer.

All copy lives in **`lib/i18n.js`** — 274 keys, English and Spanish in strict
parity. Prices are never written into the strings; they come through as
`{{combo}}`, `{{member}}` and so on, interpolated from `lib/pricing.js`. That is
why English and Spanish cannot disagree about a price.

The same dictionary writes the SMS reminders, so a Spanish-speaking customer
gets Spanish texts.

To add a string: add the key to both `en` and `es`, then put
`data-i18n="your.key"` on the element. Use `data-i18n-html` only for our own
copy containing markup, and `data-i18n-attr="placeholder:your.key"` for
attributes.

## Still to add

### Your contact details

There is still no phone number, email or Instagram handle on the site. These
are not hard-coded anywhere — set them in the admin portal under settings
(`business.phone`, `business.smsNumber`, `business.email`,
`business.instagram`) and the call, text and Instagram buttons appear by
themselves: in the header menu, in the booking section, in the footer, and as a
sticky call/text bar on phones. Until then every one of those stays hidden
rather than linking nowhere.

The sticky mobile bar and the "More on Instagram" button are already built and
waiting on that one setting.

### Your own photos

The brief asked for real customer work: matching before-and-after pairs,
Instagram video, strong interior results as well as exterior shine. The gallery
still shows the stock and generated photography, because no customer photos
exist in the repo yet.

The markup is ready for them — `#galleryGrid` is populated from the `gallery`
collection when it has rows, and falls back to the current stills when it does
not. Dropping in real before/after sets is a data change, not a code change.

### Connected services

| | Status |
| --- | --- |
| Recurring payments | Not connected. Membership runs as a request flow. |
| Text reminders | Scheduled and queued, not sent. Needs Twilio credentials. |
| A2P 10DLC registration | Required before business SMS delivers in the US. |

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
