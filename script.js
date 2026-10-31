
"use strict";

const STORAGE_KEY = "studyPlannerDataV1";
const ACTIVE_KEY = "studyPlannerActiveV1";
const DAILY_GOAL_MINUTES = 120;

const $ = id => document.getElementById(id);

const el = {
    sidebar: $("sidebar"),
    overlay: $("overlay"),
    menuButton: $("menuButton"),
    closeMenu: $("closeMenu"),
    currentDate: $("currentDate"),

    weeklyAverage: $("weeklyAverage"),
    weeklyTotal: $("weeklyTotal"),
    weeklyChart: $("weeklyChart"),

    todayStudy: $("todayStudy"),
    todayProgress: $("todayProgress"),
    todayGoalText: $("todayGoalText"),
    streakCount: $("streakCount"),
    streakMessage: $("streakMessage"),
    totalStudy: $("totalStudy"),

    timerRing: $("timerRing"),
    timerDisplay: $("timerDisplay"),
    timerSubtext: $("timerSubtext"),
    timerStatus: $("timerStatus"),
    saveStatus: $("saveStatus"),
    subjectSelect: $("subjectSelect"),

    startButton: $("startButton"),
    pauseButton: $("pauseButton"),
    saveButton: $("saveButton"),
    timerHelp: $("timerHelp"),

    historyCount: $("historyCount"),
    historyList: $("historyList"),
    clearHistoryButton: $("clearHistoryButton"),
    bannerStart: $("bannerStart"),
    toast: $("toast")
};

let data = loadData();
let active = loadActive();
let timerInterval = null;
let toastTimeout = null;

/* วันที่และเวลา */

function dateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");

    return `${y}-${m}-${d}`;
}

function parseDate(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
}

function shiftDate(date, amount) {
    const result = new Date(date);
    result.setDate(result.getDate() + amount);
    return result;
}

function formatDate(key) {
    return new Intl.DateTimeFormat("th-TH", {
        day: "numeric",
        month: "short",
        year: "numeric"
    }).format(parseDate(key));
}

function formatDuration(seconds) {
    seconds = Math.max(0, Math.floor(seconds));

    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    return [h, m, s]
        .map(number => String(number).padStart(2, "0"))
        .join(":");
}

function formatMinutes(minutes) {
    minutes = Math.max(0, Math.round(minutes));

    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;

    if (hours && remaining) {
        return `${hours} ชม. ${remaining} นาที`;
    }

    if (hours) {
        return `${hours} ชม.`;
    }

    return `${remaining} นาที`;
}

/* บันทึกข้อมูล */

function loadData() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));

        if (saved && Array.isArray(saved.history)) {
            return saved;
        }
    } catch (error) {
        console.error("อ่านข้อมูลไม่ได้", error);
    }

    return { history: [] };
}

function persistData() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        el.saveStatus.textContent = "● บันทึกข้อมูลอัตโนมัติแล้ว";
    } catch (error) {
        el.saveStatus.textContent = "บันทึกข้อมูลไม่สำเร็จ";
        console.error(error);
    }
}

function loadActive() {
    try {
        const saved = JSON.parse(localStorage.getItem(ACTIVE_KEY));

        if (saved && saved.startedAt && saved.subject) {
            return {
                subject: saved.subject,
                startedAt: Number(saved.startedAt),
                elapsedBefore: Math.max(0, Number(saved.elapsedBefore) || 0),
                paused: Boolean(saved.paused)
            };
        }
    } catch (error) {
        console.error("กู้คืนตัวจับเวลาไม่ได้", error);
    }

    return null;
}

function persistActive() {
    try {
        if (active) {
            localStorage.setItem(ACTIVE_KEY, JSON.stringify(active));
        } else {
            localStorage.removeItem(ACTIVE_KEY);
        }
    } catch (error) {
        console.error("บันทึกสถานะตัวจับเวลาไม่ได้", error);
    }
}

/* คำนวณเวลาอ่าน */

function elapsedSeconds() {
    if (!active) return 0;

    if (active.paused) {
        return active.elapsedBefore;
    }

    return active.elapsedBefore +
        Math.max(0, Math.floor((Date.now() - active.startedAt) / 1000));
}

function secondsOnDate(key) {
    return data.history
        .filter(item => item.date === key)
        .reduce((sum, item) => sum + item.seconds, 0);
}

function totalSeconds() {
    return data.history.reduce((sum, item) => sum + item.seconds, 0);
}

function todaySeconds() {
    return secondsOnDate(dateKey());
}

/* นับจำนวนวันที่อ่านต่อเนื่อง */

function streakLength() {
    const studiedDays = new Set(
        data.history
            .filter(item => item.seconds > 0)
            .map(item => item.date)
    );

    const today = dateKey();

    // ถ้ายังไม่ได้อ่านวันนี้ ให้นับต่อจากเมื่อวาน
    let cursor = studiedDays.has(today)
        ? parseDate(today)
        : shiftDate(parseDate(today), -1);

    if (!studiedDays.has(dateKey(cursor))) {
        return 0;
    }

    let count = 0;

    while (studiedDays.has(dateKey(cursor))) {
        count++;
        cursor = shiftDate(cursor, -1);
    }

    return count;
}

/* สรุปข้อมูลบนหน้าเว็บ */

function updateDashboard() {
    const todayMinutes = Math.floor(todaySeconds() / 60);
    const allMinutes = Math.floor(totalSeconds() / 60);
    const streak = streakLength();

    el.currentDate.textContent = new Intl.DateTimeFormat("th-TH", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric"
    }).format(new Date());

    el.todayStudy.innerHTML =
        `${todayMinutes} <small>นาที</small>`;

    const progress = Math.min(
        100,
        todayMinutes / DAILY_GOAL_MINUTES * 100
    );

    el.todayProgress.style.width = `${progress}%`;

    if (todayMinutes >= DAILY_GOAL_MINUTES) {
        el.todayGoalText.textContent =
            "ยอดเยี่ยม! คุณอ่านครบเป้าหมาย 2 ชั่วโมงแล้ว 🎉";
    } else {
        el.todayGoalText.textContent =
            `เป้าหมาย 2 ชม. เหลืออีก ${formatMinutes(DAILY_GOAL_MINUTES - todayMinutes)}`;
    }

    el.streakCount.innerHTML =
        `${streak} <small>วัน</small> 🔥`;

    el.streakMessage.textContent = streak > 0
        ? "ยอดเยี่ยม รักษาความสม่ำเสมอต่อไป!"
        : "อ่านวันนี้เพื่อเริ่มสถิติของคุณ";

    el.totalStudy.innerHTML =
        `${(allMinutes / 60).toFixed(1)} <small>ชม.</small>`;

    updateWeekly();
    renderHistory();
}

/* สถิติ 7 วันล่าสุด */

function updateWeekly() {
    const today = new Date();

    const days = Array.from(
        { length: 7 },
        (_, index) => shiftDate(today, index - 6)
    );

    const values = days.map(day => secondsOnDate(dateKey(day)));

    const total = values.reduce((sum, value) => sum + value, 0);
    const averageMinutes = Math.round(total / 7 / 60);
    const maxValue = Math.max(...values, 6*60*60);

    el.weeklyAverage.textContent = formatMinutes(averageMinutes);
    el.weeklyTotal.textContent = formatMinutes(total / 60);

    el.weeklyChart.innerHTML = days.map((day, index) => {
        const key = dateKey(day);

        const label = new Intl.DateTimeFormat("th-TH", {
            weekday: "narrow"
        }).format(day);

        const height = Math.min(
            72,
            Math.max(
            values[index] > 0 ? 5 : 2,
            values[index] / maxValue * 72
            )
        );

        const todayClass = key === dateKey() ? "today" : "";

        return `
            <div class="chart-day ${todayClass}"
                 title="${formatDate(key)}: ${formatMinutes(values[index] / 60)}">

                <div class="chart-bar-track">
                    <div class="chart-bar" style="height:${height}px"></div>
                </div>

                <span>${label}</span>
            </div>
        `;
    }).join("");
}

/* ประวัติการอ่าน */

function subjectEmoji(subject) {
    const icons = {
        "คณิตศาสตร์": "📘",
        "ภาษาอังกฤษ": "🌐",
        "วิทยาศาสตร์": "🔬",
        "ภาษาไทย": "📖",
        "สังคมศึกษา": "🌏",
        "อื่น ๆ": "✦"
    };

    return icons[subject] || "📚";
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function renderHistory() {
    const history = [...data.history].sort(
        (a, b) => b.createdAt - a.createdAt
    );

    el.historyCount.textContent = `${history.length} รายการ`;

    if (history.length === 0) {
        el.historyList.innerHTML = `
            <div class="empty-state">
                <div>📚</div>
                <h3>ยังไม่มีประวัติการอ่าน</h3>
                <p>เริ่มอ่านหนังสือ แล้วประวัติของคุณจะแสดงตรงนี้</p>
            </div>
        `;
        return;
    }

    el.historyList.innerHTML = history.map(item => `
        <article class="history-row">
            <div class="subject-icon">${subjectEmoji(item.subject)}</div>

            <div class="subject-info">
                <strong>${escapeHTML(item.subject)}</strong>
                <p>${formatDate(item.date)} · ${escapeHTML(item.startLabel)}</p>
            </div>

            <div class="history-duration">
                ${formatMinutes(item.seconds / 60)}
            </div>

            <button
                class="delete-entry"
                data-delete="${item.id}"
                aria-label="ลบรายการ"
                title="ลบรายการ">×</button>
        </article>
    `).join("");
}

/* ตัวจับเวลา */

function updateTimerDisplay() {
    el.timerDisplay.textContent =
        formatDuration(elapsedSeconds());

    if (active) {
        el.timerStatus.textContent =
            active.paused ? "● พักอยู่" : "● กำลังอ่าน";

        el.timerSubtext.textContent =
            active.paused ? "พักสักครู่ได้เลย" : `วิชา: ${active.subject}`;

        el.timerRing.classList.toggle("running", !active.paused);

        el.startButton.disabled = !active.paused;
        el.pauseButton.disabled = active.paused;
        el.subjectSelect.disabled = true;

        el.timerHelp.textContent = active.paused
            ? "กดเริ่มอ่านเพื่อจับเวลาต่อ"
            : "กำลังจับเวลาอยู่ สามารถพักหรือบันทึกได้";
    } else {
        el.timerStatus.textContent = "● พร้อมเริ่ม";
        el.timerSubtext.textContent = "ทุกนาทีมีความหมาย";

        el.timerRing.classList.remove("running");

        el.startButton.disabled = false;
        el.pauseButton.disabled = true;
        el.subjectSelect.disabled = false;

        el.timerHelp.textContent =
            "กดเริ่มเมื่อพร้อม และบันทึกเมื่ออ่านเสร็จ";
    }
}

function startTimer() {
    // หากพักอยู่ ปุ่มเริ่มจะใช้สำหรับอ่านต่อ
    if (active) {
        if (active.paused) {
            active.startedAt = Date.now();
            active.paused = false;

            persistActive();
            updateTimerDisplay();

            showToast("เริ่มอ่านต่อแล้ว ✨");
        }

        return;
    }

    active = {
        subject: el.subjectSelect.value,
        startedAt: Date.now(),
        elapsedBefore: 0,
        paused: false
    };

    persistActive();
    updateTimerDisplay();

    if (!timerInterval) {
        timerInterval = setInterval(() => {
            updateTimerDisplay();
        }, 250);
    }

    showToast("เริ่มจับเวลาแล้ว ตั้งใจอ่านนะครับ 📚");
}

function pauseTimer() {
    if (!active || active.paused) return;

    active.elapsedBefore = elapsedSeconds();
    active.paused = true;

    persistActive();
    updateTimerDisplay();

    showToast("พักเวลาไว้แล้ว");
}


const achievements = [
    { id: 1, name: "นักอ่านมือใหม่", seconds: 60, icon: "📚" },
    { id: 2, name: "นักอ่านมีวิชา", seconds: 300, icon: "📒" },
    { id: 3, name: "นักอ่านไม่ลดละ", seconds: 3600, icon: "🥉" },
    { id: 4, name: "นักอ่านผู้มุ่งมั่น", seconds: 10800, icon: "🥈" },
    { id: 5, name: "นักอ่านขั้นเทพ", seconds: 18000, icon: "🥇" },
    { id: 6, name: "ระดับปีศาจการอ่าน", seconds: 28800, icon: "😈🔥" },
    { id: 7, name: "ผู้ปราชญ์ด้วยปัญญา", seconds: 72000, icon: "💎" },
    { id: 8, name: "เทพแห่งหนังสือ", seconds: 144000, icon: "👑" },
    { id: 9, name: "ผู้ตรัสรู้ด้านการอ่าน", seconds: 360000, icon: "✨" }
];

let unlockedAchievements = JSON.parse(
    localStorage.getItem("unlockedAchievements") || "[]"
);
function playAchievementSound() {
    const AudioContext =
        window.AudioContext || window.webkitAudioContext;

    if (!AudioContext) return;

    const audio = new AudioContext();

    const notes = [523.25, 659.25, 783.99];

    notes.forEach((frequency, index) => {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();

        oscillator.connect(gain);
        gain.connect(audio.destination);

        oscillator.frequency.value = frequency;
        oscillator.type = "sine";

        const start = audio.currentTime + index * 0.15;

        gain.gain.setValueAtTime(0.15, start);
        gain.gain.exponentialRampToValueAtTime(
            0.001,
            start + 0.3
        );

        oscillator.start(start);
        oscillator.stop(start + 0.3);
    });

    setTimeout(() => audio.close(), 1000);
}
function checkAchievements() {
    const total = totalSeconds();

    achievements.forEach(achievement => {
        const alreadyUnlocked =
            unlockedAchievements.includes(achievement.id);

        if (total >= achievement.seconds && !alreadyUnlocked) {
            unlockedAchievements.push(achievement.id);

            localStorage.setItem(
                "unlockedAchievements",
                JSON.stringify(unlockedAchievements)
            );

            showToast(
                `${achievement.icon} ปลดล็อกความสำเร็จ ${achievement.name}!`
            );
            playAchievementSound();
        }
    });
    updateAchievementsUI();
}

function updateAchievementsUI() {
    const unlocked = new Set(unlockedAchievements);

    document.querySelectorAll("[data-achievement]").forEach(card => {
        const id = Number(card.dataset.achievement);
        const isUnlocked = unlocked.has(id);

        card.classList.toggle("locked", !isUnlocked);
        card.classList.toggle("unlocked", isUnlocked);

        const status = card.querySelector(".achievement-status");

        if (status) {
            status.textContent = isUnlocked
                ? "ปลดล็อกแล้ว ✓"
                : "ยังไม่ปลดล็อก";
        }
    });

    const progress = document.getElementById("achievement-progress");

    if (progress) {
        progress.textContent =
            `${unlockedAchievements.length} / ${achievements.length}`;
    }

    const progressBar =
        document.getElementById("achievementProgress");

    if (progressBar) {
        const percent =
            (unlockedAchievements.length / achievements.length) * 100;

        progressBar.style.width = `${percent}%`;
    }
}

function saveSession() {
    if (!active) {
        showToast("กรุณากดเริ่มอ่านก่อนบันทึกครับ");
        return;
    }

    const seconds = elapsedSeconds();

    if (seconds < 1) {
        showToast("เริ่มอ่านอย่างน้อย 1 วินาทีก่อนครับ");
        return;
    }

    const startTimestamp =
        active.startedAt - active.elapsedBefore * 1000;

    const startDate = new Date(startTimestamp);

    data.history.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        subject: active.subject,
        date: dateKey(startDate),
        seconds: seconds,
        startLabel: startDate.toLocaleTimeString("th-TH", {
            hour: "2-digit",
            minute: "2-digit"
        }),
        createdAt: Date.now()
    });

    active = null;

    persistActive();
    persistData();
    checkAchievements();
    updateDashboard();
    updateTimerDisplay();

    showToast(`บันทึกเวลา ${formatMinutes(seconds / 60)} แล้ว ✓`);
}

/* แจ้งเตือนสั้น ๆ */

function showToast(message) {
    el.toast.textContent = message;
    el.toast.classList.add("show");

    clearTimeout(toastTimeout);

    toastTimeout = setTimeout(() => {
        el.toast.classList.remove("show");
    }, 2800);
}

/* เปิดและปิดเมนู */

function openMenu() {
    el.sidebar.classList.add("open");
    el.overlay.classList.add("show");
}

function closeMenu() {
    el.sidebar.classList.remove("open");
    el.overlay.classList.remove("show");
}

function goToSection(id) {
    const section = $(id);

    if (section) {
        section.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }

    closeMenu();

    document.querySelectorAll(".nav-item").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.target === id
        );
    });
}

/* ลบประวัติ */

function clearHistory() {
    if (data.history.length === 0) {
        showToast("ยังไม่มีประวัติให้ลบ");
        return;
    }

    const confirmed = confirm(
        "ต้องการลบประวัติการอ่านทั้งหมดหรือไม่?"
    );

    if (!confirmed) return;

    data.history = [];

    persistData();
    updateDashboard();

    showToast("ลบประวัติทั้งหมดแล้ว");
}

/* เชื่อมปุ่มกับฟังก์ชัน */

// ปุ่มสามขีด
el.menuButton.addEventListener("click", () => {
    $("quickMenu").classList.toggle("show");
});

// ปิดเมนูหลักเดิม
el.closeMenu.addEventListener("click", closeMenu);
el.overlay.addEventListener("click", closeMenu);

// ปุ่มเหตุผลที่จัดทำเว็บนี้
$("aboutMenuButton").addEventListener("click", () => {
    $("quickMenu").classList.remove("show");
    goToSection("aboutSection");
});

// ระบบเมนูหลักเดิม
document.querySelectorAll(".nav-item").forEach(button => {
    button.addEventListener("click", () => {
        goToSection(button.dataset.target);
    });
});

el.startButton.addEventListener("click", startTimer);
el.pauseButton.addEventListener("click", pauseTimer);
el.saveButton.addEventListener("click", saveSession);

el.bannerStart.addEventListener("click", () => {
    goToSection("timerSection");

    if (!active || active.paused) {
        startTimer();
    }
});

el.clearHistoryButton.addEventListener("click", clearHistory);

el.historyList.addEventListener("click", event => {
    const button = event.target.closest("[data-delete]");

    if (!button) return;

    const id = button.dataset.delete;
    const item = data.history.find(entry => entry.id === id);

    if (!item) return;

    if (!confirm(`ต้องการลบประวัติวิชา ${item.subject} หรือไม่?`)) {
        return;
    }

    data.history = data.history.filter(entry => entry.id !== id);

    persistData();
    updateDashboard();

    showToast("ลบรายการแล้ว");
});

/* เมื่อกลับมาที่หน้าเว็บ */

document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
        updateTimerDisplay();
        updateDashboard();
    }
});

window.addEventListener("resize", () => {
    if (window.innerWidth > 900) {
        closeMenu();
    }
});

/* เริ่มต้นเว็บไซต์ */

if (active && !active.paused) {
    timerInterval = setInterval(updateTimerDisplay, 250);
}

persistData();
checkAchievements();
updateDashboard();
updateTimerDisplay();

$("aboutMenuButton").addEventListener("click", () => {
    $("quickMenu").classList.remove("show");
    goToSection("aboutSection");
});