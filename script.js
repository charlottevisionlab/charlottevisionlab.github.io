const buildDate = document.querySelector("#build-date");
const publicationsList = document.querySelector("#publications-list");
const publicationsStatus = document.querySelector("#publications-status");
const publicationsSearch = document.querySelector("#publications-search");
const publicationsCount = document.querySelector("#publications-count");
const publicationsTypeButtons = Array.from(
  document.querySelectorAll("[data-publications-type]"),
);
const papersYearSelect = document.querySelector("#papers-year");
const papersTypeSelect = document.querySelector("#papers-type");
const papersVenueSelect = document.querySelector("#papers-venue");
const papersTagSelect = document.querySelector("#papers-tag");
const papersResetButton = document.querySelector("#papers-reset");
const papersPrevButton = document.querySelector("#papers-prev");
const papersNextButton = document.querySelector("#papers-next");
const papersPageInfo = document.querySelector("#papers-pageinfo");

const DBLP_FEEDS = [
  {
    name: "Hieu Le",
    url: "https://dblp.org/pid/123/2117-1.xml",
  },
  {
    name: "Srijan Das",
    url: "https://dblp.org/pid/173/0062.xml",
  },
];

const MIN_PUBLICATION_YEAR = 2022;
const PAPERS_PAGE_SIZE = 10;

let allPublications = [];
let publicationsState = {
  query: "",
  type: "all", // all | conference | journal
  year: "", // "" means any
  venueLabel: "", // "" means any
  tag: "", // "" means any
  page: 0, // 0-indexed
};

const TAG_RULES = [
  { tag: "Vision-Language", test: /vision[-\s]?language|vlm|multimodal|language vision/i },
  { tag: "Video Understanding", test: /video|egocentric|action|activity|temporal/i },
  { tag: "Robotics", test: /robot|robotic|manipulation|policy|embodied|navigation/i },
  { tag: "3D / Geometry", test: /\b3d\b|geometry|reconstruction|pose|point cloud|mesh|depth/i },
  { tag: "Generative", test: /diffusion|generative|synthesis|gan\b|text-to-image|image generation/i },
  { tag: "Reliable / Uncertainty", test: /uncertainty|robust|reliab|calibration|explain|interpretab/i },
];

const VENUE_RULES = {
  conference: [
    { label: "CVPR", test: /CVPR|Computer Vision and Pattern Recognition/i },
    { label: "ICCV", test: /ICCV|International Conference on Computer Vision/i },
    { label: "ECCV", test: /ECCV|European Conference on Computer Vision/i },
    { label: "ICML", test: /ICML|International Conference on Machine Learning/i },
    { label: "NeurIPS", test: /NeurIPS|Advances in Neural Information Processing Systems/i },
    { label: "ICLR", test: /ICLR|International Conference on Learning Representations/i },
    { label: "AAAI", test: /AAAI|AAAI Conference on Artificial Intelligence/i },
    { label: "WACV", test: /WACV|Winter Conference on Applications of Computer Vision/i },
  ],
  journal: [
    { label: "TPAMI", test: /Pattern Anal\. Mach\. Intell\.|TPAMI/i },
    { label: "MeDIA", test: /Medical Image Anal\.|MeDIA/i },
    { label: "IJCV", test: /Int\. J\. Comput\. Vis\.|IJCV/i },
    { label: "TMLR", test: /Trans\. Mach\. Learn\. Res\.|TMLR/i },
  ],
};

if (buildDate) {
  buildDate.textContent = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

function normalizeText(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function filteredPublications(entries, state) {
  const query = normalizeText(state.query).toLowerCase();
  const type = state.type;
  const year = state.year;
  const venueLabel = state.venueLabel;
  const tag = state.tag;

  return entries.filter((entry) => {
    if (type !== "all" && entry.venueType !== type) {
      return false;
    }

    if (year && String(entry.year) !== String(year)) {
      return false;
    }

    if (venueLabel && entry.venueLabel !== venueLabel) {
      return false;
    }

    if (tag && !(entry.tags || []).includes(tag)) {
      return false;
    }

    if (!query) {
      return true;
    }

    const haystack = [
      entry.title,
      entry.venue,
      entry.venueLabel,
      entry.sourceName,
      ...(entry.authors || []),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });
}

function updatePublicationsCount(count) {
  if (!publicationsCount) return;
  publicationsCount.textContent = `${count} result${count === 1 ? "" : "s"}`;
}

function updatePager(totalCount) {
  if (!papersPageInfo || !papersPrevButton || !papersNextButton) {
    return;
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAPERS_PAGE_SIZE));
  const page = Math.min(Math.max(0, publicationsState.page), totalPages - 1);

  const start = totalCount === 0 ? 0 : page * PAPERS_PAGE_SIZE + 1;
  const end = Math.min(totalCount, (page + 1) * PAPERS_PAGE_SIZE);

  papersPageInfo.textContent =
    totalCount === 0
      ? "No results"
      : `Showing ${start}-${end} of ${totalCount}`;

  papersPrevButton.disabled = page <= 0;
  papersNextButton.disabled = page >= totalPages - 1;
}

function applyPagination(entries) {
  if (!papersPageInfo || !papersPrevButton || !papersNextButton) {
    return entries;
  }

  const totalPages = Math.max(1, Math.ceil(entries.length / PAPERS_PAGE_SIZE));
  const page = Math.min(Math.max(0, publicationsState.page), totalPages - 1);
  const startIdx = page * PAPERS_PAGE_SIZE;
  return entries.slice(startIdx, startIdx + PAPERS_PAGE_SIZE);
}

function uniqueSorted(values, compare) {
  return Array.from(new Set(values)).sort(compare);
}

function inferTags(entry) {
  const haystack = `${entry.title || ""} ${entry.venue || ""}`.toLowerCase();
  const tags = TAG_RULES.filter((rule) => rule.test.test(haystack)).map(
    (rule) => rule.tag,
  );
  return tags.length ? tags : ["Other"];
}

function syncPapersSelectOptions(entries) {
  if (papersYearSelect) {
    const years = uniqueSorted(
      entries.map((e) => e.year).filter(Boolean),
      (a, b) => b - a,
    );
    const selected = papersYearSelect.value;
    papersYearSelect.innerHTML =
      `<option value="">Any</option>` +
      years.map((y) => `<option value="${y}">${y}</option>`).join("");
    papersYearSelect.value = selected;
  }

  if (papersVenueSelect) {
    const venues = uniqueSorted(
      entries.map((e) => e.venueLabel).filter(Boolean),
      (a, b) => a.localeCompare(b),
    );
    const selected = papersVenueSelect.value;
    papersVenueSelect.innerHTML =
      `<option value="">Any</option>` +
      venues.map((v) => `<option value="${v}">${v}</option>`).join("");
    papersVenueSelect.value = selected;
  }

  if (papersTagSelect) {
    const tags = uniqueSorted(
      entries.flatMap((e) => e.tags || []),
      (a, b) => a.localeCompare(b),
    );
    const selected = papersTagSelect.value;
    papersTagSelect.innerHTML =
      `<option value="">Any</option>` +
      tags.map((t) => `<option value="${t}">${t}</option>`).join("");
    papersTagSelect.value = selected;
  }
}

function parseAuthors(node) {
  return Array.from(node.querySelectorAll("author"))
    .map((author) => normalizeText(author.textContent))
    .filter(Boolean);
}

function firstText(node, selector) {
  return normalizeText(node.querySelector(selector)?.textContent || "");
}

function recordLink(node) {
  const ee = node.querySelector("ee");
  if (ee?.textContent) {
    return normalizeText(ee.textContent);
  }

  const url = firstText(node, "url");
  if (url.startsWith("db/")) {
    return `https://dblp.org/rec/${url.slice(3)}`;
  }

  return "";
}

function classifyVenue(venue) {
  for (const rule of VENUE_RULES.conference) {
    if (rule.test.test(venue)) {
      return { type: "conference", label: rule.label };
    }
  }

  for (const rule of VENUE_RULES.journal) {
    if (rule.test.test(venue)) {
      return { type: "journal", label: rule.label };
    }
  }

  return null;
}

function parseRecord(node, sourceName) {
  const title = firstText(node, "title");
  const year = Number.parseInt(firstText(node, "year"), 10);
  const venue = firstText(node, "booktitle") || firstText(node, "journal");
  const classification = classifyVenue(venue);

  if (!title || !year || year < MIN_PUBLICATION_YEAR || !classification) {
    return null;
  }

  const entry = {
    authors: parseAuthors(node),
    link: recordLink(node),
    sourceName,
    title,
    venue,
    venueLabel: classification.label,
    venueType: classification.type,
    year,
  };

  entry.tags = inferTags(entry);
  return entry;
}

function sortEntries(entries) {
  return entries.sort((left, right) => {
    if (right.year !== left.year) {
      return right.year - left.year;
    }

    if (left.venueType !== right.venueType) {
      return left.venueType.localeCompare(right.venueType);
    }

    if (left.venueLabel !== right.venueLabel) {
      return left.venueLabel.localeCompare(right.venueLabel);
    }

    return left.title.localeCompare(right.title);
  });
}

function groupByYear(entries) {
  const grouped = new Map();

  for (const entry of entries) {
    if (!grouped.has(entry.year)) {
      grouped.set(entry.year, { conference: [], journal: [] });
    }

    grouped.get(entry.year)[entry.venueType].push(entry);
  }

  return Array.from(grouped.entries())
    .sort((left, right) => right[0] - left[0])
    .map(([year, bucket]) => ({
      year,
      conference: sortEntries(bucket.conference),
      journal: sortEntries(bucket.journal),
    }));
}

function dedupeEntries(entries) {
  const seen = new Set();

  return entries.filter((entry) => {
    const key = `${entry.year}::${entry.title.toLowerCase()}::${entry.venueLabel}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function entryMarkup(entry) {
  const authors = entry.authors.join(", ");
  const title = entry.link
    ? `<a class="text-link" href="${entry.link}">${entry.title}</a>`
    : entry.title;

  return `
    <article class="publication-entry">
      <div class="publication-meta">
        <span class="publication-chip">${entry.venueLabel}</span>
        <span class="publication-chip">${entry.sourceName}</span>
      </div>
      <h5>${title}</h5>
      <p>${authors}</p>
      <p>${entry.venue}</p>
    </article>
  `;
}

function columnMarkup(title, entries) {
  if (!entries.length) {
    return `
      <div class="publication-column">
        <h4>${title}</h4>
        <p class="publication-empty">No matching papers for this category in the selected venues.</p>
      </div>
    `;
  }

  return `
    <div class="publication-column">
      <h4>${title}</h4>
      <div class="publication-stack">
        ${entries.map(entryMarkup).join("")}
      </div>
    </div>
  `;
}

function sequentialMarkup(bucket) {
  const ordered = [...bucket.conference, ...bucket.journal];

  if (!ordered.length) {
    return '<p class="publication-empty">No matching papers for this year.</p>';
  }

  return `
    <div class="publication-stack">
      ${ordered.map(entryMarkup).join("")}
    </div>
  `;
}

function renderPublications(years) {
  if (!publicationsList || !publicationsStatus) {
    return;
  }

  if (!years.length) {
    publicationsStatus.textContent = "No publications match the current filters.";
    publicationsStatus.hidden = false;
    publicationsList.innerHTML = "";
    return;
  }

  publicationsStatus.hidden = true;
  publicationsList.innerHTML = years
    .map(
      (bucket) => `
        <section class="publication-year">
          <div class="publication-year-head">
            <h3>${bucket.year}</h3>
            <span class="publication-chip">
              ${bucket.conference.length + bucket.journal.length} papers
            </span>
          </div>
          ${sequentialMarkup(bucket)}
        </section>
      `,
    )
    .join("");
}

function setActiveType(type) {
  publicationsState = { ...publicationsState, type };
  for (const button of publicationsTypeButtons) {
    const isActive = button.dataset.publicationsType === type;
    button.classList.toggle("is-active", isActive);
  }
  rerenderPublications();
}

function rerenderPublications() {
  const filtered = filteredPublications(allPublications, publicationsState);
  const ordered = sortEntries([...filtered]);
  updatePublicationsCount(ordered.length);
  updatePager(ordered.length);
  const paged = applyPagination(ordered);
  renderPublications(groupByYear(paged));
}

async function loadPublications() {
  if (!publicationsList || !publicationsStatus) {
    return;
  }

  try {
    const xmlDocs = await Promise.all(
      DBLP_FEEDS.map(async (feed) => {
        const response = await fetch(feed.url);
        if (!response.ok) {
          throw new Error(`Failed to fetch ${feed.name} DBLP feed`);
        }

        const xml = await response.text();
        const doc = new DOMParser().parseFromString(xml, "text/xml");
        return { doc, name: feed.name };
      }),
    );

    const entries = xmlDocs.flatMap(({ doc, name }) =>
      Array.from(doc.querySelectorAll("r > article, r > inproceedings"))
        .map((node) => parseRecord(node, name))
        .filter(Boolean),
    );

    allPublications = dedupeEntries(entries);
    syncPapersSelectOptions(allPublications);
    rerenderPublications();
  } catch (error) {
    publicationsStatus.textContent =
      "Could not load the live DBLP feed in this browser session. You can still browse the featured highlights below.";
  }
}

if (publicationsSearch) {
  publicationsSearch.addEventListener("input", (event) => {
    publicationsState = {
      ...publicationsState,
      query: event.target.value,
      page: 0,
    };
    rerenderPublications();
  });
}

for (const button of publicationsTypeButtons) {
  button.addEventListener("click", () => {
    setActiveType(button.dataset.publicationsType || "all");
  });
}

if (papersTypeSelect) {
  papersTypeSelect.addEventListener("change", () => {
    publicationsState = {
      ...publicationsState,
      type: papersTypeSelect.value || "all",
      page: 0,
    };
    rerenderPublications();
  });
}

if (papersYearSelect) {
  papersYearSelect.addEventListener("change", () => {
    publicationsState = {
      ...publicationsState,
      year: papersYearSelect.value || "",
      page: 0,
    };
    rerenderPublications();
  });
}

if (papersVenueSelect) {
  papersVenueSelect.addEventListener("change", () => {
    publicationsState = {
      ...publicationsState,
      venueLabel: papersVenueSelect.value || "",
      page: 0,
    };
    rerenderPublications();
  });
}

if (papersTagSelect) {
  papersTagSelect.addEventListener("change", () => {
    publicationsState = { ...publicationsState, tag: papersTagSelect.value || "", page: 0 };
    rerenderPublications();
  });
}

if (papersPrevButton) {
  papersPrevButton.addEventListener("click", () => {
    publicationsState = { ...publicationsState, page: Math.max(0, publicationsState.page - 1) };
    rerenderPublications();
  });
}

if (papersNextButton) {
  papersNextButton.addEventListener("click", () => {
    publicationsState = { ...publicationsState, page: publicationsState.page + 1 };
    rerenderPublications();
  });
}

if (papersResetButton) {
  papersResetButton.addEventListener("click", () => {
    publicationsState = {
      query: "",
      type: "all",
      year: "",
      venueLabel: "",
      tag: "",
      page: 0,
    };
    if (publicationsSearch) publicationsSearch.value = "";
    if (papersTypeSelect) papersTypeSelect.value = "all";
    if (papersYearSelect) papersYearSelect.value = "";
    if (papersVenueSelect) papersVenueSelect.value = "";
    if (papersTagSelect) papersTagSelect.value = "";
    for (const button of publicationsTypeButtons) {
      const isActive = button.dataset.publicationsType === "all";
      button.classList.toggle("is-active", isActive);
    }
    rerenderPublications();
  });
}

loadPublications();
