const buildDate = document.querySelector("#build-date");
const publicationsList = document.querySelector("#publications-list");
const publicationsStatus = document.querySelector("#publications-status");
const publicationsSearch = document.querySelector("#publications-search");
const siteHeader = document.querySelector(".site-header");
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
const newsList = document.querySelector("#news-list");

// Single source of truth for the Publications page. Edit publications.yaml
// to add or update papers; they appear after refresh/deploy.
const LAB_PUBLICATIONS_URL = "./publications.yaml";

const MIN_PUBLICATION_YEAR = 2015;
const PAPERS_PAGE_SIZE = 20;

const LAB_MEMBERS = [
  "Hieu Le",
  "Srijan Das",
  "Pu Wang",
  "Dominick Reilly",
  "Arkaprava Sinha",
  "Manish Kumar Govind",
  "Weston Bondurant",
  "Wenhao Chi",
  "Ba-Thinh Lam",
];

let allPublications = [];
let publicationsState = {
  query: "",
  type: "all",
  year: "",
  venueLabel: "",
  tag: "",
  page: 0,
};

const TAG_RULES = [
  { tag: "Vision-Language", test: /vision[-\s]?language|vlm|multimodal|language vision/i },
  { tag: "Video Understanding", test: /video|egocentric|action|activity|temporal/i },
  { tag: "Robotics", test: /robot|robotic|manipulation|policy|embodied|navigation/i },
  { tag: "3D / Geometry", test: /\b3d\b|geometry|reconstruction|pose|point cloud|mesh|depth/i },
  { tag: "Generative", test: /diffusion|generative|synthesis|gan\b|text-to-image|image generation/i },
  { tag: "Reliable / Uncertainty", test: /uncertainty|robust|reliab|calibration|explain|interpretab/i },
];

let revealObserver = null;

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
  preprint: [
    { label: "arXiv", test: /CoRR|arXiv/i },
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
      entry.methodName,
      ...(entry.authors || []),
      ...(entry.keywords || []),
      ...(entry.tags || []),
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

function normalizeForMatch(title) {
  return normalizeText(title).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function publicationRichness(entry) {
  let score = 0;
  if (entry.abstract) score += 2;
  if (entry.link) score += 1;
  if (entry.authors?.length) score += 1;
  return score;
}

function pickPrimaryLink(links = {}) {
  const priority = ["arxiv", "project", "openreview", "paper", "pdf", "code"];

  for (const key of priority) {
    const value = links[key];
    if (value && value !== "TBD" && /^https?:\/\//i.test(String(value))) {
      return String(value);
    }
  }

  return "";
}

function classifyPublicationVenue(venue) {
  const normalizedVenue = normalizeText(venue);

  if (/preprint|arxiv/i.test(normalizedVenue)) {
    return { type: "preprint", label: "arXiv" };
  }

  return classifyVenue(normalizedVenue);
}

function formatVenueLabel(venue, year) {
  const normalizedVenue = normalizeText(venue);
  if (!normalizedVenue) {
    return String(year || "");
  }

  if (/\d{4}/.test(normalizedVenue)) {
    return normalizedVenue;
  }

  return year ? `${normalizedVenue} ${year}` : normalizedVenue;
}

function resolvePublicationAsset(path) {
  const value = normalizeText(path);
  if (!value || /^(null|none|tbd)$/i.test(value)) {
    return "";
  }

  if (/^https?:\/\//i.test(value) || value.startsWith("./") || value.startsWith("/")) {
    return value;
  }

  return `./${value.replace(/^\.?\/+/, "")}`;
}

function mapYamlPublication(paper, sourceName = "Charlotte Vision Lab") {
  const year = Number(paper.year);
  if (!paper.title || !year || year < MIN_PUBLICATION_YEAR) {
    return null;
  }

  const venue = normalizeText(paper.venue);
  const classification = classifyPublicationVenue(venue);
  const links = paper.links || {};
  const link = pickPrimaryLink(links);
  const thumbnail = resolvePublicationAsset(paper.thumbnail);
  const keywords = (paper.keywords || [])
    .map((keyword) => normalizeText(String(keyword)))
    .filter(Boolean);

  const entry = {
    authors: (paper.authors || []).map((author) =>
      normalizeText(String(author).replace(/\*+$/, "")),
    ),
    abstract: normalizeText(paper.tldr || paper.abstract || ""),
    link,
    links,
    sourceName,
    title: normalizeText(paper.title),
    methodName: normalizeText(paper["method-name"] || paper.method_name || ""),
    venue: formatVenueLabel(venue, year),
    venueLabel: classification.label,
    venueType: classification.type,
    year,
    thumbnail,
    mediaType: /\.(mp4|webm|mov)(\?|$)/i.test(thumbnail) ? "video" : "image",
    keywords,
  };

  const inferred = inferTags(entry).filter((tag) => tag !== "Other");
  const keywordTags = keywords.map((keyword) =>
    keyword
      .split(/[-_\s]+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" "),
  );
  const tags = Array.from(new Set([...inferred, ...keywordTags]));
  entry.tags = tags.length ? tags : ["Other"];
  return entry;
}

async function loadLabPublications() {
  if (!window.jsyaml) {
    throw new Error("js-yaml is required to load lab publications");
  }

  const response = await fetch(LAB_PUBLICATIONS_URL, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${LAB_PUBLICATIONS_URL} (HTTP ${response.status})`);
  }

  const papers = window.jsyaml.load(await response.text());
  if (!Array.isArray(papers)) {
    return [];
  }

  return papers.map((paper) => mapYamlPublication(paper)).filter(Boolean);
}

async function loadPublications() {
  if (!publicationsList || !publicationsStatus) {
    return;
  }

  publicationsStatus.hidden = false;
  publicationsStatus.textContent = "Loading publications...";

  try {
    allPublications = dedupeEntries(await loadLabPublications());
    syncPapersSelectOptions(allPublications);
    rerenderPublications();

    if (!allPublications.length) {
      publicationsStatus.hidden = false;
      publicationsStatus.textContent =
        "No publications found. Add entries to publications.yaml.";
    }
  } catch (error) {
    console.warn(error);
    publicationsStatus.hidden = false;
    publicationsStatus.textContent =
      "Could not load publications.yaml in this browser session.";
  }
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

  for (const rule of VENUE_RULES.preprint) {
    if (rule.test.test(venue)) {
      return { type: "preprint", label: rule.label };
    }
  }

  return { type: "conference", label: "Other" };
}


function venueSortRank(entry) {
  const order = {
    ECCV: 0,
    CVPR: 1,
    ICCV: 2,
    NeurIPS: 3,
    ICML: 4,
    ICLR: 5,
    WACV: 6,
    AAAI: 7,
    arXiv: 100,
    Other: 150,
  };

  return order[entry.venueLabel] ?? 120;
}

function sortEntries(entries) {
  return entries.sort((left, right) => {
    if (right.year !== left.year) {
      return right.year - left.year;
    }

    const venueRankDiff = venueSortRank(left) - venueSortRank(right);
    if (venueRankDiff !== 0) {
      return venueRankDiff;
    }

    if (left.venueType !== right.venueType) {
      return left.venueType.localeCompare(right.venueType);
    }

    return left.title.localeCompare(right.title);
  });
}

function groupByYear(entries) {
  const grouped = new Map();

  for (const entry of entries) {
    if (!grouped.has(entry.year)) {
      grouped.set(entry.year, { conference: [], journal: [], preprint: [] });
    }

    grouped.get(entry.year)[entry.venueType].push(entry);
  }

  return Array.from(grouped.entries())
    .sort((left, right) => right[0] - left[0])
    .map(([year, bucket]) => ({
      year,
      conference: sortEntries(bucket.conference),
      journal: sortEntries(bucket.journal),
      preprint: sortEntries(bucket.preprint),
    }));
}

function extractArxivId(value) {
  const match = String(value || "").match(/(\d{4}\.\d{4,5})/);
  return match ? match[1] : "";
}

function getPublicationMatchKeys(entry) {
  const keys = new Set();
  const normalizedTitle = normalizeForMatch(entry.title);

  if (normalizedTitle) {
    keys.add(`title:${normalizedTitle}`);
  }

  const arxivId = extractArxivId(entry.link);
  if (arxivId) {
    keys.add(`arxiv:${arxivId}`);
  }

  for (const linkValue of Object.values(entry.links || {})) {
    const linkedArxivId = extractArxivId(linkValue);
    if (linkedArxivId) {
      keys.add(`arxiv:${linkedArxivId}`);
    }
  }

  const titlePrefix = normalizeText(entry.title).split(":")[0];
  const prefixKey = normalizeForMatch(titlePrefix);
  if (prefixKey.length >= 5) {
    keys.add(`prefix:${prefixKey}`);
  }

  return keys;
}

function titlesMatch(leftTitle, rightTitle) {
  const left = normalizeForMatch(leftTitle);
  const right = normalizeForMatch(rightTitle);

  if (!left || !right) {
    return false;
  }

  if (left === right) {
    return true;
  }

  const shorter = left.length < right.length ? left : right;
  const longer = left.length < right.length ? right : left;
  return shorter.length >= 5 && longer.includes(shorter);
}

function entriesMatch(left, right) {
  const leftKeys = getPublicationMatchKeys(left);
  const rightKeys = getPublicationMatchKeys(right);

  for (const key of leftKeys) {
    if (rightKeys.has(key)) {
      return true;
    }
  }

  return titlesMatch(left.title, right.title);
}

function dedupeEntries(entries) {
  const kept = [];

  for (const entry of entries) {
    const duplicateIndex = kept.findIndex((existing) => entriesMatch(existing, entry));

    if (duplicateIndex === -1) {
      kept.push(entry);
      continue;
    }

    if (publicationRichness(entry) > publicationRichness(kept[duplicateIndex])) {
      kept[duplicateIndex] = entry;
    }
  }

  return kept;
}

function renderPublicationThumbnail(entry) {
  if (!entry.thumbnail) {
    return "";
  }

  if (entry.mediaType === "video") {
    return `
      <div class="publication-thumb">
        <video autoplay muted loop playsinline preload="metadata" aria-hidden="true">
          <source src="${entry.thumbnail}" type="video/mp4" />
        </video>
      </div>
    `;
  }

  return `
    <div class="publication-thumb">
      <img src="${entry.thumbnail}" alt="" loading="lazy" />
    </div>
  `;
}

function renderPublicationAbstract(entry) {
  const prefilledAbstract = entry.abstract ? escapeHtml(entry.abstract) : "";

  return `
    <div class="publication-abstract">
      <button
        class="fetch-abstract-btn publication-abstract-toggle"
        type="button"
        aria-expanded="false"
        data-title="${encodeURIComponent(entry.title)}"
        data-has-abstract="${entry.abstract ? "true" : "false"}"
      >
        Read abstract
      </button>
      <p class="abstract-text publication-abstract-text" hidden>${prefilledAbstract}</p>
    </div>
  `;
}

function normalizeAuthorName(name) {
  return normalizeText(name).toLowerCase().replace(/\*+$/, "");
}

function isLabMember(authorName) {
  const normalizedAuthor = normalizeAuthorName(authorName);

  return LAB_MEMBERS.some((member) => {
    const normalizedMember = normalizeAuthorName(member);

    if (normalizedAuthor === normalizedMember) {
      return true;
    }

    if (
      normalizedAuthor.includes(normalizedMember) ||
      normalizedMember.includes(normalizedAuthor)
    ) {
      return true;
    }

    const memberParts = normalizedMember.split(/\s+/);
    const authorParts = normalizedAuthor.split(/\s+/);

    return (
      memberParts.length >= 2 &&
      authorParts.length >= 2 &&
      memberParts[0] === authorParts[0] &&
      memberParts.at(-1) === authorParts.at(-1)
    );
  });
}

function formatAuthorName(authorName) {
  const cleaned = normalizeText(authorName).replace(/\*+$/, "");

  if (!isLabMember(cleaned)) {
    return escapeHtml(cleaned);
  }

  return `<span class="publication-author-lab">${escapeHtml(cleaned)}</span>`;
}

function formatAuthors(authors = []) {
  return authors.map(formatAuthorName).join(", ");
}

function formatPublicationTitle(entry) {
  const venueInline = entry.venue
    ? ` <span class="publication-venue-inline">(${escapeHtml(entry.venue)})</span>`
    : "";
  const titleText = escapeHtml(entry.title);

  if (!entry.link) {
    return `${titleText}${venueInline}`;
  }

  return `<a class="text-link" href="${escapeHtml(entry.link)}" target="_blank" rel="noreferrer noopener">${titleText}</a>${venueInline}`;
}

function entryMarkup(entry) {
  const authors = formatAuthors(entry.authors);
  const title = formatPublicationTitle(entry);
  const thumbClass = entry.thumbnail ? " publication-entry-has-thumb" : "";

  return `
    <article class="publication-entry${thumbClass}">
      ${renderPublicationThumbnail(entry)}
      <div class="publication-entry-body">
        <h5>${title}</h5>
        <p>${authors}</p>
        ${renderPublicationAbstract(entry)}
      </div>
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
  const ordered = [...bucket.conference, ...bucket.journal, ...bucket.preprint];

  if (!ordered.length) {
    return '<p class="publication-empty">No matching papers for this year.</p>';
  }

  return `
    <div class="publication-stack">
      ${ordered.map(entryMarkup).join("")}
    </div>
  `;
}

function renderPublications(years, yearTotals = {}) {
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
    .map((bucket) => {
      const totalForYear = yearTotals[bucket.year] ||
        (bucket.conference.length + bucket.journal.length + (bucket.preprint ? bucket.preprint.length : 0));
      return `
        <section class="publication-year">
          <div class="publication-year-head">
            <h3>${bucket.year}</h3>
            <span class="publication-chip">
              ${totalForYear} paper${totalForYear === 1 ? "" : "s"}
            </span>
          </div>
          ${sequentialMarkup(bucket)}
        </section>
      `;
    })
    .join("");
}

function syncHeaderState() {
  if (!siteHeader) {
    return;
  }

  siteHeader.classList.toggle("has-scrolled", window.scrollY > 18);
}

function revealTargets(root = document) {
  return Array.from(
    root.querySelectorAll(
      ".hero, .metric-card, .hero-panel-head, .hero-figure, .hero-note",
    ),
  );
}

function queueRevealElements(root = document) {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (prefersReducedMotion.matches) {
    return;
  }

  const elements = revealTargets(root).filter((element) => !element.dataset.revealReady);

  for (const [index, element] of elements.entries()) {
    element.dataset.revealReady = "true";
    element.classList.add("reveal-on-scroll");

    const parent = element.parentElement;
    const siblingIndex = parent ? Array.from(parent.children).indexOf(element) : index;
    element.style.setProperty(
      "--reveal-delay",
      `${Math.min(Math.max(siblingIndex, 0), 5) * 70}ms`,
    );

    if (revealObserver) {
      revealObserver.observe(element);
    } else {
      element.classList.add("is-visible");
    }
  }
}

function initMotion() {
  syncHeaderState();
  window.addEventListener("scroll", syncHeaderState, { passive: true });

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  if (!("IntersectionObserver" in window)) {
    queueRevealElements(document);
    return;
  }

  revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue;
        }

        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    },
    {
      // Tall home sections never reached the old 0.14 threshold while mostly
      // below the fold, so they stayed opacity: 0. Reveal on first pixel.
      rootMargin: "0px 0px -4% 0px",
      threshold: 0,
    },
  );

  queueRevealElements(document);
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
  const yearTotals = {};
  for (const entry of ordered) {
    yearTotals[entry.year] = (yearTotals[entry.year] || 0) + 1;
  }
  const paged = applyPagination(ordered);
  renderPublications(groupByYear(paged), yearTotals);
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

if (publicationsList) {
  publicationsList.addEventListener("click", async (event) => {
    if (event.target.classList.contains("fetch-abstract-btn")) {
      const btn = event.target;
      const container = btn.nextElementSibling;

      if (!container.hidden) {
        container.hidden = true;
        btn.textContent = "Read abstract";
        btn.setAttribute("aria-expanded", "false");
        return;
      }

      const hasPrefilledAbstract = btn.getAttribute("data-has-abstract") === "true";

      if (
        !hasPrefilledAbstract &&
        (!container.textContent ||
          container.textContent.includes("Failed") ||
          container.textContent.includes("not available"))
      ) {
        btn.textContent = "Loading...";
        try {
          const rawTitle = decodeURIComponent(btn.getAttribute("data-title"));

          const cleanTitle = rawTitle.replace(/[^a-zA-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

          const url = `https://api.openalex.org/works?filter=title.search:${encodeURIComponent(cleanTitle)}&select=abstract_inverted_index`;

          const response = await fetch(url);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const data = await response.json();

          if (data.results && data.results.length > 0 && data.results[0].abstract_inverted_index) {
            const inverted = data.results[0].abstract_inverted_index;
            const words = [];

            for (const [word, positions] of Object.entries(inverted)) {
              for (const pos of positions) {
                words[pos] = word;
              }
            }

            let abstractText = words.join(" ");

            abstractText = abstractText.replace(/\\textbf{([^}]+)}/g, "<strong>$1</strong>");
            abstractText = abstractText.replace(/\\emph{([^}]+)}/g, "<em>$1</em>");
            abstractText = abstractText.replace(/\\textit{([^}]+)}/g, "<em>$1</em>");

            container.innerHTML = abstractText;

            if (window.MathJax) {
              MathJax.typesetPromise([container]);
            }
          } else {
            container.textContent = "Abstract not available in the open database.";
          }
        } catch (err) {
          container.textContent = `Failed to load abstract. Please try again later.`;
        }
      }

      container.hidden = false;
      btn.textContent = "Hide abstract";
      btn.setAttribute("aria-expanded", "true");
    }
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatNewsDate(dateValue) {
  const [year, month = "01", day = "01"] = String(dateValue).split("-");
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  if (Number.isNaN(parsed.getTime())) {
    return { datetime: dateValue, label: dateValue };
  }

  const hasDay = dateValue.split("-").length >= 3;
  const label = new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    ...(hasDay ? { day: "numeric" } : {}),
    timeZone: "UTC",
  }).format(parsed);

  return { datetime: dateValue, label };
}

function highlightConferenceInText(text, venue) {
  const escapedText = escapeHtml(text);

  if (venue) {
    const escapedVenue = escapeHtml(venue);
    if (escapedText.includes(escapedVenue)) {
      return escapedText.replace(
        escapedVenue,
        `<strong class="news-conf">${escapedVenue}</strong>`,
      );
    }
  }

  return escapedText.replace(
    /\b((?:CVPR|ECCV|ICCV|ICML|NeurIPS|ICLR|AAAI|WACV|BMVC|CoRL)\s+\d{4})\b/g,
    '<strong class="news-conf">$1</strong>',
  );
}

function renderNewsItem(item) {
  const { datetime, label } = formatNewsDate(item.date);
  const body = highlightConferenceInText(item.text, item.venue);
  const text = item.href
    ? `<a href="${escapeHtml(item.href)}">${body}</a>`
    : body;

  return `
    <li class="news-item">
      <time class="news-date" datetime="${escapeHtml(datetime)}">${escapeHtml(label)}</time>
      <p class="news-text">${text}</p>
    </li>
  `;
}

function renderNewsStatus(message) {
  if (!newsList) {
    return;
  }

  newsList.innerHTML = `<li class="news-item news-status">${escapeHtml(message)}</li>`;
}

function renderNewsItems(items) {
  if (!newsList) {
    return;
  }

  if (!Array.isArray(items) || items.length === 0) {
    renderNewsStatus("No news items yet.");
    return;
  }

  const sortedItems = [...items].sort((left, right) =>
    String(right.date).localeCompare(String(left.date)),
  );

  newsList.innerHTML = sortedItems.map(renderNewsItem).join("");
}

async function loadNews() {
  if (!newsList) {
    return;
  }

  try {
    const response = await fetch("./news.json", { cache: "no-cache" });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const items = await response.json();
    renderNewsItems(items);
  } catch (error) {
    // Keep any static markup already in the page when the feed cannot load.
    if (newsList.children.length === 0) {
      renderNewsStatus("News is temporarily unavailable.");
    }
  }
}

initMotion();
loadNews();
loadPublications();
