const { test } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const AxeBuilder = require("@axe-core/playwright").default;
const fs = require("node:fs/promises");
const path = require("node:path");

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
    await t.test("homepage and featured filters", async () => {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.title(), "Donald Loveland");
      assert.equal(await visible(page, "[data-featured-paper]"), 3);
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
    await t.test("research map and experience work with keyboard", async () => {
      const topic = page.locator('[data-map-topic="recommendations"]');
      await topic.focus();
      await page.keyboard.press("Enter");
      assert.equal(await topic.getAttribute("aria-pressed"), "true");
      assert.equal(
        await page.locator("#map-recommendations").isVisible(),
        true,
      );
      assert.equal(await page.locator("#map-graphs").isVisible(), false);
      assert.match(
        await page
          .locator("#map-recommendations .text-link")
          .getAttribute("href"),
        /topic=recommendations/,
      );
      const experience = page.locator(".experience-item").nth(1);
      await experience.locator("summary").focus();
      await page.keyboard.press("Enter");
      assert.equal(await experience.getAttribute("open"), "");
      await page.keyboard.press("Enter");
      assert.equal(await experience.getAttribute("open"), null);
    });
    await t.test("homepage accessibility", async () => {
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
    });
    await t.test(
      "archive filters, search, URLs, reset, and citation copying",
      async () => {
        await page.goto(`${base}/pubs/`, { waitUntil: "networkidle" });
        assert.equal(await visible(page, "[data-publication]"), 17);
        await screenshot("desktop-publications.png");
        await page
          .locator('[data-publication-topic="recommendations"]')
          .click();
        assert.equal(await visible(page, "[data-publication]"), 3);
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
        assert.equal(await visible(page, "[data-publication]"), 17);
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
        await page.goto(`${base}/pubs/?topic=science#glance`, {
          waitUntil: "networkidle",
        });
        assert.equal(await page.locator("#glance").isVisible(), true);
        assert.equal(
          await page.locator("#glance details").getAttribute("open"),
          "",
        );
        await page.goto(`${base}/pubs/?topic=unknown&year=1900`, {
          waitUntil: "networkidle",
        });
        assert.equal(await visible(page, "[data-publication]"), 17);
      },
    );
    await t.test("mobile layout, menu, map, and archive", async () => {
      for (const width of [320, 390, 768]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto(base, { waitUntil: "networkidle" });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
          true,
          `No horizontal overflow at ${width}px`,
        );
        const menu = page.getByRole("button", { name: /Menu/ });
        await menu.click();
        assert.equal(await page.locator("#main-nav").isVisible(), true);
        await page.keyboard.press("Escape");
        assert.equal(await menu.getAttribute("aria-expanded"), "false");
        await page.locator('[data-map-topic="trustworthy"]').click();
        assert.equal(await page.locator("#map-trustworthy").isVisible(), true);
        if (width === 390) {
          await page.locator('[data-map-topic="graphs"]').click();
          await screenshot("mobile-home.png");
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
        }
        await page.goto(`${base}/pubs/`, { waitUntil: "networkidle" });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
          true,
          `Archive overflow at ${width}px`,
        );
        if (width === 390) await screenshot("mobile-publications.png");
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
        assert.equal(await visible(staticPage, "[data-featured-paper]"), 3);
        assert.equal(await staticPage.locator("#main-nav").isVisible(), true);
        assert.equal(
          await staticPage.locator(".filter-row").isVisible(),
          false,
        );
        await staticPage.goto(`${base}/pubs/`);
        assert.equal(await visible(staticPage, "[data-publication]"), 17);
        await staticPage.locator("#glance summary").click();
        assert.equal(
          await staticPage.locator("#glance details").getAttribute("open"),
          "",
        );
        await noJs.close();
      },
    );
    assert.deepEqual(errors, [], "No browser errors or failed local resources");
  } finally {
    await browser.close();
  }
});
