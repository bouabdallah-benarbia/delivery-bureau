# Bureau Locator

A static website for finding delivery bureaus across Algeria's 58 wilayas.

## Folders

- `site/`: the website. Upload this folder to any static host (Netlify, GitHub Pages, Vercel…), or just open `site/index.html` in a browser.
- `data/communes.csv`: wilayas, communes and bureau cities. This file decides which cities appear in each wilaya.
- `data/desks.json`: a saved copy of the Ecotrack desks API response, with bureau names, addresses and map links.
- `tools/build-data.js`: merges the two files above into `site/data.js`.

The website never calls the API, so the API token is not in the site.

## Updating the data

1. Download a fresh API response and save it over `data/desks.json`. Don't commit the token anywhere.
2. Edit `data/communes.csv` if needed.
3. Run:

```bash
node tools/build-data.js
```

   It prints any bureau it could not match to a city in the CSV, and any CSV city that has no bureau in the API.

4. Commit, then publish the `site/` folder to GitHub Pages:

```bash
git push origin main
git subtree push --prefix site origin gh-pages
```

Live site: https://bouabdallah-benarbia.github.io/delivery-bureau/
