(() => {
  "use strict";
  document.documentElement.classList.add("js");
  const all = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector));
  const normalize = (value) =>
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  const menu = document.querySelector(".menu-toggle");
  const navigation = document.getElementById("main-nav");
  const closeMenu = () => {
    if (!menu || !navigation) return;
    menu.setAttribute("aria-expanded", "false");
    navigation.classList.remove("is-open");
  };
  menu?.addEventListener("click", () => {
    const open = menu.getAttribute("aria-expanded") !== "true";
    menu.setAttribute("aria-expanded", String(open));
    navigation.classList.toggle("is-open", open);
  });
  navigation?.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      menu?.getAttribute("aria-expanded") === "true"
    ) {
      closeMenu();
      menu.focus();
    }
  });
  window.matchMedia("(min-width: 901px)").addEventListener("change", closeMenu);

  const carousel = document.querySelector("[data-research-carousel]");
  if (carousel) {
    const slides = all("[data-research-slide]", carousel);
    let current = 0;
    function showPaper(offset) {
      const moveFocus = slides[current].contains(document.activeElement);
      current = (current + offset + slides.length) % slides.length;
      slides.forEach((slide, index) => {
        const active = index === current;
        slide.setAttribute("aria-hidden", String(!active));
        slide.inert = !active;
      });
      carousel.querySelector("[data-research-count]").textContent =
        `${current + 1} / ${slides.length}`;
      carousel.querySelector("[data-research-status]").textContent =
        `Paper ${current + 1} of ${slides.length}: ${slides[current].querySelector("h3").textContent}`;
      if (moveFocus)
        slides[current].querySelector("a").focus({ preventScroll: true });
    }
    if (slides.length > 1) {
      carousel
        .querySelector("[data-research-previous]")
        .addEventListener("click", () => showPaper(-1));
      carousel
        .querySelector("[data-research-next]")
        .addEventListener("click", () => showPaper(1));
      carousel.addEventListener("keydown", (event) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
          return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          showPaper(event.key === "ArrowLeft" ? -1 : 1);
        }
      });
    } else {
      carousel.querySelector(".research-carousel-controls").hidden = true;
    }
  }

  function revealExperience() {
    let id;
    try {
      id = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return;
    }
    const entry = document.getElementById(id);
    if (entry?.matches(".experience-item")) entry.open = true;
  }
  window.addEventListener("hashchange", revealExperience);
  revealExperience();

  const featureButtons = all("[data-feature-filter]");
  const featuredPapers = all("[data-featured-paper]");
  featureButtons.forEach((button) =>
    button.addEventListener("click", () => {
      const topic = button.dataset.featureFilter;
      featureButtons.forEach((item) =>
        item.setAttribute("aria-pressed", String(item === button)),
      );
      let count = 0;
      featuredPapers.forEach((paper) => {
        paper.hidden =
          topic !== "all" && !paper.dataset.topics.split(" ").includes(topic);
        if (!paper.hidden) count++;
      });
      document.getElementById("featured-status").textContent =
        `${count} featured ${count === 1 ? "paper" : "papers"} shown.`;
    }),
  );

  const topicButtons = all("[data-map-topic]");
  const topicPanels = all("[data-map-panel]");
  topicButtons.forEach((button) =>
    button.addEventListener("click", () => {
      const topic = button.dataset.mapTopic;
      topicButtons.forEach((item) =>
        item.setAttribute("aria-pressed", String(item === button)),
      );
      topicPanels.forEach((panel) => {
        panel.hidden = panel.dataset.mapPanel !== topic;
      });
      document.querySelector(".network-graph").dataset.activeTopic = topic;
    }),
  );

  const browser = document.querySelector("[data-publication-browser]");
  if (browser) {
    const search = document.getElementById("publication-search");
    const year = document.getElementById("publication-year");
    const type = document.getElementById("publication-type");
    const groups = all("[data-publication-group]", browser);
    const buttons = all("[data-publication-topic]", browser);
    const papers = all("[data-publication]", browser).map((element) => ({
      element,
      year: element.dataset.year,
      type: element.dataset.type,
      topics: element.dataset.topics.split(" "),
      text: normalize(
        [
          element.querySelector(".publication-title").textContent,
          element.querySelector(".publication-authors").textContent,
          element.querySelector(".publication-venue").textContent,
          element.querySelector(".eyebrow").textContent,
          element.dataset.searchAliases || "",
        ].join(" "),
      ),
    }));
    const clear = browser.querySelector("[data-clear-filters]");
    const empty = browser.querySelector(".empty-state");
    let topic = "all";
    function update(writeUrl = true) {
      const terms = normalize(search.value).split(" ").filter(Boolean);
      let count = 0;
      papers.forEach((paper) => {
        const visible =
          (topic === "all" || paper.topics.includes(topic)) &&
          (year.value === "all" || paper.year === year.value) &&
          (type.value === "all" || paper.type === type.value) &&
          terms.every((term) => paper.text.includes(term));
        paper.element.hidden = !visible;
        if (visible) count++;
      });
      groups.forEach((group) => {
        const visible = all("[data-publication]", group).filter(
          (paper) => !paper.hidden,
        ).length;
        group.hidden = visible === 0;
        group.querySelector("[data-group-count]").textContent =
          `${visible} ${visible === 1 ? "paper" : "papers"}`;
      });
      buttons.forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.publicationTopic === topic),
        ),
      );
      document.getElementById("publication-status").textContent =
        `${count} of ${papers.length} publications`;
      empty.hidden = count > 0;
      clear.hidden =
        !search.value &&
        topic === "all" &&
        year.value === "all" &&
        type.value === "all";
      if (writeUrl) {
        const url = new URL(window.location.href);
        [
          ["q", search.value.trim()],
          ["topic", topic === "all" ? "" : topic],
          ["year", year.value === "all" ? "" : year.value],
          ["type", type.value === "all" ? "" : type.value],
        ].forEach(([key, value]) => {
          if (value) url.searchParams.set(key, value);
          else url.searchParams.delete(key);
        });
        // A filtered view shouldn't retain a fragment pointing at a now-hidden paper.
        url.hash = browser.dataset.archiveAnchor || "";
        window.history.replaceState(null, "", url);
      }
    }
    function readUrl() {
      const params = new URLSearchParams(window.location.search);
      search.value = params.get("q") || "";
      topic = buttons.some(
        (button) => button.dataset.publicationTopic === params.get("topic"),
      )
        ? params.get("topic")
        : "all";
      year.value = all("option", year).some(
        (option) => option.value === params.get("year"),
      )
        ? params.get("year")
        : "all";
      type.value = all("option", type).some(
        (option) => option.value === params.get("type"),
      )
        ? params.get("type")
        : "all";
      update(false);
    }
    function reset() {
      search.value = "";
      year.value = "all";
      type.value = "all";
      topic = "all";
      update();
      search.focus();
    }
    buttons.forEach((button) =>
      button.addEventListener("click", () => {
        topic = button.dataset.publicationTopic;
        update();
      }),
    );
    search.addEventListener("input", () => update());
    year.addEventListener("change", () => update());
    type.addEventListener("change", () => update());
    clear.addEventListener("click", reset);
    browser
      .querySelector("[data-reset-search]")
      .addEventListener("click", reset);
    window.addEventListener("popstate", readUrl);
    readUrl();

    function revealLinkedPaper() {
      if (!window.location.hash) return;
      let id;
      try {
        id = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return;
      }
      const linked = papers.find((paper) => paper.element.id === id);
      if (!linked) return;
      if (linked.element.hidden) {
        search.value = "";
        year.value = "all";
        type.value = "all";
        topic = "all";
        const url = new URL(window.location.href);
        ["q", "topic", "year", "type"].forEach((key) =>
          url.searchParams.delete(key),
        );
        window.history.replaceState(null, "", url);
        update(false);
      }
      linked.element.querySelector("details").open = true;
      requestAnimationFrame(() =>
        linked.element.scrollIntoView({ block: "start", behavior: "instant" }),
      );
    }
    window.addEventListener("hashchange", revealLinkedPaper);
    revealLinkedPaper();
  }

  all("[data-copy-citation]").forEach((button) =>
    button.addEventListener("click", async () => {
      const citation = document.getElementById(button.dataset.copyCitation);
      const status = button.nextElementSibling;
      if (!citation || !status) return;
      try {
        if (!navigator.clipboard?.writeText)
          throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(citation.textContent.trim());
        status.textContent = "Citation copied.";
      } catch {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(citation);
        selection.removeAllRanges();
        selection.addRange(range);
        status.textContent =
          "Citation selected. Use your device’s copy command.";
      }
    }),
  );
})();
