# RYSC Schedule Finder

A static, mobile-friendly schedule search page for GitHub Pages. The included
parser collects all 12 TCYSA Summer 2026 division pages. The page filters the
combined schedule by club, team, opponent, division, date, and upcoming games.

## Test locally

Requires Node.js 20 or newer.

```bash
npm run refresh
npx serve .
```

Open the local address shown in the terminal. The page must be served over HTTP;
opening `index.html` directly will not load `data/games.json`.

## Publish with GitHub Pages

1. Create a GitHub repository and add these files at its root.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Open the **Actions** tab and run **Refresh schedule** once if it does not
   start automatically.
4. In **Settings → Actions → General**, allow workflows to read and write the
   repository so the schedule refresh can commit updates.

The included workflow refreshes and republishes the schedule every six hours.

## Use RYSC by default

Summer 2026 currently uses TSC as the test club. To switch the default after
RYSC games are published:

- In `index.html`, move `selected` from TSC to RYSC.
- In `app.js`, change `DEFAULT_CLUB` from `"TSC"` to `"RYSC"`.

You can also link directly to a club without changing code:

```text
https://YOUR-ACCOUNT.github.io/YOUR-REPOSITORY/?club=RYSC
```

## Embed in TeamSideline

Use the published GitHub Pages URL as the source of an iframe or TeamSideline
embed block. A typical iframe is:

```html
<iframe
  src="https://YOUR-ACCOUNT.github.io/YOUR-REPOSITORY/?club=RYSC"
  title="RYSC game schedule"
  style="width:100%;min-height:900px;border:0"
  loading="lazy">
</iframe>
```
