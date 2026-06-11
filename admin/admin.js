import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
    getFirestore, collection, getDocs, doc, getDoc,
    setDoc, updateDoc, deleteDoc, addDoc,
    query, orderBy, where, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

// ─── Firebase ────────────────────────────────────────────────────────
const app = initializeApp({
    apiKey: "AIzaSyBdwzCGhUtqGm0Ggfmrl2MC8_u10c_AuMQ",
    authDomain: "stronacritmcpl.firebaseapp.com",
    projectId: "stronacritmcpl",
    storageBucket: "stronacritmcpl.firebasestorage.app",
    messagingSenderId: "674591154096",
    appId: "1:674591154096:web:fee55d9cf1c83dcfbe8075"
});
const db = getFirestore(app);

// ─── Stan ─────────────────────────────────────────────────────────────
let currentUser = null;
let allPlayers = [], allBans = [], allMutes = [], allLogs = [];

// ─── Domyślne konta (fallback gdy Firestore puste) ───────────────────
const DEFAULT_ACCOUNTS = [
    { login: 'test', password: 'test', displayName: 'Test Admin', role: 'Zarządzający', permissions: ['all'] }
];

// ─── Uprawnienia per ranga ────────────────────────────────────────────
const ROLE_PERMISSIONS = {
    'ChatMod':      ['mute', 'unmute', 'warn', 'check'],
    'Pomocnik':     ['mute', 'warn', 'check', 'players'],
    'Moderator':    ['ban', 'mute', 'unmute', 'kick', 'warn', 'check', 'players', 'logs'],
    'Admin':        ['ban', 'unban', 'mute', 'unmute', 'kick', 'warn', 'check', 'players', 'logs', 'notes'],
    'Zarządzający': ['all']
};

function hasPermission(perm) {
    if (!currentUser) return false;
    const perms = currentUser.permissions || [];
    return perms.includes('all') || perms.includes(perm);
}

function requirePermission(perm, label) {
    if (hasPermission(perm)) return true;
    showToast('error', `Brak uprawnienia: ${label || perm}`);
    return false;
}

function permissionsForRole(role) {
    return [...(ROLE_PERMISSIONS[role] || [])];
}

function setAdminPermissionsSelection(perms = []) {
    document.querySelectorAll('.perm-checkbox').forEach(cb => {
        cb.checked = perms.includes(cb.value);
    });
}

function ensureAdminPermissions(perms = []) {
    const unique = [...new Set(perms.filter(Boolean))];
    if (unique.includes('all')) return ['all'];
    return unique;
}

// ─── Nasłuch na login z inline scriptu ──────────────────────────────
window.addEventListener('adminLogin', async (e) => {
    const { login, password } = e.detail;

    try {
        const snap = await getDocs(query(collection(db, 'admins'), where('login', '==', login)));
        if (!snap.empty) {
            const adminDoc = snap.docs[0];
            const data = adminDoc.data();
            if (data.password !== password) { showLoginError('Błędny login lub hasło!'); return; }
            if (data.disabled) { showLoginError('Konto zablokowane!'); return; }
            currentUser = {
                id: adminDoc.id, login: data.login,
                displayName: data.displayName || data.login,
                role: data.role || 'Admin',
                permissions: data.permissions || ROLE_PERMISSIONS[data.role] || []
            };
            initPanelUI();
            return;
        }
    } catch (err) {
        console.warn('[CritMC] Firestore niedostępny, próba fallback:', err.message);
    }

    const local = DEFAULT_ACCOUNTS.find(a => a.login === login && a.password === password);
    if (local) {
        currentUser = { ...local };
        initPanelUI();
        try {
            const check = await getDocs(query(collection(db, 'admins'), where('login', '==', login)));
            if (check.empty) {
                await addDoc(collection(db, 'admins'), {
                    login: local.login, password: local.password,
                    displayName: local.displayName, role: local.role,
                    permissions: local.permissions, disabled: false,
                    createdAt: serverTimestamp(), createdBy: 'system'
                });
            }
        } catch(e) { /* silent */ }
    } else {
        showLoginError('Błędny login lub hasło!');
    }
});

// ─── initPanelUI ─────────────────────────────────────────────────────
function initPanelUI() {
    document.body.classList.add('auth-ready');
    document.getElementById('su-name').textContent   = currentUser.displayName;
    document.getElementById('su-role').textContent   = currentUser.role;
    document.getElementById('su-avatar').textContent = currentUser.displayName.charAt(0).toUpperCase();
    applyPermissions();
    setTimeout(_extendedApplyPermissions, 0);
    updateServerStatus('loading', 'Łączenie...');
    loadAll();
    setTimeout(() => updateServerStatus('online', 'Serwer online'), 1500);
}

// ─── applyPermissions ─────────────────────────────────────────────────
function applyPermissions() {
    const actionMap = {
        '.ban-btn':    'ban',
        '.unban-btn':  'unban',
        '.mute-btn':   'mute',
        '.unmute-btn': 'unmute',
        '.kick-btn':   'kick',
        '.warn-btn':   'warn',
        '.check-btn':  'check'
    };
    Object.entries(actionMap).forEach(([sel, perm]) => {
        document.querySelectorAll(sel).forEach(el => {
            el.style.display = hasPermission(perm) ? '' : 'none';
        });
    });
    const adminsNav = document.querySelector('.nav-btn[data-page="admins"]');
    if (adminsNav) adminsNav.style.display = hasPermission('all') ? '' : 'none';
    const logsNav = document.querySelector('.nav-btn[data-page="logs"]');
    if (logsNav) logsNav.style.display = hasPermission('logs') ? '' : 'none';
}

// ─── showLoginError ────────────────────────────────────────────────────
function showLoginError(msg) {
    document.body.classList.remove('auth-ready');
    const errEl = document.getElementById('login-error');
    if (errEl) {
        errEl.style.display = 'flex';
        errEl.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${msg}`;
    }
    if (typeof window.recordFailedAttempt === 'function') {
        window.recordFailedAttempt();
    }
    const pwEl = document.getElementById('login-password');
    if (pwEl) pwEl.value = '';
}

// ─── loadAll ──────────────────────────────────────────────────────────
function loadAll() {
    loadPlayers();
    loadBans();
    loadMutes();
    loadLogs();
}

// ─── Server status ────────────────────────────────────────────────────
function updateServerStatus(type, text) {
    const dot = document.querySelector('.status-dot');
    if (dot) dot.className = `status-dot ${type}`;
    const span = document.getElementById('status-text');
    if (span) span.textContent = text;
}

// ─── Helpers ──────────────────────────────────────────────────────────
function formatDate(val) {
    if (!val) return '—';
    let d;
    if (val instanceof Timestamp) d = val.toDate();
    else if (val?.seconds) d = new Date(val.seconds * 1000);
    else d = new Date(val);
    if (isNaN(d)) return '—';
    return d.toLocaleString('pl-PL', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function rankBadge(rank) {
    const map = { vip:'badge-vip', boss:'badge-boss', crit:'badge-crit', chatmod:'badge-chatmod', pomocnik:'badge-pomocnik', moderator:'badge-moderator', admin:'badge-admin', zarzadzajacy:'badge-zarzadzajacy' };
    const cls = map[(rank||'').toLowerCase()] || 'badge-default';
    return `<span class="badge ${cls}">${rank || 'Gracz'}</span>`;
}

function statusBadge(p) {
    if (p.banned) return `<span class="badge badge-banned"><i class="fa-solid fa-ban"></i> Zbanowany</span>`;
    if (p.muted)  return `<span class="badge badge-muted"><i class="fa-solid fa-microphone-slash"></i> Zmutowany</span>`;
    if (p.online) return `<span class="badge badge-online"><i class="fa-solid fa-circle"></i> Online</span>`;
    return `<span class="badge badge-offline"><i class="fa-regular fa-circle"></i> Offline</span>`;
}

function actionBadge(action) {
    const icons = { ban:'fa-ban', unban:'fa-ban', mute:'fa-microphone-slash', unmute:'fa-microphone', kick:'fa-door-open', warn:'fa-triangle-exclamation', check:'fa-magnifying-glass' };
    return `<span class="badge badge-action-${action}"><i class="fa-solid ${icons[action]||'fa-circle'}"></i> ${(action||'').toUpperCase()}</span>`;
}

function head(nick) {
    return `<img class="player-head" src="https://mc-heads.net/avatar/${encodeURIComponent(nick)}/36" alt="${nick}" onerror="this.src='https://mc-heads.net/avatar/Steve/36'">`;
}

// ─── GRACZE ───────────────────────────────────────────────────────────
async function loadPlayers() {
    try {
        const snap = await getDocs(collection(db, 'players'));
        allPlayers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderPlayers(allPlayers);
    } catch (e) {
        document.getElementById('players-tbody').innerHTML =
            `<tr><td colspan="5" class="table-empty" style="color:#ef4444;"><i class="fa-solid fa-circle-exclamation"></i> Błąd: ${e.message}</td></tr>`;
    }
}

function renderPlayers(list) {
    const tb = document.getElementById('players-tbody');
    if (!list.length) { tb.innerHTML = `<tr><td colspan="5" class="table-empty">Brak graczy</td></tr>`; return; }
    tb.innerHTML = list.map(p => `
        <tr>
            <td><div class="player-cell">${head(p.nick||p.id)}<div>
                <div class="player-name">${p.nick||p.id}</div>
                <div class="player-uuid">${(p.uuid||p.id||'').substring(0,16)}...</div>
            </div></div></td>
            <td>${rankBadge(p.rank)}</td>
            <td>${statusBadge(p)}</td>
            <td style="color:var(--text-secondary);font-size:.82rem;">${formatDate(p.lastSeen)}</td>
            <td><div style="display:flex;gap:.4rem;flex-wrap:wrap;">
                <button class="tbl-btn" onclick="openActionModal('${p.nick||p.id}','${p.uuid||''}')"><i class="fa-solid fa-gavel"></i> Akcja</button>
                <button class="tbl-btn" onclick="openPlayerDetail('${p.id}')"><i class="fa-solid fa-eye"></i></button>
                <button class="tbl-btn" onclick="openNoteModal('${p.nick||p.id}')"><i class="fa-solid fa-note-sticky"></i></button>
            </div></td>
        </tr>`).join('');
}

window.filterPlayers = function() {
    const s  = (document.getElementById('players-search').value||'').toLowerCase();
    const r  = (document.getElementById('players-filter-rank').value||'').toLowerCase();
    const st = document.getElementById('players-filter-status').value;
    renderPlayers(allPlayers.filter(p => {
        const n = (p.nick||p.id||'').toLowerCase();
        if (s && !n.includes(s)) return false;
        if (r && (p.rank||'default').toLowerCase() !== r) return false;
        if (st === 'online'  && !p.online)  return false;
        if (st === 'offline' && p.online)   return false;
        if (st === 'banned'  && !p.banned)  return false;
        if (st === 'muted'   && !p.muted)   return false;
        return true;
    }));
};

// ─── BANY ─────────────────────────────────────────────────────────────
async function loadBans() {
    try {
        const snap = await getDocs(query(collection(db, 'bans'), orderBy('date', 'desc')));
        allBans = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderBans(allBans);
        document.getElementById('badge-bans').textContent = allBans.length;
    } catch (e) { console.error('loadBans:', e); }
}

function renderBans(list) {
    const tb = document.getElementById('bans-tbody');
    if (!list.length) { tb.innerHTML = `<tr><td colspan="6" class="table-empty"><i class="fa-solid fa-check-circle" style="color:var(--accent-green)"></i> Brak aktywnych banów</td></tr>`; return; }
    tb.innerHTML = list.map(b => `
        <tr>
            <td><div class="player-cell">${head(b.player)}<div class="player-name">${b.player}</div></div></td>
            <td style="max-width:180px;color:var(--text-secondary);font-size:.85rem;">${b.reason||'—'}</td>
            <td><span style="font-weight:700;">${b.bannedBy||'—'}</span></td>
            <td style="font-size:.82rem;color:var(--text-secondary);">${formatDate(b.date)}</td>
            <td>${b.duration==='permanent'?`<span class="badge badge-action-ban">Permanentny</span>`:`<span style="font-size:.82rem;">${b.duration||'—'}</span>`}</td>
            <td><button class="tbl-btn tbl-btn-green" onclick="quickUnban('${b.player}','${b.id}')"><i class="fa-solid fa-check"></i> Unban</button></td>
        </tr>`).join('');
}

window.filterBans = function() {
    const s = (document.getElementById('bans-search').value||'').toLowerCase();
    const t = document.getElementById('bans-filter-type').value;
    renderBans(allBans.filter(b => {
        if (s && !(b.player||'').toLowerCase().includes(s) && !(b.reason||'').toLowerCase().includes(s)) return false;
        if (t === 'permanent' && b.duration !== 'permanent') return false;
        if (t === 'temporary' && b.duration === 'permanent') return false;
        return true;
    }));
};

window.quickUnban = async function(nick, banId) {
    if (!requirePermission('unban', 'unban')) return;
    if (!confirm(`Odbanować ${nick}?`)) return;
    try {
        await deleteDoc(doc(db, 'bans', banId));
        const snap = await getDocs(query(collection(db, 'players'), where('nick', '==', nick)));
        snap.forEach(async d => await updateDoc(d.ref, { banned: false }));
        await logAction('unban', nick, currentUser.displayName, 'Odbanowany z panelu', '—');
        showToast('success', `Odbanowano ${nick}`);
        await loadBans(); await loadPlayers(); await loadLogs();
    } catch (e) { showToast('error', 'Błąd: ' + e.message); }
};

// ─── MUTY ─────────────────────────────────────────────────────────────
async function loadMutes() {
    try {
        const snap = await getDocs(query(collection(db, 'mutes'), orderBy('date', 'desc')));
        allMutes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderMutes(allMutes);
        document.getElementById('badge-mutes').textContent = allMutes.length;
    } catch (e) { console.error('loadMutes:', e); }
}

function renderMutes(list) {
    const tb = document.getElementById('mutes-tbody');
    if (!list.length) { tb.innerHTML = `<tr><td colspan="6" class="table-empty"><i class="fa-solid fa-check-circle" style="color:var(--accent-green)"></i> Brak aktywnych mutów</td></tr>`; return; }
    tb.innerHTML = list.map(m => `
        <tr>
            <td><div class="player-cell">${head(m.player)}<div class="player-name">${m.player}</div></div></td>
            <td style="max-width:180px;color:var(--text-secondary);font-size:.85rem;">${m.reason||'—'}</td>
            <td><span style="font-weight:700;">${m.mutedBy||'—'}</span></td>
            <td style="font-size:.82rem;color:var(--text-secondary);">${formatDate(m.date)}</td>
            <td>${m.duration==='permanent'?`<span class="badge badge-action-mute">Permanentny</span>`:`<span style="font-size:.82rem;">${m.duration||'—'}</span>`}</td>
            <td><button class="tbl-btn tbl-btn-green" onclick="quickUnmute('${m.player}','${m.id}')"><i class="fa-solid fa-microphone"></i> Unmute</button></td>
        </tr>`).join('');
}

window.filterMutes = function() {
    const s = (document.getElementById('mutes-search').value||'').toLowerCase();
    const t = document.getElementById('mutes-filter-type').value;
    renderMutes(allMutes.filter(m => {
        if (s && !(m.player||'').toLowerCase().includes(s) && !(m.reason||'').toLowerCase().includes(s)) return false;
        if (t === 'permanent' && m.duration !== 'permanent') return false;
        if (t === 'temporary' && m.duration === 'permanent') return false;
        return true;
    }));
};

window.quickUnmute = async function(nick, muteId) {
    if (!requirePermission('unmute', 'unmute')) return;
    if (!confirm(`Odmutować ${nick}?`)) return;
    try {
        await deleteDoc(doc(db, 'mutes', muteId));
        const snap = await getDocs(query(collection(db, 'players'), where('nick', '==', nick)));
        snap.forEach(async d => await updateDoc(d.ref, { muted: false }));
        await logAction('unmute', nick, currentUser.displayName, 'Odmutowany z panelu', '—');
        showToast('success', `Odmutowano ${nick}`);
        await loadMutes(); await loadPlayers(); await loadLogs();
    } catch (e) { showToast('error', 'Błąd: ' + e.message); }
};

// ─── LOGI ─────────────────────────────────────────────────────────────
async function loadLogs() {
    try {
        const snap = await getDocs(query(collection(db, 'admin_logs'), orderBy('date', 'desc')));
        allLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderLogs(allLogs);
        buildAdminFilter();
        loadRecentLogs();
        loadStats();
    } catch (e) { console.error('loadLogs:', e); }
}

function renderLogs(list) {
    const tb = document.getElementById('logs-tbody');
    if (!list.length) { tb.innerHTML = `<tr><td colspan="6" class="table-empty">Brak logów</td></tr>`; return; }
    tb.innerHTML = list.map(l => `
        <tr>
            <td>${actionBadge(l.action)}</td>
            <td><div class="player-cell">${head(l.player)}<div class="player-name">${l.player}</div></div></td>
            <td><span style="font-weight:700;">${l.admin||'—'}</span></td>
            <td style="max-width:180px;color:var(--text-secondary);font-size:.85rem;">${l.reason||'—'}</td>
            <td style="font-size:.82rem;color:var(--text-secondary);">${l.duration||'—'}</td>
            <td style="font-size:.82rem;color:var(--text-secondary);white-space:nowrap;">${formatDate(l.date)}</td>
        </tr>`).join('');
}

function buildAdminFilter() {
    const sel = document.getElementById('logs-filter-admin');
    if (!sel) return;
    const admins = [...new Set(allLogs.map(l => l.admin).filter(Boolean))];
    const cur = sel.value;
    sel.innerHTML = `<option value="">Wszyscy admini</option>` +
        admins.map(a => `<option value="${a}" ${a===cur?'selected':''}>${a}</option>`).join('');
}

window.filterLogs = function() {
    const s   = (document.getElementById('logs-search').value||'').toLowerCase();
    const a   = document.getElementById('logs-filter-action').value;
    const adm = document.getElementById('logs-filter-admin').value;
    const date = document.getElementById('logs-filter-date').value;
    renderLogs(allLogs.filter(l => {
        if (s && !(l.player||'').toLowerCase().includes(s) && !(l.admin||'').toLowerCase().includes(s)) return false;
        if (a && l.action !== a) return false;
        if (adm && l.admin !== adm) return false;
        if (date) {
            let ld;
            if (l.date instanceof Timestamp) ld = l.date.toDate();
            else if (l.date?.seconds) ld = new Date(l.date.seconds * 1000);
            else ld = new Date(l.date);
            if (ld.toISOString().slice(0,10) !== date) return false;
        }
        return true;
    }));
};

// ─── STATYSTYKI ───────────────────────────────────────────────────────
function loadStats() {
    const counts = {};
    const last = {};
    allLogs.forEach(l => {
        const a = l.admin || 'Nieznany';
        if (!counts[a]) counts[a] = { ban:0, unban:0, mute:0, unmute:0, kick:0, warn:0, check:0 };
        if (counts[a][l.action] !== undefined) counts[a][l.action]++;
        if (!last[a] || (l.date?.seconds||0) > (last[a]?.seconds||0)) last[a] = l.date;
    });

    const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    el('stat-total-bans',   allLogs.filter(l => l.action === 'ban').length);
    el('stat-total-mutes',  allLogs.filter(l => l.action === 'mute').length);
    el('stat-total-kicks',  allLogs.filter(l => l.action === 'kick').length);
    el('stat-total-admins', Object.keys(counts).length);

    const tb = document.getElementById('stats-tbody');
    if (!tb) return;
    const sorted = Object.entries(counts).sort((a, b) => {
        const ta = Object.values(a[1]).reduce((s, v) => s + v, 0);
        const tb2 = Object.values(b[1]).reduce((s, v) => s + v, 0);
        return tb2 - ta;
    });
    if (!sorted.length) { tb.innerHTML = `<tr><td colspan="10" class="table-empty">Brak danych</td></tr>`; return; }
    tb.innerHTML = sorted.map(([admin, c], i) => {
        const total = Object.values(c).reduce((s, v) => s + v, 0);
        return `<tr>
            <td style="font-weight:800;color:var(--text-secondary);">#${i+1}</td>
            <td><span style="font-weight:700;">${admin}</span></td>
            <td><span class="badge badge-action-ban">${c.ban}</span></td>
            <td><span class="badge badge-action-unban">${c.unban}</span></td>
            <td><span class="badge badge-action-mute">${c.mute}</span></td>
            <td><span class="badge badge-action-kick">${c.kick}</span></td>
            <td><span class="badge badge-action-warn">${c.warn}</span></td>
            <td style="color:var(--text-secondary);">${c.check||0}</td>
            <td><span style="font-weight:800;">${total}</span></td>
            <td style="font-size:.8rem;color:var(--text-secondary);">${formatDate(last[admin])}</td>
        </tr>`;
    }).join('');
}

// ─── OSTATNIE LOGI (strona Akcje) ─────────────────────────────────────
function loadRecentLogs() {
    const el = document.getElementById('ap-recent-logs');
    if (!el) return;
    const recent = allLogs.slice(0, 15);
    if (!recent.length) { el.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-secondary);font-size:.88rem;">Brak akcji</div>`; return; }
    el.innerHTML = recent.map(l => `
        <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem 1rem;border-bottom:1px solid var(--border);">
            ${actionBadge(l.action)}
            <div style="flex:1;min-width:0;">
                <div style="font-weight:700;font-size:.88rem;">${l.player}</div>
                <div style="font-size:.75rem;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${l.reason||'—'} · ${l.admin||'—'}</div>
            </div>
            <div style="font-size:.75rem;color:var(--text-secondary);white-space:nowrap;">${formatDate(l.date)}</div>
        </div>`).join('');
}

// ─── LOG AKCJI ────────────────────────────────────────────────────────
async function logAction(action, player, admin, reason, duration) {
    try {
        await addDoc(collection(db, 'admin_logs'), {
            action, player, admin, reason,
            duration: duration || '—',
            date: serverTimestamp()
        });
    } catch (e) { console.error('logAction:', e); }
}

// ─── AKCJA NA GRACZU (modal) ──────────────────────────────────────────
window.addEventListener('submitModalAction', async () => {
    const reason   = document.getElementById('action-reason').value.trim();
    const custom   = document.getElementById('duration-custom').value.trim();
    const duration = custom || window._selectedDuration;
    const action   = window._selectedAction;
    const player   = window._actionModalPlayer;

    if (!action)   { showModalMsg('error', 'Wybierz akcję!'); return; }
    if (!reason)   { showModalMsg('error', 'Podaj powód!'); return; }
    const noDur = ['unban', 'unmute', 'kick', 'check'];
    if (!noDur.includes(action) && !duration) { showModalMsg('error', 'Wybierz czas trwania!'); return; }
    if (!player)   { showModalMsg('error', 'Brak danych gracza!'); return; }

    const btn = document.getElementById('modal-submit');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Wykonywanie...'; }

    try {
        await executeAction(action, player.nick, player.uuid, reason, duration);
        showToast('success', `${action.toUpperCase()} na ${player.nick} wykonane`);
        document.getElementById('action-modal').classList.remove('open');
        loadAll();
    } catch (e) {
        showModalMsg('error', 'Błąd: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Wykonaj akcję'; }
    }
});

// ─── AKCJA ZE STRONY "NADAJ KARĘ" ────────────────────────────────────
window.addEventListener('apSubmitAction', async () => {
    const nick     = document.getElementById('ap-nick').value.trim();
    const action   = window._apAction;
    const custom   = document.getElementById('ap-duration-custom').value.trim();
    const duration = custom || window._apDuration;
    const reason   = document.getElementById('ap-reason').value.trim();

    if (!nick)   { showApMsg('error', 'Podaj nick gracza!'); return; }
    if (!action) { showApMsg('error', 'Wybierz rodzaj akcji!'); return; }
    if (!reason) { showApMsg('error', 'Podaj powód!'); return; }
    const noDur = ['unban', 'unmute', 'kick', 'check'];
    if (!noDur.includes(action) && !duration) { showApMsg('error', 'Wybierz czas trwania!'); return; }

    try {
        await executeAction(action, nick, '', reason, duration);
        showApMsg('success', `✓ ${action.toUpperCase()} na ${nick} wykonane`);
        showToast('success', `${action.toUpperCase()} na ${nick} wykonane`);
        document.getElementById('ap-nick').value = '';
        document.getElementById('ap-reason').value = '';
        document.getElementById('ap-duration-custom').value = '';
        document.querySelectorAll('#page-action .action-btn').forEach(b => b.classList.remove('selected'));
        document.querySelectorAll('#page-action .dur-btn').forEach(b => b.classList.remove('selected'));
        window._apAction = null; window._apDuration = null;
        loadAll();
    } catch (e) {
        showApMsg('error', 'Błąd: ' + e.message);
    }
});

// ─── WYKONAJ AKCJĘ ────────────────────────────────────────────────────
async function executeAction(action, nick, uuid, reason, duration) {
    const admin = currentUser?.displayName || 'Panel';
    const actionPerm = {
        ban: 'ban',
        unban: 'unban',
        mute: 'mute',
        unmute: 'unmute',
        kick: 'kick',
        warn: 'warn',
        check: 'check'
    }[action];

    if (actionPerm && !requirePermission(actionPerm, action.toUpperCase())) {
        throw new Error(`Brak uprawnienia do akcji ${action.toUpperCase()}`);
    }

    if (action === 'ban') {
        await addDoc(collection(db, 'bans'), {
            player: nick, uuid, reason, bannedBy: admin,
            duration, date: serverTimestamp()
        });
        const snap = await getDocs(query(collection(db, 'players'), where('nick', '==', nick)));
        snap.forEach(async d => await updateDoc(d.ref, { banned: true }));

    } else if (action === 'unban') {
        const snap = await getDocs(query(collection(db, 'bans'), where('player', '==', nick)));
        snap.forEach(async d => await deleteDoc(d.ref));
        const pSnap = await getDocs(query(collection(db, 'players'), where('nick', '==', nick)));
        pSnap.forEach(async d => await updateDoc(d.ref, { banned: false }));

    } else if (action === 'mute') {
        await addDoc(collection(db, 'mutes'), {
            player: nick, uuid, reason, mutedBy: admin,
            duration, date: serverTimestamp()
        });
        const snap = await getDocs(query(collection(db, 'players'), where('nick', '==', nick)));
        snap.forEach(async d => await updateDoc(d.ref, { muted: true }));

    } else if (action === 'unmute') {
        const snap = await getDocs(query(collection(db, 'mutes'), where('player', '==', nick)));
        snap.forEach(async d => await deleteDoc(d.ref));
        const pSnap = await getDocs(query(collection(db, 'players'), where('nick', '==', nick)));
        pSnap.forEach(async d => await updateDoc(d.ref, { muted: false }));
    } else if (action === 'kick' || action === 'warn' || action === 'check') {
        // Te akcje są dziś logowane w panelu, ale nie zmieniają dokumentów Firestore.
    }
    await logAction(action, nick, admin, reason, duration || '—');
}

// ─── SZCZEGÓŁY GRACZA ─────────────────────────────────────────────────
window.addEventListener('openPlayerDetail', async (e) => {
    const playerId = e.detail;
    const modal = document.getElementById('player-detail-modal');
    const body  = document.getElementById('player-detail-body');
    body.innerHTML = `<div style="text-align:center;padding:2rem;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>`;
    modal.classList.add('open');

    try {
        const snap = await getDoc(doc(db, 'players', playerId));
        const p = snap.exists() ? { id: snap.id, ...snap.data() } : null;
        if (!p) { body.innerHTML = `<p style="color:#ef4444;">Nie znaleziono gracza.</p>`; return; }

        const histSnap = await getDocs(query(collection(db, 'admin_logs'), where('player', '==', p.nick||p.id)));
        const hist = histSnap.docs.map(d => d.data()).sort((a, b) => (b.date?.seconds||0) - (a.date?.seconds||0));

        const notesSnap = await getDocs(collection(db, 'players', playerId, 'notes'));
        const notes = notesSnap.docs.map(d => ({id:d.id,...d.data()})).sort((a,b) => (b.date?.seconds||0) - (a.date?.seconds||0));

        body.innerHTML = `
            <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem;">
                ${head(p.nick||p.id)}
                <div style="flex:1;">
                    <div style="font-size:1.2rem;font-weight:800;">${p.nick||p.id}</div>
                    <div style="font-size:.78rem;color:var(--text-secondary);margin-top:.2rem;">${p.uuid||'—'}</div>
                </div>
                <div style="display:flex;flex-direction:column;gap:.4rem;align-items:flex-end;">
                    ${rankBadge(p.rank)} ${statusBadge(p)}
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:1.5rem;">
                <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:.75rem;">
                    <div style="font-size:.7rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:.3rem;">Pierwsze logowanie</div>
                    <div style="font-weight:700;font-size:.88rem;">${formatDate(p.firstJoin)}</div>
                </div>
                <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:.75rem;">
                    <div style="font-size:.7rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:.3rem;">Ostatnie logowanie</div>
                    <div style="font-weight:700;font-size:.88rem;">${formatDate(p.lastSeen)}</div>
                </div>
            </div>
            <div style="margin-bottom:1.5rem;">
                <div style="font-size:.78rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:.75rem;">
                    Notatki (${notes.length}) — <span style="color:#f59e0b;font-weight:600;">nie można usunąć</span>
                </div>
                ${notes.length === 0 ? '<div style="text-align:center;padding:.75rem;color:var(--text-secondary);font-size:.88rem;">Brak notatek</div>' :
                    notes.slice(0,5).map(n => `
                        <div style="background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.2);border-radius:8px;padding:.65rem .9rem;margin-bottom:.5rem;">
                            <div style="font-size:.85rem;color:var(--text-primary);">${n.content||'—'}</div>
                            <div style="font-size:.72rem;color:var(--text-secondary);margin-top:.3rem;">${n.author||'—'} · ${formatDate(n.date)}</div>
                        </div>`).join('')
                }
            </div>
            <div style="margin-bottom:1.5rem;">
                <div style="font-size:.78rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:.75rem;">Historia akcji (${hist.length})</div>
                ${hist.length === 0 ? '<div style="text-align:center;padding:1rem;color:var(--text-secondary);font-size:.88rem;">Brak historii</div>' :
                    hist.slice(0,10).map(h => `
                        <div style="display:flex;align-items:center;gap:.75rem;padding:.6rem 0;border-bottom:1px solid var(--border);">
                            ${actionBadge(h.action)}
                            <span style="font-size:.82rem;color:var(--text-secondary);flex:1;">${h.reason||'—'}</span>
                            <span style="font-size:.78rem;color:var(--text-secondary);">${formatDate(h.date)}</span>
                        </div>`).join('')
                }
            </div>
            <div style="display:flex;gap:.75rem;">
                <button class="login-btn" style="flex:1;" onclick="openActionModal('${p.nick||p.id}','${p.uuid||''}');closePlayerDetail();">
                    <i class="fa-solid fa-gavel"></i> Wykonaj akcję
                </button>
                <button class="login-btn" style="flex:1;background:var(--accent-yellow);color:#000;" onclick="openNoteModal('${p.nick||p.id}');closePlayerDetail();">
                    <i class="fa-solid fa-note-sticky"></i> Dodaj notatkę
                </button>
            </div>`;
    } catch (e) {
        body.innerHTML = `<p style="color:#ef4444;">Błąd: ${e.message}</p>`;
    }
});

// ─── NOTATKI ──────────────────────────────────────────────────────────
window.openNoteModal = function(nick) {
    window._noteNick = nick;
    document.getElementById('note-player-info').innerHTML =
        `<div class="player-cell">${head(nick)}<div class="player-name">${nick}</div></div>`;
    document.getElementById('note-content').value = '';
    document.getElementById('note-msg').style.display = 'none';
    document.getElementById('note-modal').classList.add('open');
};

window.closeNoteModal = function() {
    document.getElementById('note-modal').classList.remove('open');
};

window.submitNote = async function() {
    const nick    = window._noteNick;
    const content = document.getElementById('note-content').value.trim();
    if (!content) { showNoteMsg('error', 'Wpisz treść notatki!'); return; }

    try {
        const snap = await getDocs(query(collection(db, 'players'), where('nick', '==', nick)));
        if (snap.empty) { showNoteMsg('error', 'Gracz nie znaleziony w bazie!'); return; }
        const playerId = snap.docs[0].id;

        await addDoc(collection(db, 'players', playerId, 'notes'), {
            content,
            author: currentUser?.displayName || 'Admin',
            date: serverTimestamp()
        });
        showNoteMsg('success', '✓ Notatka zapisana!');
        showToast('success', `Notatka dodana do ${nick}`);
        setTimeout(() => document.getElementById('note-modal').classList.remove('open'), 1500);
    } catch (e) {
        showNoteMsg('error', 'Błąd: ' + e.message);
    }
};

function showNoteMsg(type, text) {
    const el = document.getElementById('note-msg');
    if (!el) return;
    el.className = `modal-msg ${type}`;
    el.innerHTML = text;
    el.style.display = 'block';
}

// ─── HELPERS MSG ──────────────────────────────────────────────────────
function showModalMsg(type, text) {
    const el = document.getElementById('modal-msg');
    if (!el) return;
    el.className = `modal-msg ${type}`;
    el.innerHTML = `<i class="fa-solid fa-${type==='error'?'circle-exclamation':'check'}"></i> ${text}`;
    el.style.display = 'block';
}

function showApMsg(type, text) {
    const el = document.getElementById('ap-msg');
    if (!el) return;
    el.className = `modal-msg ${type}`;
    el.innerHTML = text;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
}

// ─── TOAST ────────────────────────────────────────────────────────────
function showToast(type, message) {
    const icons = { success:'fa-check-circle', error:'fa-circle-exclamation', info:'fa-circle-info' };
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `<i class="fa-solid ${icons[type]||icons.info}"></i> ${message}`;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

// ─── ZARZĄDZANIE ADMINAMI ─────────────────────────────────────────────
let allAdmins = [];

window.loadAdminAccounts = async function() {
    try {
        const snap = await getDocs(collection(db, 'admins'));
        allAdmins = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderAdminAccounts(allAdmins);
    } catch (e) {
        console.error('loadAdminAccounts:', e);
    }
};

function renderAdminAccounts(list) {
    const tb = document.getElementById('admin-accounts-tbody');
    if (!tb) return;
    if (!list.length) {
        tb.innerHTML = `<tr><td colspan="6" class="table-empty">Brak kont administracyjnych</td></tr>`;
        return;
    }
    tb.innerHTML = list.map(a => `
        <tr>
            <td>
                <div style="font-weight:700;">${a.displayName || a.login}</div>
                ${a.desc ? `<div style="font-size:.78rem;color:var(--text-secondary);margin-top:.2rem;">${a.desc}</div>` : ''}
            </td>
            <td><span style="font-family:monospace;font-size:.82rem;color:var(--text-secondary);">${a.login}</span></td>
            <td>${rankBadge(a.role)}</td>
            <td>
                <div style="display:flex;flex-wrap:wrap;gap:.3rem;">
                    ${(a.permissions||[]).map(p => `<span class="badge badge-default" style="font-size:.68rem;">${p}</span>`).join('')}
                </div>
            </td>
            <td>
                <span class="badge ${a.disabled ? 'badge-banned' : 'badge-online'}">${a.disabled ? 'Zablokowane' : 'Aktywne'}</span>
            </td>
            <td>
                <div style="display:flex;gap:.4rem;">
                    <button class="tbl-btn" onclick="editAdminAccount('${a.id}')"><i class="fa-solid fa-pen"></i></button>
                    <button class="tbl-btn tbl-btn-red" onclick="toggleAdminDisable('${a.id}','${a.disabled?'false':'true'}')">
                        <i class="fa-solid fa-${a.disabled?'unlock':'lock'}"></i>
                    </button>
                </div>
            </td>
        </tr>`).join('');
}

window.openAddAdminModal = function() {
    document.getElementById('admin-account-modal-title').textContent = 'Dodaj administratora';
    document.getElementById('aa-id').value = '';
    document.getElementById('aa-displayname').value = '';
    document.getElementById('aa-login').value = '';
    document.getElementById('aa-password').value = '';
    document.getElementById('aa-role').value = 'Pomocnik';
    const descEl = document.getElementById('aa-desc'); if (descEl) descEl.value = '';
    setAdminPermissionsSelection(permissionsForRole('Pomocnik'));
    document.getElementById('aa-msg').style.display = 'none';
    document.getElementById('admin-account-modal').classList.add('open');
};

window.editAdminAccount = function(id) {
    const admin = allAdmins.find(a => a.id === id);
    if (!admin) return;
    document.getElementById('admin-account-modal-title').textContent = 'Edytuj administratora';
    document.getElementById('aa-id').value = id;
    document.getElementById('aa-displayname').value = admin.displayName || '';
    document.getElementById('aa-login').value = admin.login || '';
    document.getElementById('aa-password').value = '';
    document.getElementById('aa-role').value = admin.role || 'Pomocnik';
    const descEl = document.getElementById('aa-desc'); if (descEl) descEl.value = admin.desc || '';
    setAdminPermissionsSelection(admin.permissions || permissionsForRole(admin.role));
    document.getElementById('aa-msg').style.display = 'none';
    document.getElementById('admin-account-modal').classList.add('open');
};

window.saveAdminAccount = async function() {
    const id          = document.getElementById('aa-id').value;
    const displayName = document.getElementById('aa-displayname').value.trim();
    const login       = document.getElementById('aa-login').value.trim();
    const password    = document.getElementById('aa-password').value;
    const role        = document.getElementById('aa-role').value;
    const perms       = ensureAdminPermissions([...document.querySelectorAll('.perm-checkbox:checked')].map(cb => cb.value));
    const descEl      = document.getElementById('aa-desc');
    const desc        = descEl ? descEl.value.trim() : '';

    if (!displayName || !login) { showAaMsg('error', 'Wypełnij nazwę i login!'); return; }

    try {
        const data = { displayName, login, role, permissions: perms, desc };
        if (password) data.password = password;

        if (id) {
            await updateDoc(doc(db, 'admins', id), data);
        } else {
            if (!password) { showAaMsg('error', 'Podaj hasło dla nowego konta!'); return; }
            const check = await getDocs(query(collection(db, 'admins'), where('login', '==', login)));
            if (!check.empty) { showAaMsg('error', 'Ten login jest już zajęty!'); return; }
            data.disabled = false;
            data.createdAt = serverTimestamp();
            data.createdBy = currentUser?.displayName || 'Panel';
            await addDoc(collection(db, 'admins'), data);
        }
        showAaMsg('success', id ? '✓ Zaktualizowano!' : '✓ Konto utworzone!');
        await window.loadAdminAccounts();
        setTimeout(() => document.getElementById('admin-account-modal').classList.remove('open'), 1200);
    } catch (e) {
        showAaMsg('error', 'Błąd: ' + e.message);
    }
};

window.toggleAdminDisable = async function(id, disable) {
    const action = disable === 'true' ? 'zablokować' : 'odblokować';
    if (!confirm(`Czy na pewno chcesz ${action} to konto?`)) return;
    try {
        await updateDoc(doc(db, 'admins', id), { disabled: disable === 'true' });
        showToast('success', `Konto ${disable === 'true' ? 'zablokowane' : 'odblokowane'}`);
        await window.loadAdminAccounts();
    } catch (e) { showToast('error', 'Błąd: ' + e.message); }
};

const adminRoleSelect = document.getElementById('aa-role');
if (adminRoleSelect) {
    adminRoleSelect.addEventListener('change', () => {
        if (document.getElementById('aa-id').value) return;
        setAdminPermissionsSelection(permissionsForRole(adminRoleSelect.value));
    });
}

function showAaMsg(type, text) {
    const el = document.getElementById('aa-msg');
    if (!el) return;
    el.className = `modal-msg ${type}`;
    el.innerHTML = text;
    el.style.display = 'block';
}

async function ensureDefaultAdmin() {
    try {
        const snap = await getDocs(collection(db, 'admins'));
        if (snap.empty) {
            await addDoc(collection(db, 'admins'), {
                login: 'test', password: 'test',
                displayName: 'Test Admin', role: 'Zarządzający',
                permissions: ['all'], disabled: false,
                createdAt: serverTimestamp(), createdBy: 'system'
            });
            console.log('[CritMC] Utworzono domyślne konto test/test w Firestore');
        }
    } catch (e) { console.log('[CritMC] ensureDefaultAdmin:', e.message); }
}
ensureDefaultAdmin();

// ═══════════════════════════════════════════════════════════════════════
// ─── PERSONEL ─────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

let allPersonel = [], allCreators = [];

window.loadPersonel = async function() {
    await Promise.all([_loadPersonelList(), _loadCreatorsList(), _loadOwnerData()]);
};

async function _loadOwnerData() {
    try {
        const snap = await getDoc(doc(db, 'server_content', 'owners'));
        if (snap.exists()) {
            const d = snap.data();
            const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
            set('owner-nick', d.owner?.nick);
            set('owner-yt', d.owner?.yt);
            set('owner-tt', d.owner?.tt);
            set('owner-desc', d.owner?.desc);
            set('cowowner-nick', d.cowowner?.nick);
            set('cowowner-yt', d.cowowner?.yt);
            set('cowowner-dc', d.cowowner?.dc);
            set('cowowner-desc', d.cowowner?.desc);
        }
    } catch(e) { console.error('loadOwnerData:', e); }
}

window.saveOwner = async function() {
    const nick = document.getElementById('owner-nick').value.trim();
    if (!nick) { showToast('error', 'Podaj nick właściciela!'); return; }
    try {
        const ref = doc(db, 'server_content', 'owners');
        const snap = await getDoc(ref);
        const existing = snap.exists() ? snap.data() : {};
        await setDoc(ref, { ...existing, owner: {
            nick,
            yt: document.getElementById('owner-yt').value.trim(),
            tt: document.getElementById('owner-tt').value.trim(),
            desc: document.getElementById('owner-desc').value.trim()
        }});
        showToast('success', 'Właściciel zapisany!');
    } catch(e) { showToast('error', 'Błąd: ' + e.message); }
};

window.saveCowowner = async function() {
    try {
        const ref = doc(db, 'server_content', 'owners');
        const snap = await getDoc(ref);
        const existing = snap.exists() ? snap.data() : {};
        await setDoc(ref, { ...existing, cowowner: {
            nick: document.getElementById('cowowner-nick').value.trim() || '???',
            yt: document.getElementById('cowowner-yt').value.trim(),
            dc: document.getElementById('cowowner-dc').value.trim(),
            desc: document.getElementById('cowowner-desc').value.trim()
        }});
        showToast('success', 'Współwłaściciel zapisany!');
    } catch(e) { showToast('error', 'Błąd: ' + e.message); }
};

async function _loadPersonelList() {
    try {
        const snap = await getDocs(query(collection(db, 'personel'), orderBy('order', 'asc')));
        allPersonel = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderPersonelTable(allPersonel);
        const el = document.getElementById('personel-count');
        if (el) el.textContent = `(${allPersonel.length})`;
    } catch(e) {
        const tb = document.getElementById('personel-tbody');
        if (tb) tb.innerHTML = `<tr><td colspan="7" class="table-empty" style="color:#ef4444;">Błąd: ${e.message}</td></tr>`;
    }
}

const RANK_COLORS = {
    'ChatMod': '#059669', 'Pomocnik': '#047857', 'Moderator': '#7c3aed',
    'Admin': '#b91c1c', 'Technik': '#0284c7', 'Zarządzający': '#ff1744'
};

function renderPersonelTable(list) {
    const tb = document.getElementById('personel-tbody');
    if (!tb) return;
    if (!list.length) { tb.innerHTML = `<tr><td colspan="7" class="table-empty">Brak personelu — dodaj pierwszego!</td></tr>`; return; }
    tb.innerHTML = list.map(p => {
        const color = RANK_COLORS[p.rank] || '#6b7280';
        const socials = [
            p.dc && `<a href="${p.dc}" target="_blank" style="color:#7289da;text-decoration:none;font-size:.8rem;"><i class="fa-brands fa-discord"></i></a>`,
            p.yt && `<a href="${p.yt}" target="_blank" style="color:#ff0000;text-decoration:none;font-size:.8rem;"><i class="fa-brands fa-youtube"></i></a>`,
            p.tt && `<a href="${p.tt}" target="_blank" style="color:#00f0ff;text-decoration:none;font-size:.8rem;"><i class="fa-brands fa-tiktok"></i></a>`
        ].filter(Boolean).join(' ');
        return `<tr>
            <td><img src="https://mc-heads.net/avatar/${encodeURIComponent(p.nick||'Steve')}/36" style="width:36px;height:36px;border-radius:6px;image-rendering:pixelated;" onerror="this.src='https://mc-heads.net/avatar/Steve/36'"></td>
            <td><span style="font-weight:700;">${p.nick||'—'}</span></td>
            <td><span class="badge" style="background:${color}22;border:1px solid ${color}44;color:${color};">${p.rank||'—'}</span></td>
            <td style="max-width:180px;font-size:.82rem;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.desc||'—'}</td>
            <td style="display:flex;gap:.4rem;padding:.5rem 0;">${socials||'—'}</td>
            <td style="font-size:.82rem;color:var(--text-secondary);">${p.order ?? 99}</td>
            <td><div style="display:flex;gap:.4rem;">
                <button class="tbl-btn" onclick="editPersonelMember('${p.id}')"><i class="fa-solid fa-pen"></i></button>
                <button class="tbl-btn tbl-btn-red" onclick="deletePersonelMember('${p.id}','${p.nick}')"><i class="fa-solid fa-trash"></i></button>
            </div></td>
        </tr>`;
    }).join('');
}

window.openPersonelModal = function() {
    document.getElementById('personel-modal-title').textContent = 'Dodaj członka personelu';
    document.getElementById('pm-id').value = '';
    ['pm-nick','pm-desc','pm-dc','pm-yt','pm-tt','pm-perms'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById('pm-rank').value = 'Moderator';
    document.getElementById('pm-order').value = '99';
    const d = new Date(); document.getElementById('pm-since').value = d.toISOString().slice(0,10);
    document.getElementById('pm-msg').style.display = 'none';
    document.getElementById('personel-modal').classList.add('open');
};

window.editPersonelMember = function(id) {
    const p = allPersonel.find(x => x.id === id);
    if (!p) return;
    document.getElementById('personel-modal-title').textContent = 'Edytuj członka personelu';
    document.getElementById('pm-id').value = id;
    const set = (elId, v) => { const el = document.getElementById(elId); if (el) el.value = v || ''; };
    set('pm-nick', p.nick); set('pm-desc', p.desc); set('pm-dc', p.dc);
    set('pm-yt', p.yt); set('pm-tt', p.tt); set('pm-perms', p.perms); set('pm-since', p.since);
    document.getElementById('pm-rank').value = p.rank || 'Moderator';
    document.getElementById('pm-order').value = p.order ?? 99;
    document.getElementById('pm-msg').style.display = 'none';
    document.getElementById('personel-modal').classList.add('open');
};

window.savePersonelMember = async function() {
    const id = document.getElementById('pm-id').value;
    const nick = document.getElementById('pm-nick').value.trim();
    if (!nick) { showPmMsg('error', 'Wpisz nick!'); return; }
    const data = {
        nick,
        rank: document.getElementById('pm-rank').value,
        desc: document.getElementById('pm-desc').value.trim(),
        dc: document.getElementById('pm-dc').value.trim(),
        yt: document.getElementById('pm-yt').value.trim(),
        tt: document.getElementById('pm-tt').value.trim(),
        perms: document.getElementById('pm-perms').value.trim(),
        since: document.getElementById('pm-since').value,
        order: parseInt(document.getElementById('pm-order').value) || 99,
        updatedAt: serverTimestamp()
    };
    try {
        if (id) { await updateDoc(doc(db, 'personel', id), data); }
        else { data.createdAt = serverTimestamp(); await addDoc(collection(db, 'personel'), data); }
        showPmMsg('success', id ? '✓ Zaktualizowano!' : '✓ Dodano!');
        await _loadPersonelList();
        setTimeout(() => document.getElementById('personel-modal').classList.remove('open'), 1200);
    } catch(e) { showPmMsg('error', 'Błąd: ' + e.message); }
};

window.deletePersonelMember = async function(id, nick) {
    if (!confirm(`Usunąć ${nick} z personelu?`)) return;
    try {
        await deleteDoc(doc(db, 'personel', id));
        showToast('success', `Usunięto ${nick}`);
        await _loadPersonelList();
    } catch(e) { showToast('error', 'Błąd: ' + e.message); }
};

function showPmMsg(type, text) {
    const el = document.getElementById('pm-msg');
    if (!el) return;
    el.className = `modal-msg ${type}`; el.innerHTML = text; el.style.display = 'block';
}

// ─── TWÓRCY ───────────────────────────────────────────────────────────

async function _loadCreatorsList() {
    try {
        const snap = await getDocs(collection(db, 'creators'));
        allCreators = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderCreatorsTable(allCreators);
        const el = document.getElementById('creators-count');
        if (el) el.textContent = `(${allCreators.length})`;
    } catch(e) {
        const tb = document.getElementById('creators-tbody');
        if (tb) tb.innerHTML = `<tr><td colspan="5" class="table-empty" style="color:#ef4444;">Błąd: ${e.message}</td></tr>`;
    }
}

function renderCreatorsTable(list) {
    const tb = document.getElementById('creators-tbody');
    if (!tb) return;
    if (!list.length) { tb.innerHTML = `<tr><td colspan="5" class="table-empty">Brak twórców.</td></tr>`; return; }
    tb.innerHTML = list.map(c => {
        const socials = [
            c.yt && `<a href="${c.yt}" target="_blank" style="color:#ff0000;text-decoration:none;font-size:.8rem;"><i class="fa-brands fa-youtube"></i></a>`,
            c.tt && `<a href="${c.tt}" target="_blank" style="color:#00f0ff;text-decoration:none;font-size:.8rem;"><i class="fa-brands fa-tiktok"></i></a>`,
            c.dc && `<a href="${c.dc}" target="_blank" style="color:#7289da;text-decoration:none;font-size:.8rem;"><i class="fa-brands fa-discord"></i></a>`
        ].filter(Boolean).join(' ');
        return `<tr>
            <td><img src="https://mc-heads.net/avatar/${encodeURIComponent(c.nick||'Steve')}/36" style="width:36px;height:36px;border-radius:6px;image-rendering:pixelated;" onerror="this.src='https://mc-heads.net/avatar/Steve/36'"></td>
            <td><span style="font-weight:700;">${c.nick||'—'}</span></td>
            <td style="max-width:180px;font-size:.82rem;color:var(--text-secondary);">${c.desc||'—'}</td>
            <td style="display:flex;gap:.4rem;padding:.5rem 0;">${socials||'—'}</td>
            <td><div style="display:flex;gap:.4rem;">
                <button class="tbl-btn" onclick="editCreator('${c.id}')"><i class="fa-solid fa-pen"></i></button>
                <button class="tbl-btn tbl-btn-red" onclick="deleteCreator('${c.id}','${c.nick}')"><i class="fa-solid fa-trash"></i></button>
            </div></td>
        </tr>`;
    }).join('');
}

window.openCreatorModal = function() {
    document.getElementById('creator-modal-title').textContent = 'Dodaj twórcę';
    document.getElementById('cm-id').value = '';
    ['cm-nick','cm-desc','cm-yt','cm-tt','cm-dc'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById('cm-msg').style.display = 'none';
    document.getElementById('creator-modal').classList.add('open');
};

window.editCreator = function(id) {
    const c = allCreators.find(x => x.id === id);
    if (!c) return;
    document.getElementById('creator-modal-title').textContent = 'Edytuj twórcę';
    document.getElementById('cm-id').value = id;
    const set = (elId, v) => { const el = document.getElementById(elId); if (el) el.value = v || ''; };
    set('cm-nick', c.nick); set('cm-desc', c.desc); set('cm-yt', c.yt); set('cm-tt', c.tt); set('cm-dc', c.dc);
    document.getElementById('cm-msg').style.display = 'none';
    document.getElementById('creator-modal').classList.add('open');
};

window.saveCreator = async function() {
    const id = document.getElementById('cm-id').value;
    const nick = document.getElementById('cm-nick').value.trim();
    if (!nick) { showCmMsg('error', 'Wpisz nick!'); return; }
    const data = {
        nick,
        desc: document.getElementById('cm-desc').value.trim(),
        yt: document.getElementById('cm-yt').value.trim(),
        tt: document.getElementById('cm-tt').value.trim(),
        dc: document.getElementById('cm-dc').value.trim(),
        updatedAt: serverTimestamp()
    };
    try {
        if (id) { await updateDoc(doc(db, 'creators', id), data); }
        else { data.createdAt = serverTimestamp(); await addDoc(collection(db, 'creators'), data); }
        showCmMsg('success', id ? '✓ Zaktualizowano!' : '✓ Dodano!');
        await _loadCreatorsList();
        setTimeout(() => document.getElementById('creator-modal').classList.remove('open'), 1200);
    } catch(e) { showCmMsg('error', 'Błąd: ' + e.message); }
};

window.deleteCreator = async function(id, nick) {
    if (!confirm(`Usunąć ${nick} z twórców?`)) return;
    try {
        await deleteDoc(doc(db, 'creators', id));
        showToast('success', `Usunięto ${nick}`);
        await _loadCreatorsList();
    } catch(e) { showToast('error', 'Błąd: ' + e.message); }
};

function showCmMsg(type, text) {
    const el = document.getElementById('cm-msg');
    if (!el) return;
    el.className = `modal-msg ${type}`; el.innerHTML = text; el.style.display = 'block';
}

// ═══════════════════════════════════════════════════════════════════════
// ─── STRONA (SITE PAGE) ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

// ─── _currentContestId ────────────────────────────────────────────────
function _currentContestId() {
    const sel = document.getElementById('site-contest-select');
    return (sel && sel.value) ? sel.value : 'start';
}

function formatDatetimeLocalValue(date) {
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// ─── siteLoadContestList ──────────────────────────────────────────────
async function siteLoadContestList() {
    const sel = document.getElementById('site-contest-select');
    if (!sel) return;
    const previousVal = sel.value;
    try {
        const snap = await getDocs(collection(db, 'contests'));
        const ids = snap.docs.map(d => d.id).sort();
        if (!ids.length) {
            sel.innerHTML = '<option value="start">start (brak)</option>';
            return;
        }
        sel.innerHTML = ids.map(id => `<option value="${id}">${id}</option>`).join('');
        // Zachowaj poprzedni wybór jeśli nadal istnieje
        if (previousVal && ids.includes(previousVal)) {
            sel.value = previousVal;
        }
    } catch(e) {
        sel.innerHTML = '<option value="start">start</option>';
        console.error('siteLoadContestList:', e);
    }
}

// ─── siteNewContest ────────────────────────────────────────────────────
window.siteNewContest = async function() {
    const id = prompt('Podaj ID nowego konkursu (np. "konkurs2025"):');
    if (!id || !id.trim()) return;
    const contestId = id.trim();
    const defaultDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    defaultDate.setHours(20, 0, 0, 0);
    try {
        const ref = doc(db, 'contests', contestId);
        const snap = await getDoc(ref);
        if (snap.exists()) { showToast('error', `Konkurs "${contestId}" już istnieje!`); return; }
        await setDoc(ref, {
            participants: 0, aktywny: true,
            nagroda: '', winners: [], winnersCount: 2,
            wyniki: formatDatetimeLocalValue(defaultDate),
            createdAt: new Date().toISOString()
        });
        showToast('success', `Konkurs "${contestId}" utworzony!`);
        await siteLoadContestList();
        const sel = document.getElementById('site-contest-select');
        if (sel) sel.value = contestId;
        await siteLoadContestInfo();
    } catch(e) { showToast('error', 'Błąd: ' + e.message); }
};

// ─── loadSitePage ─────────────────────────────────────────────────────
window.loadSitePage = async function() {
    await siteLoadContestList();
    await Promise.all([siteLoadContestInfo(), siteLoadEntries(), siteLoadChanges(), siteLoadMedia(), siteLoadProposals()]);
};

// ─── switchSiteTab ────────────────────────────────────────────────────
window.switchSiteTab = function(tab) {
    document.querySelectorAll('.site-tab-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-site-tab') === tab);
    });
    document.querySelectorAll('.site-tab-panel').forEach(p => {
        p.classList.toggle('sp-active', p.id === 'site-tab-' + tab);
    });
};

// ─── siteLoadContestInfo ──────────────────────────────────────────────
async function siteLoadContestInfo() {
    const contestId = _currentContestId();
    try {
        const snap = await getDoc(doc(db, 'contests', contestId));
        if (snap.exists()) {
            const d = snap.data();
            const n  = document.getElementById('site-contest-nagroda');
            const dt = document.getElementById('site-contest-date');
            const wc = document.getElementById('site-contest-winners-count');
            if (n)  n.value  = d.nagroda || '';
            if (dt && d.wyniki) {
                // Normalize to datetime-local format (YYYY-MM-DDTHH:MM)
                dt.value = d.wyniki.includes('T') ? d.wyniki.slice(0, 16) : d.wyniki + 'T20:00';
            }
            if (wc) wc.value = d.winnersCount || 2;
            _buildWinnersInputs(d.winnersCount || 2);
        } else {
            _buildWinnersInputs(2);
        }
    } catch(e) { console.error('siteLoadContestInfo:', e); _buildWinnersInputs(2); }
}

// ─── _buildWinnersInputs ──────────────────────────────────────────────
function _buildWinnersInputs(n) {
    const c = document.getElementById('site-winners-inputs');
    if (!c) return;
    c.innerHTML = '';
    for (let i = 1; i <= n; i++) {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.placeholder = `Nick zwycięzcy #${i}`;
        inp.style.cssText = 'width:100%;padding:.6rem .9rem;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:.9rem;color:var(--text-primary);background:var(--bg);outline:none;font-family:var(--font);margin-bottom:.3rem;';
        c.appendChild(inp);
    }
}

document.addEventListener('change', e => {
    if (e.target && e.target.id === 'site-contest-winners-count') {
        _buildWinnersInputs(parseInt(e.target.value) || 2);
    }
    if (e.target && e.target.id === 'site-contest-select') {
        siteLoadContestInfo();
        siteLoadEntries();
    }
});

// ─── siteUpdateContest ────────────────────────────────────────────────
window.siteUpdateContest = async function() {
    const contestId = _currentContestId();
    const nagroda = document.getElementById('site-contest-nagroda').value.trim();
    const dateVal = document.getElementById('site-contest-date').value;
    const wc = parseInt(document.getElementById('site-contest-winners-count').value) || 2;
    try {
        const ref = doc(db, 'contests', contestId);
        const snap = await getDoc(ref);
        const upd = { winnersCount: wc };
        if (nagroda) upd.nagroda = nagroda;
        if (dateVal) upd.wyniki = dateVal;
        if (snap.exists()) { await updateDoc(ref, upd); }
        else { await setDoc(ref, { participants: 0, aktywny: true, ...upd }); }
        _buildWinnersInputs(wc);
        showSiteContestMsg('✓ Zapisano!', '#00e676');
    } catch(e) { showSiteContestMsg('Błąd: ' + e.message, '#ef4444'); }
};

// ─── siteAnnounceWinners ──────────────────────────────────────────────
window.siteAnnounceWinners = async function() {
    const contestId = _currentContestId();
    const inputs = document.querySelectorAll('#site-winners-inputs input');
    const winners = [...inputs].map(i => i.value.trim()).filter(Boolean);
    if (!winners.length) { showSiteContestMsg('Wpisz nicki zwycięzców!', '#ef4444'); return; }
    if (!confirm('Ogłosić zwycięzców: ' + winners.join(', ') + '?')) return;
    try {
        const ref = doc(db, 'contests', contestId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
            await updateDoc(ref, { aktywny: false, winners, winnersDate: new Date().toISOString() });
        } else {
            await setDoc(ref, { participants: 0, aktywny: false, winners, winnersDate: new Date().toISOString() });
        }
        showSiteContestMsg('✓ Zwycięzcy ogłoszeni!', '#00e676');
    } catch(e) { showSiteContestMsg('Błąd: ' + e.message, '#ef4444'); }
};

// ─── siteEndContest ────────────────────────────────────────────────────
window.siteEndContest = async function() {
    const contestId = _currentContestId();
    if (!confirm('Zakończyć konkurs bez wyników?')) return;
    try {
        const ref = doc(db, 'contests', contestId);
        const snap = await getDoc(ref);
        if (snap.exists()) { await updateDoc(ref, { aktywny: false }); }
        showSiteContestMsg('Konkurs zakończony.', '#f59e0b');
    } catch(e) { showSiteContestMsg('Błąd: ' + e.message, '#ef4444'); }
};

// ─── siteDeleteContest ─────────────────────────────────────────────────
window.siteDeleteContest = async function() {
    const contestId = _currentContestId();
    if (!confirm(`USUNĄĆ konkurs "${contestId}"? Tej operacji nie można cofnąć!`)) return;
    try {
        const entriesSnap = await getDocs(collection(db, 'contests', contestId, 'entries'));
        for (const d of entriesSnap.docs) await deleteDoc(d.ref);
        await deleteDoc(doc(db, 'contests', contestId));
        showSiteContestMsg('Konkurs usunięty.', '#ef4444');
        showToast('success', `Usunięto konkurs "${contestId}"`);
        // Odśwież listę i przejdź do pierwszego dostępnego
        await siteLoadContestList();
        const sel = document.getElementById('site-contest-select');
        if (sel && sel.options.length > 0) {
            sel.selectedIndex = 0;
        }
        await siteLoadContestInfo();
        await siteLoadEntries();
    } catch(e) { showSiteContestMsg('Błąd: ' + e.message, '#ef4444'); }
};

// ─── siteRestartContest ────────────────────────────────────────────────
window.siteRestartContest = async function() {
    const contestId = _currentContestId();
    if (!confirm('Zresetować konkurs (usunąć uczestników i ustawić aktywny)?')) return;
    try {
        const entriesSnap = await getDocs(collection(db, 'contests', contestId, 'entries'));
        for (const d of entriesSnap.docs) await deleteDoc(d.ref);
        const ref = doc(db, 'contests', contestId);
        await setDoc(ref, {
            participants: 0, aktywny: true,
            winners: [], nagroda: document.getElementById('site-contest-nagroda').value.trim() || '2x Ranga CRIT na 14 dni',
            winnersCount: parseInt(document.getElementById('site-contest-winners-count').value) || 2
        });
        showSiteContestMsg('✓ Konkurs zresetowany!', '#00e676');
        await siteLoadEntries();
    } catch(e) { showSiteContestMsg('Błąd: ' + e.message, '#ef4444'); }
};

// ─── showSiteContestMsg ────────────────────────────────────────────────
function showSiteContestMsg(text, color) {
    const el = document.getElementById('site-contest-msg');
    if (!el) return;
    el.textContent = text; el.style.color = color;
    setTimeout(() => { el.textContent = ''; }, 3500);
}

// ─── siteLoadEntries ──────────────────────────────────────────────────
window.siteLoadEntries = async function() {
    const contestId = _currentContestId();
    const tb = document.getElementById('site-entries-tbody');
    const cntEl = document.getElementById('site-entries-count');
    if (!tb) return;
    tb.innerHTML = `<tr><td colspan="5" class="table-loading"><i class="fa-solid fa-spinner fa-spin"></i> Ładowanie...</td></tr>`;
    try {
        const snap = await getDocs(collection(db, 'contests', contestId, 'entries'));
        const entries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (cntEl) cntEl.textContent = `(${entries.length})`;
        if (!entries.length) { tb.innerHTML = `<tr><td colspan="5" class="table-empty">Brak uczestników.</td></tr>`; return; }
        tb.innerHTML = entries.map(e => `
            <tr>
                <td><span style="font-weight:700;">${e.nickMC||e.id}</span></td>
                <td style="color:var(--text-secondary);">${e.nickDC||'—'}</td>
                <td><span style="color:#f59e0b;font-style:italic;">${e.secret||'—'}</span></td>
                <td style="font-size:.8rem;color:var(--text-secondary);">${e.joinedAt ? new Date(e.joinedAt).toLocaleString('pl-PL') : '—'}</td>
                <td><button class="tbl-btn tbl-btn-red" onclick="siteRemoveEntry('${e.nickMC||e.id}')"><i class="fa-solid fa-trash"></i> Usuń</button></td>
            </tr>`).join('');
    } catch(e) { tb.innerHTML = `<tr><td colspan="5" class="table-empty" style="color:#ef4444;">Błąd: ${e.message}</td></tr>`; }
};

// ─── siteRemoveEntry ──────────────────────────────────────────────────
window.siteRemoveEntry = async function(nick) {
    const contestId = _currentContestId();
    if (!confirm(`Usunąć ${nick} z konkursu?`)) return;
    try {
        await deleteDoc(doc(db, 'contests', contestId, 'entries', nick));
        const ref = doc(db, 'contests', contestId);
        const snap = await getDoc(ref);
        if (snap.exists()) await updateDoc(ref, { participants: Math.max(0, (snap.data().participants||1) - 1) });
        showToast('success', `Usunięto ${nick}`);
        await siteLoadEntries();
    } catch(e) { showToast('error', 'Błąd: ' + e.message); }
};

// ─── siteLoadChanges ──────────────────────────────────────────────────
async function siteLoadChanges() {
    try {
        const snap = await getDoc(doc(db, 'server_content', 'changes'));
        if (snap.exists()) {
            const d = snap.data();
            ['zwykle','szczegolowe','najmocniejsze'].forEach(m => {
                const el = document.getElementById('site-edit-' + m);
                if (el) el.value = d[m] || '';
            });
        }
    } catch(e) { console.error('siteLoadChanges:', e); }
}

// ─── siteSaveChanges ──────────────────────────────────────────────────
window.siteSaveChanges = async function() {
    const msgEl = document.getElementById('site-changes-msg');
    const vals = {
        zwykle: document.getElementById('site-edit-zwykle').value,
        szczegolowe: document.getElementById('site-edit-szczegolowe').value,
        najmocniejsze: document.getElementById('site-edit-najmocniejsze').value,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.displayName || 'Admin'
    };
    try {
        await setDoc(doc(db, 'server_content', 'changes'), vals);
        if (msgEl) { msgEl.textContent = '✓ Opublikowano!'; msgEl.style.color = '#00e676'; setTimeout(() => { msgEl.textContent = ''; }, 3000); }
        showToast('success', 'Zmiany serwerowe opublikowane!');
    } catch(e) {
        if (msgEl) { msgEl.textContent = 'Błąd: ' + e.message; msgEl.style.color = '#ef4444'; }
    }
};

// ─── siteLoadMedia ────────────────────────────────────────────────────
async function siteLoadMedia() {
    try {
        const snap = await getDoc(doc(db, 'server_content', 'media'));
        if (snap.exists()) {
            const d = snap.data();
            const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
            set('site-dc-url', d.discord?.url); set('site-dc-sub', d.discord?.sub);
            set('site-yt-url', d.youtube?.url); set('site-yt-handle', d.youtube?.handle);
            set('site-tt-url', d.tiktok?.url); set('site-tt-handle', d.tiktok?.handle);
        }
    } catch(e) { console.error('siteLoadMedia:', e); }
}

// ─── siteSaveMedia ────────────────────────────────────────────────────
window.siteSaveMedia = async function() {
    const msgEl = document.getElementById('site-media-msg');
    const vals = {
        discord: { url: document.getElementById('site-dc-url').value.trim(), sub: document.getElementById('site-dc-sub').value.trim() },
        youtube: { url: document.getElementById('site-yt-url').value.trim(), handle: document.getElementById('site-yt-handle').value.trim() },
        tiktok:  { url: document.getElementById('site-tt-url').value.trim(), handle: document.getElementById('site-tt-handle').value.trim() },
        updatedAt: new Date().toISOString()
    };
    try {
        await setDoc(doc(db, 'server_content', 'media'), vals);
        if (msgEl) { msgEl.textContent = '✓ Zapisano!'; msgEl.style.color = '#00e676'; setTimeout(() => { msgEl.textContent = ''; }, 2500); }
        showToast('success', 'Linki mediów zapisane!');
    } catch(e) {
        if (msgEl) { msgEl.textContent = 'Błąd: ' + e.message; msgEl.style.color = '#ef4444'; }
    }
};

// ─── siteLoadProposals ────────────────────────────────────────────────
window.siteLoadProposals = async function() {
    const tb = document.getElementById('site-proposals-tbody');
    if (!tb) return;
    tb.innerHTML = `<tr><td colspan="5" class="table-loading"><i class="fa-solid fa-spinner fa-spin"></i> Ładowanie...</td></tr>`;
    try {
        const snap = await getDocs(query(collection(db, 'proposals'), orderBy('createdAt', 'desc')));
        if (snap.empty) { tb.innerHTML = `<tr><td colspan="5" class="table-empty">Brak propozycji.</td></tr>`; return; }
        tb.innerHTML = snap.docs.map(d => {
            const p = { id: d.id, ...d.data() };
            const date = p.createdAt ? new Date(p.createdAt).toLocaleString('pl-PL', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
            const total = (p.yes||0) + (p.no||0);
            const yesPct = total ? Math.round((p.yes||0)/total*100) : 0;
            return `<tr>
                <td style="max-width:300px;font-size:.88rem;">${p.text||'—'}</td>
                <td><span style="color:#00e676;font-weight:700;">${p.yes||0}</span></td>
                <td><span style="color:#ef4444;font-weight:700;">${p.no||0}</span> ${total > 0 ? `<span style="color:var(--text-secondary);font-size:.75rem;">(${yesPct}% TAK)</span>` : ''}</td>
                <td style="font-size:.8rem;color:var(--text-secondary);">${date}</td>
                <td><button class="tbl-btn tbl-btn-red" onclick="siteDeleteProposal('${p.id}')"><i class="fa-solid fa-trash"></i></button></td>
            </tr>`;
        }).join('');
    } catch(e) { tb.innerHTML = `<tr><td colspan="5" class="table-empty" style="color:#ef4444;">Błąd: ${e.message}</td></tr>`; }
};

// ─── siteDeleteProposal ───────────────────────────────────────────────
window.siteDeleteProposal = async function(id) {
    if (!confirm('Usunąć tę propozycję?')) return;
    try {
        await deleteDoc(doc(db, 'proposals', id));
        showToast('success', 'Propozycja usunięta');
        await siteLoadProposals();
    } catch(e) { showToast('error', 'Błąd: ' + e.message); }
};

// ═══════════════════════════════════════════════════════════════════════
// ─── ROZSZERZENIE UPRAWNIEŃ ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

function _extendedApplyPermissions() {
    const isManager = hasPermission('all');

    const siteNav     = document.querySelector('.nav-btn[data-page="site"]');
    const personelNav = document.querySelector('.nav-btn[data-page="personel"]');
    const adminsNav   = document.querySelector('.nav-btn[data-page="admins"]');

    if (siteNav)     siteNav.style.display     = isManager ? '' : 'none';
    if (personelNav) personelNav.style.display  = isManager ? '' : 'none';
    if (adminsNav)   adminsNav.style.display    = isManager ? '' : 'none';
}

// Expose to window so inline scripts can call it if needed
window._extendedApplyPermissions = _extendedApplyPermissions;
