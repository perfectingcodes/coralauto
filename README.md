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

## Layout

```
public/
  index.html            single page: hero, services, packages, about,
                        process, gallery, reviews, guarantee, FAQ,
                        booking, footer. Opens with an inline SVG sprite
                        that every icon on the page references.
  assets/css/styles.css design tokens and all component styles
  assets/js/main.js     sticky header, sliding nav pill, full-screen
                        mobile menu, scroll reveal, FAQ accordion,
                        package preselect, booking submit
  assets/img/           brand badges and photography
server.js               static file server + POST /api/booking
scripts/
  process_assets.py     logo knockout + hero crops
  add_guarantee.py      guarantee badge
  add_packages.py       Gold / Platinum / MVP badges
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

## Package pricing is placeholder

The three package cards in the Packages section carry invented prices and
durations:

| Package | Price shown | Duration shown |
| --- | --- | --- |
| Gold | $149 | About 1.5 hours |
| Platinum | $249 | About 3 hours |
| MVP | $399 | About 5 hours |

**Set these to your real rates before launch.** The same goes for what each
package includes, and for the four promises in the Guarantee section, which
commit you to a 48-hour callback, on-time arrival, insured staff and a handover
walkthrough. Confirm every one of those is something you actually offer.

Each package button carries `data-package`, which preselects the matching option
in the booking form. If you rename a package, update the button's `data-package`
value and the matching `<option>` together or the preselect stops working.

## Booking form

`POST /api/booking` validates name, phone, email and service, then appends a JSON
line to `bookings.log`. That file is gitignored because it holds customer contact
details, and on Replit it does not survive a redeploy.

Before taking real bookings, send submissions somewhere durable: an email API,
a Google Sheet, or a CRM webhook. The handler is at the bottom of `server.js`.

## Placeholder content to replace

- Phone `(555) 012-7278` and email `hello@coralautospa.com`, in `index.html`
  and in the JSON-LD block in `<head>`
- Social links in the footer, currently `href="#"`
- The three reviews, which came from the design mock
- Package prices, inclusions and durations (see above)
- The four guarantee promises (see above)
- Service descriptions

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
