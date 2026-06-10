document.addEventListener('DOMContentLoaded', () => {

    // --- ZAKŁADKI ---
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === targetTab) content.classList.add('active');
            });
        });
    });

    // --- PODKATEGORIE (zestawy) ---
    const subButtons = document.querySelectorAll('.subcategory-button');
    subButtons.forEach(button => {
        button.addEventListener('click', () => {
            const target = button.getAttribute('data-subcategory');
            const parent = button.closest('.tab-content');
            parent.querySelectorAll('.subcategory-button').forEach(b => b.classList.remove('active'));
            button.classList.add('active');
            parent.querySelectorAll('.subcategory-panel').forEach(p => {
                p.classList.remove('active');
                if (p.id === target) p.classList.add('active');
            });
        });
    });

    // --- CHANGES TABS ---
    document.querySelectorAll('.changes-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.stopPropagation();
            const mode = tab.getAttribute('data-mode');
            const box = tab.closest('.changes-panel-box');
            if (!box) return;
            box.querySelectorAll('.changes-tab').forEach(t => t.classList.remove('active'));
            box.querySelectorAll('.changes-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const panel = box.querySelector('#mode-' + mode);
            if (panel) panel.classList.add('active');
        });
    });

    // --- IP SERWERA ---
    const ipBox = document.getElementById('ip-box');
    if (ipBox) {
        ipBox.addEventListener('click', () => {
            navigator.clipboard.writeText(ipBox.getAttribute('data-ip')).then(() => {
                const tooltip = ipBox.querySelector('.copy-tooltip');
                if (tooltip) {
                    const orig = tooltip.textContent;
                    tooltip.textContent = 'Skopiowano!';
                    tooltip.style.color = '#00ff66';
                    setTimeout(() => { tooltip.textContent = orig; tooltip.style.color = ''; }, 2000);
                }
            }).catch(() => {});
        });
    }
});

// --- ADMIN ACCORDION ---
function toggleAdmin(card) {
    card.classList.toggle('open');
}

// --- REGULAMIN ---
function openRegulamin() {
    document.getElementById('regulamin-overlay').classList.add('open');
}
function closeRegulamin(e) {
    if (!e || e.target === document.getElementById('regulamin-overlay')) {
        document.getElementById('regulamin-overlay').classList.remove('open');
    }
}

// --- ZMIANY (otwieranie modala - logika w module) ---
function openChanges() {
    document.getElementById('changes-overlay').classList.add('open');
}
function closeChanges(e) {
    if (!e || e.target === document.getElementById('changes-overlay')) {
        document.getElementById('changes-overlay').classList.remove('open');
    }
}

// --- KONKURS ---
function openContest(id) {
    window._currentContest = id;
    document.getElementById('contest-overlay').classList.add('open');
    document.getElementById('contest-msg').textContent = '';
    ['contest-nick-mc','contest-nick-dc','contest-secret'].forEach(i => {
        const el = document.getElementById(i);
        if (el) el.value = '';
    });
}
function closeContest(e) {
    if (!e || e.target === document.getElementById('contest-overlay')) {
        document.getElementById('contest-overlay').classList.remove('open');
    }
}

// --- KONKURS ADMIN ---
function openContestAdmin() {
    document.getElementById('contest-admin-overlay').classList.add('open');
    if (!window._adminLogged) {
        document.getElementById('admin-login-form').style.display = 'block';
        document.getElementById('admin-panel-content').style.display = 'none';
        document.getElementById('admin-login-err').style.display = 'none';
    }
}
function closeContestAdmin(e) {
    if (!e || e.target === document.getElementById('contest-admin-overlay')) {
        document.getElementById('contest-admin-overlay').classList.remove('open');
    }
}

// --- ZMIANY SERWEROWE LOGIKA — Firestore (real-time) ---
const CHANGES_KEY = 'critmc-changes'; // fallback tylko
const ADMIN_LOGIN_CH = 'test';
const ADMIN_PASS_CH = 'test';

// Pobierz zmiany z Firestore
async function loadChanges() {
    try {
        // Spróbuj z Firestore przez moduł
        if (typeof window._loadChangesFromFirestore === 'function') {
            await window._loadChangesFromFirestore();
            return;
        }
        // Fallback: localStorage
        const d = JSON.parse(localStorage.getItem(CHANGES_KEY) || '{}');
        ['zwykle','szczegolowe','najmocniejsze'].forEach(mode => {
            const el = document.getElementById('mode-' + mode);
            if (el && d[mode]) el.innerHTML = '<p style="white-space:pre-line">' + d[mode] + '</p>';
        });
    } catch(e) {
        const d = JSON.parse(localStorage.getItem(CHANGES_KEY) || '{}');
        ['zwykle','szczegolowe','najmocniejsze'].forEach(mode => {
            const el = document.getElementById('mode-' + mode);
            if (el && d[mode]) el.innerHTML = '<p style="white-space:pre-line">' + d[mode] + '</p>';
        });
    }
}

function changesAdminLogin() {
    const l = document.getElementById('changes-admin-l').value;
    const p = document.getElementById('changes-admin-p').value;
    if (l === ADMIN_LOGIN_CH && p === ADMIN_PASS_CH) {
        window._changesLogged = true;
        document.getElementById('changes-admin-login').style.display = 'none';
        document.getElementById('changes-admin-panel').style.display = 'flex';
        // Załaduj istniejące
        if (typeof window._loadChangesForEdit === 'function') {
            window._loadChangesForEdit();
        } else {
            const d = JSON.parse(localStorage.getItem(CHANGES_KEY) || '{}');
            ['zwykle','szczegolowe','najmocniejsze'].forEach(m => {
                const el = document.getElementById('edit-' + m);
                if (el) el.value = d[m] || '';
            });
        }
    } else {
        document.getElementById('changes-admin-err').style.display = 'block';
    }
}

function saveChangesAdmin() {
    if (typeof window._saveChangesToFirestore === 'function') {
        window._saveChangesToFirestore();
        return;
    }
    // Fallback localStorage
    const d = {
        zwykle: document.getElementById('edit-zwykle').value,
        szczegolowe: document.getElementById('edit-szczegolowe').value,
        najmocniejsze: document.getElementById('edit-najmocniejsze').value
    };
    localStorage.setItem(CHANGES_KEY, JSON.stringify(d));
    loadChanges();
    const msg = document.getElementById('changes-save-msg');
    msg.textContent = 'Zapisano!';
    msg.style.color = '#00e676';
    setTimeout(() => {
        msg.textContent = '';
        document.getElementById('changes-admin-overlay').classList.remove('open');
    }, 1500);
}

// --- KONKURS ADMIN LOGIKA (bez Firebase - tylko otwieranie) ---
function adminLogin() {
    const l = document.getElementById('admin-login').value;
    const p = document.getElementById('admin-pass').value;
    if (l === 'test' && p === 'test') {
        window._adminLogged = true;
        document.getElementById('admin-login-form').style.display = 'none';
        document.getElementById('admin-panel-content').style.display = 'flex';
        if (typeof window.loadAdminPanel === 'function') window.loadAdminPanel();
    } else {
        document.getElementById('admin-login-err').style.display = 'block';
    }
}

// Ogłoś zwycięzców
async function adminAnnounceWinners() {
    const w1 = document.getElementById('winner-input-1').value.trim();
    const w2 = document.getElementById('winner-input-2').value.trim();
    if (!w1 || !w2) { showAdminMsg('Podaj nicki obu zwycięzców!', '#ff5252'); return; }
    if (!confirm('Ogłosić zwycięzców i zakończyć konkurs?')) return;
    try {
        if (typeof window.setWinners === 'function') {
            await window.setWinners(window._currentContest || 'start', [w1, w2]);
        }
        showAdminMsg('Zwycięzcy ogłoszeni! Strona odświeży się za chwilę.', '#00e676');
        setTimeout(() => location.reload(), 2000);
    } catch(e) { showAdminMsg('Błąd: ' + e.message, '#ff5252'); }
}

// Zakończ bez wyników
async function adminEndContest() {
    if (!confirm('Zakończyć konkurs bez ogłoszenia wyników?')) return;
    try {
        if (typeof window.endContest === 'function') {
            await window.endContest(window._currentContest || 'start');
        }
        showAdminMsg('Konkurs zakończony.', '#ffb700');
        setTimeout(() => { document.getElementById('contest-admin-overlay').classList.remove('open'); location.reload(); }, 1500);
    } catch(e) { showAdminMsg('Błąd: ' + e.message, '#ff5252'); }
}

// Usuń konkurs
async function adminDeleteContest() {
    if (!confirm('USUNĄĆ CAŁY KONKURS? Tej operacji nie można cofnąć!')) return;
    try {
        if (typeof window.deleteContest === 'function') {
            await window.deleteContest(window._currentContest || 'start');
        }
        showAdminMsg('Konkurs usunięty.', '#ff5252');
        setTimeout(() => { document.getElementById('contest-admin-overlay').classList.remove('open'); location.reload(); }, 1500);
    } catch(e) { showAdminMsg('Błąd: ' + e.message, '#ff5252'); }
}

function showAdminMsg(msg, color) {
    const el = document.getElementById('admin-action-msg');
    if (el) { el.textContent = msg; el.style.color = color || '#fff'; }
}

document.addEventListener('DOMContentLoaded', loadChanges);

// --- TIMER KONKURSU ---
(function() {
    const WYNIKI_DATE = new Date('2026-08-25T12:00:00');
    function updateTimer() {
        const el = document.getElementById('contest-timer');
        if (!el) return;
        const diff = WYNIKI_DATE - new Date();
        if (diff <= 0) {
            el.innerHTML = '<i class="fa-solid fa-flag-checkered"></i> Wyniki juz ogloszone!';
            return;
        }
        const d = Math.floor(diff/86400000);
        const h = Math.floor((diff%86400000)/3600000);
        const m = Math.floor((diff%3600000)/60000);
        if (d >= 10) {
            el.innerHTML = '<i class="fa-solid fa-clock"></i> ' + d + 'd ' + h + 'h';
        } else {
            el.innerHTML = '<i class="fa-solid fa-clock"></i> ' + d + 'd ' + h + 'h ' + m + 'm';
        }
    }
    document.addEventListener('DOMContentLoaded', function() {
        updateTimer();
        setInterval(updateTimer, 30000);
    });
})();

// --- ADMIN ILOSC ZWYCIEZCOW ---
function adminUpdateIlosc() {
    const n = parseInt(document.getElementById('admin-ilosc').value) || 2;
    const container = document.getElementById('winners-inputs');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 1; i <= n; i++) {
        const inp = document.createElement('input');
        inp.className = 'winner-input';
        inp.type = 'text';
        inp.placeholder = 'Nick zwyciezcy #' + i;
        inp.style.cssText = 'background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#fff;padding:0.6rem 1rem;border-radius:8px;font-size:0.9rem;outline:none;';
        container.appendChild(inp);
    }
    // Aktualizuj ilosc na karcie konkursu
    const iloscEl = document.querySelector('#contest-start .contest-desc strong[style*="f2c84a"]');
    if (iloscEl) iloscEl.textContent = n + ' szt.';
}
