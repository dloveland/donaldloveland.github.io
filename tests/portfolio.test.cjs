const { test } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const AxeBuilder = require("@axe-core/playwright").default;
const fs = require("node:fs/promises");
const path = require("node:path");
const publications = require("../_data/publications.json");
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
              await active.locator("a").getAttribute("href"),
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
          await active.locator("a").focus();
          await page.keyboard.press("ArrowRight");
          assert.equal(
            await active
              .locator("a")
              .evaluate((link) => link === document.activeElement),
            true,
          );
          assert.match(
            await carousel.locator("[data-research-status]").innerText(),
            /Paper 2 of 3/,
          );
          if (width === 1440) {
            await active.locator("a").click();
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
      assert.equal(await visible(page, "[data-publication]"), total);
      assert.equal(
        await page.locator('#main-nav a[aria-current="page"]').innerText(),
        "Research",
      );
      await screenshot("desktop-research.png");
      await page.locator('[data-feature-filter="recommendations"]').click();
      assert.equal(await visible(page, "[data-featured-paper]"), 1);
      assert.match(
        await page.locator("[data-featured-paper]:visible h3").innerText(),
        /popular/,
      );
      await page.locator('[data-feature-filter="trustworthy"]').click();
      assert.equal(await visible(page, "[data-featured-paper]"), 1);
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
        assert.equal(await visible(page, "[data-publication]"), total);
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
        await page.locator('[data-feature-filter="trustworthy"]').click();
        assert.equal(await visible(page, "[data-featured-paper]"), 1);
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
          await firstPaper.getAttribute("href"),
          /\/research\/#semantic-initialization$/,
        );
        await staticPage.locator("#research .teaser-cta").click();
        assert.equal(await visible(staticPage, "[data-featured-paper]"), 3);
        assert.equal(await visible(staticPage, "[data-publication]"), total);
        assert.equal(await staticPage.locator("#main-nav").isVisible(), true);
        assert.equal(
          await staticPage.locator(".filter-row:visible").count(),
          0,
        );
        await staticPage.goto(`${base}/pubs/`);
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
