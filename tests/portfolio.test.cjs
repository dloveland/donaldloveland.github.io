const { test } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const AxeBuilder = require("@axe-core/playwright").default;
const fs = require("node:fs/promises");
const path = require("node:path");
const publications = require("../_data/publications.json");
const atlas = require("../_data/paper_atlas.json");
const figures = require("../_data/paper_figures.json");
const total = publications.length;
const recommendationCount = publications.filter((paper) =>
  paper.topics.includes("recommendations"),
).length;
const years = [...new Set(publications.map((paper) => String(paper.year)))]
  .sort()
  .reverse();

const base = process.env.SITE_URL || "http://127.0.0.1:4173";
const screenshotDir = process.env.SCREENSHOT_DIR;
const visible = (page, selector) => page.locator(`${selector}:visible`).count();

test("portfolio works on desktop, mobile, and without JavaScript", async (t) => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.url().startsWith(base) && response.status() >= 400)
      errors.push(`${response.status()} ${response.url()}`);
  });
  const screenshot = async (name) => {
    if (!screenshotDir) return;
    await fs.mkdir(screenshotDir, { recursive: true });
    await page.screenshot({
      path: path.join(screenshotDir, name),
      fullPage: true,
    });
  };
  try {
    await t.test(
      "homepage papers cycle with buttons and keyboard without layout shifts",
      async () => {
        const expected = publications
          .filter((paper) => paper.homepage_order)
          .sort((a, b) => a.homepage_order - b.homepage_order)
          .slice(0, 3);
        assert.equal(expected.length, 3);
        assert.deepEqual(
          expected.map((paper) => paper.id),
          ["semantic-initialization", "gala", "glance"],
        );
        assert.ok(
          expected.every((paper) =>
            paper.authors.startsWith("Donald Loveland,"),
          ),
        );
        for (const width of [1440, 1024, 768, 390, 320]) {
          await page.setViewportSize({ width, height: 1000 });
          await page.goto(base, { waitUntil: "networkidle" });
          await page.evaluate(() => document.fonts.ready);
          const carousel = page.locator("[data-research-carousel]");
          const active = carousel.locator(
            '[data-research-slide][aria-hidden="false"]',
          );
          const next = carousel.getByRole("button", { name: "Next paper" });
          const previous = carousel.getByRole("button", {
            name: "Previous paper",
          });
          const height = (await carousel.boundingBox()).height;
          for (let index = 0; index < 3; index++) {
            assert.equal(await visible(page, ".research-preview"), 1);
            assert.equal(
              await active
                .locator("[data-research-paper-link]")
                .getAttribute("href"),
              `/research/#${expected[index].id}`,
            );
            assert.equal(
              await carousel.locator("[data-research-count]").innerText(),
              `${index + 1} / 3`,
            );
            assert.equal(
              await carousel.locator('[aria-hidden="true"][inert]').count(),
              2,
            );
            assert.ok(
              Math.abs((await carousel.boundingBox()).height - height) < 1,
              `Stable height at ${width}`,
            );
            assert.equal(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
              true,
            );
            if (
              screenshotDir &&
              index === 0 &&
              (width === 1440 || width === 390)
            ) {
              await fs.mkdir(screenshotDir, { recursive: true });
              await carousel.screenshot({
                path: path.join(screenshotDir, `carousel-${width}.png`),
              });
            }
            await next.click();
          }
          assert.equal(
            await carousel.locator("[data-research-count]").innerText(),
            "1 / 3",
          );
          await previous.click();
          assert.equal(
            await carousel.locator("[data-research-count]").innerText(),
            "3 / 3",
          );
          await page.keyboard.press("ArrowRight");
          assert.equal(
            await carousel.locator("[data-research-count]").innerText(),
            "1 / 3",
          );
          await active.locator("[data-research-paper-link]").focus();
          await page.keyboard.press("ArrowRight");
          assert.equal(
            await active
              .locator("[data-research-paper-link]")
              .evaluate((link) => link === document.activeElement),
            true,
          );
          assert.match(
            await carousel.locator("[data-research-status]").innerText(),
            /Paper 2 of 3/,
          );
          if (width === 1440) {
            await active.locator("[data-research-paper-link]").click();
            await page.waitForURL(`${base}/research/#${expected[1].id}`);
            assert.equal(
              await page
                .locator(`#${expected[1].id} details`)
                .getAttribute("open"),
              "",
            );
          }
        }
        await page.setViewportSize({ width: 1440, height: 1000 });
      },
    );
    await t.test(
      "original paper figures enlarge with sources and restore keyboard focus",
      async () => {
        const seen = new Set();
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: 1000 });
          for (const route of ["/", "/research/"]) {
            await page.goto(base + route, { waitUntil: "networkidle" });
            const dialog = page.locator(".figure-dialog");
            for (let index = 0; index < 3; index++) {
              const link =
                route === "/"
                  ? page.locator(
                      '[data-research-slide][aria-hidden="false"] [data-figure-open]',
                    )
                  : page
                      .locator("[data-featured-paper] [data-figure-open]")
                      .nth(index);
              const href = await link.getAttribute("href");
              const [id, figure] = Object.entries(figures).find(
                ([, figure]) => figure.image === href,
              );
              seen.add(id);
              await link.scrollIntoViewIfNeeded();
              await link.locator("img").evaluate((img) => img.decode());
              await link.focus();
              await page.keyboard.press("Enter");
              assert.equal(await dialog.evaluate((d) => d.open), true);
              await dialog.locator("img").evaluate((img) => img.decode());
              assert.equal(
                await dialog.locator("img").getAttribute("src"),
                base + figure.image,
              );
              assert.equal(
                await dialog
                  .locator("[data-figure-source-link]")
                  .getAttribute("href"),
                figure.source,
              );
              assert.equal(
                await dialog.locator("#figure-caption").innerText(),
                figure.caption,
              );
              assert.equal(
                await page.evaluate(
                  () => document.documentElement.scrollWidth <= innerWidth,
                ),
                true,
              );
              if (route === "/" && index === 0 && width === 1440) {
                const result = await new AxeBuilder({ page })
                  .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
                  .analyze();
                assert.deepEqual(
                  result.violations.map((v) => v.id),
                  [],
                );
              }
              if (index % 2)
                await dialog.locator("[data-figure-close]").click();
              else await page.keyboard.press("Escape");
              assert.equal(await dialog.evaluate((d) => d.open), false);
              assert.equal(
                await link.evaluate((el) => el === document.activeElement),
                true,
              );
              if (route === "/")
                await page.locator("[data-research-next]").click();
            }
          }
        }
        assert.deepEqual(
          seen,
          new Set(
            publications
              .filter((paper) => paper.featured_order || paper.homepage_order)
              .map((paper) => paper.id),
          ),
        );
        await page.setViewportSize({ width: 1440, height: 1000 });
      },
    );
    await t.test("homepage teasers lead to the research page", async () => {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.title(), "Donald Loveland");
      assert.equal(await visible(page, "[data-featured-paper]"), 0);
      assert.equal(await page.locator(".page-teaser").count(), 2);
      assert.equal(await page.locator(".experience-item").count(), 0);
      assert.equal(
        await page
          .locator(".hero-portrait img")
          .evaluate((img) => img.complete && img.naturalWidth > 0),
        true,
      );
      assert.equal(
        await page.evaluate(() => document.fonts.check("48px Newsreader")),
        true,
      );
      await screenshot("desktop-home.png");
      await page.locator("#research .teaser-cta").click();
      await page.waitForURL(`${base}/research/`);
      assert.equal(await page.title(), "Research · Donald Loveland");
      assert.equal(await visible(page, "[data-featured-paper]"), 3);
      assert.equal(await visible(page, "[data-publication]"), 0);
      assert.equal(await page.locator("[data-publication]").count(), total);
      assert.equal(
        await page.locator('#main-nav a[aria-current="page"]').innerText(),
        "Research",
      );
      await screenshot("desktop-research.png");
      await page.locator('[data-feature-filter="recommendations"]').click();
      assert.equal(await visible(page, "[data-featured-paper]"), 1);
      assert.match(
        await page.locator("[data-featured-paper]:visible h3").innerText(),
        /new item token/,
      );
      await page.locator('[data-feature-filter="graphs"]').click();
      assert.equal(await visible(page, "[data-featured-paper]"), 2);
      await page.locator('[data-feature-filter="all"]').click();
      assert.equal(await visible(page, "[data-featured-paper]"), 3);
    });
    await t.test(
      "publication filters and experience work with keyboard",
      async () => {
        const topic = page.locator(
          '[data-publication-topic="recommendations"]',
        );
        await topic.focus();
        await page.keyboard.press("Enter");
        assert.equal(await topic.getAttribute("aria-pressed"), "true");
        await page.waitForURL(/research\/\?topic=recommendations#publications/);
        assert.equal(
          await visible(page, "[data-publication]"),
          recommendationCount,
        );
        await page.locator("#main-nav a", { hasText: "Experience" }).click();
        await page.waitForURL(`${base}/experience/`);
        assert.equal(await page.title(), "Experience · Donald Loveland");
        assert.equal(await page.locator(".experience-item").count(), 6);
        await screenshot("desktop-experience.png");
        const experience = page.locator(".experience-item").nth(1);
        await experience.locator("summary").focus();
        await page.keyboard.press("Enter");
        await page.waitForURL(/#university-of-michigan-doctoral-research$/);
        assert.equal(await experience.getAttribute("open"), "");
        await page.keyboard.press("Enter");
        await page.waitForURL(/#timeline$/);
        assert.equal(await experience.getAttribute("open"), null);
      },
    );
    await t.test(
      "experience milestones support direct links and browser history",
      async () => {
        const michigan = "university-of-michigan-doctoral-research";
        const amazon = "amazon-summer-2025";
        const selected = async (id) => {
          assert.equal(await page.locator(".experience-item[open]").count(), 1);
          assert.equal(
            await page.locator(".experience-item[open]").getAttribute("id"),
            id,
          );
          assert.equal(
            await page.locator(`#${id} .experience-body`).isVisible(),
            true,
          );
        };
        await page.goto(`${base}/experience/#${michigan}`);
        await selected(michigan);
        await page.locator(`#${amazon} summary`).click();
        await page.waitForURL(`${base}/experience/#${amazon}`);
        await selected(amazon);
        await page.goBack();
        await page.waitForURL(`${base}/experience/#${michigan}`);
        await selected(michigan);
        await page.goForward();
        await page.waitForURL(`${base}/experience/#${amazon}`);
        await selected(amazon);
        await page.reload();
        await selected(amazon);
        await page.locator(`#${amazon} summary`).focus();
        await page.keyboard.press("Space");
        await page.waitForURL(`${base}/experience/#timeline`);
        assert.equal(await page.locator(".experience-item[open]").count(), 0);
        await page.goBack();
        await selected(amazon);
        await page.setViewportSize({ width: 390, height: 844 });
        const last = page.locator(".experience-item").last();
        await last.locator("summary").click();
        await page.waitForURL(
          `${base}/experience/#${await last.getAttribute("id")}`,
        );
        await selected(await last.getAttribute("id"));
        await screenshot("mobile-experience-expanded.png");
        await page.setViewportSize({ width: 1440, height: 1000 });
      },
    );
    await t.test(
      "year groups start closed and open for navigation or search",
      async () => {
        for (const route of ["/research/", "/pubs/"]) {
          await page.goto(base + route);
          const groups = page.locator("[data-publication-group]");
          assert.equal(await groups.count(), years.length);
          assert.equal(
            await page.locator("[data-publication-group][open]").count(),
            0,
          );
          const first = groups.first();
          await first.locator(":scope > summary").focus();
          await page.keyboard.press("Enter");
          assert.ok((await visible(page, "[data-publication]")) > 0);
          await page.keyboard.press("Space");
          assert.equal(await visible(page, "[data-publication]"), 0);
          await page.locator("[data-toggle-years]").click();
          assert.equal(await visible(page, "[data-publication]"), total);
          await page.locator("[data-toggle-years]").click();
          assert.equal(await visible(page, "[data-publication]"), 0);
          await page.locator("#publication-search").fill("GLANCE");
          assert.equal(await page.locator("#glance").isVisible(), true);
          assert.equal(
            await page.locator("[data-publication-group][open]").count(),
            1,
          );
          await page.locator("[data-clear-filters]").click();
          assert.equal(await visible(page, "[data-publication]"), 0);
        }
      },
    );
    await t.test(
      "atlas covers the bibliography with specific, bounded connections",
      async () => {
        const ids = new Set(publications.map((paper) => paper.id));
        assert.equal(new Set(atlas.nodes.map((node) => node.id)).size, total);
        assert.ok(
          atlas.nodes.every(
            (node) => ids.has(node.id) && node.summary && node.source_url,
          ),
        );
        const pairs = new Set(),
          degrees = new Map(atlas.nodes.map((node) => [node.id, 0]));
        for (const edge of atlas.edges) {
          assert.ok(ids.has(edge.source) && ids.has(edge.target));
          assert.notEqual(edge.source, edge.target);
          const key = [edge.source, edge.target].sort().join("|");
          assert.equal(pairs.has(key), false, "Duplicate atlas connection");
          pairs.add(key);
          assert.ok(edge.reason.length > 80 && edge.label.length > 8);
          degrees.set(edge.source, degrees.get(edge.source) + 1);
          degrees.set(edge.target, degrees.get(edge.target) + 1);
        }
        assert.ok([...degrees.values()].every((degree) => degree <= 5));
        assert.ok(
          atlas.edges.length / total > 1 && atlas.edges.length / total < 2,
        );
        await page.goto(`${base}/research/`);
        assert.equal(await visible(page, "[data-atlas-node]"), total);
        assert.equal(
          await page.locator(".atlas-edge").count(),
          atlas.edges.length,
        );
        await page.locator('[data-atlas-node="glance"]').click();
        await page.waitForURL(/atlas=glance#atlas$/);
        assert.match(
          await page.locator("#atlas-paper-title").innerText(),
          /Glance for Context/,
        );
        assert.equal(
          await page.locator("[data-atlas-related]").count(),
          degrees.get("glance"),
        );
        await page.locator('[data-atlas-related="local-fairness"]').click();
        assert.match(
          await page.locator("#atlas-paper-title").innerText(),
          /Local Homophily on GNN Fairness/,
        );
        await page.goBack();
        assert.equal(await page.locator("#atlas-paper").inputValue(), "glance");
        await page.goForward();
        assert.equal(
          await page.locator("#atlas-paper").inputValue(),
          "local-fairness",
        );
        await page.reload();
        assert.equal(
          await page.locator("#atlas-paper").inputValue(),
          "local-fairness",
        );
        await page.locator('[data-atlas-view="connected"]').click();
        assert.equal(
          await visible(page, "[data-atlas-node]"),
          degrees.get("local-fairness") + 1,
        );
        await page.locator('[data-atlas-node="local-fairness"]').focus();
        await page.keyboard.press("ArrowUp");
        const focused = await page.evaluate(
          () => document.activeElement.dataset.atlasNode,
        );
        assert.ok(focused && focused !== "local-fairness");
        await page.keyboard.press("Enter");
        assert.equal(await page.locator("#atlas-paper").inputValue(), focused);
        await page.locator("[data-atlas-publication]").click();
        await page.waitForFunction(
          (id) => document.getElementById(id).querySelector("details").open,
          focused,
        );
        assert.equal(await page.locator(`#${focused}`).isVisible(), true);
        assert.equal(
          await page.locator(`#${focused} details`).getAttribute("open"),
          "",
        );
        await page.goto(`${base}/research/?atlas=does-not-exist#atlas`);
        assert.equal(
          await page.locator("#atlas-paper").inputValue(),
          atlas.default_paper,
        );
        if (screenshotDir)
          await page.locator("#atlas").screenshot({
            path: path.join(screenshotDir, "desktop-paper-atlas.png"),
          });
      },
    );
    await t.test(
      "computed communities cover every paper and full-graph labels stay separate",
      async () => {
        assert.equal(atlas.clustering.method, "Louvain");
        assert.ok(atlas.clustering.modularity > 0);
        const assigned = atlas.communities.flatMap((c) => c.papers);
        assert.equal(new Set(assigned).size, total);
        assert.equal(assigned.length, total);
        for (const node of atlas.nodes)
          assert.ok(
            atlas.communities
              .find((c) => c.id === node.community)
              ?.papers.includes(node.id),
          );
        assert.ok(
          atlas.edges.every(
            (edge) =>
              edge.similarity >= 0 && edge.similarity <= 1 && edge.weight > 0,
          ),
        );
        for (const width of [1440, 1200, 1024, 768, 390, 320]) {
          await page.setViewportSize({ width, height: 1000 });
          await page.goto(`${base}/research/`);
          await page.evaluate(() => document.fonts.ready);
          await page.locator('[data-atlas-view="all"]').click();
          const issues = await page.locator(".atlas-map").evaluate((map) => {
            const bounds = map.getBoundingClientRect();
            const nodes = [...map.querySelectorAll("[data-atlas-node]")].map(
              (n) => ({
                id: n.dataset.atlasNode,
                box: n.getBoundingClientRect(),
              }),
            );
            return nodes.flatMap((n, i) => {
              const r = n.box;
              const outside =
                r.left < bounds.left ||
                r.right > bounds.right ||
                r.top < bounds.top ||
                r.bottom > bounds.bottom;
              const collisions = nodes
                .slice(i + 1)
                .filter(
                  (m) =>
                    r.left < m.box.right &&
                    r.right > m.box.left &&
                    r.top < m.box.bottom &&
                    r.bottom > m.box.top,
                )
                .map((m) => `${n.id} overlaps ${m.id}`);
              return outside
                ? [...collisions, `${n.id} outside canvas`]
                : collisions;
            });
          });
          assert.deepEqual(issues, [], `Graph at ${width}px`);
        }
        const details = page.locator(".atlas-connections details").first();
        assert.equal(await details.evaluate((d) => d.open), false);
        await details.locator("summary").click();
        assert.equal(await details.locator("p").isVisible(), true);
      },
    );
    await t.test(
      "atlas neighborhoods stay legible and navigable on phones",
      async () => {
        for (const width of [320, 390]) {
          await page.setViewportSize({ width, height: 1000 });
          await page.goto(`${base}/research/`);
          await page.evaluate(() => document.fonts.ready);
          assert.equal(
            await page
              .locator('[data-atlas-view="connected"]')
              .getAttribute("aria-pressed"),
            "true",
          );
          for (const node of atlas.nodes) {
            await page.locator("#atlas-paper").selectOption(node.id);
            const related = atlas.edges.filter(
              (edge) => edge.source === node.id || edge.target === node.id,
            );
            assert.equal(
              await visible(page, "[data-atlas-node]"),
              related.length + 1,
            );
            const geometry = await page
              .locator(".atlas-map")
              .evaluate((map) => {
                const bounds = map.getBoundingClientRect();
                const rects = [...map.querySelectorAll("[data-atlas-node]")]
                  .filter((node) => !node.hidden)
                  .map((node) => node.getBoundingClientRect());
                return {
                  outside: rects.some(
                    (r) =>
                      r.left < bounds.left ||
                      r.right > bounds.right ||
                      r.top < bounds.top ||
                      r.bottom > bounds.bottom,
                  ),
                  overlap: rects.some((r, i) =>
                    rects
                      .slice(i + 1)
                      .some(
                        (s) =>
                          r.left < s.right &&
                          r.right > s.left &&
                          r.top < s.bottom &&
                          r.bottom > s.top,
                      ),
                  ),
                  overflow: document.documentElement.scrollWidth > innerWidth,
                };
              });
            assert.deepEqual(
              geometry,
              { outside: false, overlap: false, overflow: false },
              `${node.id} at ${width}`,
            );
          }
          assert.equal(
            await page.locator("[data-atlas-isolated]").isVisible(),
            true,
          );
          await page.locator("#atlas-paper").selectOption(atlas.default_paper);
          if (screenshotDir && width === 390)
            await page.locator("#atlas").screenshot({
              path: path.join(screenshotDir, "mobile-paper-atlas.png"),
            });
          await page.locator('[data-atlas-view="all"]').click();
          assert.equal(await visible(page, "[data-atlas-node]"), total);
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
          );
        }
        await page.setViewportSize({ width: 1440, height: 1000 });
      },
    );
    await t.test("all main pages are accessible", async () => {
      for (const route of ["/", "/research/", "/experience/"]) {
        await page.goto(base + route, { waitUntil: "networkidle" });
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        assert.deepEqual(
          results.violations.map((v) => ({
            id: v.id,
            elements: v.nodes.map((n) => n.target),
          })),
          [],
          route,
        );
      }
    });
    await t.test(
      "archive filters, search, URLs, reset, and citation copying",
      async () => {
        await page.goto(`${base}/pubs/`, { waitUntil: "networkidle" });
        assert.equal(await visible(page, "[data-publication]"), 0);
        await page.locator("[data-toggle-years]").click();
        assert.equal(await visible(page, "[data-publication]"), total);
        await screenshot("desktop-publications.png");
        await page
          .locator('[data-publication-topic="recommendations"]')
          .click();
        assert.equal(
          await visible(page, "[data-publication]"),
          recommendationCount,
        );
        assert.equal(
          new URL(page.url()).searchParams.get("topic"),
          "recommendations",
        );
        await page.locator("#publication-year").selectOption("2025");
        await page.locator("#publication-search").fill("weight decay");
        assert.equal(await visible(page, "[data-publication]"), 1);
        assert.equal(
          await page.locator("[data-publication]:visible").getAttribute("id"),
          "weight-decay",
        );
        await page.reload({ waitUntil: "networkidle" });
        assert.equal(await visible(page, "[data-publication]"), 1);
        await page
          .locator("#publication-search")
          .fill("no-matching-research-xyz");
        assert.equal(await page.locator(".empty-state").isVisible(), true);
        await page.locator("[data-reset-search]").click();
        assert.equal(await visible(page, "[data-publication]"), 0);
        await page.locator("[data-toggle-years]").click();
        assert.equal(await visible(page, "[data-publication]"), total);
        assert.equal(new URL(page.url()).search, "");
        await page.locator("#glance summary").click();
        await page.locator("#glance [data-copy-citation]").click();
        await page.waitForFunction(
          () =>
            document.querySelector("#glance .copy-status").textContent ===
            "Citation copied.",
        );
        assert.match(
          await page.evaluate(() => navigator.clipboard.readText()),
          /Glance for Context/,
        );
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        assert.deepEqual(
          results.violations.map((v) => ({
            id: v.id,
            elements: v.nodes.map((n) => n.target),
          })),
          [],
        );
      },
    );
    await t.test(
      "deep links reveal papers and reject unknown filter values",
      async () => {
        await page.goto(`${base}/pubs/?topic=science&type=preprint#glance`, {
          waitUntil: "networkidle",
        });
        assert.equal(await page.locator("#glance").isVisible(), true);
        assert.equal(
          await page.locator("#glance details").getAttribute("open"),
          "",
        );
        await page.goto(`${base}/pubs/?topic=unknown&year=1900&type=unknown`, {
          waitUntil: "networkidle",
        });
        assert.equal(await visible(page, "[data-publication]"), 0);
        assert.equal(await page.locator("[data-publication]").count(), total);
      },
    );
    await t.test(
      "year groups, publication types, and earlier titles are searchable",
      async () => {
        await page.goto(`${base}/research/#publications`, {
          waitUntil: "networkidle",
        });
        assert.deepEqual(
          await page.locator(".publication-group-heading h3").allTextContents(),
          years,
        );
        await page.locator("#publication-type").selectOption("preprint");
        assert.equal(
          await visible(page, "[data-publication]"),
          publications.filter((paper) => paper.type === "preprint").length,
        );
        assert.equal(new URL(page.url()).searchParams.get("type"), "preprint");
        await page.locator("#publication-year").selectOption("2022");
        assert.equal(await visible(page, "[data-publication-group]"), 1);
        assert.equal(
          await page
            .locator("[data-publication-group]:visible [data-group-count]")
            .innerText(),
          "2 papers",
        );
        await page.locator('[data-publication-topic="science"]').click();
        assert.equal(await visible(page, "[data-publication]"), 1);
        assert.equal(
          await page.locator("[data-publication]:visible").getAttribute("id"),
          "zeroth-order-sciml",
        );
        await page.reload({ waitUntil: "networkidle" });
        assert.equal(
          await page.locator("#publication-type").inputValue(),
          "preprint",
        );
        assert.equal(await visible(page, "[data-publication]"), 1);
        await page.locator("#publication-search").fill("no-matching-paper");
        assert.equal(await visible(page, "[data-publication-group]"), 0);
        await page.locator("[data-reset-search]").click();
        assert.equal(
          await visible(page, "[data-publication-group]"),
          years.length,
        );
        assert.equal(
          await page.locator("#publication-type").inputValue(),
          "all",
        );
        await page
          .locator("#publication-search")
          .fill("Exploiting ID-Text Complementarity");
        assert.equal(await visible(page, "[data-publication]"), 1);
        assert.equal(
          await page.locator("[data-publication]:visible").getAttribute("id"),
          "id-text-complementarity",
        );
        await page.locator("[data-clear-filters]").click();
        await page.locator("#publication-type").selectOption("conference");
        await page.locator("#publication-year").selectOption("2026");
        assert.deepEqual(
          await page
            .locator("[data-publication]:visible")
            .evaluateAll((nodes) => nodes.map((node) => node.id).sort()),
          ["corre", "gala", "glance", "pencil"],
        );
        await screenshot("desktop-publication-groups.png");
      },
    );
    await t.test("mobile navigation and separate content pages", async () => {
      for (const width of [320, 390, 768]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto(base, { waitUntil: "networkidle" });
        if (width === 390) await screenshot("mobile-home.png");
        const menu = page.getByRole("button", { name: /Menu/ });
        await menu.click();
        assert.equal(await page.locator("#main-nav").isVisible(), true);
        await page.keyboard.press("Escape");
        assert.equal(await menu.getAttribute("aria-expanded"), "false");
        await menu.click();
        await page.locator("#main-nav a", { hasText: "Research" }).click();
        await page.waitForURL(`${base}/research/`);
        await page.locator('[data-feature-filter="graphs"]').click();
        assert.equal(await visible(page, "[data-featured-paper]"), 2);
        for (const route of ["/", "/research/", "/experience/", "/pubs/"]) {
          await page.goto(base + route, { waitUntil: "networkidle" });
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
            `${route} at ${width}`,
          );
          if (width === 390 && route !== "/")
            await screenshot("mobile-" + route.replaceAll("/", "") + ".png");
        }
      }
    });
    await t.test("reduced motion is respected", async () => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(base);
      assert.equal(
        await page.evaluate(
          () => getComputedStyle(document.documentElement).scrollBehavior,
        ),
        "auto",
      );
    });
    await t.test(
      "content and navigation remain usable without JavaScript",
      async () => {
        const noJs = await browser.newContext({
          javaScriptEnabled: false,
          viewport: { width: 390, height: 844 },
        });
        const staticPage = await noJs.newPage();
        await staticPage.goto(base);
        assert.equal(await visible(staticPage, "[data-featured-paper]"), 0);
        assert.equal(await visible(staticPage, ".research-preview"), 1);
        assert.equal(
          await staticPage.getByRole("button", { name: "Next paper" }).count(),
          0,
        );
        const firstPaper = staticPage.locator(".research-preview:visible");
        assert.match(
          await firstPaper
            .locator("[data-research-paper-link]")
            .getAttribute("href"),
          /\/research\/#semantic-initialization$/,
        );
        await staticPage.locator("#research .teaser-cta").click();
        assert.equal(await visible(staticPage, "[data-featured-paper]"), 3);
        assert.equal(await visible(staticPage, "[data-publication]"), 0);
        for (const group of await staticPage
          .locator("[data-publication-group]")
          .all()) {
          await group.locator(":scope > summary").click();
        }
        assert.equal(await visible(staticPage, "[data-publication]"), total);
        assert.equal(await staticPage.locator("#main-nav").isVisible(), true);
        assert.equal(
          await staticPage.locator(".filter-row:visible").count(),
          0,
        );
        await staticPage.goto(`${base}/pubs/`);
        assert.equal(await visible(staticPage, "[data-publication]"), 0);
        for (const group of await staticPage
          .locator("[data-publication-group]")
          .all()) {
          await group.locator(":scope > summary").click();
        }
        assert.equal(await visible(staticPage, "[data-publication]"), total);
        await staticPage.locator("#glance summary").click();
        assert.equal(
          await staticPage.locator("#glance details").getAttribute("open"),
          "",
        );
        await staticPage.goto(`${base}/experience/`);
        const milestone = staticPage.locator(".experience-item").nth(2);
        await milestone.locator("summary").click();
        assert.equal(
          await milestone.locator(".experience-body").isVisible(),
          true,
        );
        await noJs.close();
      },
    );
    assert.deepEqual(errors, [], "No browser errors or failed local resources");
  } finally {
    await browser.close();
  }
});
