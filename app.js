(function () {
  const root = document.querySelector("#zapovedny-comic");
  if (!root) return;

  const state = {
    source: "zapovedny_wing_quiz",
    answers: {},
    currentStep: 1,
    totalSteps: 4
  };

  const form = root.querySelector("[data-quiz-form]");
  const stepLabel = root.querySelector("[data-step-label]");
  const progressBar = root.querySelector("[data-progress-bar]");
  const nextButton = root.querySelector("[data-next]");
  const prevButton = root.querySelector("[data-prev]");
  const submitButton = root.querySelector("[data-submit]");
  const errorBox = root.querySelector("[data-error]");
  const thanks = root.querySelector("[data-thanks]");

  function getUTMParams() {
    const params = new URLSearchParams(window.location.search);
    const utm = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach((key) => {
      if (params.has(key)) utm[key] = params.get(key);
    });
    return utm;
  }

  function getYaCounter() {
    if (typeof ym !== "undefined") return ym;
    return null;
  }

  function reachGoal(id) {
    const ya = getYaCounter();
    if (ya) try { ya("reachGoal", id); } catch(e) {}
  }

  function submitLead(payload) {
    fetch("/api/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => {});
    reachGoal("zapovedny_quiz_submit");
  }

  function setError(message) {
    errorBox.textContent = message || "";
  }

  function getActiveStep() {
    return form.querySelector(`.zq-step[data-step="${state.currentStep}"], .comic-step[data-step="${state.currentStep}"]`);
  }

  function updateStep() {
    form.querySelectorAll(".zq-step, .comic-step").forEach((step) => {
      step.classList.toggle("is-active", Number(step.dataset.step) === state.currentStep);
    });

    const isLeadStep = state.currentStep === 5;
    const shownStep = Math.min(state.currentStep, state.totalSteps);
    stepLabel.textContent = isLeadStep ? "Контакты для расчёта" : `Шаг ${shownStep} из ${state.totalSteps}`;
    progressBar.style.width = `${Math.min((shownStep / state.totalSteps) * 100, 100)}%`;
    prevButton.hidden = state.currentStep === 1;
    nextButton.hidden = isLeadStep;
    submitButton.hidden = !isLeadStep;
    setError("");

    // Disable next if no option selected on radio steps
    if (!isLeadStep) {
      const activeStep = getActiveStep();
      const checked = activeStep && activeStep.querySelector("input[type='radio']:checked");
      nextButton.disabled = !checked;
    } else {
      nextButton.disabled = false;
    }
  }

  function saveCurrentAnswer() {
    const activeStep = getActiveStep();
    const checked = activeStep.querySelector("input[type='radio']:checked");
    if (!checked) {
      setError("Выберите один вариант, чтобы продолжить.");
      return false;
    }
    state.answers[checked.name] = checked.value;
    return true;
  }

  function isValidName(value) {
    return value.trim().length >= 2;
  }

  function isValidPhone(value) {
    const digits = value.replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 12;
  }

  function collectLeadPayload() {
    const data = new FormData(form);
    return {
      source: state.source,
      answers: { ...state.answers },
      name: String(data.get("name") || "").trim(),
      phone: String(data.get("phone") || "").trim(),
      utm: getUTMParams(),
      timestamp: new Date().toISOString()
    };
  }

  root.querySelectorAll("[data-scroll-to]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = root.querySelector(`#${button.dataset.scrollTo}`);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  root.querySelectorAll("a[href^='#']").forEach((link) => {
    link.addEventListener("click", (e) => {
      const id = link.getAttribute("href").slice(1);
      const target = root.querySelector(`#${id}`);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  nextButton.addEventListener("click", () => {
    if (!saveCurrentAnswer()) return;
    if (state.currentStep === 1) reachGoal("zapovedny_quiz_start");
    state.currentStep += 1;
    updateStep();
  });

  prevButton.addEventListener("click", () => {
    state.currentStep = Math.max(1, state.currentStep - 1);
    updateStep();
  });

  form.addEventListener("change", (event) => {
    if (event.target.matches("input[type='radio']")) {
      state.answers[event.target.name] = event.target.value;
      setError("");
      nextButton.disabled = false;
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const payload = collectLeadPayload();

    if (!isValidName(payload.name)) {
      setError("Укажите имя: хотя бы 2 символа.");
      return;
    }

    if (!isValidPhone(payload.phone)) {
      setError("Укажите телефон в удобном формате, например +7 900 000-00-00.");
      return;
    }

    submitLead(payload);
    form.hidden = true;
    root.querySelector(".comic-quiz__progress").hidden = true;
    thanks.hidden = false;
  });

  updateStep();

  window.zapovednyComic = {
    get state() {
      return { ...state, answers: { ...state.answers } };
    },
    getUTMParams,
    submitLead
  };
})();
