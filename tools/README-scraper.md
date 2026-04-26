# Google Bad Reviews Scraper (Simple)

This scraper opens a Google Maps place URL, tries to sort reviews by lowest rating, scrolls, and saves bad reviews to JSON.

## 1) Install

```bash
npm install
npx playwright install chromium
```

## 2) Run

```bash
npm run scrape:bad-reviews -- --url="https://www.google.com/maps/place/..."
```

Optional flags:

- `--max-rating=2` (default: `2`)
- `--limit=50` (default: `50`)
- `--out=bad-reviews.json` (default file)
- `--headless` (run browser without UI)
- `--try-sort-lowest` (optional best effort; default is OFF)

Example:

```bash
npm run scrape:bad-reviews -- --url="https://www.google.com/maps/place/..." --max-rating=2 --limit=100 --out=east-chinese-bad.json
```

## Notes

- Google UI changes often; selectors may need updates.
- If Google shows consent/login/captcha, solve it in the opened browser first.
- This script is for local testing and internal workflow automation.
- Default mode now scans as many loaded reviews as possible without relying on sort menu.

## GUI Mode (simple local UI)

Start local GUI server:

```bash
npm run scrape:gui
```

Then open:

`http://localhost:4180`

Or use one command that starts the server and opens the GUI automatically:

```bash
npm run scrape:desktop
```

Paste URL, click **Start Scrape**:

- bad reviews are shown + saved as JSON
- a company subpage is auto-created in project root: `/<slug>/index.html`
- if `baseUrl` is provided, response includes full public URL (e.g. `https://reviewloeschen.de/<slug>/`)

Recommended simple workflow (without admin page):

1. Run `npm run scrape:desktop`
2. Scrape in local GUI
3. Deploy with `npm run deploy:all -- --base-url="https://your-domain.tld"` (and `DEPLOY_CMD=...`)

## One-step: Scrape -> publishable case subpage

This command scrapes and automatically creates:

- `cases/<slug>/index.html` (customer order page)
- `cases/<slug>/reviews.json`
- `cases/index.json` (registry)

```bash
npm run case:create -- --url="https://www.google.com/maps/place/..." --company="Meat The Greeks"
```

Useful options:

- `--slug=meat-the-greeks-sofia`
- `--base-url=https://your-domain.tld`
- `--max-rating=2`
- `--limit=120`
- `--try-sort-lowest` (optional)
- `--form-action=https://formspree.io/f/xxxxxxx`

Use existing scraper JSON instead of live scraping:

```bash
npm run case:create -- --from-json="bad-reviews.json" --company="Meat The Greeks"
```

## Always up-to-date deploy

Before deploying your website, always refresh all generated company pages:

```bash
npm run case:refresh-all -- --base-url="https://reviewloeschen.de"
```

Or run one command that refreshes and deploys:

```bash
DEPLOY_CMD="your deploy command" npm run deploy:all -- --base-url="https://reviewloeschen.de"
```

Examples:

```bash
DEPLOY_CMD="vercel --prod" npm run deploy:all -- --base-url="https://reviewloeschen.de"
```

```bash
DEPLOY_CMD="rsync -avz --delete ./ user@server:/var/www/reviewloeschen.de" npm run deploy:all -- --base-url="https://reviewloeschen.de"
```
