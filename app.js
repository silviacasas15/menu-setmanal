const DAYS = ["Dilluns", "Dimarts", "Dimecres", "Dijous", "Divendres", "Dissabte", "Diumenge"];
const MEAL_SLOTS = [
  { value: "desayunar", label: "Esmorzar", icon: "☀️" },
  { value: "comer", label: "Dinar", icon: "🍽️" },
  { value: "merendar", label: "Berenar", icon: "🍎" },
  { value: "cenar", label: "Sopar", icon: "🌙" },
];
const storageKey = "menu-setmanal-state-v3";
const prefersDarkMedia = window.matchMedia("(prefers-color-scheme: dark)");

const state = loadState();

const mealForm = document.getElementById("meal-form");
const prevWeekButton = document.getElementById("prev-week");
const nextWeekButton = document.getElementById("next-week");
const todayWeekWrapper = document.getElementById("today-week-wrapper");
const weekRange = document.getElementById("week-range");
const weekSectionRange = document.getElementById("week-section-range");
const mealNameInput = document.getElementById("meal-name");
const mealCategoryInputs = Array.from(document.querySelectorAll("input[name='meal-category']"));
const mealList = document.getElementById("meal-list");
const addMealToggle = document.getElementById("add-meal-toggle");
const addMealContent = document.getElementById("add-meal-content");
const mealsToggle = document.getElementById("meals-toggle");
const weekList = document.getElementById("week-list");
const mealCount = document.getElementById("meal-count");
const themeToggle = document.getElementById("theme-toggle");
const shareMenuButton = document.getElementById("share-menu");
const toast = document.getElementById("toast");

addMealToggle.addEventListener("click", () => {
  const isExpanded = addMealToggle.getAttribute("aria-expanded") === "true";
  addMealToggle.setAttribute("aria-expanded", String(!isExpanded));
  addMealContent.classList.toggle("collapsed", isExpanded);
  addMealContent.classList.toggle("expanded", !isExpanded);
});

mealsToggle.addEventListener("click", () => {
  const isExpanded = mealsToggle.getAttribute("aria-expanded") === "true";
  mealsToggle.setAttribute("aria-expanded", String(!isExpanded));
  mealList.classList.toggle("collapsed", isExpanded);
  mealList.classList.toggle("expanded", !isExpanded);
});

prevWeekButton.addEventListener("click", () => {
  state.currentWeekKey = moveWeek(state.currentWeekKey, -1);
  saveState();
  render();
});

nextWeekButton.addEventListener("click", () => {
  state.currentWeekKey = moveWeek(state.currentWeekKey, 1);
  saveState();
  render();
});

mealForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = mealNameInput.value.trim();
  const categories = mealCategoryInputs.filter((input) => input.checked).map((input) => input.value);

  if (!value) {
    mealNameInput.focus();
    return;
  }

  if (!categories.length) {
    mealCategoryInputs[0]?.focus();
    return;
  }

  const existingMeal = state.meals.find((meal) => meal.name.toLowerCase() === value.toLowerCase());

  if (existingMeal) {
    existingMeal.categories = Array.from(new Set([...existingMeal.categories, ...categories]));
  } else {
    state.meals.push({
      id: createId(),
      name: value,
      categories,
    });
  }

  saveState();
  mealNameInput.value = "";
  mealCategoryInputs.forEach((input, index) => {
    input.checked = index === 0;
  });
  render();
});

mealList.addEventListener("click", (event) => {
  const categoryButton = event.target.closest("button[data-action='toggle-category']");
  if (categoryButton) {
    const category = categoryButton.dataset.category;
    state.expandedMealCategories[category] = !state.expandedMealCategories[category];
    saveState();
    renderMeals();
    return;
  }

  const button = event.target.closest("button[data-action='delete']");
  if (!button) return;

  const mealId = button.dataset.mealId;
  state.meals = state.meals.filter((item) => item.id !== mealId);

  const weekPlan = getActiveWeekPlan();
  DAYS.forEach((day) => {
    MEAL_SLOTS.forEach((slot) => {
      const slotValue = weekPlan[day]?.[slot.value];
      if (!Array.isArray(slotValue)) return;
      weekPlan[day][slot.value] = slotValue.filter((id) => id !== mealId);
    });
  });

  saveState();
  render();
});

weekList.addEventListener("change", (event) => {
  const select = event.target.closest("select[data-day]");
  if (!select) return;

  const day = select.dataset.day;
  const slot = select.dataset.slot;
  const weekPlan = getActiveWeekPlan();
  if (!weekPlan[day]) {
    weekPlan[day] = createDayPlan();
  }

  weekPlan[day][slot] = Array.from(select.selectedOptions).map((option) => option.value);
  saveState();
  render();
});

themeToggle.addEventListener("click", () => {
  state.followSystemTheme = false;
  state.darkMode = !state.darkMode;
  saveState();
  applyTheme();
});

shareMenuButton.addEventListener("click", async () => {
  const text = buildShareText();
  try {
    if (navigator.share) {
      await navigator.share({ title: "Menú Setmanal", text });
      showToast("Menú compartit");
      return;
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      showToast("Menú copiat");
      return;
    }
  } catch (error) {
    console.warn("No s'ha pogut compartir", error);
  }

  showToast("Compartició no disponible");
});

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (saved) {
      return normalizeState(saved);
    }
  } catch (error) {
    console.warn("No s'ha pogut llegir el guardat", error);
  }

  return {
    meals: [],
    weekPlans: {},
    currentWeekKey: getCurrentWeekKey(),
    darkMode: false,
    followSystemTheme: true,
    expandedMealCategories: {},
  };
}

function normalizeState(saved) {
  const meals = Array.isArray(saved.meals)
    ? saved.meals.map((meal, index) => {
        if (typeof meal === "string") {
          return { id: createId(), name: meal, categories: ["comer"] };
        }

        if (meal && typeof meal === "object") {
          return {
            id: meal.id || createId(),
            name: meal.name || "Plat",
            categories: Array.isArray(meal.categories)
              ? meal.categories.filter((category) => typeof category === "string" && category)
              : meal.category
              ? [meal.category]
              : ["comer"],
          };
        }

        return { id: createId(), name: `Plat ${index + 1}`, categories: ["comer"] };
      })
    : [];

  const weekPlans = {};
  const currentWeekKey = getCurrentWeekKey();
  const legacyWeekPlan = saved.weekPlan || saved.weekPlans?.[saved.currentWeekKey] || {};

  if (saved.weekPlans && typeof saved.weekPlans === "object") {
    Object.entries(saved.weekPlans).forEach(([weekKey, weekPlanValue]) => {
      weekPlans[weekKey] = normalizeWeekPlan(weekPlanValue, meals);
    });
  } else if (legacyWeekPlan && typeof legacyWeekPlan === "object") {
    weekPlans[currentWeekKey] = normalizeWeekPlan(legacyWeekPlan, meals);
  }

  return {
    meals,
    weekPlans,
    currentWeekKey,
    darkMode: saved.followSystemTheme ? prefersDarkMedia.matches : Boolean(saved.darkMode),
    followSystemTheme: saved.followSystemTheme !== false,
    expandedMealCategories: saved.expandedMealCategories && typeof saved.expandedMealCategories === "object" ? saved.expandedMealCategories : {},
  };
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

prefersDarkMedia.addEventListener("change", () => {
  if (state.followSystemTheme) {
    applyTheme();
  }
});

function render() {
  applyTheme();
  renderMeals();
  renderWeek();
  renderWeekNavigator();
  resetMealsAccordion();
  resetAddMealAccordion();
}

function renderMeals() {
  const counts = MEAL_SLOTS.map((slot) => ({
    ...slot,
    total: state.meals.filter((meal) => meal.categories.includes(slot.value)).length,
  }));
  const totalText = `${state.meals.length} plats · ${counts.map((item) => `${item.total} ${item.label.toLowerCase()}`).join(" · ")}`;
  mealCount.textContent = totalText;

  if (!state.meals.length) {
    mealList.innerHTML = '<div class="empty-state">Encara no tens plats. Afegeix-ne un per començar.</div>';
    return;
  }

  const groups = MEAL_SLOTS.map((slot) => {
      const items = state.meals.filter((meal) => meal.categories.includes(slot.value));

    const isExpanded = Boolean(state.expandedMealCategories?.[slot.value]);

    return `
      <div class="category-block">
        <button class="category-toggle" type="button" data-action="toggle-category" data-category="${slot.value}" aria-expanded="${isExpanded ? "true" : "false"}">
          <span class="category-toggle-title">
            <span class="slot-icon" aria-hidden="true">${slot.icon}</span>
            <span>${slot.label}</span>
          </span>
          <span class="toggle-icon">▸</span>
        </button>
        <div class="category-content ${isExpanded ? "expanded" : "collapsed"}">
          ${items
            .map((meal) => {
              const labels = meal.categories
                .map((value) => MEAL_SLOTS.find((slot) => slot.value === value)?.label || value)
                .filter(Boolean)
                .join(" · ");

              return `
                <div class="meal-item">
                  <div>
                    <strong>${escapeHtml(meal.name)}</strong>
                    <div class="meal-meta">${escapeHtml(labels)}</div>
                  </div>
                  <button class="secondary-btn" data-action="delete" data-meal-id="${escapeHtml(meal.id)}">Eliminar</button>
                </div>
              `;
            })
            .join("")}
        </div>
      </div>
    `;
  }).join("");

  mealList.innerHTML = groups;
}

function renderWeek() {
  if (!state.meals.length) {
    weekList.innerHTML = '<div class="empty-state">Guarda un plat per preparar la setmana.</div>';
    return;
  }

  const weekPlan = getActiveWeekPlan();
  const currentDay = getCurrentDayName();

  weekList.innerHTML = DAYS.map((day) => {
    const dayPlan = weekPlan[day] || createDayPlan();
    const filledSlots = MEAL_SLOTS.filter((slot) => dayPlan[slot.value]?.length).length;

    const slotsMarkup = MEAL_SLOTS.map((slot) => {
      const currentMealIds = dayPlan[slot.value] || [];
      const selects = state.meals
        .map((meal) => `<option value="${escapeHtml(meal.id)}" ${currentMealIds.includes(meal.id) ? "selected" : ""}>${escapeHtml(meal.name)}</option>`)
        .join("");

      return `
        <div class="slot-row">
          <label class="slot-label">
            <span class="slot-icon" aria-hidden="true">${slot.icon}</span>
            <span>${slot.label}</span>
          </label>
          <div class="slot-actions">
            <select multiple data-day="${day}" data-slot="${slot.value}">
              ${selects}
            </select>
          </div>
        </div>
      `;
    }).join("");

    return `
      <div class="day-card ${day === currentDay ? "current-day" : ""}">
        <div class="day-top">
          <div>
            <strong>${day}</strong>
            <p>${filledSlots ? `${filledSlots} moments assignats` : "Sense plats"}</p>
          </div>
          <span class="chip ${filledSlots === MEAL_SLOTS.length ? "ready" : "pending"}">${filledSlots === MEAL_SLOTS.length ? "Llest" : "Pendent"}</span>
        </div>
        <div class="day-slots">${slotsMarkup}</div>
      </div>
    `;
  }).join("");
}

function renderWeekNavigator() {
  const label = getWeekRangeLabel(state.currentWeekKey);
  weekRange.textContent = label;
  if (weekSectionRange) {
    weekSectionRange.textContent = label;
  }

  if (state.currentWeekKey === getCurrentWeekKey()) {
    todayWeekWrapper.innerHTML = '<button id="today-week" class="secondary-btn" type="button">Aquesta setmana</button>';
  } else {
    todayWeekWrapper.innerHTML = '';
  }

  const todayWeekButton = document.getElementById("today-week");
  if (todayWeekButton) {
    todayWeekButton.addEventListener("click", () => {
      state.currentWeekKey = getCurrentWeekKey();
      saveState();
      render();
    });
  }
}

function resetMealsAccordion() {
  mealsToggle.setAttribute("aria-expanded", "false");
  mealList.classList.add("collapsed");
  mealList.classList.remove("expanded");
}

function resetAddMealAccordion() {
  addMealToggle.setAttribute("aria-expanded", "false");
  addMealContent.classList.add("collapsed");
  addMealContent.classList.remove("expanded");
}

function applyTheme() {
  const isDark = state.followSystemTheme ? prefersDarkMedia.matches : state.darkMode;
  document.body.classList.toggle("dark", isDark);
  themeToggle.textContent = isDark ? "☀️" : "🌙";
}

function buildShareText() {
  return [
    "Menú setmanal",
    "",
    ...DAYS.flatMap((day) => {
      const dayPlan = getActiveWeekPlan()[day] || createDayPlan();
      const lines = [`${day}:`];
      MEAL_SLOTS.forEach((slot) => {
        const mealIds = dayPlan[slot.value] || [];
        const mealNames = mealIds
          .map((id) => state.meals.find((item) => item.id === id))
          .filter(Boolean)
          .map((meal) => meal.name);
        lines.push(`- ${slot.label}: ${mealNames.length ? mealNames.join(" + ") : "Sense plat"}`);
      });
      return lines;
    }),
  ].join("\n");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = setTimeout(() => {
    toast.classList.remove("show");
  }, 1800);
}

function createDayPlan() {
  return Object.fromEntries(MEAL_SLOTS.map((slot) => [slot.value, []]));
}

function normalizeWeekPlan(weekPlanValue, meals) {
  const normalizedWeekPlan = {};
  DAYS.forEach((day) => {
    const current = weekPlanValue?.[day];
    const normalizedDayPlan = createDayPlan();

    if (current && typeof current === "object") {
      MEAL_SLOTS.forEach((slot) => {
        const value = current[slot.value];
        if (!value) return;

        if (Array.isArray(value)) {
          normalizedDayPlan[slot.value] = value
            .map((item) => {
              const matchingMeal = meals.find((meal) => meal.id === item || meal.name === item);
              return matchingMeal ? matchingMeal.id : null;
            })
            .filter(Boolean);
        } else {
          const matchingMeal = meals.find((meal) => meal.id === value || meal.name === value);
          normalizedDayPlan[slot.value] = matchingMeal ? [matchingMeal.id] : [];
        }
      });
    } else if (current && (typeof current === "string" || typeof current === "number")) {
      const matchingMeal = meals.find((meal) => meal.id === current || meal.name === current);
      normalizedDayPlan.desayunar = matchingMeal ? [matchingMeal.id] : [];
    }

    normalizedWeekPlan[day] = normalizedDayPlan;
  });

  return normalizedWeekPlan;
}

function getActiveWeekPlan() {
  if (!state.weekPlans[state.currentWeekKey]) {
    state.weekPlans[state.currentWeekKey] = createWeekPlan();
  }

  return state.weekPlans[state.currentWeekKey];
}

function createWeekPlan() {
  return Object.fromEntries(DAYS.map((day) => [day, createDayPlan()]));
}

function getCurrentWeekKey() {
  return getWeekKey(new Date());
}

function getWeekKey(date) {
  const startOfWeek = new Date(date);
  const day = startOfWeek.getDay();
  const diff = (day + 6) % 7;
  startOfWeek.setDate(startOfWeek.getDate() - diff);
  const year = startOfWeek.getFullYear();
  const month = String(startOfWeek.getMonth() + 1).padStart(2, "0");
  const dayNumber = String(startOfWeek.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayNumber}`;
}

function moveWeek(weekKey, delta) {
  const [year, month, day] = weekKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + delta * 7);
  return getWeekKey(date);
}

function getWeekRangeLabel(weekKey) {
  const [year, month, day] = weekKey.split("-").map(Number);
  const startDate = new Date(year, month - 1, day);
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);

  const formatDate = (date) => date.toLocaleDateString("ca-ES", { day: "numeric", month: "short" });
  return `${formatDate(startDate)} – ${formatDate(endDate)} ${endDate.getFullYear()}`;
}

function getCurrentDayName() {
  const today = new Date();
  const dayIndex = (today.getDay() + 6) % 7;
  return DAYS[dayIndex];
}

function createId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `meal-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js");
  });
}

function exportBackup() {
  const data = localStorage.getItem(storageKey);

  if (!data) {
    showToast("No hi ha dades per exportar.");
    return;
  }

  const blob = new Blob([data], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");

  const today = new Date().toISOString().slice(0, 10);

  a.href = url;
  a.download = `menu-setmanal-${today}.json`;

  a.click();

  URL.revokeObjectURL(url);

  showToast("Còpia de seguretat exportada.");
}

function importBackup(file) {
  const reader = new FileReader();

  reader.onload = () => {
    try {
      JSON.parse(reader.result);

      localStorage.setItem(storageKey, reader.result);

      showToast("Còpia restaurada.");

      location.reload();

    } catch {

      showToast("Aquest fitxer no és vàlid.");
    }
  };

  reader.readAsText(file);
}

const backupInput = document.getElementById("backup-input");

backupInput.addEventListener("change", e => {

  if (!e.target.files.length) return;

  importBackup(e.target.files[0]);

});

document
  .getElementById("export-backup")
  .addEventListener("click", exportBackup);

  document
  .getElementById("import-backup")
  .addEventListener("click", () => {
    backupInput.click();
  });