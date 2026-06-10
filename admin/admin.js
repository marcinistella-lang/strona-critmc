import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
    getFirestore,
    collection,
    getDocs,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    addDoc,
    query,
    orderBy,
    where,
    onSnapshot,
    serverTimestamp,
    Timestamp
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

// =====================================================================
// FIREBASE CONFIG
// =====================================================================
const firebaseConfig = {
    apiKey: "AIzaSyBdwzCGhUtqGm0Ggfmrl2MC8_u10c_AuMQ",
    authDomain: "stronacritmcpl.firebaseapp.com",
    projectId: "stronacritmcpl",
    storageBucket: "stronacritmcpl.firebasestorage.app",
    messagingSenderId: "674591154096",
    appId: "1:674591154096:web:fee55d9cf1c83dcfbe8075"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// =====================================================================
// KONTA ADMINÓW (tymczasowo hardcoded — potem do Firestore)
// =====================================================================
const ADMIN_ACCOUNTS = [
    {
        login: "test",
        password: "test",
        displayName: "Test Admin",
        role: "Zarządzający",
        isOwner: true
    }
];

// =====================================================================
// STAN APLIKACJI
// =====================================================================
let currentUser = null;
let allPlayers = [];
let allBans = [];
let allMutes = [];
let allLogs = [];
let selectedAction = null;
let selectedDuration = null;
let currentPlayerForAction = null;

// =====================================================================
// LOGOWANIE
// =====================================================================
window.handleLogin = function(e) {
    e.preventDefault();
    const login    = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl    = document.getElementById('login-error');

    const account = ADMIN_ACCOUNTS.find(a => a.login === login && a.password === password);

    if (!account) {
        errEl.style.display = 'flex';
        document.getElementById('login-password').value = '';
        return;
    }

    errEl.style.display = 'none';
    currentUser = account;
    sessionStorage.setItem('admin_user', JSON.stringify(account));

    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-panel').style.display  = 'flex';

    initPanel();
};

window.handleLogout = function() {
    sessionStorage.removeItem('admin_user');
    currentUser = null;
    document.getElementById('admin-panel').style.display  = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
};

// Podgląd hasła — obsługiwane przez inline script w HTML

// =====================================================================
// INIT PANEL
// =====================================================================
function initPanel() {
    // Ustaw dane usera w sidebarze
    document.getElementById('su-name').textContent    = currentUser.displayName;
    document.getElementById('su-role').textContent    = currentUser.role;
    document.getElementById('su-avatar').textContent  = currentUser.displayName.charAt(0).toUpperCase();

    updateServerStatus('loading', 'Łączenie...');

    loadPlayers();
    loadBans();
    loadMutes();
    loadLogs();

    // Symulacja statusu serwera (w przyszłości z pluginu)
    setTimeout(() => updateServerStatus('online', 'Serwer online'), 1500);
}

// =====================================================================
// NAWIGACJA
// =====================================================================
window.switchPage = function(pageName) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    const btn  = document.querySelector(`.nav-btn[data-page="${pageName}"]`);
    const page = document.getElementById(`page-${pageName}`);

    if (btn)  btn.classList.add('active');
    if (page) page.classList.add('active');

    const titles = {
        players: 'Gracze',
        bans:    'Bany',
        mutes:   'Muty',
        logs:    'Logi Akcji'
    };
    document.getElementById('topbar-title').textContent = titles[pageName] || pageName;
};

window.toggleSidebar = function() {
    document.getElementById('sidebar').classList.toggle('open');
};

// =====================================================================
// STATUS SERWERA
// =====================================================================
function updateServerStatus(type, text) {
    const dot  = document.querySelector('.status-dot');
    const span = document.getElementById('status-text');
    dot.className = `status-dot ${type}`;
    span.textContent = text;
}

// =====================================================================
// HELPERS
// =====================================================================
function formatDate(val) {
    if (!val) return '—';
    let date;
    if (val instanceof Timestamp) {
        date = val.toDate();
    } else if (val?.seconds) {
        date = new Date(val.seconds * 1000);
    } else {
        date = new Date(val);
    }
    if (isNaN(date)) return '—';
    return date.toLocaleString('pl-PL', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function formatDateShort(val) {
    if (!val) return '—';
    let date;
    if (val instanceof Timestamp) date = val.toDate();
    else if (val?.seconds) date = new Date(val.seconds * 1000);
    else date = new Date(val);
    if (isNaN(date)) return '—';
    return date.toLocaleDateString('pl-PL');
}

function rankBadge(rank) {
    const map = {
        vip: 'badge-vip',
        boss: 'badge-boss',
        crit: 'badge-crit',
        chatmod: 'badge-chatmod',
        pomocnik: 'badge-pomocnik',
        moderator: 'badge-moderator',
        admin: 'badge-admin',
        zarzadzajacy: 'badge-zarzadzajacy',
        default: 'badge-default'
    };
    const cls = map[(rank||'').toLowerCase()] || 'badge-default';
    const label = rank || 'Gracz';
    return `<span class="badge ${cls}">${label}</span>`;
}

function statusBadge(player) {
    if (player.banned) return `<span class="badge badge-banned"><i class="fa-solid fa-ban"></i> Zbanowany</span>`;
    if (player.muted)  return `<span class="badge badge-muted"><i class="fa-solid fa-microphone-slash"></i> Zmutowany</span>`;
    if (player.online) return `<span class="badge badge-online"><i class="fa-solid fa-circle"></i> Online</span>`;
    return `<span class="badge badge-offline"><i class="fa-regular fa-circle"></i> Offline</span>`;
}

function actionBadge(action) {
    const icons = {
        ban: 'fa-ban', unban: 'fa-ban',
        mute: 'fa-microphone-slash', unmute: 'fa-microphone',
        kick: 'fa-door-open', warn: 'fa-triangle-exclamation'
    };
    const icon = icons[action] || 'fa-circle';
    const label = (action||'').toUpperCase();
    return `<span class="badge badge-action-${action}"><i class="fa-solid ${icon}"></i> ${label}</span>`;
}

function playerHead(nick) {
    return `<img class="player-head" src="https://mc-heads.net/avatar/${encodeURIComponent(nick)}/36" alt="${nick}" onerror="this.src='https://mc-heads.net/avatar/Steve/36'">`;
}

// =====================================================================
// GRACZE
// =====================================================================
async function loadPlayers() {
    try {
        const snap = await getDocs(collection(db, 'players'));
        allPlayers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderPlayers(allPlayers);
    } catch (err) {
        console.error('loadPlayers:', err);
        renderPlayersError();
    }
}

function renderPlayers(list) {
    const tbody = document.getElementById('players-tbody');
    if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="table-empty"><i class="fa-solid fa-users-slash"></i> Brak graczy</td></tr>`;
        return;
    }
    tbody.innerHTML = list.map(p => `
        <tr>
            <td>
                <div class="player-cell">
                    ${playerHead(p.nick || p.id)}
                    <div>
                        <div class="player-name">${p.nick || p.id}</div>
                        <div class="player-uuid">${(p.uuid || p.id || '').substring(0, 16)}...</div>
                    </div>
                </div>
            </td>
            <td>${rankBadge(p.rank)}</td>
            <td>${statusBadge(p)}</td>
            <td style="color:var(--text-secondary);font-size:0.82rem;">${formatDate(p.lastSeen)}</td>
            <td>
                <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
                    <button class="tbl-btn" onclick="openActionModal('${p.nick || p.id}', '${p.uuid || ''}')">
                        <i class="fa-solid fa-gavel"></i> Akcja
                    </button>
                    <button class="tbl-btn" onclick="openPlayerDetail('${p.id}')">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function renderPlayersError() {
    document.getElementById('players-tbody').innerHTML =
        `<tr><td colspan="5" class="table-empty" style="color:#ef4444;"><i class="fa-solid fa-circle-exclamation"></i> Błąd ładowania danych</td></tr>`;
}

window.filterPlayers = function() {
    const search = (document.getElementById('players-search').value || '').toLowerCase();
    const rank   = (document.getElementById('players-filter-rank').value || '').toLowerCase();
    const status = document.getElementById('players-filter-status').value;

    let filtered = allPlayers.filter(p => {
        const nick = (p.nick || p.id || '').toLowerCase();
        if (search && !nick.includes(search)) return false;
        if (rank && (p.rank || 'default').toLowerCase() !== rank) return false;
        if (status === 'online'  && !p.online)  return false;
        if (status === 'offline' && p.online)   return false;
        if (status === 'banned'  && !p.banned)  return false;
        if (status === 'muted'   && !p.muted)   return false;
        return true;
    });

    renderPlayers(filtered);
};

// =====================================================================
// BANY
// =====================================================================
async function loadBans() {
    try {
        const q    = query(collection(db, 'bans'), orderBy('date', 'desc'));
        const snap = await getDocs(q);
        allBans = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderBans(allBans);
        document.getElementById('badge-bans').textContent = allBans.length;
    } catch (err) {
        console.error('loadBans:', err);
    }
}

function renderBans(list) {
    const tbody = document.getElementById('bans-tbody');
    if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="table-empty"><i class="fa-solid fa-check-circle" style="color:var(--accent-green)"></i> Brak aktywnych banów</td></tr>`;
        return;
    }
    tbody.innerHTML = list.map(b => `
        <tr>
            <td>
                <div class="player-cell">
                    ${playerHead(b.player)}
                    <div class="player-name">${b.player}</div>
                </div>
            </td>
            <td style="max-width:180px;color:var(--text-secondary);font-size:0.85rem;">${b.reason || '—'}</td>
            <td><span style="font-weight:700;">${b.bannedBy || '—'}</span></td>
            <td style="font-size:0.82rem;color:var(--text-secondary);">${formatDate(b.date)}</td>
            <td>
                ${b.duration === 'permanent'
                    ? `<span class="badge badge-action-ban">Permanentny</span>`
                    : `<span style="font-size:0.82rem;color:var(--text-secondary);">${b.duration || '—'}</span>`
                }
            </td>
            <td>
                <button class="tbl-btn tbl-btn-green" onclick="quickUnban('${b.player}', '${b.id}')">
                    <i class="fa-solid fa-check"></i> Unban
                </button>
            </td>
        </tr>
    `).join('');
}

window.filterBans = function() {
    const search = (document.getElementById('bans-search').value || '').toLowerCase();
    const type   = document.getElementById('bans-filter-type').value;

    let filtered = allBans.filter(b => {
        const nick   = (b.player || '').toLowerCase();
        const reason = (b.reason || '').toLowerCase();
        if (search && !nick.includes(search) && !reason.includes(search)) return false;
        if (type === 'permanent' && b.duration !== 'permanent') return false;
        if (type === 'temporary' && b.duration === 'permanent') return false;
        return true;
    });
    renderBans(filtered);
};

window.quickUnban = async function(nick, banId) {
    if (!confirm(`Czy na pewno chcesz odbanować gracza ${nick}?`)) return;
    try {
        await deleteDoc(doc(db, 'bans', banId));
        // Zaktualizuj gracza
        const playerSnap = await getDocs(query(collection(db, 'players'), where('nick', '==', nick)));
        playerSnap.forEach(async d => await updateDoc(d.ref, { banned: false }));
        // Dodaj log
        await logAction('unban', nick, currentUser.displayName, 'Odbanowany z panelu', '—');
        showToast('success', `Odbanowano ${nick}`);
        await loadBans();
        await loadPlayers();
        await loadLogs();
    } catch (err) {
        showToast('error', 'Błąd podczas odbanowywania');
        console.error(err);
    }
};

// =====================================================================
// MUTY
// =====================================================================
async function loadMutes() {
    try {
        const q    = query(collection(db, 'mutes'), orderBy('date', 'desc'));
        const snap = await getDocs(q);
        allMutes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderMutes(allMutes);
        document.getElementById('badge-mutes').textContent = allMutes.length;
    } catch (err) {
        console.error('loadMutes:', err);
    }
}

function renderMutes(list) {
    const tbody = document.getElementById('mutes-tbody');
    if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="table-empty"><i class="fa-solid fa-check-circle" style="color:var(--accent-green)"></i> Brak aktywnych mutów</td></tr>`;
        return;
    }
    tbody.innerHTML = list.map(m => `
        <tr>
            <td>
                <div class="player-cell">
                    ${playerHead(m.player)}
                    <div class="player-name">${m.player}</div>
                </div>
            </td>
            <td style="max-width:180px;color:var(--text-secondary);font-size:0.85rem;">${m.reason || '—'}</td>
            <td><span style="font-weight:700;">${m.mutedBy || '—'}</span></td>
            <td style="font-size:0.82rem;color:var(--text-secondary);">${formatDate(m.date)}</td>
            <td>
                ${m.duration === 'permanent'
                    ? `<span class="badge badge-action-mute">Permanentny</span>`
                    : `<span style="font-size:0.82rem;color:var(--text-secondary);">${m.duration || '—'}</span>`
                }
            </td>
            <td>
                <button class="tbl-btn tbl-btn-green" onclick="quickUnmute('${m.player}', '${m.id}')">
                    <i class="fa-solid fa-microphone"></i> Unmute
                </button>
            </td>
        </tr>
    `).join('');
}

window.filterMutes = function() {
    const search = (document.getElementById('mutes-search').value || '').toLowerCase();
    const type   = document.getElementById('mutes-filter-type').value;

    let filtered = allMutes.filter(m => {
        const nick   = (m.player || '').toLowerCase();
        const reason = (m.reason || '').toLowerCase();
        if (search && !nick.includes(search) && !reason.includes(search)) return false;
        if (type === 'permanent' && m.duration !== 'permanent') return false;
        if (type === 'temporary' && m.duration === 'permanent') return false;
        return true;
    });
    renderMutes(filtered);
};

window.quickUnmute = async function(nick, muteId) {
    if (!confirm(`Czy na pewno chcesz odmutować gracza ${nick}?`)) return;
    try {
        await deleteDoc(doc(db, 'mutes', muteId));
        const playerSnap = await getDocs(query(collection(db, 'players'), where('nick', '==', nick)));
        playerSnap.forEach(async d => await updateDoc(d.ref, { muted: false }));
        await logAction('unmute', nick, currentUser.displayName, 'Odmutowany z panelu', '—');
        showToast('success', `Odmutowano ${nick}`);
        await loadMutes();
        await loadPlayers();
        await loadLogs();
    } catch (err) {
        showToast('error', 'Błąd podczas odmutowywania');
        console.error(err);
    }
};

// =====================================================================
// LOGI
// =====================================================================
async function loadLogs() {
    try {
        const q    = query(collection(db, 'admin_logs'), orderBy('date', 'desc'));
        const snap = await getDocs(q);
        allLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderLogs(allLogs);
        buildAdminFilter();
    } catch (err) {
        console.error('loadLogs:', err);
    }
}

function renderLogs(list) {
    const tbody = document.getElementById('logs-tbody');
    if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="table-empty"><i class="fa-solid fa-clock-rotate-left"></i> Brak logów</td></tr>`;
        return;
    }
    tbody.innerHTML = list.map(l => `
        <tr>
            <td>${actionBadge(l.action)}</td>
            <td>
                <div class="player-cell">
                    ${playerHead(l.player)}
                    <div class="player-name">${l.player}</div>
                </div>
            </td>
            <td><span style="font-weight:700;">${l.admin || '—'}</span></td>
            <td style="max-width:180px;color:var(--text-secondary);font-size:0.85rem;">${l.reason || '—'}</td>
            <td style="font-size:0.82rem;color:var(--text-secondary);">${l.duration || '—'}</td>
            <td style="font-size:0.82rem;color:var(--text-secondary);white-space:nowrap;">${formatDate(l.date)}</td>
        </tr>
    `).join('');
}

function buildAdminFilter() {
    const sel = document.getElementById('logs-filter-admin');
    const admins = [...new Set(allLogs.map(l => l.admin).filter(Boolean))];
    const current = sel.value;
    sel.innerHTML = `<option value="">Wszyscy admini</option>` +
        admins.map(a => `<option value="${a}" ${a === current ? 'selected' : ''}>${a}</option>`).join('');
}

window.filterLogs = function() {
    const search = (document.getElementById('logs-search').value || '').toLowerCase();
    const action = document.getElementById('logs-filter-action').value;
    const admin  = document.getElementById('logs-filter-admin').value;
    const date   = document.getElementById('logs-filter-date').value;

    let filtered = allLogs.filter(l => {
        const player = (l.player || '').toLowerCase();
        const adm    = (l.admin || '').toLowerCase();
        if (search && !player.includes(search) && !adm.includes(search)) return false;
        if (action && l.action !== action) return false;
        if (admin && l.admin !== admin) return false;
        if (date) {
            const logDate = formatDateShort(l.date);
            const filterDate = new Date(date).toLocaleDateString('pl-PL');
            if (logDate !== filterDate) return false;
        }
        return true;
    });
    renderLogs(filtered);
};

// =====================================================================
// LOGOWANIE AKCJI DO FIRESTORE
// =====================================================================
async function logAction(action, player, admin, reason, duration) {
    try {
        await addDoc(collection(db, 'admin_logs'), {
            action,
            player,
            admin,
            reason,
            duration,
            date: serverTimestamp()
        });
    } catch (err) {
        console.error('logAction error:', err);
    }
}

// =====================================================================
// MODAL AKCJI
// =====================================================================
window.openActionModal = function(nick, uuid) {
    currentPlayerForAction = { nick, uuid };
    selectedAction   = null;
    selectedDuration = null;

    document.getElementById('modal-title').textContent = `Akcja na graczu: ${nick}`;
    document.getElementById('modal-player-info').innerHTML = `
        <div class="player-cell">
            ${playerHead(nick)}
            <div>
                <div class="player-name">${nick}</div>
                <div class="player-uuid">${uuid || 'UUID nieznany'}</div>
            </div>
        </div>
    `;

    // Reset formularza
    document.querySelectorAll('.action-btn').forEach(b => b.classList.remove('selected'));
    document.querySelectorAll('.dur-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById('action-reason').value   = '';
    document.getElementById('duration-custom').value = '';
    document.getElementById('modal-msg').style.display = 'none';
    document.getElementById('duration-field').style.display = 'block';

    document.getElementById('action-modal').classList.add('open');
};

window.closeActionModal = function() {
    document.getElementById('action-modal').classList.remove('open');
};

window.closeModal = function(e) {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('open');
    }
};

window.setAction = function(action) {
    selectedAction = action;
    document.querySelectorAll('.action-btn').forEach(b => b.classList.remove('selected'));
    document.querySelector(`.${action}-btn`).classList.add('selected');

    // Ukryj duration dla unban/unmute/kick
    const noDuration = ['unban', 'unmute', 'kick'];
    document.getElementById('duration-field').style.display =
        noDuration.includes(action) ? 'none' : 'block';
};

window.setDuration = function(dur) {
    selectedDuration = dur;
    document.querySelectorAll('.dur-btn').forEach(b => b.classList.remove('selected'));
    event.target.classList.add('selected');
    document.getElementById('duration-custom').value = '';
};

window.submitAction = async function() {
    const reason = document.getElementById('action-reason').value.trim();
    const custom = document.getElementById('duration-custom').value.trim();
    const duration = custom || selectedDuration;
    const msgEl = document.getElementById('modal-msg');

    if (!selectedAction) {
        showModalMsg('error', 'Wybierz akcję!');
        return;
    }
    if (!reason) {
        showModalMsg('error', 'Podaj powód!');
        return;
    }
    const noDuration = ['unban', 'unmute', 'kick'];
    if (!noDuration.includes(selectedAction) && !duration) {
        showModalMsg('error', 'Wybierz czas trwania!');
        return;
    }

    const btn = document.getElementById('modal-submit');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Wykonywanie...';

    try {
        const { nick, uuid } = currentPlayerForAction;
        const admin = currentUser.displayName;

        if (selectedAction === 'ban') {
            await addDoc(collection(db, 'bans'), {
                player: nick, uuid, reason, bannedBy: admin,
                duration, date: serverTimestamp()
            });
            // Oznacz gracza
            const snap = await getDocs(query(collection(db, 'players'), where('nick', '==', nick)));
            snap.forEach(async d => await updateDoc(d.ref, { banned: true }));

        } else if (selectedAction === 'unban') {
            const snap = await getDocs(query(collection(db, 'bans'), where('player', '==', nick)));
            snap.forEach(async d => await deleteDoc(d.ref));
            const pSnap = await getDocs(query(collection(db, 'players'), where('nick', '==', nick)));
            pSnap.forEach(async d => await updateDoc(d.ref, { banned: false }));

        } else if (selectedAction === 'mute') {
            await addDoc(collection(db, 'mutes'), {
                player: nick, uuid, reason, mutedBy: admin,
                duration, date: serverTimestamp()
            });
            const snap = await getDocs(query(collection(db, 'players'), where('nick', '==', nick)));
            snap.forEach(async d => await updateDoc(d.ref, { muted: true }));

        } else if (selectedAction === 'unmute') {
            const snap = await getDocs(query(collection(db, 'mutes'), where('player', '==', nick)));
            snap.forEach(async d => await deleteDoc(d.ref));
            const pSnap = await getDocs(query(collection(db, 'players'), where('nick', '==', nick)));
            pSnap.forEach(async d => await updateDoc(d.ref, { muted: false }));
        }
        // kick i warn — tylko log (plugin wykonuje faktycznie)
        await logAction(selectedAction, nick, admin, reason, duration || '—');

        showToast('success', `Akcja "${selectedAction.toUpperCase()}" wykonana na ${nick}`);
        closeActionModal();

        await loadPlayers();
        await loadBans();
        await loadMutes();
        await loadLogs();

    } catch (err) {
        console.error('submitAction:', err);
        showModalMsg('error', 'Błąd! Spróbuj ponownie.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Wykonaj akcję';
    }
};

function showModalMsg(type, text) {
    const el = document.getElementById('modal-msg');
    el.className = `modal-msg ${type}`;
    el.innerHTML = `<i class="fa-solid fa-${type === 'error' ? 'circle-exclamation' : 'check'}"></i> ${text}`;
    el.style.display = 'block';
}

// =====================================================================
// SZCZEGÓŁY GRACZA
// =====================================================================
window.openPlayerDetail = async function(playerId) {
    const modal = document.getElementById('player-detail-modal');
    const body  = document.getElementById('player-detail-body');

    body.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-secondary);"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>`;
    modal.classList.add('open');

    try {
        const snap  = await getDoc(doc(db, 'players', playerId));
        const player = snap.exists() ? { id: snap.id, ...snap.data() } : null;

        if (!player) {
            body.innerHTML = `<p style="color:#ef4444;">Nie znaleziono gracza.</p>`;
            return;
        }

        // Pobierz historię banów/mutów tego gracza
        const banSnap  = await getDocs(query(collection(db, 'admin_logs'), where('player', '==', player.nick || player.id)));
        const history  = banSnap.docs.map(d => d.data()).sort((a, b) => {
            const ta = a.date?.seconds || 0;
            const tb = b.date?.seconds || 0;
            return tb - ta;
        });

        body.innerHTML = `
            <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem;">
                ${playerHead(player.nick || player.id)}
                <div>
                    <div style="font-size:1.2rem;font-weight:800;">${player.nick || player.id}</div>
                    <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:0.2rem;">${player.uuid || '—'}</div>
                </div>
                <div style="margin-left:auto;display:flex;flex-direction:column;gap:0.4rem;align-items:flex-end;">
                    ${rankBadge(player.rank)}
                    ${statusBadge(player)}
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1.5rem;">
                <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:0.75rem;">
                    <div style="font-size:0.7rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:0.3rem;">Pierwsze logowanie</div>
                    <div style="font-weight:700;font-size:0.88rem;">${formatDate(player.firstJoin)}</div>
                </div>
                <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:0.75rem;">
                    <div style="font-size:0.7rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:0.3rem;">Ostatnie logowanie</div>
                    <div style="font-weight:700;font-size:0.88rem;">${formatDate(player.lastSeen)}</div>
                </div>
            </div>
            <div>
                <div style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:0.75rem;">Historia akcji (${history.length})</div>
                ${history.length === 0
                    ? `<div style="text-align:center;padding:1rem;color:var(--text-secondary);font-size:0.88rem;">Brak historii</div>`
                    : history.slice(0, 10).map(h => `
                        <div style="display:flex;align-items:center;gap:0.75rem;padding:0.6rem 0;border-bottom:1px solid var(--border);">
                            ${actionBadge(h.action)}
                            <span style="font-size:0.82rem;color:var(--text-secondary);flex:1;">${h.reason || '—'}</span>
                            <span style="font-size:0.78rem;color:var(--text-secondary);">${formatDate(h.date)}</span>
                        </div>
                    `).join('')
                }
            </div>
            <div style="margin-top:1.5rem;">
                <button class="login-btn" onclick="openActionModal('${player.nick || player.id}', '${player.uuid || ''}'); closePlayerDetail();">
                    <i class="fa-solid fa-gavel"></i> Wykonaj akcję
                </button>
            </div>
        `;
    } catch (err) {
        body.innerHTML = `<p style="color:#ef4444;">Błąd ładowania danych.</p>`;
        console.error(err);
    }
};

window.closePlayerDetail = function() {
    document.getElementById('player-detail-modal').classList.remove('open');
};

// =====================================================================
// TOAST
// =====================================================================
function showToast(type, message) {
    const icons = { success: 'fa-check-circle', error: 'fa-circle-exclamation', info: 'fa-circle-info' };
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i> ${message}`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

// =====================================================================
// AUTO-LOGIN (jeśli sesja istnieje)
// =====================================================================
const savedUser = sessionStorage.getItem('admin_user');
if (savedUser) {
    try {
        currentUser = JSON.parse(savedUser);
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('admin-panel').style.display  = 'flex';
        initPanel();
    } catch {
        sessionStorage.removeItem('admin_user');
    }
}
