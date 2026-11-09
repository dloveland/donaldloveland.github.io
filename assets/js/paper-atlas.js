(() => {
  "use strict";
  const root = document.querySelector("[data-paper-atlas]");
  if (!root) return;
  const data = JSON.parse(
    document.getElementById("paper-atlas-data").textContent,
  );
  const nodes = new Map(data.nodes.map((node) => [node.id, node]));
  const buttons = [...root.querySelectorAll("[data-atlas-node]")];
  const map = root.querySelector(".atlas-map");
  const scroll = root.querySelector(".atlas-map-scroll");
  const lines = root.querySelector(".atlas-lines");
  const picker = root.querySelector("#atlas-paper");
  const viewButtons = [...root.querySelectorAll("[data-atlas-view]")];
  const connections = root.querySelector("[data-atlas-connections]");
  const mobile = window.matchMedia("(max-width: 700px)");
  const kinds = {
    question: "Shared question",
    mechanism: "Shared mechanism",
    bridge: "Across research areas",
  };
  let selected = data.default_paper;
  let mode = mobile.matches ? "connected" : "all";
  let chosenView = false;
  let positions = new Map();
  const neighbors = (id) =>
    data.edges
      .filter((edge) => edge.source === id || edge.target === id)
      .map((edge) => ({
        ...edge,
        other: edge.source === id ? edge.target : edge.source,
      }));
  const paper = (id) => document.getElementById(id);
  const title = (id) =>
    paper(id).querySelector(".publication-title").textContent;
  const edges = data.edges.map((edge) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.classList.add("atlas-edge");
    if (edge.kind === "bridge") path.classList.add("atlas-edge-bridge");
    lines.append(path);
    return { ...edge, path };
  });
  function layout() {
    const related = neighbors(selected).map((edge) => edge.other);
    const visible = new Set([selected, ...related]);
    map.dataset.view = mode;
    const width = map.clientWidth;
    const height =
      mode === "all"
        ? (width * data.height) / data.width
        : mobile.matches
          ? 470
          : 500;
    map.style.height = `${height}px`;
    lines.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const places = {
      0: [],
      1: [[50, 85]],
      2: [
        [50, 13],
        [50, 87],
      ],
      3: [
        [50, 12],
        [82, 85],
        [18, 85],
      ],
      4: [
        [25, 16],
        [75, 16],
        [25, 84],
        [75, 84],
      ],
      5: [
        [50, 10],
        [82, 30],
        [75, 85],
        [25, 85],
        [18, 30],
      ],
    }[related.length];
    positions = new Map();
    buttons.forEach((button) => {
      const node = nodes.get(button.dataset.atlasNode);
      button.hidden = mode === "connected" && !visible.has(node.id);
      let x = (node.x / data.width) * width,
        y = (node.y / data.height) * height;
      if (mode === "connected" && visible.has(node.id)) {
        const place =
          node.id === selected ? [50, 50] : places[related.indexOf(node.id)];
        x = (width * place[0]) / 100;
        y = (height * place[1]) / 100;
      }
      positions.set(node.id, { x, y });
      button.style.left = `${x}px`;
      button.style.top = `${y}px`;
      button.setAttribute("aria-pressed", String(node.id === selected));
      button.classList.toggle("is-neighbor", related.includes(node.id));
      button.classList.toggle("is-context", !visible.has(node.id));
    });
    edges.forEach((edge) => {
      const active = edge.source === selected || edge.target === selected;
      edge.path.classList.toggle("is-active", active);
      edge.path.style.display = mode === "connected" && !active ? "none" : "";
      const a = positions.get(edge.source),
        b = positions.get(edge.target);
      edge.path.setAttribute("d", `M ${a.x} ${a.y} L ${b.x} ${b.y}`);
      // Paint the selected paper's connections above the quiet background links.
      if (active) lines.append(edge.path);
    });
    viewButtons.forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.atlasView === mode),
      ),
    );
    root.querySelector("[data-atlas-caption]").textContent =
      mode === "all"
        ? `All ${nodes.size} papers. The selected paper and its connections are highlighted.`
        : `${related.length + 1} of ${nodes.size} papers · ${related.length} ${related.length === 1 ? "connection" : "connections"} to ${nodes.get(selected).label}.`;
  }
  function select(id, writeUrl = true, announce = true) {
    selected = nodes.has(id) ? id : data.default_paper;
    const node = nodes.get(selected),
      entry = paper(selected),
      related = neighbors(selected);
    picker.value = selected;
    root.querySelector("[data-atlas-meta]").textContent =
      `${data.groups.find((group) => group.id === node.group).label} · ${entry.dataset.year}`;
    root.querySelector("#atlas-paper-title").textContent = title(selected);
    root.querySelector("[data-atlas-venue]").textContent =
      entry.querySelector(".publication-venue").textContent;
    root.querySelector("[data-atlas-summary]").textContent = node.summary;
    root.querySelector("[data-atlas-source]").href = node.source_url;
    root.querySelector("[data-atlas-publication]").href = `#${selected}`;
    root.querySelector("[data-atlas-degree]").textContent =
      `(${related.length})`;
    root.querySelector("[data-atlas-isolated]").hidden = related.length > 0;
    connections.replaceChildren();
    related.forEach((edge) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.atlasRelated = edge.other;
      const name = document.createElement("span");
      name.className = "atlas-related-name";
      name.textContent = `${nodes.get(edge.other).label} · ${paper(edge.other).dataset.year} →`;
      const label = document.createElement("span");
      label.className = "atlas-related-label";
      label.textContent = `${kinds[edge.kind]} · ${edge.label}`;
      button.append(name, label);
      button.setAttribute(
        "aria-label",
        `Explore ${title(edge.other)}. ${edge.label}.`,
      );
      button.addEventListener("click", () => {
        select(edge.other);
        // Keep keyboard focus in the updated panel when a related-paper button is replaced.
        root.querySelector("#atlas-paper-title").focus({ preventScroll: true });
      });
      const reason = document.createElement("p");
      reason.textContent = edge.reason;
      const explanation = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "Why this connection?";
      explanation.append(summary, reason);
      item.append(button, explanation);
      connections.append(item);
    });
    layout();
    if (announce)
      root.querySelector("[data-atlas-status]").textContent =
        `${node.label}, ${entry.dataset.year}. ${related.length} connected papers. Details updated.`;
    if (writeUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set("atlas", selected);
      url.hash = "atlas";
      if (url.href !== window.location.href)
        window.history.pushState(null, "", url);
    }
  }
  root.querySelector("#atlas-paper-title").tabIndex = -1;
  buttons.forEach((button) => {
    button.addEventListener("click", () => select(button.dataset.atlasNode));
    button.addEventListener("keydown", (event) => {
      const direction = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      }[event.key];
      if (
        !direction ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      event.preventDefault();
      const origin = positions.get(button.dataset.atlasNode);
      const candidates = buttons
        .filter((other) => other !== button && !other.hidden)
        .map((other) => {
          const point = positions.get(other.dataset.atlasNode);
          const dx = point.x - origin.x,
            dy = point.y - origin.y;
          return {
            button: other,
            forward: dx * direction[0] + dy * direction[1],
            score:
              Math.hypot(dx, dy) +
              2 * Math.abs(dx * direction[1] - dy * direction[0]),
          };
        })
        .filter((item) => item.forward > 1)
        .sort((a, b) => a.score - b.score);
      candidates[0]?.button.focus();
    });
  });
  picker.addEventListener("change", () => select(picker.value));
  viewButtons.forEach((button) =>
    button.addEventListener("click", () => {
      chosenView = true;
      mode = button.dataset.atlasView;
      layout();
      scroll.scrollLeft = 0;
    }),
  );
  mobile.addEventListener("change", () => {
    if (!chosenView) mode = mobile.matches ? "connected" : "all";
    layout();
  });
  const readUrl = () =>
    select(
      new URLSearchParams(window.location.search).get("atlas"),
      false,
      false,
    );
  window.addEventListener("popstate", readUrl);
  new ResizeObserver(layout).observe(scroll);
  readUrl();
})();
