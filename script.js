// Mapping de difficulte vers le nombre d'heures recommandees par jour
const HOURS_BY_LEVEL = {
  Facile: 1,
  Moyen: 2,
  Difficile: 3
};

const STORAGE_KEY = "studyflow_subjects_v1";
const THEME_KEY = "studyflow_theme";

const form = document.getElementById("subjectForm");
const nameInput = document.getElementById("subjectName");
const dateInput = document.getElementById("examDate");
const difficultyInput = document.getElementById("difficulty");
const planningList = document.getElementById("planningList");
const notificationArea = document.getElementById("notificationArea");
const globalProgress = document.getElementById("globalProgress");
const globalPercent = document.getElementById("globalPercent");
const globalStatus = document.getElementById("globalStatus");
const subjectTemplate = document.getElementById("subjectTemplate");
const themeToggle = document.getElementById("themeToggle");
const splash = document.getElementById("splash");

let subjects = loadSubjects();

initializeTheme();
render();

window.addEventListener("load", () => {
  setTimeout(() => splash.classList.add("hide"), 750);
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const name = nameInput.value.trim();
  const examDate = dateInput.value;
  const difficulty = difficultyInput.value;

  if (!name || !examDate || !HOURS_BY_LEVEL[difficulty]) {
    return;
  }

  const newSubject = {
    id: crypto.randomUUID(),
    name,
    examDate,
    difficulty,
    createdAt: new Date().toISOString()
  };

  subjects.push(newSubject);
  persistSubjects();
  render();
  form.reset();
});

planningList.addEventListener("click", (event) => {
  const button = event.target.closest(".delete-btn");
  if (!button) return;

  const { id } = button.dataset;
  subjects = subjects.filter((subject) => subject.id !== id);
  persistSubjects();
  render();
});

themeToggle.addEventListener("click", () => {
  const isDark = document.body.classList.toggle("dark");
  localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
  themeToggle.textContent = isDark ? "Mode clair" : "Mode sombre";
  drawHoursChart(subjects);
});

function initializeTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const shouldUseDark = stored ? stored === "dark" : prefersDark;

  document.body.classList.toggle("dark", shouldUseDark);
  themeToggle.textContent = shouldUseDark ? "Mode clair" : "Mode sombre";
}

function render() {
  const computed = subjects.map((subject) => buildComputedSubject(subject));

  computed.sort((a, b) => a.daysRemaining - b.daysRemaining);

  renderNotifications(computed);
  renderPlanning(computed);
  renderGlobalProgress(computed);
  drawHoursChart(computed);
}

function renderPlanning(computed) {
  planningList.innerHTML = "";

  if (computed.length === 0) {
    planningList.innerHTML = "<p>Aucune matiere pour le moment. Ajoute ta premiere revision.</p>";
    return;
  }

  const fragment = document.createDocumentFragment();

  computed.forEach((item) => {
    const node = subjectTemplate.content.cloneNode(true);

    node.querySelector(".subject-title").textContent = item.name;

    const badge = node.querySelector(".difficulty");
    badge.textContent = item.difficulty;
    badge.classList.add(item.difficulty.toLowerCase());

    node.querySelector(".subject-info").textContent =
      `Examen le ${formatDate(item.examDate)} | Jours restants: ${item.daysRemaining}`;

    node.querySelector(".subject-hours").textContent =
      `Recommande: ${item.hoursPerDay}h/jour | Charge restante: ${item.remainingHours}h`;

    const fill = node.querySelector(".subject-progress-fill");
    fill.style.width = `${item.safetyScore}%`;

    const status = node.querySelector(".subject-status");
    status.textContent = item.status;
    status.style.color =
      item.status === "En avance" ? "var(--success)" : item.status === "Normal" ? "var(--warn)" : "var(--danger)";

    const deleteBtn = node.querySelector(".delete-btn");
    deleteBtn.dataset.id = item.id;

    fragment.appendChild(node);
  });

  planningList.appendChild(fragment);
}

function renderNotifications(computed) {
  notificationArea.innerHTML = "";

  const urgent = computed.filter((item) => item.daysRemaining <= 3);
  if (urgent.length === 0) return;

  urgent.forEach((item) => {
    const alert = document.createElement("div");
    alert.className = "alert";
    alert.textContent = `Alerte: ${item.name} dans ${item.daysRemaining} jour(s). Priorite aux revisions.`;
    notificationArea.appendChild(alert);
  });
}

function renderGlobalProgress(computed) {
  if (computed.length === 0) {
    globalProgress.style.width = "0%";
    globalPercent.textContent = "0%";
    globalStatus.textContent = "Aucune matiere";
    return;
  }

  const average = computed.reduce((sum, item) => sum + item.safetyScore, 0) / computed.length;
  const rounded = Math.round(average);
  globalProgress.style.width = `${rounded}%`;
  globalPercent.textContent = `${rounded}%`;

  globalStatus.textContent =
    rounded >= 70 ? "Global: En avance" : rounded >= 40 ? "Global: Normal" : "Global: En retard";
}

// Calcul principal: jours restants, heures/jour et indicateur de securite
function buildComputedSubject(subject) {
  const today = startOfDay(new Date());
  const exam = startOfDay(new Date(subject.examDate));
  const created = startOfDay(new Date(subject.createdAt || new Date()));

  const daysRemaining = Math.max(0, Math.ceil((exam - today) / 86400000));
  const initialDays = Math.max(1, Math.ceil((exam - created) / 86400000));
  const hoursPerDay = HOURS_BY_LEVEL[subject.difficulty] || 1;

  const remainingHours = daysRemaining * hoursPerDay;

  // safetyScore represente la marge de preparation selon difficulte + delai
  const difficultyFactor = hoursPerDay;
  const scoreRaw = (daysRemaining / (difficultyFactor * 7)) * 100;
  const safetyScore = clamp(Math.round(scoreRaw), 0, 100);

  const status = safetyScore >= 70 ? "En avance" : safetyScore >= 40 ? "Normal" : "En retard";

  return {
    ...subject,
    daysRemaining,
    initialDays,
    hoursPerDay,
    remainingHours,
    safetyScore,
    status
  };
}

function drawHoursChart(computedSubjects) {
  const canvas = document.getElementById("hoursChart");
  const ctx = canvas.getContext("2d");

  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth;
  const cssHeight = 280;

  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, cssWidth, cssHeight);

  if (!computedSubjects.length) {
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--text-soft").trim();
    ctx.font = "14px Segoe UI";
    ctx.fillText("Ajoute des matieres pour afficher le graphique.", 20, 40);
    return;
  }

  const max = Math.max(...computedSubjects.map((s) => s.remainingHours), 1);
  const barWidth = Math.max(30, (cssWidth - 40) / computedSubjects.length - 10);

  computedSubjects.forEach((subject, index) => {
    const x = 20 + index * (barWidth + 10);
    const h = (subject.remainingHours / max) * (cssHeight - 70);
    const y = cssHeight - h - 30;

    ctx.fillStyle = "#1f6feb";
    ctx.fillRect(x, y, barWidth, h);

    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--text").trim();
    ctx.font = "12px Segoe UI";
    ctx.fillText(String(subject.remainingHours), x + 5, y - 6);

    const label = subject.name.length > 10 ? `${subject.name.slice(0, 10)}...` : subject.name;
    ctx.fillText(label, x, cssHeight - 10);
  });
}

function loadSubjects() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(data) ? data : [];
  } catch (error) {
    return [];
  }
}

function persistSubjects() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(subjects));
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(isoDate) {
  return new Date(isoDate).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
