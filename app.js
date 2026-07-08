const STORAGE_KEY = "tap-counter-daily-v1";
const COUNT_KEYS = ["male_business", "male_private", "female_business", "female_private"];
const LABELS = {
  male_business: "男性ビジネス",
  male_private: "男性プライベート",
  female_business: "女性ビジネス",
  female_private: "女性プライベート",
};
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const MONDAY_FIRST = ["月", "火", "水", "木", "金", "土", "日"];

const state = {
  data: loadData(),
  today: getJapanDateString(),
  editing: false,
  viewYear: 0,
  viewMonth: 0,
};

const els = {
  mainView: document.querySelector("#mainView"),
  calendarView: document.querySelector("#calendarView"),
  todayLabel: document.querySelector("#todayLabel"),
  todayTotal: document.querySelector("#todayTotal"),
  openCalendarButton: document.querySelector("#openCalendarButton"),
  backButton: document.querySelector("#backButton"),
  resetButton: document.querySelector("#resetButton"),
  editModeButton: document.querySelector("#editModeButton"),
  calendarGrid: document.querySelector("#calendarGrid"),
  monthLabel: document.querySelector("#monthLabel"),
  monthSummary: document.querySelector("#monthSummary"),
  weekSummary: document.querySelector("#weekSummary"),
  weekdaySummary: document.querySelector("#weekdaySummary"),
  prevMonthButton: document.querySelector("#prevMonthButton"),
  nextMonthButton: document.querySelector("#nextMonthButton"),
  currentMonthButton: document.querySelector("#currentMonthButton"),
  csvButton: document.querySelector("#csvButton"),
  detailDialog: document.querySelector("#detailDialog"),
  detailTitle: document.querySelector("#detailTitle"),
  detailBody: document.querySelector("#detailBody"),
};

initialize();

function initialize() {
  ensureToday();
  const todayParts = parseDateKey(state.today);
  state.viewYear = todayParts.year;
  state.viewMonth = todayParts.month;
  bindEvents();
  renderMain();
  registerServiceWorker();
  setInterval(checkDateRollover, 60 * 1000);
}

function bindEvents() {
  document.addEventListener("gesturestart", (event) => {
    event.preventDefault();
  });

  document.querySelector(".tap-grid").addEventListener("click", (event) => {
    const minus = event.target.closest(".minus-control");
    if (minus && state.editing) {
      event.stopPropagation();
      changeCount(minus.dataset.key, -1);
      return;
    }

    const button = event.target.closest("[data-action='increment']");
    if (!button) return;
    changeCount(button.dataset.key, 1);
  });

  els.editModeButton.addEventListener("click", () => {
    state.editing = !state.editing;
    els.mainView.classList.toggle("editing", state.editing);
    els.editModeButton.setAttribute("aria-pressed", String(state.editing));
    els.editModeButton.textContent = state.editing ? "修正中" : "修正モード";
  });

  els.resetButton.addEventListener("click", () => {
    if (!confirm("本当に今日の集計をリセットしますか？")) return;
    state.data[state.today] = emptyCounts();
    persist();
    renderMain();
  });

  els.openCalendarButton.addEventListener("click", () => {
    showCalendar();
  });

  els.backButton.addEventListener("click", () => {
    els.calendarView.classList.add("hidden");
    els.mainView.classList.remove("hidden");
    renderMain();
  });

  els.prevMonthButton.addEventListener("click", () => moveMonth(-1));
  els.nextMonthButton.addEventListener("click", () => moveMonth(1));
  els.currentMonthButton.addEventListener("click", () => {
    const todayParts = parseDateKey(getJapanDateString());
    state.viewYear = todayParts.year;
    state.viewMonth = todayParts.month;
    renderCalendar();
  });
  els.csvButton.addEventListener("click", exportCsv);
}

function changeCount(key, amount) {
  ensureToday();
  const day = state.data[state.today];
  day[key] = Math.max(0, (day[key] || 0) + amount);
  persist();
  renderMain();
}

function renderMain() {
  ensureToday();
  const counts = normalizeCounts(state.data[state.today]);
  els.todayLabel.textContent = formatDateLabel(state.today);
  els.todayTotal.textContent = String(totalOf(counts));
  COUNT_KEYS.forEach((key) => {
    document.querySelector(`#count-${key}`).textContent = String(counts[key]);
  });
}

function showCalendar() {
  checkDateRollover();
  els.mainView.classList.add("hidden");
  els.calendarView.classList.remove("hidden");
  renderCalendar();
}

function renderCalendar() {
  const year = state.viewYear;
  const month = state.viewMonth;
  const today = getJapanDateString();
  els.monthLabel.textContent = `${year}年${month}月`;
  els.calendarGrid.innerHTML = "";

  getCalendarCells(year, month).forEach((cell) => {
    const counts = normalizeCounts(state.data[cell.key]);
    const button = document.createElement("button");
    button.className = `day-cell${cell.month === month ? "" : " outside"}${cell.key === today ? " today" : ""}`;
    button.type = "button";
    button.innerHTML = `<span class="date-num">${cell.day}</span><span class="day-total">${totalOf(counts)}人</span>`;
    button.addEventListener("click", () => openDayDetail(cell.key));
    els.calendarGrid.appendChild(button);
  });

  const monthDates = getMonthDateKeys(year, month);
  renderSummaryGrid(els.monthSummary, summarizeDates(monthDates), true);
  renderWeekSummary(monthDates);
  renderWeekdaySummary(monthDates);
}

function renderWeekSummary(monthDates) {
  els.weekSummary.innerHTML = "";
  const weeks = new Map();
  monthDates.forEach((key) => {
    const weekStart = getMondayOfWeek(key);
    if (!weeks.has(weekStart)) weeks.set(weekStart, []);
    weeks.get(weekStart).push(key);
  });

  Array.from(weeks.entries()).forEach(([weekStart, dates], index) => {
    const summary = summarizeDates(dates);
    els.weekSummary.appendChild(createStackCard(`${state.viewYear}年${state.viewMonth}月 第${index + 1}週`, summary));
  });
}

function renderWeekdaySummary(monthDates) {
  els.weekdaySummary.innerHTML = "";
  MONDAY_FIRST.forEach((label) => {
    const dates = monthDates.filter((key) => WEEKDAYS[getUtcDate(key).getUTCDay()] === label);
    const summary = summarizeDates(dates);
    els.weekdaySummary.appendChild(createStackCard(`${label}曜日`, summary));
  });
}

function createStackCard(title, summary) {
  const details = document.createElement("details");
  details.className = "stack-card";
  details.innerHTML = `<summary><span>${title}</span><span>${summary.total}人</span></summary>`;
  const body = document.createElement("div");
  body.className = "summary-grid";
  renderSummaryGrid(body, summary, false);
  details.appendChild(body);
  return details;
}

function openDayDetail(dateKey) {
  const summary = summarizeCounts(normalizeCounts(state.data[dateKey]));
  els.detailTitle.textContent = `${formatDateLabel(dateKey)} の内訳`;
  renderSummaryGrid(els.detailBody, summary, true);
  if (typeof els.detailDialog.showModal === "function") {
    els.detailDialog.showModal();
  }
}

function renderSummaryGrid(container, summary, clear) {
  if (clear) container.innerHTML = "";
  const items = [
    ["男性ビジネス", summary.male_business],
    ["男性プライベート", summary.male_private],
    ["女性ビジネス", summary.female_business],
    ["女性プライベート", summary.female_private],
    ["男性合計", summary.male_total],
    ["女性合計", summary.female_total],
    ["ビジネス合計", summary.business_total],
    ["プライベート合計", summary.private_total],
    ["総合計", summary.total, "total"],
  ];
  items.forEach(([label, value, type]) => {
    const div = document.createElement("div");
    div.className = `summary-item${type ? ` ${type}` : ""}`;
    div.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    container.appendChild(div);
  });
}

function moveMonth(delta) {
  const next = new Date(Date.UTC(state.viewYear, state.viewMonth - 1 + delta, 1));
  state.viewYear = next.getUTCFullYear();
  state.viewMonth = next.getUTCMonth() + 1;
  renderCalendar();
}

function exportCsv() {
  const rows = [[
    "日付",
    "曜日",
    "男性ビジネス",
    "男性プライベート",
    "女性ビジネス",
    "女性プライベート",
    "男性合計",
    "女性合計",
    "ビジネス合計",
    "プライベート合計",
    "総合計",
  ]];

  Object.keys(state.data).sort().forEach((dateKey) => {
    const summary = summarizeCounts(normalizeCounts(state.data[dateKey]));
    rows.push([
      dateKey,
      `${WEEKDAYS[getUtcDate(dateKey).getUTCDay()]}曜日`,
      summary.male_business,
      summary.male_private,
      summary.female_business,
      summary.female_private,
      summary.male_total,
      summary.female_total,
      summary.business_total,
      summary.private_total,
      summary.total,
    ]);
  });

  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `tap-summary-${getJapanDateString()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function checkDateRollover() {
  const current = getJapanDateString();
  if (current === state.today) return;
  state.today = current;
  ensureToday();
  renderMain();
  if (!els.calendarView.classList.contains("hidden")) renderCalendar();
}

function ensureToday() {
  if (!state.data[state.today]) {
    state.data[state.today] = emptyCounts();
    persist();
  } else {
    state.data[state.today] = normalizeCounts(state.data[state.today]);
  }
}

function loadData() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, normalizeCounts(value)]));
  } catch {
    return {};
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

function emptyCounts() {
  return {
    male_business: 0,
    male_private: 0,
    female_business: 0,
    female_private: 0,
  };
}

function normalizeCounts(counts = {}) {
  const normalized = emptyCounts();
  COUNT_KEYS.forEach((key) => {
    normalized[key] = Math.max(0, Number(counts[key] || 0));
  });
  return normalized;
}

function summarizeDates(dateKeys) {
  return summarizeCounts(dateKeys.reduce((acc, key) => {
    const counts = normalizeCounts(state.data[key]);
    COUNT_KEYS.forEach((countKey) => {
      acc[countKey] += counts[countKey];
    });
    return acc;
  }, emptyCounts()));
}

function summarizeCounts(counts) {
  const normalized = normalizeCounts(counts);
  return {
    ...normalized,
    male_total: normalized.male_business + normalized.male_private,
    female_total: normalized.female_business + normalized.female_private,
    business_total: normalized.male_business + normalized.female_business,
    private_total: normalized.male_private + normalized.female_private,
    total: totalOf(normalized),
  };
}

function totalOf(counts) {
  return COUNT_KEYS.reduce((sum, key) => sum + Number(counts[key] || 0), 0);
}

function getJapanDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function formatDateLabel(dateKey) {
  const date = getUtcDate(dateKey);
  return `${dateKey}（${WEEKDAYS[date.getUTCDay()]}）`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return { year, month, day };
}

function getUtcDate(dateKey) {
  const { year, month, day } = parseDateKey(dateKey);
  return new Date(Date.UTC(year, month - 1, day));
}

function toDateKey(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCalendarCells(year, month) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return {
      key: toDateKey(date),
      day: date.getUTCDate(),
      month: date.getUTCMonth() + 1,
    };
  });
}

function getMonthDateKeys(year, month) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: lastDay }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    return `${year}-${String(month).padStart(2, "0")}-${day}`;
  });
}

function getMondayOfWeek(dateKey) {
  const date = getUtcDate(dateKey);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return toDateKey(date);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
}
