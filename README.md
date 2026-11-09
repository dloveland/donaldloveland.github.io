# Donald Loveland’s website

A personal research portfolio hosted by GitHub Pages at https://www.donaldloveland.com.
The custom editorial design uses Jekyll, local fonts, responsive images, and a small
JavaScript layer. It retains the existing GitHub Pages branch deployment.

## Updating content

- `_data/portfolio.yml`: introduction, contact links, CV location, research topics,
  and experience entries.
- `_data/publications.json`: all publications, authors, venues, topic tags, and links.
  Records with `featured_order` appear on the homepage; `question` is the short
  editorial heading. Omit unknown paper/code links rather than guessing them.
- `index.html`: homepage structure and mentoring section.
- `_pages/pubs.html`: searchable publication archive at `/pubs/`.
- `_layouts/portfolio.html`: navigation, metadata, and footer.
- `assets/css/portfolio.css` and `assets/js/portfolio.js`: design and interactions.
- `assets/images/25_CV_Yr4.pdf`: the current CV; update `cv_url` when replacing it.

The research illustrations are conceptual SVG diagrams, not empirical charts.
Publication search combines topic, year, and text filters and stores the current
view in the URL. Standard links, citations, and experience details work without
JavaScript. Interactive controls support keyboard input and reduced motion.

## Local build

With Docker installed, run from this directory:

```sh
docker run --rm \
  --volume "$PWD:/github/workspace" \
  --env GITHUB_WORKSPACE=/github/workspace \
  --env INPUT_SOURCE=. --env INPUT_DESTINATION=_site \
  --env GITHUB_REPOSITORY=dloveland/donaldloveland.github.io \
  --env GITHUB_API_URL=https://api.github.com \
  --env GIT_CONFIG_COUNT=1 \
  --env GIT_CONFIG_KEY_0=safe.directory \
  --env GIT_CONFIG_VALUE_0=/github/workspace \
  ghcr.io/actions/jekyll-build-pages:v1.0.13
python3 -m http.server 4173 --bind 127.0.0.1 --directory _site
```

Open http://127.0.0.1:4173. GitHub Pages builds the site automatically when
changes are pushed to `master`. The root `CNAME` retains the custom domain.

## Browser checks

With Node 22.12+ and the local site server running:

```sh
npm install
npx playwright install --with-deps chromium
npm run test:site
```

`SITE_URL` can point the checks at another deployment. Set `SCREENSHOT_DIR` to
capture desktop and mobile screenshots. The checks exercise search, filters,
deep links, citation copying, the research map, keyboard navigation, reduced
motion, mobile layouts, accessibility, and the site without JavaScript.

## Credits

Newsreader and DM Sans are bundled under the SIL Open Font License; copies of
the licenses are in `assets/fonts/`. The repository retains the Minimal Mistakes
Jekyll theme and its original MIT license for the inherited theme files.
