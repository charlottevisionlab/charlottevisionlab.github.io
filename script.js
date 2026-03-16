const buildDate = document.querySelector("#build-date");

if (buildDate) {
  buildDate.textContent = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());
}
