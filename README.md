# Donald Loveland’s website

A personal research portfolio hosted by GitHub Pages at https://www.donaldloveland.com.
The custom editorial design uses Jekyll, local fonts, responsive images, and a small
JavaScript layer. It retains the existing GitHub Pages branch deployment.

## Updating content

- `_data/portfolio.yml`: introduction, contact links, CV location, research topics,
  and experience entries. Each experience entry can set `logo` to a local image.
- `_data/publications.json`: all publications, authors, venues, topic tags, and links.
  Records with `featured_order` appear on the research page; `question` is the short
  editorial heading. Omit unknown paper/code links rather than guessing them.
  Set `type` to `conference`, `journal`, `workshop`, or `preprint`. Keep one record
  per paper when a preprint is published, retaining its `id` for shared links.
  Use the conference/publication year for published work and the first release
  year for preprints. Use `search_aliases` for earlier titles and method names.
  The homepage carousel highlights the three most recent first-author papers using
  `homepage_order`, ordered from 1. Set their `question`, `teaser_label`, and
  `short_venue` fields.
- `_data/paper_figures.json`: original figure sources, PDF page and figure numbers,
  crop coordinates (PDF points), captions, alt text, and optimized image paths.
  The homepage and selected-work cards share `_includes/paper-figure.html`.
- `index.html`: homepage introduction, Research and Experience teasers, and mentoring section.
- `_pages/research.html`: selected work and the full publication browser.
- `_data/paper_atlas.json`: paper summaries, primary sources, map positions, and
  curated connections. `_includes/paper-atlas.html` and `assets/js/paper-atlas.js`
  render the explorer on the Research page.
- `_pages/experience.html`: the full career timeline.
- `_includes/publication-browser.html`: shared publication search and citation interface.
- `_pages/pubs.html`: the existing `/pubs/` archive remains available for shared links.
- `_layouts/portfolio.html`: navigation, metadata, and footer.
- `assets/css/portfolio.css` and `assets/js/portfolio.js`: design and interactions.
- `assets/images/25_CV_Yr4.pdf`: the current CV; update `cv_url` when replacing it.

Paper cards use figures cropped from the original manuscripts: item semantics
(Figure 1, page 2), GaLA (Figure 1, page 2), GLANCE (Figure 2, page 6), weight decay
(Figure 2, page 4), and local fairness (Figure 4, page 8). The item-semantics thumbnail
shows a detail; its enlarged view contains the full figure. Lossless WebP images
preserve the original labels, colors, and results. Select a figure to enlarge it
and follow its source link; without JavaScript the image link opens directly.
Publications are grouped by year, with publication types labeled on each entry.
Publication search combines topic, year, type, and text filters and stores the current
view in the URL. Standard links, citations, and experience details work without
JavaScript. Interactive controls support keyboard input and reduced motion.
Publication years start collapsed. Filters open matching years; direct paper links
open the containing year and citation. Readers can also expand all years.
First-author work has a small badge on paper entries and a star on atlas nodes.
`_includes/paper-authorship.html` derives the label from the author list; an explicit
equal-contribution marker shared with the first-listed author produces “Co-first
author.” The atlas detail panel distinguishes these two labels. Other coauthored
papers are unmarked.

## Curating the paper atlas

The atlas includes all 28 publications, joined by 38 undirected reading connections.
Connections were curated from primary abstracts and papers, with an explicit reason
for each pair. They represent shared questions, shared mechanisms, or a bridge
between research areas; they do not assert citations or direct intellectual lineage.
Author overlap, publication year, and a broad topic tag are insufficient reasons
to add a connection. The original astronomy study remains independently selectable
because its subject does not support a specific connection to these ML threads.

Each node's `source_url` points to the abstract or paper supporting its summary.
Each edge is supported by its two endpoint sources. Sources include arXiv,
the author's weight-decay manuscript, AAMAS proceedings, and the original
publisher-deposited abstracts in PubMed for the crystalline-density and Autopack
papers. The atlas uses short, newly written descriptions of the research.

Keep about two to four useful connections per paper and at most five. A few papers
can have one or no links when that is the honest reading. Prefer complementary
approaches to a concrete question over linking every pair in a topic. Maintain the
`reason` and descriptive `label` together when changing an edge.

The global map renders circular nodes, colored by **Louvain communities with
editorial refinements**. TF-IDF
cosine similarity of paper titles and curated summaries weights the existing
connections (`0.5 + 2 × similarity`); it does not add speculative edges. Louvain
optimizes weighted modularity with resolution 1 and seed 41. After clustering,
Interpretability (reliable explanations, actionable attribution, counterfactuals)
and Scientific ML (density, crystal packing, strength, zeroth-order SciML) are
separated for browsing, and general GNN robustness joins graph structure and
prediction. These explicit refinements are recorded in the generation script and
output metadata; they preserve every curated connection. Names are then assigned
to the resulting six groups, including the isolated astronomy paper. The short-text similarity
measure is lexical, not a full-text semantic embedding or citation analysis.

A seeded Fruchterman–Reingold spring layout strengthens attraction within the
detected groups. A collision-avoidance pass reserves room for clickable labels.
Positions are precomputed, so the browser needs no graph library and the layout
stays stable while exploring. Regenerate after editing papers or connections:

```sh
python3 -m venv /tmp/paper-atlas-env
/tmp/paper-atlas-env/bin/pip install -r scripts/requirements-atlas.txt
/tmp/paper-atlas-env/bin/python scripts/build_atlas_layout.py
```

Review the resulting group labels and run the browser checks before publishing.
The mobile view defaults to the selected paper's neighborhood, while every
paper stays available through the picker and the full atlas view. Selections can be
shared with `?atlas=paper-id#atlas`. Expand “Why this connection?” for the source-backed
reason behind each suggested next paper.

The November 2026 bibliography update uses primary arXiv records and Snap Research
venue information, with DBLP used for discovery. Google Scholar blocked automated
access, so this is not a complete reconciliation of that profile. The related
materials-science preprint (arXiv:2007.08631) is linked from the existing Actionable
Attribution Maps workshop entry rather than counted as a second paper.

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
deep links, citation copying, the experience timeline, keyboard navigation, reduced
motion, mobile layouts, accessibility, the original-figure viewer, nonoverlapping
graph labels, and the site without JavaScript.

## Credits

Organization logos are local transparent SVGs, displayed in matching 28px squares
on the homepage and 24px squares beside the smaller experience-page names. Original proportions
are preserved. They are decorative for screen readers because the adjacent text
already names the organization. See [logo sources and adaptations](assets/images/organizations/SOURCES.md)
and the bundled Bootstrap Icons license for asset provenance.

Newsreader and DM Sans are bundled under the SIL Open Font License; copies of
the licenses are in `assets/fonts/`. The repository retains the Minimal Mistakes
Jekyll theme and its original MIT license for the inherited theme files.
