const buildDate = document.querySelector("#build-date");
const publicationsList = document.querySelector("#publications-list");
const publicationsStatus = document.querySelector("#publications-status");

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

  return {
    authors: parseAuthors(node),
    link: recordLink(node),
    sourceName,
    title,
    venue,
    venueLabel: classification.label,
    venueType: classification.type,
    year,
  };
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
    publicationsStatus.textContent =
      "No publications matched the selected DBLP venue filters.";
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

    renderPublications(groupByYear(dedupeEntries(entries)));
  } catch (error) {
    publicationsStatus.textContent =
      "Could not load the live DBLP feed in this browser session. You can still browse the featured highlights below.";
  }
}

loadPublications();
