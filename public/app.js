const queryInput = document.getElementById("query");
const limitInput = document.getElementById("limit");
const enginesEl = document.getElementById("engines");
const suggestionsEl = document.getElementById("suggestions");
const datasetInfoEl = document.getElementById("dataset-info");

const SUGGESTIONS = [
  "amsterdm",
  "barcalona",
  "chigago",
  "lndon",
  "los angles",
  "nw yrok",
  "pariss",
  "Sand fransic",
  "toyko",
  "sidney",
];

let engines = [];
let abortController = null;
let debounceTimer = null;

async function bootstrap() {
  const [enginesResp, datasetsResp] = await Promise.all([
    fetch("/api/engines").then((r) => r.json()),
    fetch("/api/datasets").then((r) => r.json()),
  ]);
  engines = enginesResp.engines;
  renderEngineCards();
  renderSuggestions();
  const dataset = datasetsResp.datasets[0];
  if (dataset) {
    datasetInfoEl.textContent = `dataset: ${dataset.displayName}`;
  }
}

function renderEngineCards() {
  enginesEl.innerHTML = "";
  for (const engine of engines) {
    const card = document.createElement("section");
    card.className = "engine";
    card.dataset.engine = engine.id;
    card.setAttribute("aria-labelledby", `engine-${engine.id}-name`);
    card.innerHTML = `
      <div class="engine-header">
        <div>
          <h2 class="engine-name" id="engine-${engine.id}-name">${escape(engine.displayName)}</h2>
          <span class="engine-license" aria-label="License: ${escape(engine.license)}">${escape(engine.license)}</span>
        </div>
        <div class="engine-latency" data-latency aria-label="Latency">—</div>
      </div>
      <p class="engine-description">${escape(engine.description)}</p>
      <ul class="hits" data-hits aria-label="Results from ${escape(engine.displayName)}"></ul>
    `;
    enginesEl.appendChild(card);
  }
}

function renderSuggestions() {
  suggestionsEl.innerHTML =
    '<span class="suggestions-label">try a misspelling:</span>' +
    SUGGESTIONS.map(
      (suggestion) =>
        `<button type="button" class="chip" data-query="${escape(suggestion)}" aria-label="Search for ${escape(suggestion)}">${escape(suggestion)}</button>`,
    ).join("");

  for (const chip of suggestionsEl.querySelectorAll(".chip")) {
    chip.addEventListener("click", () => {
      queryInput.value = chip.dataset.query;
      queryInput.focus();
      scheduleSearch();
    });
  }
}

function escape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function runSearch(query, limit) {
  if (abortController) abortController.abort();
  abortController = new AbortController();
  enginesEl.setAttribute("aria-busy", "true");

  for (const card of enginesEl.querySelectorAll(".engine")) {
    card.querySelector("[data-latency]").textContent = "…";
  }

  if (!query) {
    for (const card of enginesEl.querySelectorAll(".engine")) {
      card.querySelector("[data-hits]").innerHTML =
        '<div class="empty">type a query to compare results</div>';
      card.querySelector("[data-latency]").textContent = "—";
      card.querySelector("[data-latency]").className = "engine-latency";
    }
    return;
  }

  try {
    const resp = await fetch(
      `/api/search?q=${encodeURIComponent(query)}&limit=${limit}`,
      { signal: abortController.signal },
    );
    const json = await resp.json();
    renderResults(json.results || {});
  } catch (error) {
    if (error.name === "AbortError") return;
    console.error(error);
  } finally {
    enginesEl.setAttribute("aria-busy", "false");
  }
}

function renderResults(results) {
  for (const engine of engines) {
    const card = enginesEl.querySelector(`[data-engine="${engine.id}"]`);
    const result = results[engine.id];
    const latencyEl = card.querySelector("[data-latency]");
    const hitsEl = card.querySelector("[data-hits]");

    if (!result) {
      latencyEl.textContent = "—";
      latencyEl.className = "engine-latency";
      hitsEl.innerHTML = "";
      continue;
    }

    latencyEl.textContent = `${result.ms} ms`;
    latencyEl.className = `engine-latency ${
      result.ms < 50 ? "fast" : result.ms > 200 ? "slow" : ""
    }`;

    if (result.error) {
      hitsEl.innerHTML = `<div class="error">${escape(result.error)}</div>`;
      continue;
    }
    if (!result.hits.length) {
      hitsEl.innerHTML = '<div class="empty">no results</div>';
      continue;
    }

    hitsEl.innerHTML = result.hits
      .map(
        (hit) => `
          <li>
            <div class="hit-primary">${escape(hit.primaryText || hit.displayName)}</div>
            <div class="hit-secondary">${escape(hit.secondaryText || "")}</div>
          </li>
        `,
      )
      .join("");
  }
}

function scheduleSearch() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    runSearch(queryInput.value.trim(), Number(limitInput.value) || 10);
  }, 80);
}

queryInput.addEventListener("input", scheduleSearch);
limitInput.addEventListener("change", scheduleSearch);

bootstrap();
