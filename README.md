# RYSC Schedule Finder

A static, mobile-friendly schedule search page for GitHub Pages. The included
parser automatically discovers every active division listed on the TCYSA home
page, including divisions added or removed in future seasons. The page filters
the combined schedule by club, team, division, field, date, and upcoming games.
Between seasons, the refresh completes normally and shows a schedule-coming-soon
message instead of failing repeatedly.

## Test locally

Requires Node.js 24 or newer.

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
The included workflow refreshes and republishes the schedule every six hours.

## Select a club by default

The public page opens with All clubs selected. To open it with a particular
club selected, add its abbreviation to the URL:

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
