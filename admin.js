import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
    getFirestore, collection, getDocs, doc, getDoc,
    setDoc, updateDoc, deleteDoc, addDoc, onSnapshot,
    query, orderBy, where, limit, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

// ─── Firebase ────────────────────────────────────────────────────────────────
const app = initializeApp({
    apiKey: "AIzaSyBdwzCGhUtqGm0Ggfmrl2MC8_u10c_AuMQ",
    authDomain: "stronacritmcpl.firebaseapp.com",
    projectId: "stronacritmcpl",
    storageBucket: "stronacritmcpl.firebasestorage.app",
    messagingSenderId: "674591154096",
    appId: "1:674591154096:web:fee55d9cf1c83dcfbe8075"
});
const db = getFirestore(app);
const FILE_WORKER_URL = "https://critmc-b2-files.marcinistella.workers.dev";

// ─── Stan ─────────────────────────────────────────────────────────────────────
let currentUser = null;
let allPlayers = [], allBans = [], allMutes = [], allLogs = [];
let allFiles = [], allAdmins = [], allShopItems = [];
let unsubscribePlayers = null;

// ─── Uprawnienia ──────────────────────────────────────────────────────────────
const DEFAULT_ACCOUNTS = [
    { login: 'test', password: 'test', displayName: 'Test Admin', role: 'Zarządzający', permissions: ['all'] }
];
const ROLE_PERMISSIONS = {
    'ChatMod':      ['mute', 'warn', 'check'],
    'Pomocnik':     ['mute', 'warn', 'check', 'players'],
    'Moderator':    ['ban', 'mute', 'kick', 'warn', 'check', 'players', 'logs', 'evidence_view'],
    'Admin':        ['ban', 'unban', 'mute', 'unmute', 'kick', 'warn', 'check', 'players', 'logs', 'notes', 'site', 'shop', 'media_manage', 'evidence_view', 'evidence_delete', 'ai_actions', 'stats_edit'],
    'Zarządzający': ['all']
};
const ROLE_ORDER = ['ChatMod', 'Pomocnik', 'Moderator', 'Admin', 'Zarządzający'];
const PERMISSIONS_PL = {
    players:       { label: 'Podgląd graczy',     desc: 'Może przeglądać listę graczy.' },
    ban:           { label: 'Bany',               desc: 'Może nadawać bany.' },
    unban:         { label: 'Odbanowanie',         desc: 'Może odbanowywać graczy.' },
    mute:          { label: 'Muty',               desc: 'Może nadawać muty.' },
    unmute:        { label: 'Odciszenie',          desc: 'Może zdejmować muty.' },
    kick:          { label: 'Kick',               desc: 'Może wyrzucać graczy.' },
    warn:          { label: 'Ostrzeżenia',         desc: 'Może nadawać ostrzeżenia.' },
    check:         { label: 'Sprawdzanie',         desc: 'Może wykonywać kontrole.' },
    logs:          { label: 'Logi',               desc: 'Może przeglądać logi.' },
    notes:         { label: 'Notatki',             desc: 'Może dodawać notatki.' },
    site:          { label: 'Strona',             desc: 'Może edytować stronę.' },
    shop:          { label: 'Sklep',              desc: 'Może edytować sklep i nadawać produkty.' },
    media_manage:  { label: 'Media',              desc: 'Może zarządzać mediami.' },
    evidence_view: { label: 'Podgląd plików',     desc: 'Może otwierać załączniki.' },
    evidence_delete:{ label: 'Usuwanie plików',   desc: 'Może usuwać pliki.' },
    ai_actions:    { label: 'Akcje AI',           desc: 'Może wykonywać akcje przez AI Asystenta.' },
    console:       { label: 'Konsola serwera',    desc: 'Może wysyłać dowolne komendy przez AI (console_cmd).' },
    op_manage:     { label: 'Zarządzanie OP',     desc: 'Może dawać/zabierać OP graczom.' },
    stats_edit:    { label: 'Edycja statystyk',   desc: 'Może edytować statystyki CStats graczy.' },
    cshop_manage:  { label: 'Zarządzanie CShop',  desc: 'Może edytować ceny i przedmioty w CShop.' },
    tax_manage:    { label: 'Podatki CShop',      desc: 'Może edytować progi podatkowe w sklepie.' },
    rank_manage:   { label: 'Nadawanie rang',     desc: 'Może nadawać i zabierać rangi graczom.' },
    permissions_manage: { label: 'Uprawnienia',  desc: 'Może edytować uprawnienia rang.' },
    admins_manage: { label: 'Administratorzy',    desc: 'Może zarządzać kontami adminów.' },
    all:           { label: 'Pełny dostęp',       desc: 'Ma pełny dostęp do panelu.' }
};

function hasPermission(perm) {
    if (!currentUser) return false;
    const perms = currentUser.permissions || [];
    return perms.includes('all') || perms.includes(perm);
}
function requirePermission(perm, label) {
    if (hasPermission(perm)) return true;
    showToast('error', 'Brak uprawnienia: ' + (label || perm));
    return false;
}
function permissionsForRole(role) { return [...(ROLE_PERMISSIONS[role] || [])]; }
function setAdminPermissionsSelection(perms = []) {
    document.querySelectorAll('.perm-checkbox').forEach(cb => { cb.checked = perms.includes(cb.value); });
}
function ensureAdminPermissions(perms = []) {
    const u = [...new Set(perms.filter(Boolean))];
    return u.includes('all') ? ['all'] : u;
}
function permissionLabel(key) { return PERMISSIONS_PL[key]?.label || key; }

// ─── Logowanie ────────────────────────────────────────────────────────────────
window.addEventListener('adminLogin', async (e) => {
    const { login, password } = e.detail;
    try {
        const snap = await getDocs(query(collection(db, 'admins'), where('login', '==', login)));
        if (!snap.empty) {
            const d = snap.docs[0]; const data = d.data();
            if (data.password !== password) { showLoginError('Błędny login lub hasło!'); return; }
            if (data.disabled) { showLoginError('Konto zablokowane!'); return; }
            currentUser = { id: d.id, login: data.login, displayName: data.displayName || data.login, role: data.role || 'Admin', permissions: data.permissions || ROLE_PERMISSIONS[data.role] || [] };
            initPanelUI(); return;
        }
    } catch (err) { console.warn('Firestore niedostępny, próba fallback:', err.message); }
    const local = DEFAULT_ACCOUNTS.find(a => a.login === login && a.password === password);
    if (local) { currentUser = { ...local }; initPanelUI(); }
    else { showLoginError('Błędny login lub hasło!'); }
});

function showLoginError(msg) {
    document.body.classList.remove('auth-ready');
    const e = document.getElementById('login-error');
    if (e) { e.style.display = 'flex'; e.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> ' + msg; }
    if (typeof window.recordFailedAttempt === 'function') window.recordFailedAttempt();
    const pw = document.getElementById('login-password'); if (pw) pw.value = '';
}

// ─── initPanelUI ─────────────────────────────────────────────────────────────
function initPanelUI() {
    localStorage.removeItem('ap_block');
    localStorage.removeItem('ap_attempts');
    document.body.classList.add('auth-ready');
    document.getElementById('su-name').textContent   = currentUser.displayName;
    document.getElementById('su-role').textContent   = currentUser.role;
    document.getElementById('su-avatar').textContent = currentUser.displayName.charAt(0).toUpperCase();
    applyPermissions();
    updateServerStatus('loading', 'Łączenie...');
    loadAll();
    setTimeout(() => updateServerStatus('online', 'Serwer online'), 2000);
}

function applyPermissions() {
    const shopNav = document.querySelector('.nav-btn[data-page="shop"]');
    if (shopNav) shopNav.style.display = (hasPermission('shop') || hasPermission('all')) ? '' : 'none';
    const filesNav = document.querySelector('.nav-btn[data-page="files"]');
    if (filesNav) filesNav.style.display = (hasPermission('evidence_view') || hasPermission('all')) ? '' : 'none';
    const siteNav = document.querySelector('.nav-btn[data-page="site"]');
    if (siteNav) siteNav.style.display = (hasPermission('site') || hasPermission('all')) ? '' : 'none';
    const permNav = document.querySelector('.nav-btn[data-page="permissions"]');
    if (permNav) permNav.style.display = (hasPermission('permissions_manage') || hasPermission('all')) ? '' : 'none';
    const adminsNav = document.querySelector('.nav-btn[data-page="admins"]');
    if (adminsNav) adminsNav.style.display = (hasPermission('admins_manage') || hasPermission('all')) ? '' : 'none';
}

function loadAll() {
    // Wszystkie zapytania Firestore równolegle — nie czekaj na siebie nawzajem
    Promise.allSettled([loadBans(), loadMutes(), loadLogs(), loadRolePermissionsFromStore()]);
    loadPlayers(); // real-time listener, non-blocking
}

// Przycisk odświeżania w topbarze — resetuje listenery i przeładowuje dane
window.refreshAllData = async function() {
    const icon = document.getElementById('topbar-refresh-icon');
    const btn  = document.getElementById('topbar-refresh-btn');
    if (icon) { icon.className = 'fa-solid fa-rotate-right fa-spin'; icon.style.color = 'var(--accent-blue)'; }
    if (btn)  btn.disabled = true;

    try {
        // Resetuj real-time listener graczy (wymusi ponowne pobranie)
        if (typeof unsubscribePlayers !== 'undefined' && unsubscribePlayers) {
            unsubscribePlayers();
            unsubscribePlayers = null;
        }
        allBans = []; allMutes = []; allLogs = [];

        // Uruchom wszystko równolegle
        await Promise.allSettled([
            loadBans(),
            loadMutes(),
            loadLogs(),
            loadRolePermissionsFromStore()
        ]);
        // Gracze — z real-time listenerem (reset wyżej go reinicjalizuje)
        loadPlayers();

        // Odśwież aktualnie otwartą stronę
        const activePage = document.querySelector('.page.active')?.id?.replace('page-', '');
        if (activePage === 'shop')     await loadShopGrants?.();
        if (activePage === 'stats')    loadStats?.();
        if (activePage === 'info')     loadInfoPage?.();
        if (activePage === 'site')     { /* switchSiteTab odświeży */ }
        // Strona CStats — odśwież topki + historię edycji + aktualnie wybranego gracza
        if (activePage === 'plugins') {
            await Promise.allSettled([loadCStatsTop?.(), loadCStatsEditLog?.()]);
            if (typeof _cstatsSelectedPlayer !== 'undefined' && _cstatsSelectedPlayer) {
                // Odśwież dane aktualnie otwartego gracza (statystyki, osiągnięcia, ekwipunek)
                cstatsSelectPlayer(_cstatsSelectedPlayer.name, _cstatsSelectedPlayer.uuid);
            }
        }
        // Modal szczegółów gracza — odśwież ekwipunek jeśli otwarty
        const detailModal = document.getElementById('player-detail-modal');
        if (detailModal && detailModal.classList.contains('open') && _openDetailPlayerId) {
            window.dispatchEvent(new CustomEvent('openPlayerDetail', { detail: _openDetailPlayerId }));
        }

        showToast('success', 'Dane odświeżone!');
    } catch(e) {
        showToast('error', 'Błąd odświeżania: ' + e.message);
    } finally {
        if (icon) { icon.className = 'fa-solid fa-rotate-right'; icon.style.color = ''; }
        if (btn)  btn.disabled = false;
    }
};

function updateServerStatus(type, text) {
    const dot = document.querySelector('.status-dot'); if (dot) dot.className = 'status-dot ' + type;
    const span = document.getElementById('status-text'); if (span) span.textContent = text;
}

async function loadRolePermissionsFromStore() {
    try {
        const snap = await getDoc(doc(db, 'panel_settings', 'role_permissions'));
        if (!snap.exists()) return;
        const roles = snap.data()?.roles || {};
        Object.entries(roles).forEach(([role, perms]) => {
            if (Array.isArray(perms)) ROLE_PERMISSIONS[role] = ensureAdminPermissions(perms);
        });
    } catch (e) { console.warn('loadRolePermissionsFromStore:', e.message); }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(val) {
    if (!val) return '—';
    let d;
    if (val instanceof Timestamp) d = val.toDate();
    else if (val?.seconds) d = new Date(val.seconds * 1000);
    else d = new Date(val);
    if (isNaN(d)) return '—';
    return d.toLocaleString('pl-PL', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function escapeHtml(v) {
    return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n <= 0) return '0 B';
    const units = ['B','KB','MB','GB'];
    const i = Math.min(Math.floor(Math.log(n)/Math.log(1024)), units.length-1);
    const v = n / Math.pow(1024, i);
    return (v >= 10 || i === 0 ? v.toFixed(0) : v.toFixed(1)) + ' ' + units[i];
}

function rankBadge(rank) {
    const map = { vip:'badge-vip', boss:'badge-boss', crit:'badge-crit', chatmod:'badge-chatmod', pomocnik:'badge-pomocnik', moderator:'badge-moderator', admin:'badge-admin', zarzadzajacy:'badge-zarzadzajacy' };
    return '<span class="badge ' + (map[(rank||'').toLowerCase()] || 'badge-default') + '">' + (rank || 'Gracz') + '</span>';
}

function statusBadge(p) {
    if (p.banned) return '<span class="badge badge-banned"><i class="fa-solid fa-ban"></i> Zbanowany</span>';
    if (p.muted)  return '<span class="badge badge-muted"><i class="fa-solid fa-microphone-slash"></i> Zmutowany</span>';
    if (p.online) return '<span class="badge badge-online"><i class="fa-solid fa-circle"></i> Online</span>';
    return '<span class="badge badge-offline"><i class="fa-regular fa-circle"></i> Offline</span>';
}

function actionBadge(action) {
    const icons = { ban:'fa-ban', unban:'fa-ban', mute:'fa-microphone-slash', unmute:'fa-microphone', kick:'fa-door-open', warn:'fa-triangle-exclamation', check:'fa-magnifying-glass' };
    return '<span class="badge badge-action-' + action + '"><i class="fa-solid ' + (icons[action]||'fa-circle') + '"></i> ' + (action||'').toUpperCase() + '</span>';
}

function head(nick) {
    return '<img class="player-head" src="https://mc-heads.net/avatar/' + encodeURIComponent(nick) + '/36" alt="' + nick + '" onerror="this.src=\'https://mc-heads.net/avatar/Steve/36\'">';
}

function showToast(type, message) {
    const icons = { success:'fa-check-circle', error:'fa-circle-exclamation', info:'fa-circle-info' };
    const c = document.getElementById('toast-container'); if (!c) return;
    const t = document.createElement('div');
    t.className = 'toast toast-' + type;
    t.innerHTML = '<i class="fa-solid ' + (icons[type]||icons.info) + '"></i> ' + message;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

function renderAttachmentCell(attachment) {
    if (!attachment || !attachment.type) return '<span style="color:var(--text-secondary);">—</span>';
    if (attachment.type === 'link' && attachment.url)
        return '<button class="tbl-btn" onclick="openAttachmentUrl(\'' + encodeURIComponent(attachment.url) + '\')" title="Otwórz link"><i class="fa-solid fa-link"></i></button>';
    if (attachment.type === 'text' && attachment.text)
        return '<button class="tbl-btn" onclick="showAttachmentText(\'' + encodeURIComponent(attachment.text) + '\')" title="Pokaż treść"><i class="fa-solid fa-note-sticky"></i></button>';
    if (attachment.type === 'file' && attachment.url)
        return '<button class="tbl-btn" onclick="openAttachmentUrl(\'' + encodeURIComponent(attachment.url) + '\')" title="Otwórz plik"><i class="fa-solid fa-paperclip"></i> ' + escapeHtml(attachment.fileName||'plik') + '</button>';
    return '<span style="color:var(--text-secondary);">—</span>';
}

window.openAttachmentUrl = function(encodedUrl) {
    try { window.open(decodeURIComponent(encodedUrl||''), '_blank', 'noopener,noreferrer'); } catch(e) { showToast('error', 'Nie można otworzyć pliku.'); }
};
window.showAttachmentText = function(encodedText) { alert(decodeURIComponent(encodedText||'')); };

// ─── GRACZE ───────────────────────────────────────────────────────────────────
function loadPlayers() {
    if (unsubscribePlayers) return;
    try {
        unsubscribePlayers = onSnapshot(collection(db, 'players'), (snap) => {
            const raw = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const byNick = new Map();
            raw.forEach(p => {
                const key = (p.nick || p.id || '').toLowerCase();
                const ex  = byNick.get(key);
                if (!ex || (p.lastSeen?.seconds||0) > (ex.lastSeen?.seconds||0)) byNick.set(key, p);
            });
            allPlayers = [...byNick.values()].sort((a, b) => {
                if (a.online && !b.online) return -1;
                if (!a.online && b.online) return 1;
                return (a.nick||a.id||'').localeCompare(b.nick||b.id||'');
            });
            filterPlayers();
            refreshApPlayers();
        }, (e) => {
            const tb = document.getElementById('players-tbody');
            if (tb) tb.innerHTML = '<tr><td colspan="5" class="table-empty" style="color:#ef4444;">' + e.message + '</td></tr>';
        });
    } catch (e) { console.error('loadPlayers:', e); }
}

function renderPlayers(list) {
    const tb = document.getElementById('players-tbody'); if (!tb) return;
    if (!list.length) { tb.innerHTML = '<tr><td colspan="5" class="table-empty">Brak graczy</td></tr>'; return; }
    tb.innerHTML = list.map(p => '<tr>'
        + '<td><div class="player-cell">' + head(p.nick||p.id) + '<div><div class="player-name">' + escapeHtml(p.nick||p.id) + '</div><div class="player-uuid">' + (p.uuid||p.id||'').substring(0,16) + '...</div></div></div></td>'
        + '<td><span id="ip-' + escapeHtml(p.nick||p.id) + '" style="font-family:monospace;font-size:.8rem;color:var(--text-secondary);cursor:pointer;" onclick="toggleIpDisplay(this,\'' + escapeHtml(p.ip||'') + '\')" title="Kliknij aby pokazać IP"><i class="fa-solid fa-eye-slash"></i> ••••••••</span></td>'
        + '<td>' + statusBadge(p) + '</td>'
        + '<td style="color:var(--text-secondary);font-size:.82rem;">' + formatDate(p.lastSeen) + '</td>'
        + '<td><div style="display:flex;gap:.4rem;flex-wrap:wrap;">'
        + '<button class="tbl-btn" onclick="openActionModal(\'' + escapeHtml(p.nick||p.id) + '\',\'' + (p.uuid||'') + '\')"><i class="fa-solid fa-gavel"></i> Akcja</button>'
        + '<button class="tbl-btn" onclick="openPlayerDetail(\'' + p.id + '\')"><i class="fa-solid fa-eye"></i> Szczegóły</button>'
        + '<button class="tbl-btn" onclick="openNoteModal(\'' + escapeHtml(p.nick||p.id) + '\')"><i class="fa-solid fa-note-sticky"></i></button>'
        + '</div></td></tr>'
    ).join('');
}

window.toggleIpDisplay = function(el, ip) {
    if (!ip) return;
    if (el.dataset.shown === '1') {
        el.innerHTML = '<i class="fa-solid fa-eye-slash"></i> ••••••••';
        el.style.color = 'var(--text-secondary)';
        el.dataset.shown = '0';
    } else {
        el.innerHTML = '<i class="fa-solid fa-network-wired"></i> ' + escapeHtml(ip);
        el.style.color = 'var(--accent-blue)';
        el.dataset.shown = '1';
    }
};

window.revealIpInDetail = function(btn, ip) {
    if (!ip) { btn.textContent = 'Brak IP'; return; }
    btn.outerHTML = '<span style="font-family:monospace;font-size:.78rem;color:var(--accent-blue);font-weight:600;">'
        + '<i class="fa-solid fa-network-wired"></i> ' + escapeHtml(ip) + '</span>';
};

window.filterPlayers = function() {
    const s = (document.getElementById('players-search')?.value||'').toLowerCase();
    const r = (document.getElementById('players-filter-rank')?.value||'').toLowerCase();
    const st = document.getElementById('players-filter-status')?.value||'';
    renderPlayers(allPlayers.filter(p => {
        const n = (p.nick||p.id||'').toLowerCase(), ip = (p.ip||'').toLowerCase();
        if (s && !n.includes(s) && !ip.includes(s)) return false;
        if (r && (p.rank||'default').toLowerCase() !== r) return false;
        if (st === 'online' && !p.online) return false;
        if (st === 'offline' && p.online) return false;
        if (st === 'banned' && !p.banned) return false;
        if (st === 'muted' && !p.muted) return false;
        return true;
    }));
};

// ─── KARY: BANY ───────────────────────────────────────────────────────────────
async function loadBans() {
    try {
        const snap = await getDocs(query(collection(db, 'bans'), orderBy('date', 'desc'), limit(500)));
        allBans = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderBans(allBans);
        const el = document.getElementById('badge-bans'); if (el) el.textContent = allBans.length;
        _updatePenaltiesBadge();
    } catch (e) { console.error('loadBans:', e); }
}

function renderBans(list) {
    const tb = document.getElementById('bans-tbody'); if (!tb) return;
    if (!list.length) { tb.innerHTML = '<tr><td colspan="7" class="table-empty"><i class="fa-solid fa-check-circle" style="color:var(--accent-green)"></i> Brak aktywnych banów</td></tr>'; return; }
    tb.innerHTML = list.map(b => '<tr>'
        + '<td><div class="player-cell">' + head(b.player||'?') + '<div class="player-name">' + escapeHtml(b.player||'?') + '</div></div></td>'
        + '<td style="max-width:180px;color:var(--text-secondary);font-size:.85rem;">' + escapeHtml(b.reason||'—') + '</td>'
        + '<td style="font-weight:700;">' + escapeHtml(b.bannedBy||'—') + '</td>'
        + '<td style="font-size:.82rem;color:var(--text-secondary);">' + formatDate(b.date) + '</td>'
        + '<td>' + (b.duration==='permanent' ? '<span class="badge badge-action-ban">Permanentny</span>' : '<span style="font-size:.82rem;">' + escapeHtml(b.duration||'—') + '</span>') + '</td>'
        + '<td>' + renderAttachmentCell(b.attachment) + '</td>'
        + '<td><div style="display:flex;gap:.4rem;flex-wrap:wrap;">'
        + '<button class="tbl-btn tbl-btn-green" onclick="quickUnban(\'' + escapeHtml(b.player||'') + '\',\'' + b.id + '\')"><i class="fa-solid fa-check"></i> Unban</button>'
        + '</div></td></tr>'
    ).join('');
}

window.filterBans = function() {
    const s = (document.getElementById('bans-search')?.value||'').toLowerCase();
    const t = document.getElementById('bans-filter-type')?.value||'';
    renderBans(allBans.filter(b => {
        if (s && !(b.player||'').toLowerCase().includes(s) && !(b.reason||'').toLowerCase().includes(s)) return false;
        if (t === 'permanent' && b.duration !== 'permanent') return false;
        if (t === 'temporary' && b.duration === 'permanent') return false;
        return true;
    }));
};

window.quickUnban = async function(nick, banId) {
    if (!requirePermission('unban','unban')) return;
    if (!confirm('Odbanować ' + nick + '?')) return;
    try {
        await deleteDoc(doc(db, 'bans', banId));
        const snap = await getDocs(query(collection(db, 'players'), where('nick','==',nick)));
        snap.forEach(async d => await updateDoc(d.ref, { banned: false }));
        await logAction('unban', nick, currentUser.displayName, 'Odbanowany z panelu', '—');
        showToast('success', 'Odbanowano ' + nick);
        await loadBans(); await loadPlayers();
    } catch (e) { showToast('error', 'Błąd: ' + e.message); }
};

// ─── KARY: MUTY ───────────────────────────────────────────────────────────────
async function loadMutes() {
    try {
        const snap = await getDocs(query(collection(db, 'mutes'), orderBy('date', 'desc'), limit(500)));
        allMutes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderMutes(allMutes);
        const el = document.getElementById('badge-mutes'); if (el) el.textContent = allMutes.length;
        _updatePenaltiesBadge();
    } catch (e) { console.error('loadMutes:', e); }
}

function renderMutes(list) {
    const tb = document.getElementById('mutes-tbody'); if (!tb) return;
    if (!list.length) { tb.innerHTML = '<tr><td colspan="7" class="table-empty"><i class="fa-solid fa-check-circle" style="color:var(--accent-green)"></i> Brak aktywnych mutów</td></tr>'; return; }
    tb.innerHTML = list.map(m => '<tr>'
        + '<td><div class="player-cell">' + head(m.player||'?') + '<div class="player-name">' + escapeHtml(m.player||'?') + '</div></div></td>'
        + '<td style="max-width:180px;color:var(--text-secondary);font-size:.85rem;">' + escapeHtml(m.reason||'—') + '</td>'
        + '<td style="font-weight:700;">' + escapeHtml(m.mutedBy||'—') + '</td>'
        + '<td style="font-size:.82rem;color:var(--text-secondary);">' + formatDate(m.date) + '</td>'
        + '<td>' + (m.duration==='permanent' ? '<span class="badge badge-action-mute">Permanentny</span>' : '<span style="font-size:.82rem;">' + escapeHtml(m.duration||'—') + '</span>') + '</td>'
        + '<td>' + renderAttachmentCell(m.attachment) + '</td>'
        + '<td><button class="tbl-btn tbl-btn-green" onclick="quickUnmute(\'' + escapeHtml(m.player||'') + '\',\'' + m.id + '\')"><i class="fa-solid fa-microphone"></i> Unmute</button></td></tr>'
    ).join('');
}

window.filterMutes = function() {
    const s = (document.getElementById('mutes-search')?.value||'').toLowerCase();
    const t = document.getElementById('mutes-filter-type')?.value||'';
    renderMutes(allMutes.filter(m => {
        if (s && !(m.player||'').toLowerCase().includes(s) && !(m.reason||'').toLowerCase().includes(s)) return false;
        if (t === 'permanent' && m.duration !== 'permanent') return false;
        if (t === 'temporary' && m.duration === 'permanent') return false;
        return true;
    }));
};

window.quickUnmute = async function(nick, muteId) {
    if (!requirePermission('unmute','unmute')) return;
    if (!confirm('Odmutować ' + nick + '?')) return;
    try {
        await deleteDoc(doc(db, 'mutes', muteId));
        const snap = await getDocs(query(collection(db, 'players'), where('nick','==',nick)));
        snap.forEach(async d => await updateDoc(d.ref, { muted: false }));
        await logAction('unmute', nick, currentUser.displayName, 'Odmutowany z panelu', '—');
        showToast('success', 'Odmutowano ' + nick);
        await loadMutes(); await loadPlayers();
    } catch (e) { showToast('error', 'Błąd: ' + e.message); }
};

function _updatePenaltiesBadge() {
    const el = document.getElementById('badge-penalties');
    if (el) el.textContent = (allBans.length||0) + (allMutes.length||0);
}

// ─── LOGI ─────────────────────────────────────────────────────────────────────
async function loadLogs() {
    try {
        const snap = await getDocs(query(collection(db, 'admin_logs'), orderBy('date', 'desc'), limit(500)));
        allLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderLogs(allLogs);
        buildAdminFilter();
        loadStats();
        refreshApPlayers();
    } catch (e) { console.error('loadLogs:', e); }
}

function renderLogs(list) {
    const tb = document.getElementById('logs-tbody'); if (!tb) return;
    if (!list.length) { tb.innerHTML = '<tr><td colspan="7" class="table-empty">Brak logów</td></tr>'; return; }
    tb.innerHTML = list.map(l => '<tr>'
        + '<td>' + actionBadge(l.action) + '</td>'
        + '<td><div class="player-cell">' + head(l.player||'?') + '<div class="player-name">' + escapeHtml(l.player||'?') + '</div></div></td>'
        + '<td style="font-weight:700;">' + escapeHtml(l.admin||'—') + '</td>'
        + '<td style="max-width:180px;color:var(--text-secondary);font-size:.85rem;">' + escapeHtml(l.reason||'—') + '</td>'
        + '<td style="font-size:.82rem;color:var(--text-secondary);">' + escapeHtml(l.duration||'—') + '</td>'
        + '<td>' + renderAttachmentCell(l.attachment) + '</td>'
        + '<td style="font-size:.82rem;color:var(--text-secondary);white-space:nowrap;">' + formatDate(l.date) + '</td></tr>'
    ).join('');
}

function buildAdminFilter() {
    const sel = document.getElementById('logs-filter-admin'); if (!sel) return;
    const admins = [...new Set(allLogs.map(l => l.admin).filter(Boolean))];
    const cur = sel.value;
    sel.innerHTML = '<option value="">Wszyscy admini</option>' + admins.map(a => '<option value="' + a + '"' + (a===cur?' selected':'') + '>' + a + '</option>').join('');
}

window.filterLogs = function() {
    const s = (document.getElementById('logs-search')?.value||'').toLowerCase();
    const a = document.getElementById('logs-filter-action')?.value||'';
    const adm = document.getElementById('logs-filter-admin')?.value||'';
    const date = document.getElementById('logs-filter-date')?.value||'';
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

async function logAction(action, player, admin, reason, duration, extra = {}) {
    try {
        await addDoc(collection(db, 'admin_logs'), { action, player, admin, reason, duration: duration||'—', ...extra, date: serverTimestamp() });
    } catch (e) { console.error('logAction:', e); }
}

// ─── STATYSTYKI ───────────────────────────────────────────────────────────────
function loadStats() {
    const counts = {}, last = {};
    allLogs.forEach(l => {
        const a = l.admin || 'Nieznany';
        if (!counts[a]) counts[a] = { ban:0, unban:0, mute:0, unmute:0, kick:0, warn:0, check:0 };
        if (counts[a][l.action] !== undefined) counts[a][l.action]++;
        if (!last[a] || (l.date?.seconds||0) > (last[a]?.seconds||0)) last[a] = l.date;
    });
    const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    el('stat-total-bans',   allLogs.filter(l=>l.action==='ban').length);
    el('stat-total-mutes',  allLogs.filter(l=>l.action==='mute').length);
    el('stat-total-kicks',  allLogs.filter(l=>l.action==='kick').length);
    el('stat-total-admins', Object.keys(counts).length);
    const tb = document.getElementById('stats-tbody'); if (!tb) return;
    const sorted = Object.entries(counts).sort((a,b) => Object.values(b[1]).reduce((s,v)=>s+v,0) - Object.values(a[1]).reduce((s,v)=>s+v,0));
    if (!sorted.length) { tb.innerHTML = '<tr><td colspan="10" class="table-empty">Brak danych</td></tr>'; return; }
    tb.innerHTML = sorted.map(([admin, c], i) => {
        const total = Object.values(c).reduce((s,v)=>s+v,0);
        return '<tr><td style="font-weight:800;color:var(--text-secondary);">#' + (i+1) + '</td>'
            + '<td style="font-weight:700;">' + escapeHtml(admin) + '</td>'
            + '<td><span class="badge badge-action-ban">' + c.ban + '</span></td>'
            + '<td><span class="badge badge-action-unban">' + c.unban + '</span></td>'
            + '<td><span class="badge badge-action-mute">' + c.mute + '</span></td>'
            + '<td><span class="badge badge-action-kick">' + c.kick + '</span></td>'
            + '<td><span class="badge badge-action-warn">' + c.warn + '</span></td>'
            + '<td style="color:var(--text-secondary);">' + (c.check||0) + '</td>'
            + '<td style="font-weight:800;">' + total + '</td>'
            + '<td style="font-size:.8rem;color:var(--text-secondary);">' + formatDate(last[admin]) + '</td></tr>';
    }).join('');
}

// ─── STRONA "NADAJ KARĘ" — lista graczy ───────────────────────────────────────
function renderApPlayers(list) {
    const el = document.getElementById('ap-players-list'); if (!el) return;
    if (!list || !list.length) { el.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-secondary);font-size:.88rem;"><i class="fa-solid fa-users-slash"></i><br>Brak graczy</div>'; return; }
    el.innerHTML = list.map(p => {
        const nick = p.nick || p.id || '?';
        const online = p.online;
        const dot = online ? '<span style="width:7px;height:7px;border-radius:50%;background:#10b981;flex-shrink:0;box-shadow:0 0 4px #10b981;"></span>' : '<span style="width:7px;height:7px;border-radius:50%;background:#9ca3af;flex-shrink:0;"></span>';
        let flags = '';
        if (p.banned) flags += '<span style="font-size:.65rem;background:rgba(239,68,68,.12);color:#dc2626;border:1px solid rgba(220,38,38,.2);padding:.1rem .4rem;border-radius:999px;font-weight:700;">BAN</span>';
        if (p.muted)  flags += '<span style="font-size:.65rem;background:rgba(245,158,11,.12);color:#d97706;border:1px solid rgba(217,119,6,.2);padding:.1rem .4rem;border-radius:999px;font-weight:700;margin-left:.2rem;">MUTE</span>';
        return '<div style="display:flex;align-items:center;gap:.65rem;padding:.6rem 1rem;border-bottom:1px solid var(--border);cursor:pointer;transition:background .15s;" onmouseenter="this.style.background=\'var(--bg)\'" onmouseleave="this.style.background=\'\'" onclick="apSelectPlayer(\'' + escapeHtml(nick) + '\')">'
            + dot
            + '<img src="https://mc-heads.net/avatar/' + encodeURIComponent(nick) + '/28" style="width:28px;height:28px;border-radius:5px;image-rendering:pixelated;border:1px solid var(--border);flex-shrink:0;" onerror="this.src=\'https://mc-heads.net/avatar/Steve/28\'">'
            + '<div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(nick) + '</div>'
            + '<div style="font-size:.72rem;color:var(--text-secondary);">' + (p.ip ? '<i class="fa-solid fa-network-wired" style="font-size:.65rem;"></i> ••••••' : '') + ' ' + flags + '</div></div>'
            + '<button style="background:var(--accent);border:none;color:#fff;padding:.3rem .65rem;border-radius:5px;font-size:.75rem;font-weight:700;cursor:pointer;flex-shrink:0;font-family:var(--font);" onclick="event.stopPropagation();apSelectPlayer(\'' + escapeHtml(nick) + '\')">Wybierz</button>'
            + '</div>';
    }).join('');
}

window.apFilterPlayers = function() {
    const s = (document.getElementById('ap-players-search')?.value||'').toLowerCase();
    const filtered = s ? allPlayers.filter(p => (p.nick||p.id||'').toLowerCase().includes(s) || (p.ip||'').includes(s)) : allPlayers;
    renderApPlayers(filtered.slice(0, 50));
};

window.apSelectPlayer = function(nick) {
    const input = document.getElementById('ap-nick');
    if (input) { input.value = nick; apSearchPlayer(nick); }
};

function refreshApPlayers() {
    if (document.getElementById('page-action')?.classList.contains('active')) window.apFilterPlayers();
}

// ─── WYKONAJ AKCJĘ ────────────────────────────────────────────────────────────
window.addEventListener('apSubmitAction', async () => {
    const nick     = document.getElementById('ap-nick').value.trim();
    const action   = window._apAction;
    const duration = document.getElementById('ap-duration-custom').value.trim() || window._apDuration;
    const reason   = document.getElementById('ap-reason').value.trim();
    let attachment = buildActionAttachmentPayload('ap');
    if (!nick)   { showApMsg('error', 'Podaj nick gracza!'); return; }
    if (!action) { showApMsg('error', 'Wybierz rodzaj akcji!'); return; }
    if (action !== 'message' && !reason) { showApMsg('error', 'Podaj powód!'); return; }
    const noDur = ['unban', 'unmute', 'kick', 'check', 'warn', 'message'];
    if (!noDur.includes(action) && !duration) { showApMsg('error', 'Wybierz czas trwania!'); return; }
    try {
        if (attachment?.type === 'file') {
            showApMsg('info', 'Wysyłam plik...');
            attachment = await uploadEvidenceFile(attachment.file, { player: nick, action, reason, admin: currentUser?.displayName||'Panel' });
        }
        await executeAction(action, nick, '', reason, duration, attachment);
        showApMsg('success', '✓ ' + action.toUpperCase() + ' na ' + nick + ' wykonane');
        showToast('success', action.toUpperCase() + ' na ' + nick + ' wykonane');
        document.getElementById('ap-nick').value = '';
        document.getElementById('ap-reason').value = '';
        document.getElementById('ap-duration-custom').value = '';
        resetActionAttachmentFields('ap');
        document.querySelectorAll('#page-action .action-btn').forEach(b => b.classList.remove('selected'));
        document.querySelectorAll('#page-action .dur-btn').forEach(b => b.classList.remove('selected'));
        window._apAction = null; window._apDuration = null;
        loadAll();
    } catch (e) { showApMsg('error', 'Błąd: ' + e.message); }
});

window.addEventListener('submitModalAction', async () => {
    const reason   = document.getElementById('action-reason').value.trim();
    const duration = document.getElementById('duration-custom').value.trim() || window._selectedDuration;
    const action   = window._selectedAction;
    const player   = window._actionModalPlayer;
    if (!action)  { showModalMsg('error', 'Wybierz akcję!'); return; }
    if (!reason)  { showModalMsg('error', 'Podaj powód!'); return; }
    const noDur = ['unban', 'unmute', 'kick', 'check', 'warn', 'message'];
    if (!noDur.includes(action) && !duration) { showModalMsg('error', 'Wybierz czas trwania!'); return; }
    if (!player)  { showModalMsg('error', 'Brak danych gracza!'); return; }
    const btn = document.getElementById('modal-submit');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Wykonywanie...'; }
    try {
        await executeAction(action, player.nick, player.uuid, reason, duration);
        showToast('success', action.toUpperCase() + ' na ' + player.nick + ' wykonane');
        document.getElementById('action-modal').classList.remove('open');
        loadAll();
    } catch (e) { showModalMsg('error', 'Błąd: ' + e.message); }
    finally { if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Wykonaj akcję'; } }
});

async function executeAction(action, nick, uuid, reason, duration, attachment = null) {
    const admin = currentUser?.displayName || 'Panel';
    const perms = { ban:'ban', unban:'unban', mute:'mute', unmute:'unmute', kick:'kick', warn:'warn', check:'check' };
    if (perms[action] && !requirePermission(perms[action], action.toUpperCase())) throw new Error('Brak uprawnienia do akcji ' + action.toUpperCase());
    const cleanAtt = (att) => { if(!att)return null; const c={}; for(const[k,v] of Object.entries(att)){if(v!==undefined&&v!==null)c[k]=v;} return Object.keys(c).length?c:null; };
    const att = cleanAtt(attachment);
    if (action==='ban') {
        const d={player:nick,uuid:uuid||'',reason,bannedBy:admin,duration,date:serverTimestamp()}; if(att)d.attachment=att;
        await addDoc(collection(db,'bans'),d);
        const s=await getDocs(query(collection(db,'players'),where('nick','==',nick))); s.forEach(async d=>await updateDoc(d.ref,{banned:true}));
    } else if (action==='unban') {
        const s=await getDocs(query(collection(db,'bans'),where('player','==',nick))); s.forEach(async d=>await deleteDoc(d.ref));
        const p=await getDocs(query(collection(db,'players'),where('nick','==',nick))); p.forEach(async d=>await updateDoc(d.ref,{banned:false}));
    } else if (action==='mute') {
        const d={player:nick,uuid:uuid||'',reason,mutedBy:admin,duration,date:serverTimestamp()}; if(att)d.attachment=att;
        await addDoc(collection(db,'mutes'),d);
        const s=await getDocs(query(collection(db,'players'),where('nick','==',nick))); s.forEach(async d=>await updateDoc(d.ref,{muted:true}));
    } else if (action==='unmute') {
        const s=await getDocs(query(collection(db,'mutes'),where('player','==',nick))); s.forEach(async d=>await deleteDoc(d.ref));
        const p=await getDocs(query(collection(db,'players'),where('nick','==',nick))); p.forEach(async d=>await updateDoc(d.ref,{muted:false}));
    } else if (action==='warn') {
        const pSnap=await getDocs(query(collection(db,'players'),where('nick','==',nick)));
        const pUuid=pSnap.docs[0]?.data()?.uuid||'';
        await addDoc(collection(db,'warns'),{uuid:pUuid,player:nick,reason,admin,active:true,date:serverTimestamp()});
        if(!pSnap.empty){const wc=await getDocs(query(collection(db,'warns'),where('player','==',nick),where('active','==',true)));await updateDoc(pSnap.docs[0].ref,{warns:wc.size});}
    }
    // Wyślij do panel_commands żeby plugin MC wykonał akcję
    const noMcCmd = ['check'];
    if (!noMcCmd.includes(action)) {
        await addDoc(collection(db,'panel_commands'),{action,player:nick,reason:reason||'—',duration:duration||'—',message:action==='message'?reason:'',admin,executed:false,createdAt:serverTimestamp()});
    }
    await logAction(action, nick, admin, reason||'—', duration||'—', att?{attachment:att}:{});
}

window.toggleActionAttachmentFields = function(prefix) {
    const t = document.getElementById(prefix+'-attachment-type')?.value||'';
    const l = document.getElementById(prefix+'-attachment-link'); if(l)l.style.display=t==='link'?'block':'none';
    const tx = document.getElementById(prefix+'-attachment-text'); if(tx)tx.style.display=t==='text'?'block':'none';
    const f = document.getElementById(prefix+'-attachment-file'); if(f)f.style.display=t==='file'?'block':'none';
};

function resetActionAttachmentFields(prefix) {
    ['type','link','text'].forEach(n=>{const e=document.getElementById(prefix+'-attachment-'+n);if(e)e.value='';});
    const f=document.getElementById(prefix+'-attachment-file'); if(f)f.value='';
    window.toggleActionAttachmentFields(prefix);
}

function buildActionAttachmentPayload(prefix) {
    const type = document.getElementById(prefix+'-attachment-type')?.value||'';
    if (!type) return null;
    if (type==='link') { const url=document.getElementById(prefix+'-attachment-link')?.value.trim(); return url?{type,url}:null; }
    if (type==='text') { const text=document.getElementById(prefix+'-attachment-text')?.value.trim(); return text?{type,text}:null; }
    if (type==='file') { const file=document.getElementById(prefix+'-attachment-file')?.files?.[0]; return file?{type,file}:null; }
    return null;
}

function showApMsg(type, text) {
    const el = document.getElementById('ap-msg'); if (!el) return;
    el.className = 'modal-msg ' + type; el.innerHTML = text; el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 4000);
}
function showModalMsg(type, text) {
    const el = document.getElementById('modal-msg'); if (!el) return;
    el.className = 'modal-msg ' + type; el.innerHTML = '<i class="fa-solid fa-' + (type==='error'?'circle-exclamation':'check') + '"></i> ' + text; el.style.display = 'block';
}

// ─── UPLOAD PLIKU (Evidence) ──────────────────────────────────────────────────
async function uploadEvidenceFile(file, meta) {
    if (!file) throw new Error('Brak pliku');
    const form = new FormData();
    form.append('file', file);
    form.append('player', meta?.player||'');
    form.append('action', meta?.action||'');
    form.append('reason', meta?.reason||'');
    form.append('admin',  meta?.admin||currentUser?.displayName||'Panel');
    const res = await fetch(FILE_WORKER_URL + '/upload/evidence', { method: 'POST', body: form });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok || !data?.file) throw new Error(data?.error || 'Błąd uploadu');
    const f = data.file;
    const fileUrl = f.url || (FILE_WORKER_URL + '/file/' + encodeURIComponent(f.fileKey));
    await addDoc(collection(db, 'files'), {
        kind: 'evidence', provider: 'r2', bucket: f.bucket||'critmc-files',
        fileKey: f.fileKey||'', originalName: f.fileName||file.name,
        mimeType: f.mimeType||file.type||'application/octet-stream',
        size: f.size||file.size||0, url: fileUrl,
        uploadedAt: serverTimestamp(), uploadedBy: meta?.admin||currentUser?.displayName||'Panel',
        player: meta?.player||'', action: meta?.action||'', reason: meta?.reason||'', status: 'ready'
    });
    return { type:'file', provider:'r2', fileName:f.fileName||file.name, mimeType:f.mimeType||file.type, size:f.size||file.size, fileKey:f.fileKey||'', url:fileUrl, status:'ready' };
}

;

;

;



;



;

;

;
;
;

// ─── NOTATKI ──────────────────────────────────────────────────────────────────
window.openNoteModal = function(nick) {
    window._noteNick = nick;
    document.getElementById('note-player-info').innerHTML = '<div class="player-cell">'+head(nick)+'<div class="player-name">'+escapeHtml(nick)+'</div></div>';
    document.getElementById('note-content').value = '';
    document.getElementById('note-msg').style.display = 'none';
    document.getElementById('note-modal').classList.add('open');
};
window.closeNoteModal = function() { document.getElementById('note-modal').classList.remove('open'); };
window.submitNote = async function() {
    const nick = window._noteNick;
    const content = document.getElementById('note-content').value.trim();
    if (!content) { showNoteMsg('error','Wpisz treść notatki!'); return; }
    try {
        const snap = await getDocs(query(collection(db,'players'),where('nick','==',nick)));
        if (snap.empty) { showNoteMsg('error','Gracz nie znaleziony!'); return; }
        await addDoc(collection(db,'players',snap.docs[0].id,'notes'),{ content, author: currentUser?.displayName||'Admin', date: serverTimestamp() });
        showNoteMsg('success','✓ Notatka zapisana!');
        showToast('success','Notatka dodana do '+nick);
        setTimeout(()=>document.getElementById('note-modal').classList.remove('open'),1500);
    } catch(e) { showNoteMsg('error','Błąd: '+e.message); }
};
function showNoteMsg(type, text) { const el=document.getElementById('note-msg'); if(!el)return; el.className='modal-msg '+type; el.innerHTML=text; el.style.display='block'; }

// ─── SZCZEGÓŁY GRACZA ─────────────────────────────────────────────────────────
let _openDetailPlayerId = null; // zapamiętany ID gracza w otwartym modalu (dla refresh)
window.addEventListener('openPlayerDetail', async (e) => {
    const playerId = e.detail;
    _openDetailPlayerId = playerId; // zapamiętaj do refresh
    const modal = document.getElementById('player-detail-modal');
    const body  = document.getElementById('player-detail-body');
    body.innerHTML = '<div style="text-align:center;padding:2rem;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>';
    modal.classList.add('open');
    try {
        const snap = await getDoc(doc(db,'players',playerId));
        const p = snap.exists() ? { id:snap.id,...snap.data() } : null;
        if (!p) { body.innerHTML = '<p style="color:#ef4444;">Nie znaleziono gracza.</p>'; return; }
        const histSnap = await getDocs(query(collection(db,'admin_logs'),where('player','==',p.nick||p.id)));
        const hist = histSnap.docs.map(d=>d.data()).sort((a,b)=>(b.date?.seconds||0)-(a.date?.seconds||0));
        const notesSnap = await getDocs(collection(db,'players',playerId,'notes'));
        const notes = notesSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.date?.seconds||0)-(a.date?.seconds||0));
        body.innerHTML = '<div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem;">'+head(p.nick||p.id)
            +'<div style="flex:1;"><div style="font-size:1.2rem;font-weight:800;">'+(p.nick||p.id)+'</div>'
            +'<div style="font-size:.78rem;color:var(--text-secondary);">'+(p.uuid||'')+'</div>'
            +'<div style="font-size:.78rem;font-weight:600;margin-top:.2rem;">'
            +'<button class="tbl-btn" style="font-size:.72rem;padding:.2rem .6rem;" onclick="revealIpInDetail(this,\''+escapeHtml(p.ip||'')+'\')">'
            +'<i class="fa-solid fa-eye"></i> Pokaż IP</button>'
            +'</div></div>'
            +'<div style="display:flex;flex-direction:column;gap:.4rem;">'+rankBadge(p.rank)+' '+statusBadge(p)+'</div></div>'
            +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:1.5rem;">'
            +'<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:.75rem;"><div style="font-size:.7rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:.3rem;">Pierwsze logowanie</div><div style="font-weight:700;font-size:.88rem;">'+formatDate(p.firstJoin)+'</div></div>'
            +'<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:.75rem;"><div style="font-size:.7rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:.3rem;">Ostatnie logowanie</div><div style="font-weight:700;font-size:.88rem;">'+formatDate(p.lastSeen)+'</div></div>'
            +'</div>'
            +'<div style="margin-bottom:1.5rem;"><div style="font-size:.78rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:.75rem;">Notatki ('+notes.length+')</div>'
            +(notes.length===0?'<div style="text-align:center;padding:.75rem;color:var(--text-secondary);">Brak notatek</div>':notes.slice(0,5).map(n=>'<div style="background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.2);border-radius:8px;padding:.65rem .9rem;margin-bottom:.5rem;"><div style="font-size:.85rem;">'+escapeHtml(n.content||'')+'</div><div style="font-size:.72rem;color:var(--text-secondary);margin-top:.3rem;">'+(n.author||'')+'·'+formatDate(n.date)+'</div></div>').join(''))
            +'</div>'
            +'<div style="margin-bottom:1.5rem;"><div style="font-size:.78rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:.75rem;">Historia akcji ('+hist.length+')</div>'
            +(hist.length===0?'<div style="text-align:center;padding:1rem;color:var(--text-secondary);">Brak historii</div>':hist.slice(0,10).map(h=>'<div style="display:flex;align-items:center;gap:.75rem;padding:.6rem 0;border-bottom:1px solid var(--border);">'+actionBadge(h.action)+'<span style="font-size:.82rem;color:var(--text-secondary);flex:1;">'+escapeHtml(h.reason||'')+'</span><span style="font-size:.78rem;color:var(--text-secondary);">'+formatDate(h.date)+'</span></div>').join(''))
            +'</div>'
            +'<div id="player-cstats-section" style="margin-bottom:1.5rem;"><div style="font-size:.78rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:.75rem;"><i class="fa-solid fa-chart-bar" style="color:#10b981;"></i> Statystyki CStats</div>'
            +'<div id="player-cstats-grid" style="font-size:.82rem;color:var(--text-secondary);">Ładowanie...</div>'
            +'</div>'
            +'<div style="margin-bottom:1.5rem;">'
            +'<div style="font-size:.78rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:.75rem;display:flex;align-items:center;justify-content:space-between;">'
            +'<span>Ekwipunek gracza</span>'
            +'<span id="player-inv-status" style="font-size:.72rem;font-weight:400;"></span>'
            +'</div>'
            +'<div id="player-inventory-display"></div>'
            +'</div>'
            +'<div id="player-cstats-section" style="margin-bottom:1.5rem;"></div>'
            +'<div style="display:flex;gap:.75rem;">'
            +'<button class="login-btn" style="flex:1;" onclick="openActionModal(\''+escapeHtml(p.nick||p.id)+'\',\''+escapeHtml(p.uuid||'')+'\');document.getElementById(\'player-detail-modal\').classList.remove(\'open\')"><i class="fa-solid fa-gavel"></i> Wykonaj akcję</button>'
            +'<button class="login-btn" style="flex:1;background:var(--accent-yellow);color:#000;" onclick="openNoteModal(\''+escapeHtml(p.nick||p.id)+'\');document.getElementById(\'player-detail-modal\').classList.remove(\'open\')"><i class="fa-solid fa-note-sticky"></i> Dodaj notatkę</button>'
            +'</div>';

        // Załaduj ekwipunek z Firestore
        const uuid = p.uuid || p.id;
        try {
            const invSnap = await getDoc(doc(db, 'cstats_inventory', uuid));
            const statusEl = document.getElementById('player-inv-status');
            const dispEl   = document.getElementById('player-inventory-display');
            if (invSnap.exists()) {
                const inv = invSnap.data();
                const upd = inv.updatedAt ? new Date(inv.updatedAt).toLocaleTimeString('pl-PL') : '—';
                if (statusEl) { statusEl.textContent = `Aktualizacja: ${upd}`; statusEl.style.color = '#10b981'; }
                renderInventoryDisplay('player-inventory-display', inv.inventory||[], inv.armor||[], inv.offhand||[], inv.enderchest||[]);
                // Uruchom auto-odświeżanie co 5s
                window._startInvAutoRefresh(uuid, 'player-inventory-display');
            } else {
                if (statusEl) { statusEl.textContent = 'Brak danych CStats'; statusEl.style.color = 'var(--text-secondary)'; }
                if (dispEl) dispEl.innerHTML = '<div style="font-size:.82rem;color:var(--text-secondary);padding:.5rem 0;">Brak danych ekwipunku — zainstaluj plugin CStats na serwerze.</div>';
            }
        } catch(invErr) {
            const statusEl = document.getElementById('player-inv-status');
            const dispEl   = document.getElementById('player-inventory-display');
            if (statusEl) { statusEl.textContent = 'Błąd: ' + invErr.message.substring(0,30); statusEl.style.color = '#ef4444'; }
            if (dispEl) dispEl.innerHTML = '<div style="font-size:.82rem;color:#ef4444;padding:.5rem 0;">Błąd ładowania ekwipunku.</div>';
        }

        // Zaladuj statystyki CStats dla tego gracza
        try {
            const csnap = await getDoc(doc(db, 'cstats_players', uuid));
            const csSection = document.getElementById('player-cstats-section');
            if (csSection) {
                if (csnap.exists()) {
                    const cs = csnap.data();
                    const fmt = v => (v === undefined || v === null) ? '0' : Math.round(Number(v)).toLocaleString('pl-PL');
                    const kdr = cs.deaths > 0 ? (cs.kills / cs.deaths).toFixed(2) : (cs.kills || 0).toString();
                    const fmtPt = s => { s=Math.round(Number(s)||0); const h=Math.floor(s/3600),m=Math.floor((s%3600)/60); return h>0?`${h}h ${m}m`:`${m}m`; };
                    const shopSpent = cs.shopSpent != null ? Number(cs.shopSpent).toFixed(2)+'
    } catch(e) { body.innerHTML = '<p style="color:#ef4444;">Błąd: '+e.message+'</p>'; }
});

// ─── EKWIPUNEK GRACZA ────────────────────────────────────────────────────────

// ─── EKWIPUNEK GRACZA — ulepszona wersja ─────────────────────────────────────

// Timer auto-odświeżania ekwipunku gdy modal otwarty
let _invRefreshInterval = null;
let _invCurrentUuid    = null;

// Rozszerzona mapa emoji
const _MAT_EMOJI = {
    // Miecze
    DIAMOND_SWORD:'⚔️', NETHERITE_SWORD:'⚔️', IRON_SWORD:'🗡️',
    STONE_SWORD:'🗡️', GOLDEN_SWORD:'🗡️', WOODEN_SWORD:'🗡️',
    // Kilofy
    DIAMOND_PICKAXE:'⛏️', NETHERITE_PICKAXE:'⛏️', IRON_PICKAXE:'⛏️',
    STONE_PICKAXE:'⛏️', GOLDEN_PICKAXE:'⛏️', WOODEN_PICKAXE:'⛏️',
    // Siekiery
    DIAMOND_AXE:'🪓', NETHERITE_AXE:'🪓', IRON_AXE:'🪓', STONE_AXE:'🪓', WOODEN_AXE:'🪓',
    // Zbroja diamentowa
    DIAMOND_HELMET:'💎', DIAMOND_CHESTPLATE:'💎', DIAMOND_LEGGINGS:'💎', DIAMOND_BOOTS:'💎',
    // Zbroja netherite
    NETHERITE_HELMET:'🌑', NETHERITE_CHESTPLATE:'🌑', NETHERITE_LEGGINGS:'🌑', NETHERITE_BOOTS:'🌑',
    // Zbroja żelazna
    IRON_HELMET:'🔩', IRON_CHESTPLATE:'🔩', IRON_LEGGINGS:'🔩', IRON_BOOTS:'🔩',
    // Zbroja złota
    GOLDEN_HELMET:'✨', GOLDEN_CHESTPLATE:'✨', GOLDEN_LEGGINGS:'✨', GOLDEN_BOOTS:'✨',
    // Zbroja chainmail
    CHAINMAIL_HELMET:'⛓️', CHAINMAIL_CHESTPLATE:'⛓️', CHAINMAIL_LEGGINGS:'⛓️', CHAINMAIL_BOOTS:'⛓️',
    // Zbroja skórzana
    LEATHER_HELMET:'🟫', LEATHER_CHESTPLATE:'🟫', LEATHER_LEGGINGS:'🟫', LEATHER_BOOTS:'🟫',
    // Jedzenie premium
    ENCHANTED_GOLDEN_APPLE:'⭐', GOLDEN_APPLE:'🍎',
    COOKED_BEEF:'🥩', COOKED_PORKCHOP:'🥩', COOKED_CHICKEN:'🍗',
    BREAD:'🍞', CAKE:'🎂', COOKED_SALMON:'🐟',
    // Mikstury i narzędzia
    POTION:'🧪', SPLASH_POTION:'💦', LINGERING_POTION:'🌫️',
    ENDER_PEARL:'🔮', CHORUS_FRUIT:'🍇',
    BOW:'🏹', CROSSBOW:'🏹',
    ARROW:'➡️', SPECTRAL_ARROW:'✴️', TIPPED_ARROW:'💘',
    SHIELD:'🛡️', TOTEM_OF_UNDYING:'🪬',
    ELYTRA:'🪂', TRIDENT:'🔱',
    FISHING_ROD:'🎣', FLINT_AND_STEEL:'🔥',
    WATER_BUCKET:'💧', LAVA_BUCKET:'🌋', BUCKET:'🪣', MILK_BUCKET:'🥛',
    TNT:'💥', OBSIDIAN:'⬛', END_CRYSTAL:'💜',
    DIAMOND:'💎', EMERALD:'💚', GOLD_INGOT:'🟡', IRON_INGOT:'⚙️',
    NETHERITE_INGOT:'🌑', AMETHYST_SHARD:'🪩',
    BLAZE_ROD:'🔥', GHAST_TEAR:'👻',
    NETHER_STAR:'⭐', BEACON:'🔦',
    COMPASS:'🧭', CLOCK:'⏰', MAP:'🗺️',
    BOOK:'📖', ENCHANTED_BOOK:'📕', WRITTEN_BOOK:'📗',
    NAME_TAG:'🏷️', LEAD:'🪢',
    SADDLE:'🐎', HORSE_ARMOR_DIAMOND:'💎',
};

/**
 * Inteligentny fallback emoji gdy nie ma w _MAT_EMOJI i ikona się nie załaduje.
 * Dobiera emoji na podstawie słów kluczowych w nazwie materiału.
 */
function _matEmoji(mat) {
    const m = (mat || '').toUpperCase();
    if (m.includes('SWORD'))          return '⚔️';
    if (m.includes('PICKAXE'))        return '⛏️';
    if (m.includes('AXE') && !m.includes('WAX')) return '🪓';
    if (m.includes('SHOVEL') || m.includes('SPADE')) return '🥄';
    if (m.includes('HOE'))            return '🌾';
    if (m.includes('HELMET'))         return '🪖';
    if (m.includes('CHESTPLATE'))     return '🦺';
    if (m.includes('LEGGINGS'))       return '👖';
    if (m.includes('BOOTS'))          return '👟';
    if (m.includes('DIAMOND'))        return '💎';
    if (m.includes('EMERALD'))        return '💚';
    if (m.includes('GOLD'))           return '🟡';
    if (m.includes('IRON'))           return '⚙️';
    if (m.includes('NETHERITE'))      return '🌑';
    if (m.includes('STONE') || m.includes('COBBLE')) return '🪨';
    if (m.includes('WOOD') || m.includes('LOG') || m.includes('PLANK')) return '🪵';
    if (m.includes('DIRT') || m.includes('GRASS')) return '🟫';
    if (m.includes('SAND'))           return '🟨';
    if (m.includes('WATER'))          return '💧';
    if (m.includes('LAVA'))           return '🌋';
    if (m.includes('FIRE'))           return '🔥';
    if (m.includes('GLASS'))          return '🪟';
    if (m.includes('BREAD') || m.includes('FOOD') || m.includes('MEAT')) return '🍞';
    if (m.includes('APPLE'))          return '🍎';
    if (m.includes('POTION'))         return '🧪';
    if (m.includes('BUCKET'))         return '🪣';
    if (m.includes('BOOK'))           return '📖';
    if (m.includes('TORCH') || m.includes('LANTERN')) return '🏮';
    if (m.includes('FLOWER') || m.includes('ROSE') || m.includes('TULIP')) return '🌸';
    if (m.includes('SAPLING') || m.includes('SEED')) return '🌱';
    if (m.includes('BONE') || m.includes('SKULL') || m.includes('HEAD')) return '💀';
    if (m.includes('GUNPOWDER') || m.includes('TNT')) return '💥';
    if (m.includes('REDSTONE'))       return '🔴';
    if (m.includes('INGOT'))          return '🧱';
    if (m.includes('CHEST') || m.includes('BARREL') || m.includes('SHULKER')) return '📦';
    if (m.includes('DOOR') || m.includes('GATE') || m.includes('TRAPDOOR')) return '🚪';
    if (m.includes('BED'))            return '🛏️';
    if (m.includes('RAIL'))           return '🛤️';
    if (m.includes('MINECART') || m.includes('BOAT')) return '🛒';
    if (m.includes('SPAWN') || m.includes('EGG')) return '🥚';
    if (m.includes('WOOL') || m.includes('CARPET')) return '🧶';
    if (m.includes('BANNER') || m.includes('SHIELD')) return '🛡️';
    if (m.includes('ENDER'))          return '👁️';
    if (m.includes('OBSIDIAN'))       return '⬛';
    return '📦'; // neutralny domyślny
}

/** Czyści kody kolorów Minecraft (§x) */
function _stripColor(s) {
    return (s||'').replace(/§[0-9a-fk-or]/gi, '').trim();
}

/** Buduje tooltip dla itemu */
function _buildItemTooltip(item) {
    if (!item || !item.type || item.type === 'AIR') return 'Pusty slot';
    const mat  = (item.type||item.material||'').replace(/_/g,' ');
    // Użyj czystej nazwy jeśli dostępna
    const name = item.displayNameClean || (item.displayName ? _stripColor(item.displayName) : mat);
    const amt  = (item.amount || 1);
    const lines = [`${name}${amt > 1 ? ' ×'+amt : ''}`];

    // Enchanty — format: { "minecraft:sharpness": 5 }
    const enchs = item.enchants || item.enchantments;
    if (enchs && typeof enchs === 'object' && !Array.isArray(enchs)) {
        const enchLines = Object.entries(enchs).map(([k,v]) => {
            const n = k.replace('minecraft:','').replace(/_/g,' ');
            return `  ✦ ${n} ${v}`;
        });
        if (enchLines.length) lines.push(...enchLines);
    } else if (Array.isArray(enchs) && enchs.length) {
        enchs.forEach(e => {
            const n = _stripColor(String(e.type||e)).replace('minecraft:','').replace(/_/g,' ');
            lines.push(`  ✦ ${n} ${e.level||''}`);
        });
    }

    // Lore (już czyste po stronie pluginu)
    const lore = item.lore;
    if (Array.isArray(lore) && lore.length) {
        lines.push('─────');
        lore.forEach(l => lines.push(String(l)));
    }

    // Trwałość i damage
    if (item.damage > 0) lines.push(`  Zniszczenie: ${item.damage}`);
    if (item.customModelData) lines.push(`  CustomModelData: ${item.customModelData}`);

    return lines.join('\n');
}

/** Pojedynczy slot eq — slot 36×36 z emoji i tooltipem */
function _invSlotHtml(item, showTooltipPopup = false) {
    if (!item || !item.type || item.type === 'AIR' || item.empty) {
        return `<div class="inv-slot inv-slot-empty" title="Pusty slot"></div>`;
    }

    // Sanityzacja materiału: usuń prefiksy (minecraft:), spacje, zachowaj tylko A-Z 0-9 _
    const rawMat = (item.type||'').toUpperCase();
    const mat    = rawMat.replace(/^MINECRAFT:/, '').replace(/[^A-Z0-9_]/g, '') || 'STONE';
    const amt    = (item.amount || 1);
    const emoji = _MAT_EMOJI[mat] || _matEmoji(mat);
    const tooltip = _buildItemTooltip(item);

    // Kolor tła wg tier
    let tier = '';
    if (mat.includes('NETHERITE'))   tier = 'netherite';
    else if (mat.includes('DIAMOND')) tier = 'diamond';
    else if (mat.includes('GOLDEN') || mat === 'ENCHANTED_GOLDEN_APPLE') tier = 'gold';
    else if (mat.includes('IRON'))    tier = 'iron';
    else if (mat === 'TOTEM_OF_UNDYING' || mat === 'NETHER_STAR') tier = 'special';
    else if (mat.includes('SWORD') || mat.includes('AXE') || mat.includes('BOW')) tier = 'weapon';
    else if (mat.includes('HELMET') || mat.includes('CHESTPLATE') || mat.includes('LEGGINGS') || mat.includes('BOOTS')) tier = 'armor';
    else if (mat.includes('POTION') || mat.includes('ENDER_PEARL')) tier = 'utility';

    const amtHtml = amt > 1
        ? `<span class="inv-slot-amt">${amt}</span>`
        : '';

    // ─── Ikona itemu — próba 2 serwisów + fallback na emoji ──────────────
    // 1. minecraftitemids.com (główny, działa dobrze)
    // 2. mc-heads.net/item/ (backup)
    // 3. emoji _matEmoji (ostateczny)
    const matLower = mat.toLowerCase();
    const url1     = `https://minecraftitemids.com/item/64/${encodeURIComponent(matLower)}.png`;
    const url2     = `https://mc-heads.net/item/${encodeURIComponent(matLower)}`;
    // onerror w 3 etapach: url1 → url2 → emoji. Używamy data-attr żeby śledzić stan.
    const iconHtml = `<img class="inv-slot-img" src="${url1}" alt="${escapeHtml(mat)}" loading="lazy"
                          data-fallback="${url2}"
                          onerror="var f=this.getAttribute('data-fallback');if(f){this.removeAttribute('data-fallback');this.src=f;}else{this.style.display='none';this.parentElement.querySelector('.inv-slot-emoji-fallback').style.display='';}">
                     <span class="inv-slot-emoji-fallback" style="display:none;">${emoji}</span>`;

    // ─── Tooltip CSS-only (Problem 4) ─────────────────────────────────────
    const tt = _buildTooltipHtml(item, mat);

    return `<div class="inv-slot inv-slot-${tier||'normal'}" data-item='${escapeHtml(JSON.stringify({type:item.type,amount:amt,name:item.displayName||'',enchants:item.enchants||item.enchantments||null,lore:item.lore||null}))}'>
        ${iconHtml}
        ${amtHtml}
        ${tt}
    </div>`;
}

/** Buduje HTML tooltipa (CSS-only hover) — pełne dane: nazwa, enchanty, lore, attributes, effects */
function _buildTooltipHtml(item, mat) {
    const amt  = (item.amount || 1);
    const name = item.displayNameClean || (item.displayName ? _stripColor(item.displayName) : '') || mat.replace(/_/g,' ');
    const nameColor = _rarirtColorClass(mat);
    let html = `<div class="inv-tooltip">`;
    html += `<div class="inv-tooltip-name ${nameColor}">${escapeHtml(name)}${amt > 1 ? ' <span style="color:#fff;opacity:.8;">×'+amt+'</span>' : ''}</div>`;

    // Enchanty
    const enchs = item.enchants || item.enchantments;
    if (enchs && typeof enchs === 'object' && !Array.isArray(enchs)) {
        const parts = Object.entries(enchs).map(([k,v]) => {
            const n = k.replace('minecraft:','').replace(/_/g,' ');
            return `<div class="inv-tooltip-enchant">✦ ${escapeHtml(n)} ${escapeHtml(String(v))}</div>`;
        });
        if (parts.length) html += parts.join('');
    } else if (Array.isArray(enchs) && enchs.length) {
        const parts = enchs.map(e => {
            const n = _stripColor(String(e.type||e)).replace('minecraft:','').replace(/_/g,' ');
            return `<div class="inv-tooltip-enchant">✦ ${escapeHtml(n)} ${escapeHtml(String(e.level||''))}</div>`;
        });
        if (parts.length) html += parts.join('');
    }

    // AttributeModifiers (atak, obrona, prędkość) — pełne dane
    if (Array.isArray(item.attributes) && item.attributes.length) {
        html += '<div class="inv-tooltip-section">Atrybuty:</div>';
        item.attributes.forEach(a => {
            const attr = (a.attribute||'').replace(/_/g,' ');
            const op = a.operation || '';
            const sign = (a.amount||0) >= 0 ? '+' : '';
            html += `<div class="inv-tooltip-attr">▸ ${escapeHtml(attr)} ${sign}${escapeHtml(String(a.amount||0))} <span style="opacity:.6;">(${escapeHtml(String(op))})</span>${a.slot && a.slot!=='ANY' ? ' ['+escapeHtml(String(a.slot))+']' : ''}</div>`;
        });
    }

    // Potion effects (czas, amplituda, typ)
    if (Array.isArray(item.potionEffects) && item.potionEffects.length) {
        html += '<div class="inv-tooltip-section">Efekty mikstury:</div>';
        item.potionEffects.forEach(eff => {
            const t = (eff.type||'').replace(/_/g,' ');
            const lvl = (eff.amplifier||0) + 1;
            const dur = eff.duration > 0 ? Math.floor(eff.duration/20) + 's' : '∞';
            html += `<div class="inv-tooltip-effect">◆ ${escapeHtml(t)} ${lvl} <span style="opacity:.6;">(${dur})</span></div>`;
        });
    }

    // Lore
    if (Array.isArray(item.lore) && item.lore.length) {
        html += '<div style="margin-top:.25rem;">';
        item.lore.forEach(l => html += `<div class="inv-tooltip-lore">${escapeHtml(String(l))}</div>`);
        html += '</div>';
    }

    // Meta — ID, trwałość, custom model data, item flags
    const metaParts = [];
    metaParts.push(`<span style="color:#9ca3af;">ID:</span> <span style="font-family:monospace;color:#60a5fa;">${escapeHtml(mat)}</span>`);
    if (item.damage > 0) {
        metaParts.push(`<span style="color:#fbbf24;">Durability:</span> ${escapeHtml(String(item.damage))}`);
    }
    if (item.customModelData) {
        metaParts.push(`<span style="color:#a78bfa;">CMD:</span> ${escapeHtml(String(item.customModelData))}`);
    }
    if (Array.isArray(item.itemFlags) && item.itemFlags.length) {
        metaParts.push(`<span style="color:#34d399;">Flags:</span> ${escapeHtml(item.itemFlags.join(', ').replace(/HIDE_/g,''))}`);
    }
    if (metaParts.length) html += `<div class="inv-tooltip-meta">${metaParts.join(' • ')}</div>`;

    html += '</div>';
    return html;
}

/** Klasa koloru nazwy wg rzadkości materiału (dla tooltipa) */
function _rarirtColorClass(mat) {
    if (mat.includes('NETHERITE'))   return 'inv-rarity-netherite';
    if (mat.includes('DIAMOND'))      return 'inv-rarity-diamond';
    if (mat.includes('GOLDEN') || mat === 'ENCHANTED_GOLDEN_APPLE') return 'inv-rarity-gold';
    if (mat === 'TOTEM_OF_UNDYING' || mat === 'NETHER_STAR' || mat === 'DRAGON_EGG') return 'inv-rarity-special';
    return 'inv-rarity-common';
}

/** Buduje sekcję tekstową z listą itemów */
function _buildItemList(label, items, count) {
    const nonEmpty = [];
    for (let i = 0; i < Math.min((items||[]).length, count); i++) {
        const item = items[i];
        if (item && item.type && item.type !== 'AIR' && !item.empty) {
            const mat  = _stripColor(item.displayName||'') || item.type.replace(/_/g,' ');
            const amt  = item.amount > 1 ? ` ×${item.amount}` : '';
            const enchs = item.enchants || item.enchantments;
            let enchStr = '';
            if (enchs && typeof enchs === 'object') {
                const parts = Array.isArray(enchs)
                    ? enchs.map(e => `${_stripColor(String(e.type||e))} ${e.level||''}`.trim())
                    : Object.entries(enchs).map(([k,v]) => `${k.replace('minecraft:','').replace(/_/g,' ')} ${v}`);
                if (parts.length) enchStr = ` <span style="color:#8b5cf6;font-size:.68rem;">[${parts.join(', ')}]</span>`;
            }
            nonEmpty.push(`<span style="font-size:.78rem;">${escapeHtml(mat)}${amt}</span>${enchStr}`);
        }
    }
    if (!nonEmpty.length) return '';
    return `<div style="margin-top:.5rem;">
        <div style="font-size:.65rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:.25rem;">${label}</div>
        <div style="display:flex;flex-wrap:wrap;gap:.3rem;">${nonEmpty.map(i=>`<span style="background:var(--bg);border:1px solid var(--border);padding:.1rem .4rem;border-radius:4px;">${i}</span>`).join('')}</div>
    </div>`;
}

/** Główna funkcja renderowania ekwipunku */
window.renderInventoryDisplay = function(containerId, inventoryData, armorData, offhandData, enderchestData) {
    const cont = document.getElementById(containerId);
    if (!cont) return;

    const inv     = Array.isArray(inventoryData)   ? inventoryData   : [];
    const armor   = Array.isArray(armorData)        ? armorData       : [];
    const offhand = Array.isArray(offhandData)      ? offhandData     : (offhandData ? [offhandData] : []);
    const ender   = Array.isArray(enderchestData)   ? enderchestData  : [];

    // Sekcja zbroi — pionowo jak w MC: hełm u góry, buty na dole
    const armorLabels = ['Hełm','Napierśnik','Spodnie','Buty'];
    const armorHtml = `<div class="inv-grid-armor">` +
        [3,2,1,0].map(i => `<div style="display:flex;align-items:center;gap:6px;">
            ${_invSlotHtml(armor[i]||null)}
            <span style="font-size:.62rem;color:var(--text-secondary);">${armorLabels[i]}</span>
        </div>`).join('') +
        `</div>`;

    const offhandHtml = _invSlotHtml(offhand[0]||null);

    // Główny ekwipunek — podzielony jak MC: górne rzędy (9-35) + hotbar (0-8)
    const mainInvHtml = `<div class="inv-grid">` +
        Array.from({length:27}, (_,i) => _invSlotHtml(inv[i+9]||null)).join('') +
        `</div>`;
    const hotbarHtml = `<div class="inv-grid inv-grid-hotbar">` +
        Array.from({length:9}, (_,i) => _invSlotHtml(inv[i]||null)).join('') +
        `</div>`;

    // Enderchest
    const enderHtml = `<div class="inv-grid">` +
        Array.from({length:27}, (_,i) => _invSlotHtml(ender[i]||null)).join('') +
        `</div>`;

    // Sekcja tekstowa — co ma gracz
    const textSummary =
        _buildItemList('Zbroja', [armor[3],armor[2],armor[1],armor[0]], 4) +
        _buildItemList('Lewa ręka', offhand, 1) +
        _buildItemList('Hotbar (1-9)', inv.slice(0,9), 9) +
        _buildItemList('Ekwipunek', inv.slice(9), 27) +
        _buildItemList('EnderChest', ender, 27);

    cont.innerHTML = `
      <!-- Cały ekwipunek przesunięty mocniej w prawo (4rem) + przycisk odświeżania u góry -->
      <div style="padding-left:4rem;border-left:2px solid rgba(139,92,246,.2);margin-left:1rem;">
        <!-- Pasek z info + przycisk odświeżania -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem;flex-wrap:wrap;gap:.5rem;">
            <div style="font-size:.72rem;color:var(--text-secondary);"><i class="fa-solid fa-circle-info" style="color:#8b5cf6;"></i> Najedź na slot aby zobaczyć pełne dane (ID, enchanty, atrybuty, efekty, lore)</div>
            <button onclick="window.dispatchEvent(new CustomEvent('openPlayerDetail',{detail:_openDetailPlayerId}));" style="padding:.45rem .9rem;background:linear-gradient(135deg,rgba(139,92,246,.15),rgba(59,130,246,.1));border:1.5px solid rgba(139,92,246,.3);border-radius:8px;color:#8b5cf6;font-size:.8rem;font-weight:800;cursor:pointer;font-family:var(--font);">
                <i class="fa-solid fa-rotate-right"></i> Odśwież ekwipunek
            </button>
        </div>

        <!-- Górny wiersz: armor (pionowo) + offhand | główny ekwipunek -->
        <div style="display:flex;gap:1.2rem;flex-wrap:wrap;align-items:flex-start;margin-bottom:.75rem;">
            <!-- Zbroja + offhand -->
            <div style="display:flex;flex-direction:column;gap:.4rem;">
                <div style="font-size:.7rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:.2rem;">⚔️ Zbroja</div>
                ${armorHtml}
                <div style="font-size:.7rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin:.4rem 0 .2rem;">✋ Lewa ręka</div>
                <div>${offhandHtml}</div>
            </div>
            <!-- Główny ekwipunek (10-36) -->
            <div style="flex:1;min-width:0;">
                <div style="font-size:.7rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:.3rem;">🎒 Plecak (sloty 10-36)</div>
                ${mainInvHtml}
            </div>
        </div>

        <!-- Hotbar (osobno, żółta ramka) -->
        <div style="margin-bottom:.75rem;">
            <div style="font-size:.7rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:.3rem;">🎮 Hotbar (sloty 1-9)</div>
            ${hotbarHtml}
        </div>

        <!-- Enderchest (domyślnie zwinięty) -->
        <details style="margin-bottom:.5rem;">
            <summary style="font-size:.72rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;cursor:pointer;margin-bottom:.3rem;user-select:none;">
                📦 Skrzynka Końca (27 slotów)
            </summary>
            <div style="margin-top:.3rem;">${enderHtml}</div>
        </details>

        <!-- Lista tekstowa -->
        ${textSummary ? `<details style="margin-top:.4rem;">
            <summary style="font-size:.68rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;cursor:pointer;user-select:none;">
                📋 Lista itemów (opis tekstowy)
            </summary>
            <div style="margin-top:.4rem;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:.6rem .8rem;">
                ${textSummary}
            </div>
        </details>` : ''}

        <!-- Przycisk AI -->
        <button onclick="_askAiAboutInventory(this)" style="margin-top:.6rem;width:100%;padding:.5rem;background:linear-gradient(135deg,rgba(139,92,246,.15),rgba(59,130,246,.1));border:1px solid rgba(139,92,246,.3);border-radius:8px;color:#8b5cf6;font-weight:700;font-size:.8rem;cursor:pointer;font-family:var(--font);">
            <i class="fa-solid fa-robot"></i> Zapytaj AI o ekwipunek gracza
        </button>
      </div>`;
};

/** Zapytaj AI o ekwipunek — wysyła summary do chatu AI */
window._askAiAboutInventory = function(btn) {
    // Zbierz summary eq
    const slots = document.querySelectorAll('.inv-slot:not(.inv-slot-empty)');
    if (!slots.length) { showToast('info', 'Brak danych ekwipunku.'); return; }
    const items = [];
    slots.forEach(s => {
        try {
            const d = JSON.parse(s.getAttribute('data-item') || '{}');
            if (d.type) items.push(`${d.name||d.type}${d.amount>1?' x'+d.amount:''}`);
        } catch(e) {}
    });
    const playerName = document.querySelector('#player-detail-body .player-name')?.textContent || 'gracza';
    const prompt = `Przeanalizuj ekwipunek gracza ${playerName}: ${items.slice(0,20).join(', ')}. Co możesz powiedzieć o tym graczu? Czy ma coś wartościowego? Czy można coś zabrać/dać?`;

    // Przełącz na stronę AI i wstaw prompt
    document.getElementById('player-detail-modal')?.classList.remove('open');
    switchPage('ai');
    loadAiPage?.();
    const input = document.getElementById('ai-input');
    if (input) { input.value = prompt; input.focus(); }
    showToast('info', 'Prompt wstawiony do AI — naciśnij Enter żeby wysłać');
};

/** Auto-odświeżanie ekwipunku gdy szczegóły gracza są otwarte */
window._startInvAutoRefresh = function(uuid, containerId) {
    _invCurrentUuid = uuid;
    if (_invRefreshInterval) clearInterval(_invRefreshInterval);
    _invRefreshInterval = setInterval(async () => {
        // Sprawdź czy modal nadal otwarty
        if (!document.getElementById('player-detail-modal')?.classList.contains('open')) {
            clearInterval(_invRefreshInterval);
            _invRefreshInterval = null;
            return;
        }
        try {
            const snap = await getDoc(doc(db, 'cstats_inventory', uuid));
            if (snap.exists()) {
                const inv = snap.data();
                const statusEl = document.getElementById('player-inv-status');
                if (statusEl) {
                    const upd = inv.updatedAt ? new Date(inv.updatedAt).toLocaleTimeString('pl-PL') : '—';
                    statusEl.textContent = `Aktualizacja: ${upd}`;
                    statusEl.style.color = '#10b981';
                }
                window.renderInventoryDisplay(containerId, inv.inventory||[], inv.armor||[], inv.offhand||[], inv.enderchest||[]);
            }
        } catch(e) { /* cicho — nie przerywaj */ }
    }, 5000); // co 5s
};

window._stopInvAutoRefresh = function() {
    if (_invRefreshInterval) { clearInterval(_invRefreshInterval); _invRefreshInterval = null; }
};

// Zatrzymaj auto-refresh gdy modal zamknięty
document.addEventListener('click', function(e) {
    if (e.target?.classList?.contains('modal-overlay') || e.target?.classList?.contains('modal-close')) {
        _stopInvAutoRefresh();
    }
});

// ─── PLIKI ────────────────────────────────────────────────────────────────────
window.loadFilesPage = async function() {
    if (!requirePermission('evidence_view','podgląd załączników')) return;
    const tb = document.getElementById('files-tbody');
    if (tb) tb.innerHTML = '<tr><td colspan="8" class="table-loading"><i class="fa-solid fa-spinner fa-spin"></i> Ładowanie...</td></tr>';
    try {
        const snap = await getDocs(query(collection(db,'files'),orderBy('uploadedAt','desc')));
        allFiles = snap.docs.map(d=>({id:d.id,...d.data()}));
        renderFiles(allFiles);
    } catch(e) { if(tb) tb.innerHTML='<tr><td colspan="8" class="table-empty" style="color:#ef4444;">Błąd: '+e.message+'</td></tr>'; }
};

function renderFiles(list) {
    const tb = document.getElementById('files-tbody'); if (!tb) return;
    if (!list.length) { tb.innerHTML='<tr><td colspan="8" class="table-empty">Brak plików.</td></tr>'; return; }
    tb.innerHTML = list.map(f => {
        const isDeleted = f.status==='deleted';
        const isImage = /\.(png|jpg|jpeg|gif|webp)/i.test(f.originalName||'');
        const thumb = isImage && f.url ? '<img src="'+escapeHtml(f.url)+'" style="width:36px;height:36px;object-fit:cover;border-radius:4px;" onerror="this.style.display=\'none\'">' : '<i class="fa-solid fa-paperclip" style="color:var(--text-secondary);font-size:1.2rem;"></i>';
        const openBtn = f.url && !isDeleted ? '<button class="tbl-btn" onclick="openAttachmentUrl(\''+encodeURIComponent(f.url)+'\')" title="Otwórz"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>' : '';
        const delBtn = (!isDeleted && hasPermission('evidence_delete')) ? '<button class="tbl-btn tbl-btn-red" onclick="deleteEvidenceFile(\''+f.id+'\')" title="Usuń"><i class="fa-solid fa-trash"></i></button>' : '';
        return '<tr><td>'+thumb+'</td><td><div style="font-weight:700;">'+escapeHtml(f.originalName||'—')+'</div><div style="font-size:.75rem;color:var(--text-secondary);">'+escapeHtml(f.mimeType||'')+'·'+formatBytes(f.size)+'</div></td>'
            +'<td style="font-weight:700;">'+escapeHtml(f.player||'—')+'</td>'
            +'<td>'+(f.action?actionBadge(f.action):'<span style="color:var(--text-secondary);">—</span>')+'</td>'
            +'<td style="font-weight:700;">'+escapeHtml(f.uploadedBy||'—')+'</td>'
            +'<td style="font-size:.82rem;color:var(--text-secondary);">'+formatDate(f.uploadedAt)+'</td>'
            +'<td style="font-size:.82rem;color:var(--text-secondary);">'+escapeHtml(f.status||'—')+'</td>'
            +'<td><div style="display:flex;gap:.4rem;">'+openBtn+delBtn+'</div></td></tr>';
    }).join('');
}

window.filterFiles = function() {
    const s = (document.getElementById('files-search')?.value||'').toLowerCase();
    const st = document.getElementById('files-filter-status')?.value||'';
    renderFiles(allFiles.filter(f => {
        if (s && !String(f.originalName||'').toLowerCase().includes(s) && !String(f.player||'').toLowerCase().includes(s)) return false;
        if (st && String(f.status||'') !== st) return false;
        return true;
    }));
};

window.deleteEvidenceFile = async function(fileId) {
    if (!requirePermission('evidence_delete','usuwanie załączników')) return;
    if (!confirm('Usunąć ten plik?')) return;
    try {
        await updateDoc(doc(db,'files',fileId),{status:'deleted',deletedAt:serverTimestamp(),deletedBy:currentUser?.displayName||'Admin'});
        showToast('success','Plik usunięty.'); await window.loadFilesPage();
    } catch(e) { showToast('error','Błąd: '+e.message); }
};

// ─── ADMINISTRATORZY ──────────────────────────────────────────────────────────
window.loadAdminAccounts = async function() {
    try {
        const snap = await getDocs(collection(db,'admins'));
        allAdmins = snap.docs.map(d=>({id:d.id,...d.data()}));
        renderAdminAccounts(allAdmins);
    } catch(e) { console.error('loadAdminAccounts:',e); }
};

function renderAdminAccounts(list) {
    const tb = document.getElementById('admin-accounts-tbody'); if (!tb) return;
    if (!list.length) { tb.innerHTML='<tr><td colspan="7" class="table-empty">Brak kont.</td></tr>'; return; }
    tb.innerHTML = list.map(a => '<tr>'
        +'<td><div style="font-weight:700;">'+escapeHtml(a.displayName||a.login)+'</div></td>'
        +'<td style="font-size:.82rem;color:var(--text-secondary);max-width:200px;">'+escapeHtml(a.desc||'')+'</td>'
        +'<td style="font-family:monospace;font-size:.82rem;color:var(--text-secondary);">'+escapeHtml(a.login)+'</td>'
        +'<td>'+rankBadge(a.role)+'</td>'
        +'<td><div style="display:flex;flex-wrap:wrap;gap:.3rem;">'+(a.permissions||[]).map(p=>'<span class="badge badge-default" style="font-size:.68rem;" title="'+escapeHtml(PERMISSIONS_PL[p]?.desc||p)+'">'+permissionLabel(p)+'</span>').join('')+'</div></td>'
        +'<td><span class="badge '+(a.disabled?'badge-banned':'badge-online')+'">'+(a.disabled?'Zablokowane':'Aktywne')+'</span></td>'
        +'<td><div style="display:flex;gap:.4rem;">'
        +'<button class="tbl-btn" onclick="editAdminAccount(\''+a.id+'\')"><i class="fa-solid fa-pen"></i></button>'
        +'<button class="tbl-btn tbl-btn-red" onclick="toggleAdminDisable(\''+a.id+'\',\''+(a.disabled?'false':'true')+'\')" title="'+(a.disabled?'Odblokuj':'Zablokuj')+'"><i class="fa-solid fa-'+(a.disabled?'unlock':'lock')+'"></i></button>'
        +'<button class="tbl-btn tbl-btn-red" onclick="deleteAdminAccount(\''+a.id+'\',\''+escapeHtml(a.displayName||a.login)+'\')" title="Usuń"><i class="fa-solid fa-trash"></i></button>'
        +'</div></td></tr>'
    ).join('');
}

window.openAddAdminModal = function() {
    document.getElementById('admin-account-modal-title').textContent = 'Dodaj administratora';
    document.getElementById('aa-id').value = '';
    document.getElementById('aa-displayname').value = '';
    document.getElementById('aa-login').value = '';
    document.getElementById('aa-password').value = '';
    document.getElementById('aa-role').value = 'Pomocnik';
    const d = document.getElementById('aa-desc'); if (d) d.value = '';
    setAdminPermissionsSelection(permissionsForRole('Pomocnik'));
    document.getElementById('aa-msg').style.display = 'none';
    document.getElementById('admin-account-modal').classList.add('open');
};

window.editAdminAccount = function(id) {
    const admin = allAdmins.find(a=>a.id===id); if (!admin) return;
    document.getElementById('admin-account-modal-title').textContent = 'Edytuj administratora';
    document.getElementById('aa-id').value = id;
    document.getElementById('aa-displayname').value = admin.displayName||'';
    document.getElementById('aa-login').value = admin.login||'';
    document.getElementById('aa-password').value = '';
    document.getElementById('aa-role').value = admin.role||'Pomocnik';
    const d = document.getElementById('aa-desc'); if (d) d.value = admin.desc||'';
    setAdminPermissionsSelection(admin.permissions||permissionsForRole(admin.role));
    document.getElementById('aa-msg').style.display = 'none';
    document.getElementById('admin-account-modal').classList.add('open');
};

window.saveAdminAccount = async function() {
    const id = document.getElementById('aa-id').value;
    const displayName = document.getElementById('aa-displayname').value.trim();
    const login = document.getElementById('aa-login').value.trim();
    const password = document.getElementById('aa-password').value;
    const role = document.getElementById('aa-role').value;
    const perms = ensureAdminPermissions([...document.querySelectorAll('.perm-checkbox:checked')].map(cb=>cb.value));
    const desc = document.getElementById('aa-desc')?.value.trim()||'';
    if (!displayName||!login) { showAaMsg('error','Wypełnij nazwę i login!'); return; }
    try {
        const data = { displayName, login, role, permissions: perms, desc };
        if (password) data.password = password;
        if (id) { await updateDoc(doc(db,'admins',id),data); }
        else {
            if (!password) { showAaMsg('error','Podaj hasło dla nowego konta!'); return; }
            const check = await getDocs(query(collection(db,'admins'),where('login','==',login)));
            if (!check.empty) { showAaMsg('error','Ten login jest już zajęty!'); return; }
            data.disabled = false; data.createdAt = serverTimestamp(); data.createdBy = currentUser?.displayName||'Panel';
            await addDoc(collection(db,'admins'),data);
        }
        showAaMsg('success',id?'✓ Zaktualizowano!':'✓ Konto utworzone!');
        await window.loadAdminAccounts();
        setTimeout(()=>document.getElementById('admin-account-modal').classList.remove('open'),1200);
    } catch(e) { showAaMsg('error','Błąd: '+e.message); }
};

window.toggleAdminDisable = async function(id, disable) {
    if (!confirm('Czy na pewno chcesz '+(disable==='true'?'zablokować':'odblokować')+' to konto?')) return;
    try { await updateDoc(doc(db,'admins',id),{disabled:disable==='true'}); showToast('success','Konto '+(disable==='true'?'zablokowane':'odblokowane')); await window.loadAdminAccounts(); }
    catch(e) { showToast('error','Błąd: '+e.message); }
};

window.deleteAdminAccount = async function(id, name) {
    if (!hasPermission('all')&&!hasPermission('admins_manage')) { showToast('error','Brak uprawnień.'); return; }
    if (currentUser && currentUser.id===id) { showToast('error','Nie możesz usunąć własnego konta!'); return; }
    if (!confirm('Usunąć konto "'+name+'"? Tej operacji nie można cofnąć.')) return;
    try { await deleteDoc(doc(db,'admins',id)); showToast('success','Konto "'+name+'" usunięte.'); await window.loadAdminAccounts(); }
    catch(e) { showToast('error','Błąd: '+e.message); }
};

function showAaMsg(type, text) { const el=document.getElementById('aa-msg'); if(!el)return; el.className='modal-msg '+type; el.innerHTML=text; el.style.display='block'; }

const adminRoleSelect = document.getElementById('aa-role');
if (adminRoleSelect) { adminRoleSelect.addEventListener('change',()=>{ if(!document.getElementById('aa-id').value) setAdminPermissionsSelection(permissionsForRole(adminRoleSelect.value)); }); }

// ─── UPRAWNIENIA ──────────────────────────────────────────────────────────────
window.loadPermissionsPage = async function() {
    await loadRolePermissionsFromStore();
    const grid = document.getElementById('permissions-grid'); if (!grid) return;
    const DEFAULT_ROLE_PERMISSIONS = { 'ChatMod':['mute','warn','check'], 'Pomocnik':['mute','warn','check','players'], 'Moderator':['ban','mute','kick','warn','check','players','logs','evidence_view'], 'Admin':['ban','unban','mute','unmute','kick','warn','check','players','logs','notes','site','shop','media_manage','evidence_view','evidence_delete'], 'Zarządzający':['all'] };
    grid.innerHTML = ROLE_ORDER.map(role => {
        const perms = permissionsForRole(role);
        const defaults = DEFAULT_ROLE_PERMISSIONS[role]||[];
        const isEdited = role!=='Zarządzający' && (perms.length!==defaults.length||perms.some(p=>!defaults.includes(p)));
        const options = Object.entries(PERMISSIONS_PL).filter(([key])=>key!=='all');
        return '<div class="table-card" style="padding:1.2rem;">'
            +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">'
            +'<div><div style="font-size:1rem;font-weight:800;">'+role+'</div>'
            +(isEdited?'<span style="background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.35);color:#f59e0b;font-size:.7rem;font-weight:700;padding:.15rem .5rem;border-radius:6px;"><i class="fa-solid fa-pen-to-square"></i> Edytowane</span>':'<span style="background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.25);color:#10b981;font-size:.7rem;font-weight:700;padding:.15rem .5rem;border-radius:6px;">Domyślne</span>')
            +'</div>'
            +'<div style="display:flex;gap:.5rem;">'
            +(isEdited?'<button class="tbl-btn" onclick="resetRolePermissions(\''+role+'\')"><i class="fa-solid fa-rotate-left"></i></button>':'')
            +'<button class="modal-submit-btn" style="width:auto;padding:.45rem 1rem;" onclick="saveRolePermissions(\''+role+'\')"><i class="fa-solid fa-floppy-disk"></i> Zapisz</button>'
            +'</div></div>'
            +'<div style="display:flex;flex-direction:column;gap:.65rem;">'
            +options.map(([key,meta])=>'<label style="display:flex;gap:.75rem;align-items:flex-start;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:.7rem .8rem;cursor:pointer;">'
                +'<input type="checkbox" class="role-permission-checkbox" data-role="'+role+'" value="'+key+'" '+(perms.includes(key)?'checked':'')+'>'
                +'<div><div style="font-size:.88rem;font-weight:700;">'+meta.label+'</div><div style="font-size:.76rem;color:var(--text-secondary);">'+meta.desc+'</div></div></label>').join('')
            +'</div></div>';
    }).join('');
};

window.saveRolePermissions = async function(role) {
    if (!requirePermission('permissions_manage','zarządzanie uprawnieniami')) return;
    const selected = [...document.querySelectorAll('.role-permission-checkbox[data-role="'+role+'"]:checked')].map(cb=>cb.value);
    ROLE_PERMISSIONS[role] = ensureAdminPermissions(selected);
    try {
        await setDoc(doc(db,'panel_settings','role_permissions'),{ roles:ROLE_ORDER.reduce((acc,r)=>{acc[r]=ROLE_PERMISSIONS[r]||[];return acc;},{}), updatedAt:serverTimestamp(), updatedBy:currentUser?.displayName||'Panel' });
        showToast('success','Zapisano uprawnienia dla '+role);
    } catch(e) { showToast('error','Błąd: '+e.message); }
};

window.resetRolePermissions = async function(role) {
    if (!requirePermission('permissions_manage','zarządzanie uprawnieniami')) return;
    if (!confirm('Przywrócić domyślne uprawnienia dla roli '+role+'?')) return;
    const defaults = { 'ChatMod':['mute','warn','check'], 'Pomocnik':['mute','warn','check','players'], 'Moderator':['ban','mute','kick','warn','check','players','logs','evidence_view'], 'Admin':['ban','unban','mute','unmute','kick','warn','check','players','logs','notes','site','shop','media_manage','evidence_view','evidence_delete'], 'Zarządzający':['all'] };
    ROLE_PERMISSIONS[role] = [...(defaults[role]||[])];
    try {
        await setDoc(doc(db,'panel_settings','role_permissions'),{ roles:ROLE_ORDER.reduce((acc,r)=>{acc[r]=ROLE_PERMISSIONS[r]||[];return acc;},{}), updatedAt:serverTimestamp(), updatedBy:currentUser?.displayName||'Panel' });
        showToast('success','Przywrócono domyślne dla '+role);
        window.loadPermissionsPage();
    } catch(e) { showToast('error','Błąd: '+e.message); }
};

// ─── PERSONEL ─────────────────────────────────────────────────────────────────
let allPersonel = [], allCreators = [];

window.loadPersonel = async function() {
    await Promise.all([_loadOwnerData(), _loadPersonelList(), _loadCreatorsList()]);
};

async function _loadOwnerData() {
    try {
        const snap = await getDoc(doc(db,'server_content','owners'));
        if (!snap.exists()) return;
        const d = snap.data();
        const set = (id,v) => { const e=document.getElementById(id); if(e)e.value=v||''; };
        set('owner-nick',d.owner?.nick); set('owner-yt',d.owner?.yt); set('owner-tt',d.owner?.tt); set('owner-desc',d.owner?.desc);
        set('cowowner-nick',d.cowowner?.nick); set('cowowner-yt',d.cowowner?.yt); set('cowowner-dc',d.cowowner?.dc); set('cowowner-desc',d.cowowner?.desc);
    } catch(e) { console.error('loadOwnerData:',e); }
}

window.saveOwner = async function() {
    const nick = document.getElementById('owner-nick').value.trim();
    if (!nick) { showToast('error','Podaj nick właściciela!'); return; }
    try {
        const ref = doc(db,'server_content','owners'); const snap = await getDoc(ref); const ex = snap.exists()?snap.data():{};
        await setDoc(ref,{...ex, owner:{nick, yt:document.getElementById('owner-yt').value.trim(), tt:document.getElementById('owner-tt').value.trim(), desc:document.getElementById('owner-desc').value.trim()}});
        showToast('success','Właściciel zapisany!');
    } catch(e) { showToast('error','Błąd: '+e.message); }
};

window.saveCowowner = async function() {
    try {
        const ref = doc(db,'server_content','owners'); const snap = await getDoc(ref); const ex = snap.exists()?snap.data():{};
        await setDoc(ref,{...ex, cowowner:{nick:document.getElementById('cowowner-nick').value.trim()||'???', yt:document.getElementById('cowowner-yt').value.trim(), dc:document.getElementById('cowowner-dc').value.trim(), desc:document.getElementById('cowowner-desc').value.trim()}});
        showToast('success','Współwłaściciel zapisany!');
    } catch(e) { showToast('error','Błąd: '+e.message); }
};

async function _loadPersonelList() {
    try {
        const snap = await getDocs(query(collection(db,'personel'),orderBy('order','asc')));
        allPersonel = snap.docs.map(d=>({id:d.id,...d.data()}));
        renderPersonelTable(allPersonel);
        const el = document.getElementById('personel-count'); if(el)el.textContent='('+allPersonel.length+')';
    } catch(e) { const tb=document.getElementById('personel-tbody'); if(tb)tb.innerHTML='<tr><td colspan="7" class="table-empty" style="color:#ef4444;">Błąd: '+e.message+'</td></tr>'; }
}

const RANK_COLORS = { 'ChatMod':'#059669','Pomocnik':'#047857','Moderator':'#7c3aed','Admin':'#b91c1c','Technik':'#0284c7','Zarządzający':'#ff1744' };

function renderPersonelTable(list) {
    const tb = document.getElementById('personel-tbody'); if (!tb) return;
    if (!list.length) { tb.innerHTML='<tr><td colspan="7" class="table-empty">Brak personelu.</td></tr>'; return; }
    tb.innerHTML = list.map(p => {
        const color = RANK_COLORS[p.rank]||'#6b7280';
        const socials = [p.dc&&'<a href="'+p.dc+'" target="_blank" style="color:#7289da;text-decoration:none;font-size:.8rem;"><i class="fa-brands fa-discord"></i></a>', p.yt&&'<a href="'+p.yt+'" target="_blank" style="color:#ff0000;text-decoration:none;font-size:.8rem;"><i class="fa-brands fa-youtube"></i></a>', p.tt&&'<a href="'+p.tt+'" target="_blank" style="color:#00f0ff;text-decoration:none;font-size:.8rem;"><i class="fa-brands fa-tiktok"></i></a>'].filter(Boolean).join(' ');
        return '<tr><td><img src="https://mc-heads.net/avatar/'+encodeURIComponent(p.nick||'Steve')+'/36" style="width:36px;height:36px;border-radius:6px;image-rendering:pixelated;" onerror="this.src=\'https://mc-heads.net/avatar/Steve/36\'"></td>'
            +'<td style="font-weight:700;">'+escapeHtml(p.nick||'')+'</td>'
            +'<td><span class="badge" style="background:'+color+'22;border:1px solid '+color+'44;color:'+color+';">'+escapeHtml(p.rank||'')+'</span></td>'
            +'<td style="font-size:.82rem;color:var(--text-secondary);">'+escapeHtml(p.desc||'')+'</td>'
            +'<td>'+socials+'</td>'
            +'<td style="font-size:.82rem;color:var(--text-secondary);">'+(p.order||99)+'</td>'
            +'<td><div style="display:flex;gap:.4rem;"><button class="tbl-btn" onclick="editPersonelMember(\''+p.id+'\')"><i class="fa-solid fa-pen"></i></button><button class="tbl-btn tbl-btn-red" onclick="deletePersonelMember(\''+p.id+'\',\''+escapeHtml(p.nick||'')+'\')"><i class="fa-solid fa-trash"></i></button></div></td></tr>';
    }).join('');
}

window.openPersonelModal = function() {
    document.getElementById('personel-modal-title').textContent='Dodaj członka personelu';
    document.getElementById('pm-id').value='';
    ['pm-nick','pm-desc','pm-dc','pm-yt','pm-tt'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
    document.getElementById('pm-rank').value='Moderator'; document.getElementById('pm-order').value='99';
    const d=new Date(); document.getElementById('pm-since').value=d.toISOString().slice(0,10);
    document.getElementById('pm-msg').style.display='none';
    document.getElementById('personel-modal').classList.add('open');
};

window.editPersonelMember = function(id) {
    const p = allPersonel.find(x=>x.id===id); if(!p)return;
    document.getElementById('personel-modal-title').textContent='Edytuj członka personelu';
    document.getElementById('pm-id').value=id;
    const set=(elId,v)=>{const e=document.getElementById(elId);if(e)e.value=v||'';};
    set('pm-nick',p.nick); set('pm-desc',p.desc); set('pm-dc',p.dc); set('pm-yt',p.yt); set('pm-tt',p.tt); set('pm-since',p.since);
    document.getElementById('pm-rank').value=p.rank||'Moderator'; document.getElementById('pm-order').value=p.order||99;
    document.getElementById('pm-msg').style.display='none'; document.getElementById('personel-modal').classList.add('open');
};

window.savePersonelMember = async function() {
    const id=document.getElementById('pm-id').value; const nick=document.getElementById('pm-nick').value.trim();
    if(!nick){showPmMsg('error','Wpisz nick!');return;}
    const data={nick, rank:document.getElementById('pm-rank').value, desc:document.getElementById('pm-desc').value.trim(), dc:document.getElementById('pm-dc').value.trim(), yt:document.getElementById('pm-yt').value.trim(), tt:document.getElementById('pm-tt').value.trim(), since:document.getElementById('pm-since').value, order:parseInt(document.getElementById('pm-order').value)||99, updatedAt:serverTimestamp()};
    try {
        if(id){await updateDoc(doc(db,'personel',id),data);}else{data.createdAt=serverTimestamp();await addDoc(collection(db,'personel'),data);}
        showPmMsg('success',id?'✓ Zaktualizowano!':'✓ Dodano!'); await _loadPersonelList();
        setTimeout(()=>document.getElementById('personel-modal').classList.remove('open'),1200);
    } catch(e){showPmMsg('error','Błąd: '+e.message);}
};

window.deletePersonelMember = async function(id,nick) {
    if(!confirm('Usunąć '+nick+' z personelu?'))return;
    try{await deleteDoc(doc(db,'personel',id));showToast('success','Usunięto '+nick);await _loadPersonelList();}
    catch(e){showToast('error','Błąd: '+e.message);}
};

function showPmMsg(type,text){const el=document.getElementById('pm-msg');if(!el)return;el.className='modal-msg '+type;el.innerHTML=text;el.style.display='block';}

async function _loadCreatorsList() {
    try {
        const snap=await getDocs(collection(db,'creators'));
        allCreators=snap.docs.map(d=>({id:d.id,...d.data()}));
        renderCreatorsTable(allCreators);
        const el=document.getElementById('creators-count'); if(el)el.textContent='('+allCreators.length+')';
    } catch(e) {const tb=document.getElementById('creators-tbody');if(tb)tb.innerHTML='<tr><td colspan="5" class="table-empty" style="color:#ef4444;">Błąd: '+e.message+'</td></tr>';}
}

function renderCreatorsTable(list) {
    const tb=document.getElementById('creators-tbody');if(!tb)return;
    if(!list.length){tb.innerHTML='<tr><td colspan="5" class="table-empty">Brak twórców.</td></tr>';return;}
    tb.innerHTML=list.map(c=>{
        const socials=[c.yt&&'<a href="'+c.yt+'" target="_blank" style="color:#ff0000;text-decoration:none;font-size:.8rem;"><i class="fa-brands fa-youtube"></i></a>',c.tt&&'<a href="'+c.tt+'" target="_blank" style="color:#00f0ff;text-decoration:none;font-size:.8rem;"><i class="fa-brands fa-tiktok"></i></a>',c.dc&&'<a href="'+c.dc+'" target="_blank" style="color:#7289da;text-decoration:none;font-size:.8rem;"><i class="fa-brands fa-discord"></i></a>'].filter(Boolean).join(' ');
        return '<tr><td><img src="https://mc-heads.net/avatar/'+encodeURIComponent(c.nick||'Steve')+'/36" style="width:36px;height:36px;border-radius:6px;image-rendering:pixelated;" onerror="this.src=\'https://mc-heads.net/avatar/Steve/36\'"></td><td style="font-weight:700;">'+escapeHtml(c.nick||'')+'</td><td style="font-size:.82rem;color:var(--text-secondary);">'+escapeHtml(c.desc||'')+'</td><td>'+socials+'</td><td><div style="display:flex;gap:.4rem;"><button class="tbl-btn" onclick="editCreator(\''+c.id+'\')"><i class="fa-solid fa-pen"></i></button><button class="tbl-btn tbl-btn-red" onclick="deleteCreator(\''+c.id+'\',\''+escapeHtml(c.nick||'')+'\')"><i class="fa-solid fa-trash"></i></button></div></td></tr>';
    }).join('');
}

window.openCreatorModal=function(){
    document.getElementById('creator-modal-title').textContent='Dodaj twórcę';
    document.getElementById('cm-id').value='';
    ['cm-nick','cm-desc','cm-yt','cm-tt','cm-dc'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
    document.getElementById('cm-msg').style.display='none'; document.getElementById('creator-modal').classList.add('open');
};
window.editCreator=function(id){
    const c=allCreators.find(x=>x.id===id);if(!c)return;
    document.getElementById('creator-modal-title').textContent='Edytuj twórcę'; document.getElementById('cm-id').value=id;
    const set=(elId,v)=>{const e=document.getElementById(elId);if(e)e.value=v||'';};
    set('cm-nick',c.nick);set('cm-desc',c.desc);set('cm-yt',c.yt);set('cm-tt',c.tt);set('cm-dc',c.dc);
    document.getElementById('cm-msg').style.display='none'; document.getElementById('creator-modal').classList.add('open');
};
window.saveCreator=async function(){
    const id=document.getElementById('cm-id').value; const nick=document.getElementById('cm-nick').value.trim();
    if(!nick){showCmMsg('error','Wpisz nick!');return;}
    const data={nick,desc:document.getElementById('cm-desc').value.trim(),yt:document.getElementById('cm-yt').value.trim(),tt:document.getElementById('cm-tt').value.trim(),dc:document.getElementById('cm-dc').value.trim(),updatedAt:serverTimestamp()};
    try{if(id){await updateDoc(doc(db,'creators',id),data);}else{data.createdAt=serverTimestamp();await addDoc(collection(db,'creators'),data);}showCmMsg('success',id?'✓ Zaktualizowano!':'✓ Dodano!');await _loadCreatorsList();setTimeout(()=>document.getElementById('creator-modal').classList.remove('open'),1200);}
    catch(e){showCmMsg('error','Błąd: '+e.message);}
};
window.deleteCreator=async function(id,nick){
    if(!confirm('Usunąć '+nick+'?'))return;
    try{await deleteDoc(doc(db,'creators',id));showToast('success','Usunięto '+nick);await _loadCreatorsList();}catch(e){showToast('error','Błąd: '+e.message);}
};
function showCmMsg(type,text){const el=document.getElementById('cm-msg');if(!el)return;el.className='modal-msg '+type;el.innerHTML=text;el.style.display='block';}

// ─── ZARZĄDZANIE STRONĄ ───────────────────────────────────────────────────────
window.switchSiteTab = function(tab) {
    document.querySelectorAll('.site-tab-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-site-tab')===tab));
    document.querySelectorAll('.site-tab-panel').forEach(p => p.classList.toggle('sp-active', p.id==='site-tab-'+tab));
    if (tab==='news' && typeof window.loadNewsTab==='function') window.loadNewsTab();
    if (tab==='poll' && typeof window.loadPollTab==='function') window.loadPollTab();
};

function _currentContestId() { const sel=document.getElementById('site-contest-select'); return(sel&&sel.value)?sel.value:'start'; }

window.loadSitePage = async function() {
    window.switchSiteTab('contest');
    await siteLoadContestList();
    await Promise.all([siteLoadContestInfo(), siteLoadEntries(), siteLoadChanges(), siteLoadMedia(), siteLoadProposals()]);
};

async function siteLoadContestList() {
    const sel=document.getElementById('site-contest-select'); if(!sel)return;
    const prev=sel.value;
    try {
        const snap=await getDocs(collection(db,'contests')); const ids=snap.docs.map(d=>d.id).sort();
        if(!ids.length){sel.innerHTML='<option value="start">start (brak)</option>';sel.value='start';return;}
        sel.innerHTML=ids.map(id=>'<option value="'+id+'">'+id+'</option>').join('');
        sel.value=(prev&&ids.includes(prev))?prev:ids[0];
    } catch(e){sel.innerHTML='<option value="start">start</option>';sel.value='start';}
}

async function siteLoadContestInfo() {
    const contestId=_currentContestId();
    const n=document.getElementById('site-contest-nagroda'), dt=document.getElementById('site-contest-date'), wc=document.getElementById('site-contest-winners-count');
    try {
        const snap=await getDoc(doc(db,'contests',contestId));
        if(snap.exists()){
            const d=snap.data();
            if(n)n.value=d.nagroda||''; if(dt)dt.value=_normContestDate(d.wyniki); if(wc)wc.value=d.winnersCount||2;
            _buildWinnersInputs(d.winnersCount||2); _renderContestStatusBadge(d,contestId);
        } else { if(n)n.value=''; if(dt)dt.value=''; if(wc)wc.value=2; _buildWinnersInputs(2); _renderContestStatusBadge(null,contestId); }
    } catch(e){ if(n)n.value=''; _buildWinnersInputs(2); _renderContestStatusBadge(null,contestId); }
}

function _normContestDate(v){if(!v)return'';const s=String(v);return s.includes('T')?s.slice(0,16):(s+'T20:00');}
function _renderContestStatusBadge(data,contestId){const badge=document.getElementById('site-contest-status-badge');if(!badge)return;if(!data){badge.innerHTML='<span class="badge badge-default">'+(contestId||'Brak')+'</span>';return;}const isActive=data.aktywny!==false;badge.innerHTML='<span class="badge '+(isActive?'badge-online':'badge-banned')+'">'+(isActive?'Aktywny':'Zakończony')+'</span><span class="badge badge-default" style="margin-left:.35rem;">ID: '+contestId+'</span><span class="badge badge-default" style="margin-left:.35rem;">Uczestnicy: '+(data.participants||0)+'</span>';}

function _buildWinnersInputs(n){
    const c=document.getElementById('site-winners-inputs');if(!c)return;c.innerHTML='';
    for(let i=1;i<=n;i++){const inp=document.createElement('input');inp.type='text';inp.placeholder='Nick zwycięzcy #'+i;inp.style.cssText='width:100%;padding:.6rem .9rem;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:.9rem;color:var(--text-primary);background:var(--bg);outline:none;font-family:var(--font);margin-bottom:.3rem;';c.appendChild(inp);}
}
window._buildWinnersInputs = _buildWinnersInputs;

document.addEventListener('change', e => {
    if(e.target?.id==='site-contest-winners-count') _buildWinnersInputs(parseInt(e.target.value)||2);
    if(e.target?.id==='site-contest-select'){siteLoadContestInfo();siteLoadEntries();}
});

window.siteNewContest = async function(){
    if(!requirePermission('site','zarządzanie stroną'))return;
    const id=prompt('Podaj ID nowego konkursu:'); if(!id||!id.trim())return;
    const contestId=id.trim().replace(/[\/\\?#\[\]]+/g,'-').replace(/\s+/g,'-');
    try {
        const ref=doc(db,'contests',contestId); const snap=await getDoc(ref);
        if(snap.exists()){showToast('error','Konkurs "'+contestId+'" już istnieje!');return;}
        const d=new Date(Date.now()+7*24*60*60*1000);d.setHours(20,0,0,0);
        const pad=n=>String(n).padStart(2,'0');
        await setDoc(ref,{participants:0,aktywny:true,nagroda:'',winners:[],winnersCount:2,wyniki:d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T20:00',createdAt:new Date().toISOString()});
        showToast('success','Konkurs "'+contestId+'" utworzony!');
        await siteLoadContestList();
        const sel=document.getElementById('site-contest-select');if(sel)sel.value=contestId;
        await siteLoadContestInfo();await siteLoadEntries();
    } catch(e){showToast('error','Błąd: '+e.message);}
};

window.siteUpdateContest = async function(){
    if(!requirePermission('site','zarządzanie stroną'))return;
    const contestId=_currentContestId();
    const nagroda=document.getElementById('site-contest-nagroda').value.trim();
    const dateVal=document.getElementById('site-contest-date').value;
    const wc=parseInt(document.getElementById('site-contest-winners-count').value)||2;
    try {
        const ref=doc(db,'contests',contestId);const snap=await getDoc(ref);
        const upd={winnersCount:wc};if(nagroda)upd.nagroda=nagroda;if(dateVal)upd.wyniki=dateVal;
        if(snap.exists()){await updateDoc(ref,upd);}else{await setDoc(ref,{participants:0,aktywny:true,...upd});}
        _buildWinnersInputs(wc);await siteLoadContestInfo();
        showSiteContestMsg('✓ Zapisano!','#00e676');
    } catch(e){showSiteContestMsg('Błąd: '+e.message,'#ef4444');}
};

window.siteAnnounceWinners = async function(){
    if(!requirePermission('site','zarządzanie stroną'))return;
    const contestId=_currentContestId();
    const inputs=document.querySelectorAll('#site-winners-inputs input');
    const winners=[...inputs].map(i=>i.value.trim()).filter(Boolean);
    if(!winners.length){showSiteContestMsg('Wpisz nicki zwycięzców!','#ef4444');return;}
    if(!confirm('Ogłosić zwycięzców: '+winners.join(', ')+'?'))return;
    try {
        const ref=doc(db,'contests',contestId);const snap=await getDoc(ref);
        if(snap.exists()){await updateDoc(ref,{aktywny:false,winners,winnersDate:new Date().toISOString()});}
        else{await setDoc(ref,{participants:0,aktywny:false,winners,winnersDate:new Date().toISOString()});}
        await siteLoadContestInfo();showSiteContestMsg('✓ Zwycięzcy ogłoszeni!','#00e676');
    } catch(e){showSiteContestMsg('Błąd: '+e.message,'#ef4444');}
};

window.siteEndContest = async function(){
    if(!requirePermission('site','zarządzanie stroną'))return;
    const contestId=_currentContestId();if(!confirm('Zakończyć konkurs bez wyników?'))return;
    try{await updateDoc(doc(db,'contests',contestId),{aktywny:false});await siteLoadContestInfo();showSiteContestMsg('Konkurs zakończony.','#f59e0b');}
    catch(e){showSiteContestMsg('Błąd: '+e.message,'#ef4444');}
};

window.siteDeleteContest = async function(){
    if(!requirePermission('site','zarządzanie stroną'))return;
    const contestId=_currentContestId();if(!confirm('USUNĄĆ konkurs "'+contestId+'"? Tej operacji nie można cofnąć!'))return;
    try{await deleteDoc(doc(db,'contests',contestId));showToast('success','Konkurs usunięty.');await siteLoadContestList();await siteLoadContestInfo();await siteLoadEntries();}
    catch(e){showToast('error','Błąd: '+e.message);}
};

window.siteRestartContest = async function(){
    if(!requirePermission('site','zarządzanie stroną'))return;
    const contestId=_currentContestId();if(!confirm('Zresetować konkurs (usunąć uczestników i ustawić aktywny)?'))return;
    try {
        const ref=doc(db,'contests',contestId);const coll=collection(db,'contests',contestId,'entries');
        const snap=await getDocs(coll);const batch=[];snap.forEach(d=>batch.push(deleteDoc(d.ref)));
        await Promise.all(batch);
        await updateDoc(ref,{aktywny:true,participants:0,winners:[]});
        await siteLoadContestInfo();await siteLoadEntries();showSiteContestMsg('✓ Konkurs zresetowany!','#00e676');
    } catch(e){showSiteContestMsg('Błąd: '+e.message,'#ef4444');}
};

function showSiteContestMsg(text,color){const el=document.getElementById('site-contest-msg');if(!el)return;el.textContent=text;el.style.color=color||'var(--text-primary)';setTimeout(()=>{el.textContent='';},3000);}

window.siteLoadEntries = async function(){
    const contestId=_currentContestId();const tb=document.getElementById('site-entries-tbody');const cnt=document.getElementById('site-entries-count');
    if(tb)tb.innerHTML='<tr><td colspan="5" class="table-loading"><i class="fa-solid fa-spinner fa-spin"></i> Ładowanie...</td></tr>';
    try {
        const snap=await getDocs(query(collection(db,'contests',contestId,'entries'),orderBy('joinedAt','desc')));
        const entries=snap.docs.map(d=>({id:d.id,...d.data()}));
        if(cnt)cnt.textContent='('+entries.length+')';
        if(!tb)return;
        if(!entries.length){tb.innerHTML='<tr><td colspan="5" class="table-empty">Brak uczestników.</td></tr>';return;}
        tb.innerHTML=entries.map(e=>'<tr><td>'+escapeHtml(e.nickMC||'?')+'</td><td>'+escapeHtml(e.nickDC||'?')+'</td><td>'+escapeHtml(e.secret||'')+'</td><td style="font-size:.82rem;color:var(--text-secondary);">'+formatDate(e.joinedAt)+'</td><td><button class="tbl-btn tbl-btn-red" onclick="siteDeleteEntry(\''+contestId+'\',\''+e.id+'\',\''+escapeHtml(e.nickMC||'')+'\')"><i class="fa-solid fa-trash"></i></button></td></tr>').join('');
    } catch(e){if(tb)tb.innerHTML='<tr><td colspan="5" class="table-empty" style="color:#ef4444;">Błąd: '+e.message+'</td></tr>';}
};

window.siteDeleteEntry = async function(contestId,entryId,nick){
    if(!confirm('Usunąć '+nick+' z konkursu?'))return;
    try{await deleteDoc(doc(db,'contests',contestId,'entries',entryId));showToast('success','Usunięto '+nick);await window.siteLoadEntries();}catch(e){showToast('error','Błąd: '+e.message);}
};

async function siteLoadChanges(){
    try{const snap=await getDoc(doc(db,'server_content','changes'));if(snap.exists()){const d=snap.data();['zwykle','szczegolowe','najmocniejsze'].forEach(m=>{const el=document.getElementById('site-edit-'+m);if(el)el.value=d[m]||'';});}}catch(e){console.error('siteLoadChanges:',e);}
}
window.siteSaveChanges = async function(){
    if(!requirePermission('site','zarządzanie stroną'))return;
    try{
        const data={};['zwykle','szczegolowe','najmocniejsze'].forEach(m=>{const el=document.getElementById('site-edit-'+m);if(el)data[m]=el.value;});
        await setDoc(doc(db,'server_content','changes'),{...data,updatedAt:serverTimestamp()});
        const msg=document.getElementById('site-changes-msg');if(msg){msg.style.color='#10b981';msg.textContent='✓ Zapisano!';setTimeout(()=>msg.textContent='',2000);}
    }catch(e){const msg=document.getElementById('site-changes-msg');if(msg){msg.style.color='#ef4444';msg.textContent='Błąd: '+e.message;}}
};

async function siteLoadMedia(){
    try{const snap=await getDoc(doc(db,'server_content','media'));if(snap.exists()){const d=snap.data();const set=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v||'';};set('site-dc-url',d.dc?.url);set('site-dc-sub',d.dc?.sub);set('site-yt-url',d.yt?.url);set('site-yt-handle',d.yt?.handle);set('site-tt-url',d.tt?.url);set('site-tt-handle',d.tt?.handle);}}catch(e){console.error('siteLoadMedia:',e);}
}
window.siteSaveMedia = async function(){
    if(!requirePermission('site','zarządzanie stroną'))return;
    try{
        await setDoc(doc(db,'server_content','media'),{dc:{url:document.getElementById('site-dc-url').value.trim(),sub:document.getElementById('site-dc-sub').value.trim()},yt:{url:document.getElementById('site-yt-url').value.trim(),handle:document.getElementById('site-yt-handle').value.trim()},tt:{url:document.getElementById('site-tt-url').value.trim(),handle:document.getElementById('site-tt-handle').value.trim()},updatedAt:serverTimestamp()});
        const msg=document.getElementById('site-media-msg');if(msg){msg.style.color='#10b981';msg.textContent='✓ Zapisano!';setTimeout(()=>msg.textContent='',2000);}
    }catch(e){const msg=document.getElementById('site-media-msg');if(msg){msg.style.color='#ef4444';msg.textContent='Błąd: '+e.message;}}
};

window.siteLoadProposals = async function(){
    const tb=document.getElementById('site-proposals-tbody');if(!tb)return;
    tb.innerHTML='<tr><td colspan="5" class="table-loading"><i class="fa-solid fa-spinner fa-spin"></i> Ładowanie...</td></tr>';
    try{
        const snap=await getDocs(query(collection(db,'proposals'),orderBy('createdAt','desc')));
        if(snap.empty){tb.innerHTML='<tr><td colspan="5" class="table-empty">Brak propozycji.</td></tr>';return;}
        tb.innerHTML=snap.docs.map(d=>{const p={id:d.id,...d.data()};const total=(p.yes||0)+(p.no||0);const yesPct=total?Math.round((p.yes||0)/total*100):0;const date=p.createdAt?new Date(p.createdAt).toLocaleDateString('pl-PL'):'—';
            return '<tr><td style="max-width:300px;font-size:.88rem;">'+escapeHtml(p.text||'')+'</td><td><span style="color:#00e676;font-weight:700;">'+(p.yes||0)+'</span></td><td><span style="color:#ef4444;font-weight:700;">'+(p.no||0)+'</span>'+(total>0?'<span style="font-size:.75rem;color:var(--text-secondary);"> ('+yesPct+'% TAK)</span>':'')+'</td><td style="font-size:.8rem;color:var(--text-secondary);">'+date+'</td><td><button class="tbl-btn tbl-btn-red" onclick="siteDeleteProposal(\''+p.id+'\')"><i class="fa-solid fa-trash"></i></button></td></tr>';
        }).join('');
    }catch(e){tb.innerHTML='<tr><td colspan="5" class="table-empty" style="color:#ef4444;">Błąd: '+e.message+'</td></tr>';}
};

window.siteDeleteProposal = async function(id){
    if(!confirm('Usunąć tę propozycję?'))return;
    try{await deleteDoc(doc(db,'proposals',id));showToast('success','Propozycja usunięta.');await window.siteLoadProposals();}catch(e){showToast('error','Błąd: '+e.message);}
};

// ─── AKTUALNOŚCI ──────────────────────────────────────────────────────────────
window.loadNewsTab = async function() {
    const container = document.getElementById('news-list'); if (!container) return;
    container.innerHTML = '<div class="table-loading"><i class="fa-solid fa-spinner fa-spin"></i> Ładowanie...</div>';
    try {
        const snap = await getDocs(query(collection(db,'news'), orderBy('createdAt','desc')));
        const items = snap.docs.map(d=>({id:d.id,...d.data()}));
        if (!items.length) { container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-secondary);"><i class="fa-solid fa-newspaper" style="font-size:2rem;opacity:.3;display:block;margin-bottom:.5rem;"></i>Brak aktualności.</div>'; return; }
        container.innerHTML = items.map(n =>
            '<div class="table-card" style="padding:1.2rem;'+(n.pinned?'border-left:3px solid var(--accent);':'')+'">'
            +'<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.75rem;flex-wrap:wrap;">'
            +'<div style="flex:1;min-width:0;"><div style="font-weight:800;font-size:.95rem;">'+(n.pinned?'<i class="fa-solid fa-thumbtack" style="color:var(--accent);margin-right:.4rem;font-size:.72rem;"></i>':'')+escapeHtml(n.title||'Bez tytułu')+'</div>'
            +'<div style="font-size:.74rem;color:var(--text-secondary);margin-top:.15rem;">'+formatDate(n.createdAt)+' · '+escapeHtml(n.author||'—')+'</div></div>'
            +'<div style="display:flex;gap:.4rem;flex-shrink:0;">'
            +'<button class="tbl-btn" onclick="editNews(\''+n.id+'\')"><i class="fa-solid fa-pen"></i></button>'
            +'<button class="tbl-btn tbl-btn-red" onclick="deleteNews(\''+n.id+'\')"><i class="fa-solid fa-trash"></i></button>'
            +'</div></div>'
            +(n.content?'<div style="margin-top:.7rem;font-size:.88rem;line-height:1.5;">'+n.content+'</div>':'')
            +_buildVideoEmbed(n.video)
            +'</div>'
        ).join('');
    } catch(e) { container.innerHTML = '<div style="color:#ef4444;padding:1rem;">Błąd: '+e.message+'</div>'; }
};

function _buildVideoEmbed(url) {
    if (!url) return '';
    const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (yt) return '<div style="margin-top:.75rem;border-radius:10px;overflow:hidden;position:relative;padding-bottom:56.25%;height:0;"><iframe src="https://www.youtube.com/embed/'+yt[1]+'" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;" allowfullscreen loading="lazy"></iframe></div>';
    if (/\.(mp4|webm|mov)/i.test(url)) return '<video src="'+escapeHtml(url)+'" controls style="width:100%;border-radius:10px;margin-top:.75rem;max-height:360px;"></video>';
    return '<a href="'+escapeHtml(url)+'" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:.4rem;margin-top:.5rem;font-size:.82rem;color:var(--accent-blue);"><i class="fa-solid fa-play-circle"></i> Obejrzyj wideo</a>';
}

window.openNewsModal = function() {
    document.getElementById('news-modal-title').textContent = 'Dodaj aktualność';
    document.getElementById('news-id').value = '';
    document.getElementById('news-title').value = '';
    document.getElementById('news-content').value = '';
    document.getElementById('news-video').value = '';
    document.getElementById('news-pinned').checked = false;
    document.getElementById('news-msg').style.display = 'none';
    const previews = document.getElementById('news-file-previews');
    if (previews) previews.innerHTML = '';
    const status = document.getElementById('news-upload-status');
    if (status) status.textContent = '';
    const fileInput = document.getElementById('news-file-upload');
    if (fileInput) fileInput.value = '';
    document.getElementById('news-modal').classList.add('open');
    setTimeout(() => document.getElementById('news-content')?.focus(), 100);
};

window.editNews = async function(id) {
    try {
        const snap = await getDoc(doc(db,'news',id)); if (!snap.exists()) return;
        const n = snap.data();
        document.getElementById('news-modal-title').textContent = 'Edytuj aktualność';
        document.getElementById('news-id').value    = id;
        document.getElementById('news-title').value = n.title||'';
        document.getElementById('news-content').value = n.content||'';
        document.getElementById('news-video').value = n.video||'';
        document.getElementById('news-pinned').checked = !!n.pinned;
        document.getElementById('news-msg').style.display = 'none';

        // Przywróć istniejące pliki do podglądu (z data-url żeby saveNews je zebrał)
        const previews = document.getElementById('news-file-previews');
        if (previews) {
            previews.innerHTML = '';
            (n.files || []).forEach(url => {
                const thumb = document.createElement('div');
                thumb.style.cssText = 'position:relative;border-radius:8px;overflow:hidden;border:1.5px solid var(--border);';
                thumb.setAttribute('data-url', url);
                const isImage = /\.(png|jpg|jpeg|gif|webp)/i.test(url);
                if (isImage) {
                    thumb.innerHTML = '<img src="'+url+'" style="width:80px;height:80px;object-fit:cover;display:block;">'
                        + '<button onclick="this.parentElement.remove()" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,.7);border:none;color:#fff;border-radius:4px;cursor:pointer;font-size:.7rem;padding:.1rem .3rem;">×</button>';
                } else {
                    const name = url.split('/').pop().split('?')[0];
                    thumb.innerHTML = '<div style="width:80px;height:80px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg);gap:.2rem;">'
                        + '<i class="fa-solid fa-file" style="font-size:1.6rem;color:var(--accent-blue);"></i>'
                        + '<div style="font-size:.55rem;color:var(--text-secondary);text-align:center;padding:0 .3rem;word-break:break-all;">'+escapeHtml(name.substring(0,15))+'</div></div>'
                        + '<button onclick="this.parentElement.remove()" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,.7);border:none;color:#fff;border-radius:4px;cursor:pointer;font-size:.7rem;padding:.1rem .3rem;">×</button>';
                }
                previews.appendChild(thumb);
            });
        }
        const status = document.getElementById('news-upload-status');
        if (status) status.textContent = (n.files||[]).length ? (n.files.length + ' istn. plik(ów)') : '';
        document.getElementById('news-modal').classList.add('open');
    } catch(e) { showToast('error',e.message); }
};

window.saveNews = async function() {
    if (!requirePermission('site','zarządzanie stroną')) return;
    const id      = document.getElementById('news-id').value;
    const title   = document.getElementById('news-title').value.trim();
    const content = document.getElementById('news-content').value.trim();
    const video   = document.getElementById('news-video').value.trim();
    const pinned  = document.getElementById('news-pinned').checked;
    if (!title) { _showNewsMsg('error','Podaj tytuł!'); return; }

    // Zbierz URL-e wgranych plików z podglądu (data-url na elementach)
    const files = [];
    const previewEl = document.getElementById('news-file-previews');
    if (previewEl) {
        previewEl.querySelectorAll('[data-url]').forEach(el => {
            const u = el.getAttribute('data-url');
            if (u) files.push(u);
        });
    }
    // Też wyciągnij URL-e img/video z content (zabezpieczenie)
    const srcMatches = [...content.matchAll(/src="(https?:\/\/[^"]+)"/g)];
    srcMatches.forEach(m => { if (!files.includes(m[1])) files.push(m[1]); });

    try {
        const data = { title, content, video, pinned, files, author: currentUser?.displayName||'Admin', updatedAt: serverTimestamp() };
        if (id) { await updateDoc(doc(db,'news',id), data); }
        else { data.createdAt = serverTimestamp(); await addDoc(collection(db,'news'), data); }
        showToast('success', id ? 'Aktualność zaktualizowana!' : 'Aktualność dodana!');
        document.getElementById('news-modal').classList.remove('open');
        window.loadNewsTab();
    } catch(e) { _showNewsMsg('error','Błąd: '+e.message); }
};

window.deleteNews = async function(id) {
    if (!confirm('Usunąć tę aktualność?')) return;
    try { await deleteDoc(doc(db,'news',id)); showToast('success','Aktualność usunięta.'); window.loadNewsTab(); }
    catch(e) { showToast('error',e.message); }
};

function _showNewsMsg(type,text) { const el=document.getElementById('news-msg'); if(!el)return; el.className='modal-msg '+type; el.textContent=text; el.style.display='block'; }

// ─── ANKIETA ──────────────────────────────────────────────────────────────────
window.loadPollTab = async function() {
    try {
        const snap = await getDoc(doc(db,'site_poll','current'));
        if (!snap.exists()) return;
        const p = snap.data();
        const q = document.getElementById('poll-question'); if (q) q.value = p.question||'';
        const o = document.getElementById('poll-options'); if (o) o.value = (p.options||[]).map(x=>x.label||x).join('\n');
        const a = document.getElementById('poll-active'); if (a) a.checked = p.active!==false;
        _renderPollResults(p);
    } catch(e) { console.error('loadPollTab:',e); }
};

function _renderPollResults(p) {
    const container = document.getElementById('poll-results'); if (!container) return;
    const options = p.options||[], total = options.reduce((s,o)=>s+(o.votes||0),0);
    if (!options.length) { container.innerHTML='<div style="color:var(--text-secondary);">Brak opcji.</div>'; return; }
    const colors = ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#ef4444','#f97316'];
    container.innerHTML = options.map((o,i) => {
        const label=o.label||o, votes=o.votes||0, pct=total>0?Math.round(votes/total*100):0, col=colors[i%colors.length];
        return '<div style="margin-bottom:.85rem;"><div style="display:flex;justify-content:space-between;margin-bottom:.3rem;"><span style="font-size:.88rem;font-weight:700;">'+escapeHtml(label)+'</span><span style="font-size:.82rem;color:var(--text-secondary);">'+votes+' głosów ('+pct+'%)</span></div><div style="height:10px;background:var(--border);border-radius:999px;overflow:hidden;"><div style="height:100%;width:'+pct+'%;background:'+col+';border-radius:999px;transition:width .5s ease;"></div></div></div>';
    }).join('') + '<div style="margin-top:.75rem;font-size:.78rem;color:var(--text-secondary);">Łącznie głosów: '+total+'</div>';
}

window.savePoll = async function() {
    if (!requirePermission('site','zarządzanie stroną')) return;
    const question = (document.getElementById('poll-question')?.value||'').trim();
    const optLines = (document.getElementById('poll-options')?.value||'').split('\n').map(l=>l.trim()).filter(Boolean);
    const active   = document.getElementById('poll-active')?.checked ?? true;
    const pollMsg  = document.getElementById('poll-msg');
    if (!question) { if(pollMsg){pollMsg.style.color='#ef4444';pollMsg.textContent='Podaj pytanie!';} return; }
    if (optLines.length < 2) { if(pollMsg){pollMsg.style.color='#ef4444';pollMsg.textContent='Dodaj min. 2 opcje!';} return; }
    try {
        const existing = await getDoc(doc(db,'site_poll','current'));
        const exOpts = existing.exists()?(existing.data().options||[]):[];
        const options = optLines.map(label => {
            const ex = exOpts.find(o=>(o.label||o)===label);
            return { label, votes: ex?(ex.votes||0):0 };
        });
        await setDoc(doc(db,'site_poll','current'),{ question, options, active, updatedAt:serverTimestamp(), updatedBy:currentUser?.displayName||'Panel' });
        if(pollMsg){pollMsg.style.color='#10b981';pollMsg.textContent='✓ Zapisano!';setTimeout(()=>{pollMsg.textContent='';},2000);}
        window.loadPollTab();
    } catch(e) { if(pollMsg){pollMsg.style.color='#ef4444';pollMsg.textContent='Błąd: '+e.message;} }
};

window.resetPollVotes = async function() {
    if (!confirm('Zresetować wszystkie głosy?')) return;
    try {
        const snap = await getDoc(doc(db,'site_poll','current')); if(!snap.exists())return;
        const options = (snap.data().options||[]).map(o=>({label:o.label||o,votes:0}));
        await updateDoc(doc(db,'site_poll','current'),{options,votedIPs:[],updatedAt:serverTimestamp()});
        showToast('success','Głosy zresetowane.'); window.loadPollTab();
    } catch(e) { showToast('error',e.message); }
};

// ─── RICH TEXT EDITOR (textarea-based) ───────────────────────────────────────
function _rteGetEditor() { return document.getElementById('news-content'); }

function _rteGetPos() {
    const ta = _rteGetEditor();
    if (!ta) return { start: 0, end: 0, value: '' };
    return { start: ta.selectionStart, end: ta.selectionEnd, value: ta.value };
}

window.rteWrap = function(before, after) {
    const ta = _rteGetEditor(); if (!ta) return;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const selected = ta.value.substring(start, end) || 'tekst';
    const newText = before + selected + after;
    ta.setRangeText(newText, start, end, 'end');
    ta.focus();
    // Ustaw kursor w środku jeśli nie było zaznaczenia
    if (start === end) {
        const pos = start + before.length;
        ta.setSelectionRange(pos, pos + 5);
    }
}

window.rteInsertText = function(text) {
    const ta = _rteGetEditor(); if (!ta) return;
    const pos = ta.selectionStart;
    // Jeśli jesteśmy w środku linii, dodaj nową linię przed
    const before = ta.value.substring(0, pos);
    const after  = ta.value.substring(pos);
    const prefix = (before.length > 0 && !before.endsWith('\n')) ? '\n' : '';
    ta.setRangeText(prefix + text, pos, pos, 'end');
    ta.focus();
}

window.rteInsertLink = function() {
    const url  = prompt('Adres URL linku:'); if (!url) return;
    const text = prompt('Tekst linku:') || url;
    const ta   = _rteGetEditor(); if (!ta) return;
    const pos  = ta.selectionStart;
    const html = '<a href="' + url + '" target="_blank">' + text + '</a>';
    ta.setRangeText(html, pos, ta.selectionEnd, 'end');
    ta.focus();
}

window.rteInsertImageUrl = function() {
    const url = prompt('URL zdjęcia:'); if (!url) return;
    const ta  = _rteGetEditor(); if (!ta) return;
    const pos = ta.selectionStart;
    const html = '\n<img src="' + url + '" alt="zdjęcie" style="max-width:100%;border-radius:8px;">\n';
    ta.setRangeText(html, pos, ta.selectionEnd, 'end');
    ta.focus();
}

window.rteUploadFile = async function() {
    if (!requirePermission('site','zarządzanie stroną')) return;
    const input = document.createElement('input');
    input.type  = 'file';
    input.accept = 'image/*,video/*,.gif,.png,.jpg,.jpeg,.mp4,.webm';
    input.onchange = async(e) => {
        const file = e.target.files?.[0]; if (!file) return;
        await _uploadAndInsertFile(file);
    };
    input.click();
};

window.newsHandleFiles = async function(input) {
    const files = Array.from(input.files || []);
    if (!files.length) return;
    const statusEl   = document.getElementById('news-upload-status');
    const previewEl  = document.getElementById('news-file-previews');
    if (statusEl) statusEl.textContent = 'Wysyłam ' + files.length + ' plik(ów)...';
    let ok = 0, fail = 0;
    for (const file of files) {
        const url = await _uploadAndInsertFile(file);
        if (url && previewEl) {
            // Dodaj podgląd
            const isImage = /\.(png|jpg|jpeg|gif|webp)/i.test(file.name);
            const isVideo = /\.(mp4|webm|mov)/i.test(file.name);
            const thumb = document.createElement('div');
            thumb.style.cssText = 'position:relative;border-radius:8px;overflow:hidden;border:1.5px solid var(--border);';
            thumb.setAttribute('data-url', url); // dla saveNews
            if (isImage) {
                thumb.innerHTML = '<img src="'+url+'" style="width:80px;height:80px;object-fit:cover;display:block;">'
                    + '<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.6);color:#fff;font-size:.6rem;padding:.15rem .3rem;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;">'+escapeHtml(file.name)+'</div>';
            } else if (isVideo) {
                thumb.innerHTML = '<video src="'+url+'" style="width:80px;height:80px;object-fit:cover;display:block;"></video>'
                    + '<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.6);color:#fff;font-size:.6rem;padding:.15rem .3rem;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;">'+escapeHtml(file.name)+'</div>';
            } else {
                thumb.innerHTML = '<div style="width:80px;height:80px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg);gap:.3rem;">'
                    + '<i class="fa-solid fa-file" style="font-size:1.8rem;color:var(--accent-blue);"></i>'
                    + '<div style="font-size:.6rem;color:var(--text-secondary);text-align:center;padding:0 .3rem;word-break:break-all;">'+escapeHtml(file.name.substring(0,15))+'</div></div>';
            }
            previewEl.appendChild(thumb);
            ok++;
        } else { fail++; }
    }
    if (statusEl) statusEl.textContent = ok + ' plik(ów) wgrano' + (fail ? ', błędy: ' + fail : '') + '. Linki wstawione do treści.';
    input.value = '';
};

async function _uploadAndInsertFile(file) {
    try {
        showToast('info', 'Wysyłam: ' + file.name);
        const form = new FormData();
        form.append('file', file); form.append('folder', 'news'); form.append('admin', currentUser?.displayName||'Panel');
        const res  = await fetch(FILE_WORKER_URL + '/upload/news', { method: 'POST', body: form });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok || !data?.file) throw new Error(data?.error || 'Błąd uploadu');
        const url = data.file.publicUrl || data.file.url || (FILE_WORKER_URL + '/file/' + encodeURIComponent(data.file.fileKey));
        const ta  = document.getElementById('news-content'); if (!ta) return url;
        const pos = ta.selectionStart || ta.value.length;
        const isVideo = /\.(mp4|webm|mov)/i.test(url);
        const isImage = /\.(png|jpg|jpeg|gif|webp)/i.test(url);
        let html;
        if (isVideo) html = '\n<video src="' + url + '" controls style="max-width:100%;border-radius:8px;"></video>\n';
        else if (isImage) html = '\n<img src="' + url + '" alt="' + escapeHtml(file.name) + '" style="max-width:100%;border-radius:8px;">\n';
        else html = ' <a href="' + url + '" target="_blank">' + escapeHtml(file.name) + '</a> ';
        ta.setRangeText(html, pos, pos, 'end');
        showToast('success', 'Wgrano: ' + file.name);
        return url;
    } catch(ex) {
        showToast('error', 'Błąd: ' + ex.message);
        return null;
    }
}

window.toggleNewsPreview = function() {
    const ta      = document.getElementById('news-content');
    const preview = document.getElementById('news-preview');
    const btn     = document.getElementById('news-preview-btn');
    if (!preview || !ta) return;
    const showing = preview.style.display !== 'none';
    if (showing) {
        preview.style.display = 'none';
        if (btn) btn.innerHTML = '<i class="fa-solid fa-eye"></i> Podgląd';
    } else {
        preview.style.display = 'block';
        preview.innerHTML = ta.value || '<em style="color:var(--text-secondary);">Brak treści</em>';
        if (btn) btn.innerHTML = '<i class="fa-solid fa-eye-slash"></i> Ukryj';
    }
};

// Stare funkcje execCommand — zachowane dla kompatybilności wstecznej
function rteCmd(cmd) {}
function rteSize(size) {}
function rteFontFamily(font) {}
function rteColor(color) {}
function rteInsertImage() { rteInsertImageUrl(); }
window.syncNewsContent = function() {};

// ─── INFORMACJE SYSTEMOWE ─────────────────────────────────────────────────────
const _panelStartTime = Date.now();
let _uptimeInterval = null;

function _setInfoStatus(elId, ok, label, detail) {
    const el=document.getElementById(elId); if(!el)return;
    const color=ok?'#10b981':'#ef4444', icon=ok?'fa-circle-check':'fa-circle-xmark';
    el.innerHTML='<span style="width:10px;height:10px;border-radius:50%;background:'+color+';flex-shrink:0;box-shadow:0 0 6px '+color+'88;"></span><span style="font-size:.88rem;font-weight:700;color:'+color+';"><i class="fa-solid '+icon+'" style="margin-right:.3rem;"></i>'+label+'</span>';
    const det=document.getElementById(elId.replace('-status','-detail')); if(det)det.textContent=detail||'';
}

function _setEl(id,val) { const el=document.getElementById(id); if(el)el.textContent=val??'—'; }
function _formatUptime(ms) { const s=Math.floor(ms/1000),m=Math.floor(s/60),h=Math.floor(m/60); if(h>0)return h+'h '+(m%60)+'m'; if(m>0)return m+'m '+(s%60)+'s'; return s+'s'; }

window.loadInfoPage = async function() {
    const refreshedEl=document.getElementById('info-refreshed-at');
    if(refreshedEl)refreshedEl.textContent='Odświeżanie...';
    // Uptime
    const uptimeEl=document.getElementById('info-uptime');
    if(uptimeEl)uptimeEl.textContent=_formatUptime(Date.now()-_panelStartTime);
    if(!_uptimeInterval){_uptimeInterval=setInterval(()=>{const el=document.getElementById('info-uptime');if(el)el.textContent=_formatUptime(Date.now()-_panelStartTime);},1000);}
    // Statystyki
    _setEl('info-stat-players',allPlayers.length);
    _setEl('info-stat-online',allPlayers.filter(p=>p.online).length);
    _setEl('info-stat-bans',allBans.length);
    _setEl('info-stat-mutes',allMutes.length);
    _setEl('info-stat-logs',allLogs.length);
    _setEl('info-stat-files',allFiles.length);
    _setEl('info-stat-admins',allAdmins.length||'—');
    _setEl('info-stat-shop',allShopItems.length||'—');
    // Sesja
    _setEl('info-s-user',currentUser?.displayName||'—');
    _setEl('info-s-role',currentUser?.role||'—');
    _setEl('info-s-login-time',new Date(_panelStartTime).toLocaleTimeString('pl-PL'));
    _setEl('info-s-browser',navigator.userAgent.split(') ').pop().split(' ')[0]||navigator.userAgent.substring(0,60));
    _setEl('info-s-res',window.screen.width+'×'+window.screen.height+' (viewport: '+window.innerWidth+'×'+window.innerHeight+')');
    _setEl('info-s-tz',Intl.DateTimeFormat().resolvedOptions().timeZone);
    // Zasoby
    _setEl('info-worker-url',FILE_WORKER_URL);
    _setEl('info-scripts',document.scripts.length);
    const mem=performance?.memory;
    _setEl('info-memory',mem?Math.round(mem.usedJSHeapSize/1048576)+' MB / '+Math.round(mem.jsHeapSizeLimit/1048576)+' MB':'N/A');
    _setEl('info-last-refresh',new Date().toLocaleTimeString('pl-PL'));
    // Test Firebase
    const t0=performance.now();
    try {
        await getDoc(doc(db,'panel_settings','health_check'));
        _setInfoStatus('info-db-status',true,'Połączono ('+(Math.round(performance.now()-t0))+'ms)','Projekt: stronacritmcpl · Firebase 12.14.0');
    } catch(e) { _setInfoStatus('info-db-status',false,'Błąd połączenia',e.message); }
    // Test Worker
    const t1=performance.now();
    try {
        const res=await fetch(FILE_WORKER_URL+'/health',{method:'GET',signal:AbortSignal.timeout(5000)});
        const ping=Math.round(performance.now()-t1);
        _setInfoStatus('info-b2-status',(res.ok||res.status===404),'Dostępny ('+ping+'ms)',FILE_WORKER_URL);
    } catch(e) {
        const ping=Math.round(performance.now()-t1);
        _setInfoStatus('info-b2-status',ping<5000,'Dostępny (CORS: '+ping+'ms)',FILE_WORKER_URL);
    }
    // Status MC
    const online=allPlayers.filter(p=>p.online).length;
    if(allPlayers.length>0||allLogs.length>0){_setInfoStatus('info-mc-status',true,'Online: '+online+' graczy',allPlayers.length+' graczy w bazie · '+allLogs.length+' wpisów w logach');}
    else{_setInfoStatus('info-mc-status',false,'Brak danych','Nie odebrano jeszcze danych z pluginu');}
    if(refreshedEl)refreshedEl.textContent='Odświeżono: '+new Date().toLocaleTimeString('pl-PL');
};

// ─── PORADNIK KAR ─────────────────────────────────────────────────────────────
let _guideVisible = false;

window.togglePunishmentGuide = function() {
    _guideVisible = !_guideVisible;
    const content = document.getElementById('punishment-guide-content');
    const btn     = document.getElementById('guide-toggle-btn');
    if (content) content.style.display = _guideVisible ? 'block' : 'none';
    if (btn) btn.innerHTML = _guideVisible ? '<i class="fa-solid fa-chevron-up"></i>' : '<i class="fa-solid fa-chevron-down"></i>';
    if (_guideVisible) {
        // Zawsze pokaż domyślne reguły od razu, potem próbuj Firestore
        _renderPunishmentGuide(_defaultGuideRules());
        loadPunishmentGuide().catch(() => {});
    }
};
window.openPunishmentGuideModal = function() {
    // Załaduj tabele i otwórz modal
    _renderPunishmentGuide(_defaultGuideRules());
    document.getElementById('punishment-guide-modal').classList.add('open');
    // Spróbuj pobrać z Firestore w tle
    window.loadPunishmentGuide().then(() => {}).catch(() => {});
};

window.loadPunishmentGuide = async function() {
    const container=document.getElementById('punishment-guide-table'); if(!container)return;
    try {
        const snap=await getDoc(doc(db,'panel_settings','punishment_guide'));
        _renderPunishmentGuide(snap.exists()?(snap.data().rules||[]):_defaultGuideRules());
    } catch(e) { _renderPunishmentGuide(_defaultGuideRules()); }
}

function _defaultGuideRules() {
    return [
        {category:'Chat',offense:'Spam / flood',punishment:'warn',duration:'—',notes:'1x warn, przy powtórzeniu mute 1h'},
        {category:'Chat',offense:'Wulgaryzmy',punishment:'mute',duration:'1h – 1d',notes:'Zależy od nasilenia'},
        {category:'Chat',offense:'Reklama innych serwerów',punishment:'ban',duration:'7d – permanent',notes:'Permanent przy nagminnym'},
        {category:'Zachowanie',offense:'Obrażanie graczy',punishment:'warn + mute',duration:'1h',notes:''},
        {category:'Zachowanie',offense:'Obrażanie administracji',punishment:'mute',duration:'1d – 7d',notes:''},
        {category:'Cheaty',offense:'Killaura / fly / bhop',punishment:'ban',duration:'7d – permanent',notes:'Wymaga screenshara'},
        {category:'Cheaty',offense:'Xray / ESP',punishment:'ban',duration:'3d – 14d',notes:''},
        {category:'Cheaty',offense:'Bugusing',punishment:'ban',duration:'1d – 7d',notes:'Zależy od skali'},
        {category:'Konto',offense:'Alt konto / omijanie bana',punishment:'ban',duration:'permanent',notes:'Ban głównego konta'},
    ];
}

function _renderPunishmentGuide(rules) {
    const container=document.getElementById('punishment-guide-table'); if(!container)return;
    const ac={ban:'#ef4444',mute:'#f59e0b',warn:'#f97316',kick:'#6366f1'};
    container.innerHTML='<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:.83rem;"><thead><tr style="border-bottom:2px solid var(--border);background:var(--bg);"><th style="text-align:left;padding:.55rem .8rem;font-size:.7rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;">Kategoria</th><th style="text-align:left;padding:.55rem .8rem;font-size:.7rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;">Przewinienie</th><th style="text-align:left;padding:.55rem .8rem;font-size:.7rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;">Kara</th><th style="text-align:left;padding:.55rem .8rem;font-size:.7rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;">Czas</th><th style="text-align:left;padding:.55rem .8rem;font-size:.7rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;">Uwagi</th></tr></thead><tbody>'
        +rules.map((r,i)=>{
            const pt=(r.punishment||'').toLowerCase().includes('ban')?'ban':(r.punishment||'').toLowerCase().includes('mute')?'mute':(r.punishment||'').toLowerCase().includes('kick')?'kick':'warn';
            const col=ac[pt]||'#6b7280';
            return '<tr style="border-bottom:1px solid var(--border);'+(i%2===0?'':'background:var(--bg)')+'"><td style="padding:.5rem .8rem;font-weight:600;color:var(--text-secondary);">'+escapeHtml(r.category||'')+'</td><td style="padding:.5rem .8rem;font-weight:700;">'+escapeHtml(r.offense||'')+'</td><td style="padding:.5rem .8rem;"><span style="background:'+col+'18;color:'+col+';border:1px solid '+col+'33;padding:.15rem .5rem;border-radius:999px;font-size:.72rem;font-weight:700;">'+escapeHtml(r.punishment||'')+'</span></td><td style="padding:.5rem .8rem;font-family:monospace;font-size:.8rem;">'+escapeHtml(r.duration||'—')+'</td><td style="padding:.5rem .8rem;color:var(--text-secondary);font-size:.78rem;">'+escapeHtml(r.notes||'')+'</td></tr>';
        }).join('')+'</tbody></table></div>';
}

window.openGuideEditModal = async function() {
    if (!hasPermission('all')) { showToast('error','Tylko Zarządzający może edytować poradnik.'); return; }
    try {
        const snap=await getDoc(doc(db,'panel_settings','punishment_guide'));
        const rules=snap.exists()?(snap.data().rules||[]):_defaultGuideRules();
        const json=prompt('Edytuj zasady kar (JSON array):',JSON.stringify(rules,null,2));
        if(json===null)return;
        const parsed=JSON.parse(json);
        await setDoc(doc(db,'panel_settings','punishment_guide'),{rules:parsed,updatedAt:serverTimestamp(),updatedBy:currentUser?.displayName||'Panel'});
        showToast('success','Poradnik zaktualizowany.'); loadPunishmentGuide();
    } catch(ex) { showToast('error','Błąd: '+ex.message); }
};

// ─── MULTIKONTA ───────────────────────────────────────────────────────────────
window.checkAlts = function(isApPage=false) {
    const nick=isApPage?document.getElementById('ap-nick')?.value.trim():(window._actionModalPlayer?.nick||window._actionModalPlayer?.id);
    if(!nick){showToast('error','Podaj nick gracza!');return;}
    const p=allPlayers.find(pl=>(pl.nick||pl.id||'').toLowerCase()===nick.toLowerCase());
    document.getElementById('alts-popup-overlay')?.remove();
    const overlay=document.createElement('div');
    overlay.id='alts-popup-overlay';
    overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(4px);z-index:1500;display:flex;align-items:center;justify-content:center;padding:1rem;';
    overlay.onclick=(e)=>{if(e.target===overlay)overlay.remove();};
    const ip=p?.ip; let alts=[];
    if(ip&&ip!=='unknown') alts=allPlayers.filter(pl=>pl.ip===ip&&(pl.nick||pl.id||'').toLowerCase()!==nick.toLowerCase());
    const ipBadge=ip?'<span style="font-size:.75rem;background:rgba(59,130,246,.1);color:#3b82f6;border:1px solid rgba(59,130,246,.25);padding:.2rem .55rem;border-radius:999px;font-weight:700;font-family:monospace;"><i class="fa-solid fa-network-wired"></i> '+ip+'</span>':'<span style="font-size:.75rem;color:#9ca3af;">brak IP</span>';
    const altsHtml=alts.length===0?'<div style="text-align:center;padding:1.5rem;color:var(--text-secondary);font-size:.9rem;"><i class="fa-solid fa-circle-check" style="color:#10b981;font-size:1.4rem;display:block;margin-bottom:.5rem;"></i>Brak powiązanych kont</div>':alts.map(pl=>'<div style="display:flex;align-items:center;gap:.75rem;padding:.6rem .75rem;border-radius:var(--radius-sm);background:var(--bg);margin-bottom:.5rem;font-weight:700;"><img class="player-head" src="https://mc-heads.net/avatar/'+encodeURIComponent(pl.nick||pl.id)+'/32" alt="'+escapeHtml(pl.nick||pl.id)+'" onerror="this.src=\'https://mc-heads.net/avatar/Steve/32\'"><span>'+escapeHtml(pl.nick||pl.id)+'</span><span style="margin-left:auto;font-size:.75rem;color:var(--text-secondary);">'+(pl.online?'<span style="color:#10b981;"><i class="fa-solid fa-circle fa-xs"></i> Online</span>':'Offline')+'</span></div>').join('');
    overlay.innerHTML='<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:1.5rem;z-index:1000;box-shadow:var(--shadow-lg);min-width:320px;max-width:480px;animation:modalIn .2s ease forwards;"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;"><h3 style="font-size:1rem;font-weight:800;"><i class="fa-solid fa-users-viewfinder" style="color:#8b5cf6;margin-right:.5rem;"></i>Multikonta – '+escapeHtml(nick)+'</h3><button onclick="document.getElementById(\'alts-popup-overlay\').remove()" style="background:none;border:1.5px solid var(--border);border-radius:6px;width:30px;height:30px;cursor:pointer;font-size:.9rem;color:var(--text-secondary);"><i class="fa-solid fa-xmark"></i></button></div><div style="margin-bottom:1rem;">Adres IP: '+ipBadge+'</div><div style="font-size:.75rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:.6rem;">Znalezione powiązane konta ('+alts.length+')</div>'+altsHtml+'</div>';
    document.body.appendChild(overlay);
};

// ─── INICJALIZACJA ────────────────────────────────────────────────────────────
async function ensureDefaultAdmin() {
    try {
        const snap=await getDocs(collection(db,'admins'));
        if(snap.empty){await addDoc(collection(db,'admins'),{login:'test',password:'test',displayName:'Test Admin',role:'Zarządzający',permissions:['all'],disabled:false,createdAt:serverTimestamp(),createdBy:'system'});console.log('[CritMC] Utworzono domyślne konto test/test');}
    } catch(e){console.warn('ensureDefaultAdmin:',e.message);}
}
ensureDefaultAdmin();

window._extendedApplyPermissions = function() {};



;

// Nadpisz filterShopItems żeby uwzględniała aktywną kategorię
window.filterShopItems = function() {
    const search = (document.getElementById('shop-search')?.value || '').toLowerCase();
    const filtered = allShopItems.filter(item => {
        // Filtr kategorii
        // Filtr wyszukiwania
        if (search && !(item.name||'').toLowerCase().includes(search) && !(item.desc||'').toLowerCase().includes(search)) return false;
        return true;
    });
    // Aktualizuj liczniki badge
    const counts = { all: allShopItems.length, ranga: 0, klucz: 0, zestaw: 0, item: 0 };
    allShopItems.forEach(i => { if (counts[i.type] !== undefined) counts[i.type]++; });
    Object.entries(counts).forEach(([cat, n]) => {
        const el = document.getElementById('shop-badge-' + cat);
        if (el) el.textContent = n;
    });
    renderShopGrid(filtered);
    renderShopItems(filtered);
};

// ─── PORADNIKI ────────────────────────────────────────────────────────────────
window.loadGuidesPage = function() {
    // Strona poradników jest statyczna — nic do ładowania async
    // W przyszłości można tu ładować inne poradniki
};






;

// Nadpisanie openShopItemModal — pola z nowego modala
;

;

// Zaktualizowany previewShopMediaInput
;

// Zaktualizowany previewShopItemMedia
;

// ─── SKLEP — CENY PRODUKTÓW ───────────────────────────────────────────────────
const SHOP_PRICES = {
    'vip': 10, 'boss': 20, 'crit': 30,
    'zwykly': 0.25, 'rzadki': 0.75, 'epicki': 1.50, 'crit_key': 5, 'premium': 20, 'losowy': 5,
    'pakiet-vip': 10, 'pakiet-boss': 20, 'pakiet-crit': 30,
    'maly-klucze': 5, 'sredni-klucze': 15, 'duzy-klucze': 30,
    'nick-color': 15, 'repair-30': 5, 'ec-30': 5
};
function getItemPrice(type, id) {
    if (type === 'klucz' && id === 'crit') return SHOP_PRICES['crit_key'] || 5;
    return SHOP_PRICES[id] || 0;
}

// ─── SKLEP — NADAWANIE PRODUKTÓW ─────────────────────────────────────────────

// Wybrane produkty do nadania
const _shopGrantSelected = new Map(); // key="type:id" -> { type, id, label, qty }

// Aktualizacja qty w mapie gdy zmienisz pole obok przycisku
window.onSgibQty = function(input) {
    const key = input.getAttribute('data-for'); // "type:id"
    if (_shopGrantSelected.has(key)) {
        const entry = _shopGrantSelected.get(key);
        entry.qty = Math.min(999, Math.max(1, parseInt(input.value) || 1));
        _shopGrantSelected.set(key, entry);
        _updateShopGrantPreview();
    }
};

window.toggleShopGrantItem = function(btn) {
    const id    = btn.getAttribute('data-id');
    const type  = btn.getAttribute('data-type');
    const label = btn.getAttribute('data-label');
    const key   = type + ':' + id;

    // Odczytaj qty z pola obok przycisku w tym samym .sgib-row
    const row = btn.closest('.sgib-row');
    const qtyInput = row ? row.querySelector('.sgib-qty') : null;
    const qty = qtyInput ? Math.min(999, Math.max(1, parseInt(qtyInput.value) || 1)) : 1;

    if (_shopGrantSelected.has(key)) {
        _shopGrantSelected.delete(key);
        btn.classList.remove('selected');
    } else {
        _shopGrantSelected.set(key, { type, id, label, qty });
        btn.classList.add('selected');
    }
    _updateShopGrantPreview();
};

function _updateShopGrantPreview() {
    const preview = document.getElementById('shop-grant-preview');
    const content = document.getElementById('shop-grant-preview-content');
    const nick    = (document.getElementById('shop-grant-nick')?.value || '').trim();

    if (_shopGrantSelected.size === 0) {
        if (preview) preview.style.display = 'none';
        return;
    }
    if (preview) preview.style.display = 'block';
    if (!content) return;

    const items = [..._shopGrantSelected.values()];

    // Oblicz całkowitą wartość
    let totalValue = 0;
    const lines = items.map(item => {
        const unitPrice = getItemPrice(item.type, item.id);
        const lineTotal = unitPrice * (item.qty || 1);
        totalValue += lineTotal;
        const qtyStr = item.qty > 1 ? ' <b>x' + item.qty + '</b>' : '';
        const priceStr = unitPrice > 0 ? ` <span style="color:var(--accent-green);font-size:.75rem;">${lineTotal.toFixed(2)} PLN</span>` : '';
        return '<span style="display:inline-flex;align-items:center;gap:.3rem;margin:.2rem;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:.2rem .55rem;font-size:.82rem;font-weight:700;">'
            + escapeHtml(item.label) + qtyStr + priceStr
            + '<button onclick="event.stopPropagation();(function(){const b=document.querySelector(\'[data-type=\\\'' + item.type + '\\\'][data-id=\\\'' + item.id + '\\\']\');if(b)b.click();})();" style="background:none;border:none;cursor:pointer;color:#ef4444;padding:0 .2rem;font-size:.85rem;">×</button>'
            + '</span>';
    });

    const valueLine = totalValue > 0
        ? `<div style="margin-top:.5rem;padding:.4rem .6rem;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);border-radius:6px;font-size:.82rem;font-weight:700;color:#10b981;">
            <i class="fa-solid fa-tag"></i> Wartość zamówienia: <b>${totalValue.toFixed(2)} PLN</b>
           </div>`
        : '';

    content.innerHTML = (nick ? '<div style="font-size:.82rem;margin-bottom:.4rem;"><b>Dla:</b> ' + escapeHtml(nick) + '</div>' : '')
        + '<div>' + lines.join('') + '</div>'
        + valueLine;
}

window.shopGrantSearchPlayer = function(val) {
    const suggestions = document.getElementById('shop-grant-suggestions');
    if (!suggestions) return;
    _updateShopGrantPreview();
    if (!val || val.length < 2) { suggestions.style.display = 'none'; return; }
    const matches = allPlayers.filter(p => (p.nick||p.id||'').toLowerCase().includes(val.toLowerCase())).slice(0,8);
    if (!matches.length) { suggestions.style.display = 'none'; return; }
    suggestions.style.display = 'block';
    suggestions.innerHTML = matches.map(p =>
        '<div style="padding:.55rem .9rem;cursor:pointer;display:flex;align-items:center;gap:.6rem;font-size:.88rem;font-weight:600;border-bottom:1px solid var(--border);" onmouseenter="this.style.background=\'var(--bg)\'" onmouseleave="this.style.background=\'\'" onclick="shopGrantSelectPlayer(\'' + escapeHtml(p.nick||p.id) + '\')">'
        + '<img src="https://mc-heads.net/avatar/' + encodeURIComponent(p.nick||p.id) + '/24" style="width:24px;height:24px;border-radius:4px;image-rendering:pixelated;">'
        + escapeHtml(p.nick||p.id)
        + (p.online ? '<span style="margin-left:auto;width:8px;height:8px;border-radius:50%;background:#10b981;"></span>' : '')
        + '</div>'
    ).join('');
};

window.shopGrantSelectPlayer = function(nick) {
    const input = document.getElementById('shop-grant-nick');
    const suggestions = document.getElementById('shop-grant-suggestions');
    if (input) input.value = nick;
    if (suggestions) suggestions.style.display = 'none';
    _updateShopGrantPreview();
};

// Zamknij sugestie przy kliknięciu poza
document.addEventListener('click', function(e) {
    const s = document.getElementById('shop-grant-suggestions');
    const i = document.getElementById('shop-grant-nick');
    if (s && i && !i.contains(e.target) && !s.contains(e.target)) s.style.display = 'none';
});

window.submitShopGrant = async function() {
    if (!requirePermission('shop', 'zarządzanie sklepem')) return;

    const nick = (document.getElementById('shop-grant-nick')?.value || '').trim();
    if (!nick) { _showShopGrantMsg('error', 'Podaj nick gracza!'); return; }
    if (_shopGrantSelected.size === 0) { _showShopGrantMsg('error', 'Wybierz co najmniej jeden produkt!'); return; }

    const message = (document.getElementById('shop-grant-message')?.value || '').trim();
    const items   = [..._shopGrantSelected.values()].map(item => ({
        type:  item.type,
        id:    item.id,
        label: item.label,
        qty:   item.qty || 1
    }));

    // ── Sprawdzenie podwójnej rangi (qty >= 2) → pytaj o zgodę → 60 dni ──
    const doubleRanks = items.filter(i => i.type === 'ranga' && i.qty >= 2);
    if (doubleRanks.length > 0) {
        const rankNames = doubleRanks.map(r => r.label).join(', ');
        const confirmed = await _confirmDoubleRank(rankNames);
        if (!confirmed) return;
        // Oznacz te rangi jako 60 dni
        items.forEach(i => {
            if (i.type === 'ranga' && i.qty >= 2) {
                i.label = i.label + ' (60 dni)';
                i.duration = '60d';
            }
        });
    }

    const btn = document.getElementById('shop-grant-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Nadawanie...'; }

    try {
        const orderRef = await addDoc(collection(db, 'orders'), {
            playerNick: nick,
            items,
            message:    message || '',
            admin:      currentUser?.displayName || 'Panel',
            status:     'pending',
            createdAt:  serverTimestamp(),
            type:       'admin_grant'
        });

        for (const item of items) {
            await addDoc(collection(db, 'panel_commands'), {
                action:    'shop_grant',
                player:    nick,
                item:      item.id,
                itemType:  item.type,
                itemLabel: item.label,
                qty:       item.qty,
                duration:  item.duration || '',
                orderId:   orderRef.id,
                message:   message,
                admin:     currentUser?.displayName || 'Panel',
                executed:  false,
                createdAt: serverTimestamp()
            });
        }

        await logAction('shop_grant', nick, currentUser?.displayName || 'Panel',
            'Nadano: ' + items.map(i => i.label + (i.qty > 1 ? ' x' + i.qty : '')).join(', '), '—');

        showToast('success', 'Produkty nadane dla ' + nick + '!');
        _showShopGrantMsg('success', '✓ Produkty wysłane do gracza ' + nick);

        // Reset formularza
        _shopGrantSelected.clear();
        document.querySelectorAll('.shop-grant-item-btn.selected').forEach(b => b.classList.remove('selected'));
        document.querySelectorAll('.sgib-qty').forEach(i => i.value = '1');
        const preview = document.getElementById('shop-grant-preview');
        if (preview) preview.style.display = 'none';
        const nickEl = document.getElementById('shop-grant-nick');
        const msgEl  = document.getElementById('shop-grant-message');
        if (nickEl) nickEl.value = '';
        if (msgEl)  msgEl.value  = '';

        await loadShopGrants();

    } catch(e) {
        _showShopGrantMsg('error', 'Błąd: ' + e.message);
        console.error('submitShopGrant:', e);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-gift"></i> Nadaj produkty'; }
    }
};

// Modal potwierdzenia podwójnej rangi
function _confirmDoubleRank(rankNames) {
    return new Promise(resolve => {
        // Usuń poprzedni modal jeśli istnieje
        document.getElementById('rank-confirm-overlay')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'rank-confirm-overlay';
        overlay.innerHTML = `
            <div id="rank-confirm-box">
                <h3><i class="fa-solid fa-crown" style="color:#8b5cf6;margin-right:.4rem;"></i>Potwierdzenie — podwójna ranga</h3>
                <p>Wybrano <b>${escapeHtml(rankNames)}</b> w ilości ≥2.<br>
                Czy chcesz nadać tę rangę na <b>60 dni</b> zamiast 30?</p>
                <div class="confirm-btns">
                    <button class="modal-submit-btn" id="rank-confirm-yes" style="flex:1;background:#8b5cf6;">
                        <i class="fa-solid fa-check"></i> Tak, 60 dni
                    </button>
                    <button class="tbl-btn" id="rank-confirm-no" style="flex:1;padding:.75rem;">
                        <i class="fa-solid fa-xmark"></i> Anuluj
                    </button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        document.getElementById('rank-confirm-yes').onclick = () => { overlay.remove(); resolve(true);  };
        document.getElementById('rank-confirm-no').onclick  = () => { overlay.remove(); resolve(false); };
        overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); resolve(false); } };
    });
}

function _showShopGrantMsg(type, text) {
    const el = document.getElementById('shop-grant-msg'); if (!el) return;
    el.className = 'modal-msg ' + type; el.innerHTML = text; el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 5000);
}

async function loadShopGrants() {
    const list = document.getElementById('shop-grants-list'); if (!list) return;
    list.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-secondary);font-size:.88rem;"><i class="fa-solid fa-spinner fa-spin"></i> Ładowanie...</div>';
    try {
        const snap = await getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc')));
        const orders = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(o => o.type === 'admin_grant').slice(0, 50);
        if (!orders.length) {
            list.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-secondary);font-size:.88rem;">Brak historii nadań.</div>';
            return;
        }
        list.innerHTML = orders.map(o => {
            const statusClass = o.status === 'executed' ? 'shop-grant-badge-executed'
                              : o.status === 'failed'   ? 'shop-grant-badge-failed'
                              : 'shop-grant-badge-pending';
            const statusLabel = o.status === 'executed' ? '<i class="fa-solid fa-check"></i> Wykonano'
                              : o.status === 'failed'   ? '<i class="fa-solid fa-xmark"></i> Błąd'
                              : '<i class="fa-solid fa-clock"></i> Oczekuje';

            // Szczegóły produktów
            const itemsHtml = (o.items || []).map(i => {
                const qty = i.qty > 1 ? ` <b>×${i.qty}</b>` : '';
                const icon = i.type === 'ranga' ? '👑' : i.type === 'klucz' ? '🔑' : i.type === 'zestaw' ? '📦' : '✨';
                const unitPrice = getItemPrice(i.type, i.id);
                const lineTotal = unitPrice * (i.qty || 1);
                const priceTag = unitPrice > 0
                    ? `<span style="color:#10b981;font-size:.68rem;font-weight:700;margin-left:.25rem;">${lineTotal.toFixed(2)} PLN</span>`
                    : '';
                return `<span style="display:inline-flex;align-items:center;gap:.25rem;background:var(--bg);border:1px solid var(--border);border-radius:5px;padding:.15rem .45rem;font-size:.75rem;font-weight:600;margin:.1rem;">${icon} ${escapeHtml(i.label || i.id || '?')}${qty}${priceTag}</span>`;
            }).join('');

            // Suma wartości
            const totalVal = (o.items || []).reduce((s, i) => s + getItemPrice(i.type, i.id) * (i.qty || 1), 0);
            const totalBadge = totalVal > 0
                ? `<span style="font-size:.72rem;font-weight:700;color:#10b981;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);padding:.1rem .45rem;border-radius:5px;margin-left:.4rem;">= ${totalVal.toFixed(2)} PLN</span>`
                : '';

            // Czas wykonania
            const execTime = o.executedAt ? '<span style="color:#10b981;font-size:.7rem;">• odebrano ' + formatDate(o.executedAt) + '</span>' : '';

            // Wiadomość
            const msgHtml = o.message ? `<div style="font-size:.75rem;color:var(--text-secondary);margin-top:.2rem;">💬 ${escapeHtml(o.message)}</div>` : '';

            return `<div class="shop-grant-entry">
                <div class="shop-grant-entry-header">
                    <div style="display:flex;align-items:center;gap:.5rem;">
                        <img src="https://mc-heads.net/avatar/${encodeURIComponent(o.playerNick||'Steve')}/22" style="width:22px;height:22px;border-radius:4px;image-rendering:pixelated;">
                        <span style="font-weight:800;font-size:.9rem;">${escapeHtml(o.playerNick || '?')}</span>
                    </div>
                    <span class="shop-grant-badge ${statusClass}">${statusLabel}</span>
                </div>
                <div style="margin:.35rem 0 .2rem;">${itemsHtml || '<span style="color:var(--text-secondary);font-size:.78rem;">brak danych</span>'}${totalBadge}</div>
                ${msgHtml}
                <div style="font-size:.72rem;color:var(--text-secondary);display:flex;justify-content:space-between;margin-top:.3rem;flex-wrap:wrap;gap:.2rem;">
                    <span>👤 Admin: <b>${escapeHtml(o.admin || '—')}</b></span>
                    <span style="display:flex;gap:.6rem;">${execTime} <span>📅 ${formatDate(o.createdAt)}</span></span>
                </div>
            </div>`;
        }).join('');
    } catch(e) {
        list.innerHTML = `<div style="padding:1rem;color:#ef4444;font-size:.85rem;">Błąd: ${e.message}</div>`;
    }
}

// Nadpisz loadShopPage
window.loadShopPage = async function() {
    await loadShopGrants();
};

// ─── PLUGINY — CStats ─────────────────────────────────────────────────────────

let _cstatsSelectedPlayer = null; // { name, uuid, stats }

window.loadPluginsPage = async function() {
    switchPluginTab('cstats');
    await Promise.allSettled([loadCStatsTop(), loadCStatsEditLog()]);
    // Wstrzyknij zakładkę CShop jeśli jeszcze nie ma
    _injectCShopTab();
};

window.switchPluginTab = function(tab) {
    document.querySelectorAll('[data-site-tab]').forEach(b => {
        if (b.closest('#page-plugins')) b.classList.toggle('active', b.getAttribute('data-site-tab') === tab);
    });
    document.querySelectorAll('#page-plugins .site-tab-panel').forEach(p => {
        p.classList.toggle('sp-active', p.id === 'ptab-' + tab);
    });
    if (tab === 'pconnections') loadPluginConnections();
    if (tab === 'cshop') loadCShopTab();
};

/** Wstrzykuje zakładkę CShop do strony Pluginy (tylko raz) */
function _injectCShopTab() {
    if (document.getElementById('ptab-cshop')) return;

    // Dodaj przycisk zakładki
    const tabBar = document.querySelector('#page-plugins .site-tab-btn[data-site-tab="pconnections"]');
    if (tabBar) {
        const btn = document.createElement('button');
        btn.className = 'site-tab-btn';
        btn.setAttribute('data-site-tab', 'cshop');
        btn.setAttribute('onclick', "switchPluginTab('cshop')");
        btn.innerHTML = '<i class="fa-solid fa-shop"></i> CShop';
        tabBar.insertAdjacentElement('beforebegin', btn);
    }

    // Dodaj panel zakładki
    const pluginsPage = document.getElementById('page-plugins');
    if (!pluginsPage) return;
    const panel = document.createElement('div');
    panel.id = 'ptab-cshop';
    panel.className = 'site-tab-panel';
    panel.innerHTML = _buildCShopTabHtml();
    pluginsPage.appendChild(panel);
}

// ── CShop Tab HTML ────────────────────────────────────────────────────────────

function _buildCShopTabHtml() {
    return `
    <!-- STATYSTYKI DZIENNE — pasek kart u góry -->
    <div id="cshop-daily-stats" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:.75rem;margin-bottom:1.2rem;">
        <div style="text-align:center;padding:1.5rem;color:var(--text-secondary);font-size:.82rem;grid-column:1/-1;">
            <i class="fa-solid fa-spinner fa-spin"></i> Ładowanie statystyk dziennych...
        </div>
    </div>

    <!-- WYKRES AKTYWNOŚCI DZIENNEJ + TOP PRZEDMIOTY -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.2rem;margin-bottom:1.2rem;">
        <!-- Top kupowanych dziś -->
        <div class="table-card" style="padding:1rem;">
            <div style="font-size:.72rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:.6rem;display:flex;align-items:center;justify-content:space-between;">
                <span><i class="fa-solid fa-fire" style="color:#ef4444;"></i> Dziś — najczęściej kupowane</span>
                <span id="cshop-daily-date" style="font-size:.7rem;color:var(--text-secondary);font-weight:400;"></span>
            </div>
            <div id="cshop-today-buy-items" style="max-height:200px;overflow-y:auto;">
                <div style="text-align:center;padding:1rem;color:var(--text-secondary);font-size:.8rem;"><i class="fa-solid fa-spinner fa-spin"></i></div>
            </div>
        </div>
        <!-- Top sprzedawanych dziś -->
        <div class="table-card" style="padding:1rem;">
            <div style="font-size:.72rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:.6rem;">
                <i class="fa-solid fa-coins" style="color:#10b981;"></i> Dziś — najczęściej sprzedawane
            </div>
            <div id="cshop-today-sell-items" style="max-height:200px;overflow-y:auto;">
                <div style="text-align:center;padding:1rem;color:var(--text-secondary);font-size:.8rem;"><i class="fa-solid fa-spinner fa-spin"></i></div>
            </div>
        </div>
    </div>

    <!-- TOP ZARABIAJĄCYCH DZIŚ -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.2rem;margin-bottom:1.2rem;">
        <div class="table-card" style="padding:1rem;">
            <div style="font-size:.72rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:.6rem;">
                <i class="fa-solid fa-ranking-star" style="color:#f59e0b;"></i> Topka zarobków dziś (sprzedaż)
            </div>
            <div id="cshop-today-top-earners" style="max-height:220px;overflow-y:auto;">
                <div style="text-align:center;padding:1rem;color:var(--text-secondary);font-size:.8rem;"><i class="fa-solid fa-spinner fa-spin"></i></div>
            </div>
        </div>
        <div class="table-card" style="padding:1rem;">
            <div style="font-size:.72rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:.6rem;">
                <i class="fa-solid fa-cart-shopping" style="color:#3b82f6;"></i> Topka wydatków dziś (kupno)
            </div>
            <div id="cshop-today-top-spenders" style="max-height:220px;overflow-y:auto;">
                <div style="text-align:center;padding:1rem;color:var(--text-secondary);font-size:.8rem;"><i class="fa-solid fa-spinner fa-spin"></i></div>
            </div>
        </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.2rem;margin-bottom:1.2rem;">
        <!-- Statystyki ogólne (wszystkie czasy) -->
        <div class="table-card" style="padding:1.2rem;">
            <div style="font-size:.78rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:.8rem;">
                <i class="fa-solid fa-chart-pie" style="color:#10b981;"></i> Statystyki sklepu (łącznie)
            </div>
            <div id="cshop-overview" style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;">
                <div style="text-align:center;padding:1rem;color:var(--text-secondary);font-size:.82rem;grid-column:1/-1;">
                    <i class="fa-solid fa-spinner fa-spin"></i> Ładowanie...
                </div>
            </div>
        </div>
        <!-- System podatków -->
        <div class="table-card" style="padding:1.2rem;">
            <div style="font-size:.78rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:.8rem;display:flex;align-items:center;justify-content:space-between;">
                <span><i class="fa-solid fa-percent" style="color:#f59e0b;"></i> System podatków</span>
                <div style="display:flex;align-items:center;gap:.5rem;">
                    <span style="font-size:.72rem;color:var(--text-secondary);">Włączony</span>
                    <label class="toggle-switch" style="position:relative;display:inline-block;width:36px;height:20px;">
                        <input type="checkbox" id="cshop-tax-enabled" onchange="cshopSaveTaxEnabled(this.checked)"
                            style="opacity:0;width:0;height:0;">
                        <span style="position:absolute;cursor:pointer;inset:0;background:#374151;border-radius:20px;transition:.2s;" id="cshop-tax-slider">
                            <span style="position:absolute;content:'';height:14px;width:14px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.2s;"></span>
                        </span>
                    </label>
                </div>
            </div>
            <div id="cshop-tax-tiers" style="display:flex;flex-direction:column;gap:.5rem;">
                <div style="text-align:center;padding:1rem;color:var(--text-secondary);font-size:.82rem;">
                    <i class="fa-solid fa-spinner fa-spin"></i> Ładowanie...
                </div>
            </div>
            <button onclick="cshopAddTier()" style="width:100%;margin-top:.6rem;padding:.5rem;background:transparent;border:1.5px dashed var(--border);border-radius:8px;color:var(--text-secondary);font-size:.8rem;font-weight:700;cursor:pointer;font-family:var(--font);">
                <i class="fa-solid fa-plus"></i> Dodaj próg podatkowy
            </button>
        </div>
    </div>
    <!-- Topki sklepu -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1.2rem;margin-bottom:1.2rem;">
        <div class="table-card" style="padding:1rem;">
            <div style="font-size:.72rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:.6rem;">
                <i class="fa-solid fa-trophy" style="color:#ef4444;"></i> Top Wydatki
            </div>
            <div id="cshop-top-spent" style="max-height:260px;overflow-y:auto;">
                <div style="text-align:center;padding:1rem;color:var(--text-secondary);font-size:.8rem;"><i class="fa-solid fa-spinner fa-spin"></i></div>
            </div>
        </div>
        <div class="table-card" style="padding:1rem;">
            <div style="font-size:.72rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:.6rem;">
                <i class="fa-solid fa-trophy" style="color:#10b981;"></i> Top Zarobki
            </div>
            <div id="cshop-top-earned" style="max-height:260px;overflow-y:auto;">
                <div style="text-align:center;padding:1rem;color:var(--text-secondary);font-size:.8rem;"><i class="fa-solid fa-spinner fa-spin"></i></div>
            </div>
        </div>
        <div class="table-card" style="padding:1rem;">
            <div style="font-size:.72rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:.6rem;">
                <i class="fa-solid fa-list-ol" style="color:#8b5cf6;"></i> Top Transakcji
            </div>
            <div id="cshop-top-transactions" style="max-height:260px;overflow-y:auto;">
                <div style="text-align:center;padding:1rem;color:var(--text-secondary);font-size:.8rem;"><i class="fa-solid fa-spinner fa-spin"></i></div>
            </div>
        </div>
    </div>
    <!-- Zarządzanie przedmiotami sklepu -->
    <div class="table-card" style="margin-bottom:1.2rem; padding:1.2rem;">
        <div style="font-size:.78rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:.8rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem;">
            <span><i class="fa-solid fa-cubes" style="color:#f59e0b;"></i> Zarządzanie przedmiotami sklepu</span>
            <div id="cshop-items-categories" style="display:flex;gap:.35rem;flex-wrap:wrap;">
                <!-- Kategoria tabs: [Wszystkie] [Książki] [Przydatne] [Czas] [Rudy] [Inne] -->
            </div>
        </div>
        <div style="overflow-x:auto;">
            <table class="data-table">
                <thead>
                    <tr>
                        <th style="width:120px;">Material</th>
                        <th style="width:60px;text-align:center;">Ikona</th>
                        <th>Nazwa</th>
                        <th style="width:140px;">Kupno ($)</th>
                        <th style="width:140px;">Sprzedaż ($)</th>
                        <th style="width:80px;text-align:center;">Akcja</th>
                    </tr>
                </thead>
                <tbody id="cshop-items-tbody">
                    <tr><td colspan="6" class="table-loading"><i class="fa-solid fa-spinner fa-spin"></i> Ładowanie przedmiotów...</td></tr>
                </tbody>
            </table>
        </div>
    </div>
    <!-- Zarządzanie przedmiotami sklepu -->
    <div class="table-card" style="overflow:hidden;margin-bottom:1.2rem;">
        <div style="padding:.8rem 1.2rem;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem;">
            <div style="font-size:.78rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;">
                <i class="fa-solid fa-tags" style="color:#f59e0b;"></i> Zarządzanie przedmiotami sklepu
            </div>
            <div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;">
                <div id="cshop-items-cat-tabs" style="display:flex;gap:.3rem;flex-wrap:wrap;">
                    <button class="tbl-btn" style="font-size:.72rem;background:rgba(245,158,11,.12);color:#d97706;border-color:rgba(245,158,11,.3);" onclick="cshopShowItemsCat('')">Wszystkie</button>
                    <button class="tbl-btn" style="font-size:.72rem;" onclick="cshopShowItemsCat('ksiazki')">📚 Książki</button>
                    <button class="tbl-btn" style="font-size:.72rem;" onclick="cshopShowItemsCat('przydatne')">⭐ Przydatne</button>
                    <button class="tbl-btn" style="font-size:.72rem;" onclick="cshopShowItemsCat('czas')">⏱️ Czas</button>
                    <button class="tbl-btn" style="font-size:.72rem;" onclick="cshopShowItemsCat('rudy')">💎 Rudy</button>
                    <button class="tbl-btn" style="font-size:.72rem;" onclick="cshopShowItemsCat('inne')">📦 Inne</button>
                </div>
                <button class="tbl-btn" onclick="loadCShopItemsManager()" style="font-size:.72rem;">
                    <i class="fa-solid fa-rotate-right"></i> Odśwież
                </button>
            </div>
        </div>
        <div id="cshop-items-manager" style="overflow-x:auto;">
            <table class="data-table">
                <thead><tr><th>Kategoria</th><th>Slot</th><th>Material</th><th>Cena kupna ($)</th><th>Cena sprzedaży ($)</th><th>Akcja</th></tr></thead>
                <tbody id="cshop-items-tbody">
                    <tr><td colspan="6" class="table-loading"><i class="fa-solid fa-spinner fa-spin"></i> Ładowanie...</td></tr>
                </tbody>
            </table>
        </div>
        <div style="padding:.6rem 1.2rem;font-size:.72rem;color:var(--text-secondary);border-top:1px solid var(--border);">
            <i class="fa-solid fa-circle-info" style="color:#f59e0b;"></i> Zmiany cen są pobierane przez plugin CShop co ~60 sekund. Dane pobierane z <code>cshop_config/items</code>.
        </div>
    </div>
    <!-- Historia transakcji -->
    <div class="table-card" style="overflow:hidden;">
        <div style="padding:.8rem 1.2rem;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem;">
            <div style="font-size:.78rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;">
                <i class="fa-solid fa-clock-rotate-left" style="color:#3b82f6;"></i> Historia transakcji
            </div>
            <div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;">
                <input type="text" id="cshop-hist-search" placeholder="Szukaj gracza..." oninput="cshopFilterHistory()"
                    style="padding:.35rem .7rem;border:1.5px solid var(--border);border-radius:6px;font-size:.8rem;background:var(--bg);color:var(--text-primary);outline:none;font-family:var(--font);width:150px;">
                <select id="cshop-hist-type" onchange="cshopFilterHistory()"
                    style="padding:.35rem .6rem;border:1.5px solid var(--border);border-radius:6px;font-size:.8rem;background:var(--bg);color:var(--text-primary);font-family:var(--font);">
                    <option value="">Wszystkie</option>
                    <option value="BUY">Kupno</option>
                    <option value="SELL">Sprzedaż</option>
                </select>
                <button class="tbl-btn" onclick="loadCShopHistory()" style="font-size:.72rem;">
                    <i class="fa-solid fa-rotate-right"></i> Odśwież
                </button>
            </div>
        </div>
        <div id="cshop-history-table" style="overflow-x:auto;">
            <table class="data-table">
                <thead><tr><th>Gracz</th><th>Przedmiot</th><th>Ilość</th><th>Cena</th><th>Typ</th><th>Kategoria</th><th>Data</th></tr></thead>
                <tbody id="cshop-history-tbody">
                    <tr><td colspan="7" class="table-loading"><i class="fa-solid fa-spinner fa-spin"></i> Ładowanie...</td></tr>
                </tbody>
            </table>
        </div>
    </div>`;
}

let _cshopAllHistory = [];
let _cshopTaxTiers = [];
let _cshopAllItemsData = {};
let _cshopCurrentCategory = 'all';

async function loadCShopTab() {
    await Promise.allSettled([
        loadCShopDailyStats(),
        loadCShopOverview(),
        loadCShopTaxConfig(),
        loadCShopTopList('top_spent',        'cshop-top-spent',        '#ef4444', '$'),
        loadCShopTopList('top_earned',       'cshop-top-earned',       '#10b981', '$'),
        loadCShopTopList('top_transactions', 'cshop-top-transactions', '#8b5cf6', 'transakcji'),
        loadCShopItemsManager(),
        loadCShopHistory()
    ]);
}

window.loadCShopItemsManager = async function() {
    const tbody = document.getElementById('cshop-items-tbody');
    const tabsContainer = document.getElementById('cshop-items-categories');
    if (!tbody || !tabsContainer) return;

    try {
        const docSnap = await getDoc(doc(db, 'cshop_config', 'items'));
        if (!docSnap.exists()) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:1.5rem;color:var(--text-secondary);">Brak danych przedmiotów. Uruchom serwer Minecraft z pluginem CShop, aby je zsynchronizować.</td></tr>`;
            return;
        }

        const data = docSnap.data();
        _cshopAllItemsData = data;

        const categoriesSet = new Set();
        Object.values(data).forEach(item => {
            if (item && item.category) {
                categoriesSet.add(item.category);
            }
        });
        const categories = Array.from(categoriesSet).sort();
        const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

        let tabsHtml = `<button class="tbl-btn ${(!_cshopCurrentCategory || _cshopCurrentCategory === 'all') ? 'active' : ''}" onclick="_cshopSetCategory('all')" style="margin-right:.25rem;margin-bottom:.25rem;font-size:.7rem;">Wszystkie</button>`;
        categories.forEach(cat => {
            const isActive = _cshopCurrentCategory === cat;
            tabsHtml += `<button class="tbl-btn ${isActive ? 'active' : ''}" onclick="_cshopSetCategory('${cat}')" style="margin-right:.25rem;margin-bottom:.25rem;font-size:.7rem;">${capitalize(cat)}</button>`;
        });
        tabsContainer.innerHTML = tabsHtml;

        _renderCShopItemsTable();

    } catch (e) {
        console.error('[CShop] Błąd loadCShopItemsManager:', e);
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:1.5rem;color:var(--danger);"><i class="fa-solid fa-circle-exclamation"></i> Błąd ładowania: ${escapeHtml(e.message)}</td></tr>`;
    }
};

window._cshopSetCategory = function(cat) {
    _cshopCurrentCategory = cat;
    const tabsContainer = document.getElementById('cshop-items-categories');
    if (tabsContainer) {
        const buttons = tabsContainer.querySelectorAll('button');
        buttons.forEach(btn => {
            const isAll = cat === 'all' && btn.textContent.toLowerCase() === 'wszystkie';
            const isCat = btn.textContent.toLowerCase() === cat.toLowerCase();
            if (isAll || isCat) btn.classList.add('active');
            else btn.classList.remove('active');
        });
    }
    _renderCShopItemsTable();
};

function _renderCShopItemsTable() {
    const tbody = document.getElementById('cshop-items-tbody');
    if (!tbody || !_cshopAllItemsData) return;

    let itemsArr = Object.entries(_cshopAllItemsData).map(([key, val]) => ({ key, ...val }));
    itemsArr.sort((a, b) => {
        const catComp = (a.category || '').localeCompare(b.category || '');
        if (catComp !== 0) return catComp;
        return (a.slot || 0) - (b.slot || 0);
    });

    if (_cshopCurrentCategory && _cshopCurrentCategory !== 'all') {
        itemsArr = itemsArr.filter(item => item.category === _cshopCurrentCategory);
    }

    if (itemsArr.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:1.5rem;color:var(--text-secondary);">Brak przedmiotów w wybranej kategorii.</td></tr>`;
        return;
    }

    tbody.innerHTML = itemsArr.map(item => {
        const buyVal = item.buyPrice !== undefined && item.buyPrice !== null ? item.buyPrice : '';
        const sellVal = item.sellPrice !== undefined && item.sellPrice !== null ? item.sellPrice : '';
        const cleanName = (item.displayName || item.material || '').replace(/§[0-9a-fk-or]/gi, '');

        return `<tr>
            <td style="font-family:monospace;font-size:.78rem;color:var(--text-secondary);">${escapeHtml(item.material || '')}</td>
            <td style="text-align:center;">
                <img src="https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/master/data/1.20/items_png/${(item.material || '').toLowerCase()}.png"
                     onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' width=\'24\' height=\'24\' fill=\'none\' stroke=\'%23f59e0b\' stroke-width=\'2\'><path d=\'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z\'/></svg>'"
                     style="width:24px;height:24px;image-rendering:pixelated;vertical-align:middle;">
            </td>
            <td style="font-weight:700;">${escapeHtml(cleanName)} <span style="font-size:.7rem;color:var(--text-secondary);font-weight:400;">(${escapeHtml(item.category)} #${item.slot})</span></td>
            <td>
                <input type="number" step="any" min="0" placeholder="Brak (brak kupna)" id="cshop-buy-${item.category}-${item.slot}" value="${buyVal}"
                       style="width:100%;padding:.3rem .5rem;border:1.5px solid var(--border);border-radius:6px;font-size:.8rem;background:var(--bg);color:var(--text-primary);outline:none;font-family:var(--font);">
            </td>
            <td>
                <input type="number" step="any" min="0" placeholder="Brak (brak sprzedaży)" id="cshop-sell-${item.category}-${item.slot}" value="${sellVal}"
                       style="width:100%;padding:.3rem .5rem;border:1.5px solid var(--border);border-radius:6px;font-size:.8rem;background:var(--bg);color:var(--text-primary);outline:none;font-family:var(--font);">
            </td>
            <td style="text-align:center;">
                <button class="tbl-btn" onclick="cshopSaveItemPrice('${escapeHtml(item.category)}', ${item.slot})" style="font-size:.72rem;padding:.3rem .6rem;">
                    <i class="fa-solid fa-floppy-disk"></i> Zapisz
                </button>
            </td>
        </tr>`;
    }).join('');
}

window.cshopSaveItemPrice = async function(category, slot) {
    const buyInput = document.getElementById(`cshop-buy-${category}-${slot}`);
    const sellInput = document.getElementById(`cshop-sell-${category}-${slot}`);
    if (!buyInput || !sellInput) return;

    if (!requirePermission('shop', 'zmianę cen w CShop')) return;

    const rawBuy = buyInput.value.trim();
    const rawSell = sellInput.value.trim();

    const buyPrice = rawBuy === '' ? null : parseFloat(rawBuy);
    const sellPrice = rawSell === '' ? null : parseFloat(rawSell);

    if (buyPrice !== null && isNaN(buyPrice)) { showToast('error', 'Niepoprawna cena kupna.'); return; }
    if (sellPrice !== null && isNaN(sellPrice)) { showToast('error', 'Niepoprawna cena sprzedaży.'); return; }

    const key = `${category}_${slot}`;

    try {
        await setDoc(doc(db, 'cshop_config', 'items'), {
            [key]: {
                buyPrice: buyPrice,
                sellPrice: sellPrice
            }
        }, { merge: true });

        if (_cshopAllItemsData[key]) {
            _cshopAllItemsData[key].buyPrice = buyPrice;
            _cshopAllItemsData[key].sellPrice = sellPrice;
        }

        showToast('success', 'Cena zapisana — plugin pobierze za ~60s');
    } catch (e) {
        console.error('[CShop] Błąd cshopSaveItemPrice:', e);
        showToast('error', 'Błąd zapisu: ' + e.message);
    }
};

async function loadCShopDailyStats() {
    const dailyEl   = document.getElementById('cshop-daily-stats');
    const dateEl    = document.getElementById('cshop-daily-date');
    const buyItems  = document.getElementById('cshop-today-buy-items');
    const sellItems = document.getElementById('cshop-today-sell-items');
    const topEarn   = document.getElementById('cshop-today-top-earners');
    const topSpend  = document.getElementById('cshop-today-top-spenders');
    if (!dailyEl) return;

    try {
        const snap = await getDocs(query(collection(db, 'cshop_transactions'), orderBy('timestamp', 'desc')));
        const all  = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        const now       = Date.now();
        const msHour    = 3600_000;
        const msDay     = 86_400_000;
        const msWeek    = 7  * msDay;
        const msMonth   = 30 * msDay;

        const todayStr  = new Date().toLocaleDateString('pl-PL');
        if (dateEl) dateEl.textContent = todayStr;

        // Filtruj po zakresie
        const inRange = (tx, ms) => {
            const t = tx.timestamp ? new Date(tx.timestamp).getTime() : 0;
            return t > now - ms;
        };

        const txHour  = all.filter(tx => inRange(tx, msHour));
        const txDay   = all.filter(tx => inRange(tx, msDay));
        const txWeek  = all.filter(tx => inRange(tx, msWeek));
        const txMonth = all.filter(tx => inRange(tx, msMonth));

        // Pomocnik: zlicz wartości dla zakresu
        const sum = (arr, type) => arr.filter(t => t.type === type).reduce((s,t) => s + (t.price||0), 0);
        const cnt = (arr, type) => arr.filter(t => t.type === type).length;
        const fmt$ = v => v.toLocaleString('pl-PL', {minimumFractionDigits:2, maximumFractionDigits:2}) + '$';

        // ── Karty podsumowania ─────────────────────────────────────────────────
        const periods = [
            { label:'Ostatnia godzina', txns: txHour,  color:'#8b5cf6' },
            { label:'Dziś',             txns: txDay,   color:'#3b82f6' },
            { label:'Ten tydzień',      txns: txWeek,  color:'#10b981' },
            { label:'Ten miesiąc',      txns: txMonth, color:'#f59e0b' },
        ];

        dailyEl.innerHTML = periods.map(p => {
            const buyV  = sum(p.txns, 'BUY');
            const sellV = sum(p.txns, 'SELL');
            const buyC  = cnt(p.txns, 'BUY');
            const sellC = cnt(p.txns, 'SELL');
            const players = new Set(p.txns.map(t => t.uuid)).size;
            return `
            <div style="background:var(--bg-card);border:1.5px solid ${p.color}33;border-radius:12px;padding:1rem;border-top:3px solid ${p.color};">
                <div style="font-size:.68rem;font-weight:700;color:${p.color};text-transform:uppercase;margin-bottom:.6rem;letter-spacing:.04em;">
                    <i class="fa-solid fa-calendar-day"></i> ${p.label}
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem;">
                    <div style="background:rgba(239,68,68,.07);border-radius:8px;padding:.5rem;text-align:center;">
                        <div style="font-size:.6rem;color:var(--text-secondary);text-transform:uppercase;">Kupno</div>
                        <div style="font-size:.88rem;font-weight:800;color:#ef4444;">${fmt$(buyV)}</div>
                        <div style="font-size:.65rem;color:var(--text-secondary);">${buyC} transakcji</div>
                    </div>
                    <div style="background:rgba(16,185,129,.07);border-radius:8px;padding:.5rem;text-align:center;">
                        <div style="font-size:.6rem;color:var(--text-secondary);text-transform:uppercase;">Sprzedaż</div>
                        <div style="font-size:.88rem;font-weight:800;color:#10b981;">${fmt$(sellV)}</div>
                        <div style="font-size:.65rem;color:var(--text-secondary);">${sellC} transakcji</div>
                    </div>
                </div>
                <div style="margin-top:.4rem;font-size:.7rem;color:var(--text-secondary);text-align:center;">
                    <i class="fa-solid fa-users" style="color:${p.color};"></i> ${players} aktywnych graczy •
                    razem: <b style="color:${p.color};">${(buyV+sellV).toFixed(2)}$</b>
                </div>
            </div>`;
        }).join('');

        // ── Top kupowanych DZIŚ (po itemName, COUNT) ───────────────────────────
        const buyMap = {};
        txDay.filter(t => t.type === 'BUY').forEach(t => {
            const k = t.itemName || t.category || '?';
            if (!buyMap[k]) buyMap[k] = { count: 0, total: 0 };
            buyMap[k].count += (t.amount || 1);
            buyMap[k].total += (t.price  || 0);
        });
        const topBuy = Object.entries(buyMap).sort((a,b) => b[1].total - a[1].total).slice(0,8);
        if (buyItems) {
            buyItems.innerHTML = topBuy.length ? topBuy.map(([item, d], i) =>
                `<div style="display:flex;align-items:center;gap:.5rem;padding:.35rem .5rem;border-bottom:1px solid var(--border);font-size:.8rem;">
                    <span style="width:18px;text-align:center;font-size:.7rem;color:var(--text-secondary);flex-shrink:0;">#${i+1}</span>
                    <span style="flex:1;font-weight:700;">${escapeHtml(item)}</span>
                    <span style="color:var(--text-secondary);font-size:.72rem;">${d.count} szt.</span>
                    <span style="font-weight:800;color:#ef4444;">${d.total.toFixed(2)}$</span>
                </div>`).join('')
            : '<div style="text-align:center;padding:1rem;color:var(--text-secondary);font-size:.8rem;">Brak kupna dziś</div>';
        }

        // ── Top sprzedawanych DZIŚ ─────────────────────────────────────────────
        const sellMap = {};
        txDay.filter(t => t.type === 'SELL').forEach(t => {
            const k = t.itemName || t.category || '?';
            if (!sellMap[k]) sellMap[k] = { count: 0, total: 0 };
            sellMap[k].count += (t.amount || 1);
            sellMap[k].total += (t.price  || 0);
        });
        const topSell = Object.entries(sellMap).sort((a,b) => b[1].total - a[1].total).slice(0,8);
        if (sellItems) {
            sellItems.innerHTML = topSell.length ? topSell.map(([item, d], i) =>
                `<div style="display:flex;align-items:center;gap:.5rem;padding:.35rem .5rem;border-bottom:1px solid var(--border);font-size:.8rem;">
                    <span style="width:18px;text-align:center;font-size:.7rem;color:var(--text-secondary);flex-shrink:0;">#${i+1}</span>
                    <span style="flex:1;font-weight:700;">${escapeHtml(item)}</span>
                    <span style="color:var(--text-secondary);font-size:.72rem;">${d.count} szt.</span>
                    <span style="font-weight:800;color:#10b981;">${d.total.toFixed(2)}$</span>
                </div>`).join('')
            : '<div style="text-align:center;padding:1rem;color:var(--text-secondary);font-size:.8rem;">Brak sprzedaży dziś</div>';
        }

        // ── Topka zarabiających DZIŚ (sprzedaż) ───────────────────────────────
        const earnMap = {};
        txDay.filter(t => t.type === 'SELL').forEach(t => {
            const k = t.playerName || '?';
            if (!earnMap[k]) earnMap[k] = { total: 0, uuid: t.uuid };
            earnMap[k].total += (t.price || 0);
        });
        const topEarners = Object.entries(earnMap).sort((a,b) => b[1].total - a[1].total).slice(0,8);
        if (topEarn) {
            const medals = ['🥇','🥈','🥉'];
            topEarn.innerHTML = topEarners.length ? topEarners.map(([name, d], i) =>
                `<div style="display:flex;align-items:center;gap:.5rem;padding:.4rem .5rem;border-bottom:1px solid var(--border);font-size:.82rem;">
                    <span style="width:22px;text-align:center;flex-shrink:0;">${i<3 ? medals[i] : '<span style="font-size:.7rem;color:var(--text-secondary);">#'+(i+1)+'</span>'}</span>
                    <img src="https://mc-heads.net/avatar/${encodeURIComponent(name)}/20" style="width:20px;height:20px;border-radius:4px;image-rendering:pixelated;flex-shrink:0;">
                    <span style="flex:1;font-weight:700;">${escapeHtml(name)}</span>
                    <span style="font-weight:800;color:#10b981;">${d.total.toFixed(2)}$</span>
                </div>`).join('')
            : '<div style="text-align:center;padding:1rem;color:var(--text-secondary);font-size:.8rem;">Brak sprzedaży dziś</div>';
        }

        // ── Topka wydających DZIŚ (kupno) ──────────────────────────────────────
        const spendMap = {};
        txDay.filter(t => t.type === 'BUY').forEach(t => {
            const k = t.playerName || '?';
            if (!spendMap[k]) spendMap[k] = { total: 0 };
            spendMap[k].total += (t.price || 0);
        });
        const topSpenders = Object.entries(spendMap).sort((a,b) => b[1].total - a[1].total).slice(0,8);
        if (topSpend) {
            const medals = ['🥇','🥈','🥉'];
            topSpend.innerHTML = topSpenders.length ? topSpenders.map(([name, d], i) =>
                `<div style="display:flex;align-items:center;gap:.5rem;padding:.4rem .5rem;border-bottom:1px solid var(--border);font-size:.82rem;">
                    <span style="width:22px;text-align:center;flex-shrink:0;">${i<3 ? medals[i] : '<span style="font-size:.7rem;color:var(--text-secondary);">#'+(i+1)+'</span>'}</span>
                    <img src="https://mc-heads.net/avatar/${encodeURIComponent(name)}/20" style="width:20px;height:20px;border-radius:4px;image-rendering:pixelated;flex-shrink:0;">
                    <span style="flex:1;font-weight:700;">${escapeHtml(name)}</span>
                    <span style="font-weight:800;color:#ef4444;">${d.total.toFixed(2)}$</span>
                </div>`).join('')
            : '<div style="text-align:center;padding:1rem;color:var(--text-secondary);font-size:.8rem;">Brak kupna dziś</div>';
        }

    } catch(e) {
        if (dailyEl) dailyEl.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:1rem;color:#ef4444;font-size:.82rem;">Błąd: ${escapeHtml(e.message)}</div>`;
    }
}

async function loadCShopOverview() {
    const el = document.getElementById('cshop-overview');
    if (!el) return;
    try {
        // Policz z historii transakcji
        const snap = await getDocs(query(collection(db, 'cshop_transactions'), orderBy('timestamp', 'desc')));
        const txns = snap.docs.map(d => d.data());
        const totalBuy  = txns.filter(t => t.type === 'BUY').reduce((s, t) => s + (t.price || 0), 0);
        const totalSell = txns.filter(t => t.type === 'SELL').reduce((s, t) => s + (t.price || 0), 0);
        const uniqPlayers = new Set(txns.map(t => t.uuid)).size;

        el.innerHTML = [
            ['fa-arrow-up-from-bracket', '#ef4444', 'Zakupy (łącznie)', totalBuy.toLocaleString('pl-PL', {minimumFractionDigits:2, maximumFractionDigits:2}) + '$'],
            ['fa-arrow-down-to-bracket', '#10b981', 'Sprzedaż (łącznie)', totalSell.toLocaleString('pl-PL', {minimumFractionDigits:2, maximumFractionDigits:2}) + '$'],
            ['fa-receipt', '#3b82f6', 'Transakcji', txns.length.toLocaleString('pl-PL')],
            ['fa-users', '#8b5cf6', 'Aktywnych graczy', uniqPlayers.toString()]
        ].map(([icon, color, label, value]) =>
            `<div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:.7rem;text-align:center;">
                <i class="fa-solid ${icon}" style="color:${color};font-size:.9rem;"></i>
                <div style="font-size:.62rem;color:var(--text-secondary);text-transform:uppercase;margin:.2rem 0 .1rem;">${label}</div>
                <div style="font-size:.9rem;font-weight:800;color:${color};">${value}</div>
            </div>`
        ).join('');
    } catch(e) {
        el.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:1rem;color:#ef4444;font-size:.8rem;">Błąd: ${e.message}</div>`;
    }
}

async function loadCShopTopList(stat, containerId, color, unit) {
    const el = document.getElementById(containerId);
    if (!el) return;
    try {
        const snap = await getDoc(doc(db, 'cshop_top', stat));
        if (!snap.exists()) {
            el.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--text-secondary);font-size:.8rem;">Brak danych — plugin musi być uruchomiony.</div>';
            return;
        }
        const entries = (snap.data().entries || []).slice(0, 10);
        if (!entries.length) { el.innerHTML = '<div style="text-align:center;padding:.8rem;color:var(--text-secondary);font-size:.8rem;">Brak danych.</div>'; return; }
        const medals = ['🥇','🥈','🥉'];
        el.innerHTML = entries.map((e, i) => {
            const val = typeof e.value === 'number' ? (Number.isInteger(e.value) ? e.value.toLocaleString('pl-PL') : e.value.toFixed(2)) : e.value;
            return `<div style="display:flex;align-items:center;gap:.5rem;padding:.4rem .5rem;border-bottom:1px solid var(--border);font-size:.82rem;">
                <span style="width:22px;text-align:center;flex-shrink:0;">${i < 3 ? medals[i] : '<span style="color:var(--text-secondary);font-size:.72rem;">#' + (i+1) + '</span>'}</span>
                <img src="https://mc-heads.net/avatar/${encodeURIComponent(e.player||'Steve')}/20" style="width:20px;height:20px;border-radius:4px;image-rendering:pixelated;flex-shrink:0;">
                <span style="flex:1;font-weight:700;">${escapeHtml(e.player||'?')}</span>
                <span style="font-weight:800;color:${color};">${val} ${unit}</span>
            </div>`;
        }).join('');
    } catch(e) {
        el.innerHTML = `<div style="padding:.5rem;color:#ef4444;font-size:.75rem;">Błąd: ${e.message}</div>`;
    }
}

async function loadCShopHistory() {
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="table-loading"><i class="fa-solid fa-spinner fa-spin"></i> Ładowanie...</td></tr>';
    try {
        const snap = await getDocs(query(collection(db, 'cshop_transactions'), orderBy('timestamp', 'desc')));
        _cshopAllHistory = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        cshopFilterHistory();
    } catch(e) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:1rem;color:#ef4444;font-size:.85rem;">Błąd: ${e.message}</td></tr>`;
    }
}

window.cshopFilterHistory = function() {
    const tbody = document.getElementById('cshop-history-tbody');
    if (!tbody) return;
    const s = (document.getElementById('cshop-hist-search')?.value || '').toLowerCase();
    const t = document.getElementById('cshop-hist-type')?.value || '';
    const filtered = _cshopAllHistory.filter(tx => {
        if (s && !(tx.playerName || '').toLowerCase().includes(s)) return false;
        if (t && tx.type !== t) return false;
        return true;
    });
    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="table-empty">Brak transakcji</td></tr>';
        return;
    }
    tbody.innerHTML = filtered.slice(0, 200).map(tx => {
        const isB = tx.type === 'BUY';
        const typeHtml = isB
            ? '<span class="badge" style="background:rgba(59,130,246,.12);color:#3b82f6;">⬆ Kupno</span>'
            : '<span class="badge" style="background:rgba(16,185,129,.12);color:#059669;">⬇ Sprzedaż</span>';
        const ts = tx.timestamp ? new Date(tx.timestamp).toLocaleString('pl-PL') : '—';
        return `<tr>
            <td><div class="player-cell">${head(tx.playerName||'?')}<div class="player-name">${escapeHtml(tx.playerName||'?')}</div></div></td>
            <td style="font-size:.82rem;">${escapeHtml(tx.itemName||'?')}</td>
            <td style="font-weight:700;text-align:center;">${tx.amount||1}</td>
            <td style="font-weight:800;color:${isB ? '#3b82f6' : '#10b981'};">${Number(tx.price||0).toFixed(2)}$</td>
            <td>${typeHtml}</td>
            <td style="font-size:.78rem;color:var(--text-secondary);">${escapeHtml(tx.category||'—')}</td>
            <td style="font-size:.78rem;color:var(--text-secondary);white-space:nowrap;">${ts}</td>
        </tr>`;
    }).join('');
};

// ── CShop Tax Config ───────────────────────────────────────────────────────────

async function loadCShopTaxConfig() {
    const tiersEl  = document.getElementById('cshop-tax-tiers');
    const enableCb = document.getElementById('cshop-tax-enabled');
    if (!tiersEl) return;
    try {
        const snap = await getDoc(doc(db, 'cshop_config', 'taxes'));
        if (!snap.exists()) {
            tiersEl.innerHTML = '<div style="font-size:.8rem;color:var(--text-secondary);text-align:center;padding:.8rem;">Brak danych — uruchom plugin CShop z firebase.enabled=true.</div>';
            return;
        }
        const data = snap.data();
        if (enableCb) {
            enableCb.checked = data.enabled !== false;
            _updateTaxToggleUI(enableCb.checked);
        }
        _cshopTaxTiers = data.tiers || [];
        _renderTaxTiers();
    } catch(e) {
        tiersEl.innerHTML = `<div style="font-size:.8rem;color:#ef4444;padding:.5rem;">Błąd: ${e.message}</div>`;
    }
}

function _renderTaxTiers() {
    const el = document.getElementById('cshop-tax-tiers');
    if (!el) return;
    if (!_cshopTaxTiers.length) {
        el.innerHTML = '<div style="font-size:.8rem;color:var(--text-secondary);text-align:center;padding:.8rem;">Brak progów podatkowych.</div>';
        return;
    }
    el.innerHTML = _cshopTaxTiers.map((tier, idx) => `
        <div style="background:var(--bg);border:1.5px solid var(--border);border-radius:10px;padding:.75rem;position:relative;" id="cshop-tier-${idx}">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem;">
                <div style="font-weight:800;font-size:.88rem;color:var(--text-primary);">
                    <i class="fa-solid fa-layer-group" style="color:#f59e0b;margin-right:.3rem;"></i>${escapeHtml(tier.name||'Próg '+(idx+1))}
                </div>
                <button onclick="cshopDeleteTier(${idx})" style="background:transparent;border:none;color:var(--text-secondary);cursor:pointer;font-size:.8rem;padding:.2rem .4rem;">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem;font-size:.78rem;">
                <div>
                    <label style="color:var(--text-secondary);font-weight:600;display:block;margin-bottom:.15rem;">Nazwa</label>
                    <input type="text" value="${escapeHtml(tier.name||'')}" onchange="_cshopTierChange(${idx},'name',this.value)"
                        style="width:100%;padding:.35rem .5rem;border:1px solid var(--border);border-radius:6px;font-size:.8rem;background:var(--bg-card);color:var(--text-primary);font-family:var(--font);">
                </div>
                <div>
                    <label style="color:var(--text-secondary);font-weight:600;display:block;margin-bottom:.15rem;">Próg (min $)</label>
                    <input type="number" value="${tier.threshold||0}" min="0" onchange="_cshopTierChange(${idx},'threshold',+this.value)"
                        style="width:100%;padding:.35rem .5rem;border:1px solid var(--border);border-radius:6px;font-size:.8rem;background:var(--bg-card);color:var(--text-primary);font-family:var(--font);">
                </div>
                <div>
                    <label style="color:var(--text-secondary);font-weight:600;display:block;margin-bottom:.15rem;">Podatek wejściowy min %</label>
                    <input type="number" value="${tier.entryMin||0}" min="0" step="0.01" onchange="_cshopTierChange(${idx},'entryMin',+this.value)"
                        style="width:100%;padding:.35rem .5rem;border:1px solid var(--border);border-radius:6px;font-size:.8rem;background:var(--bg-card);color:var(--text-primary);font-family:var(--font);">
                </div>
                <div>
                    <label style="color:var(--text-secondary);font-weight:600;display:block;margin-bottom:.15rem;">Podatek wejściowy max %</label>
                    <input type="number" value="${tier.entryMax||0}" min="0" step="0.01" onchange="_cshopTierChange(${idx},'entryMax',+this.value)"
                        style="width:100%;padding:.35rem .5rem;border:1px solid var(--border);border-radius:6px;font-size:.8rem;background:var(--bg-card);color:var(--text-primary);font-family:var(--font);">
                </div>
                <div>
                    <label style="color:var(--text-secondary);font-weight:600;display:block;margin-bottom:.15rem;">Kupno + min %</label>
                    <input type="number" value="${tier.buyIncreaseMin||0}" min="0" step="0.1" onchange="_cshopTierChange(${idx},'buyIncreaseMin',+this.value)"
                        style="width:100%;padding:.35rem .5rem;border:1px solid var(--border);border-radius:6px;font-size:.8rem;background:var(--bg-card);color:var(--text-primary);font-family:var(--font);">
                </div>
                <div>
                    <label style="color:var(--text-secondary);font-weight:600;display:block;margin-bottom:.15rem;">Kupno + max %</label>
                    <input type="number" value="${tier.buyIncreaseMax||0}" min="0" step="0.1" onchange="_cshopTierChange(${idx},'buyIncreaseMax',+this.value)"
                        style="width:100%;padding:.35rem .5rem;border:1px solid var(--border);border-radius:6px;font-size:.8rem;background:var(--bg-card);color:var(--text-primary);font-family:var(--font);">
                </div>
                <div>
                    <label style="color:var(--text-secondary);font-weight:600;display:block;margin-bottom:.15rem;">Sprzedaż - min %</label>
                    <input type="number" value="${tier.sellDecreaseMin||0}" min="0" step="0.1" onchange="_cshopTierChange(${idx},'sellDecreaseMin',+this.value)"
                        style="width:100%;padding:.35rem .5rem;border:1px solid var(--border);border-radius:6px;font-size:.8rem;background:var(--bg-card);color:var(--text-primary);font-family:var(--font);">
                </div>
                <div>
                    <label style="color:var(--text-secondary);font-weight:600;display:block;margin-bottom:.15rem;">Sprzedaż - max %</label>
                    <input type="number" value="${tier.sellDecreaseMax||0}" min="0" step="0.1" onchange="_cshopTierChange(${idx},'sellDecreaseMax',+this.value)"
                        style="width:100%;padding:.35rem .5rem;border:1px solid var(--border);border-radius:6px;font-size:.8rem;background:var(--bg-card);color:var(--text-primary);font-family:var(--font);">
                </div>
            </div>
            <button onclick="cshopSaveTier(${idx})" style="width:100%;margin-top:.5rem;padding:.4rem;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border:none;border-radius:7px;font-size:.78rem;font-weight:800;cursor:pointer;font-family:var(--font);">
                <i class="fa-solid fa-floppy-disk"></i> Zapisz próg
            </button>
        </div>`).join('');
}

window._cshopTierChange = function(idx, field, value) {
    if (_cshopTaxTiers[idx]) _cshopTaxTiers[idx][field] = value;
};

window.cshopSaveTier = async function(idx) {
    if (!requirePermission('all', 'edycja podatków')) return;
    try {
        const enabled = document.getElementById('cshop-tax-enabled')?.checked ?? true;
        await setDoc(doc(db, 'cshop_config', 'taxes'), {
            enabled,
            tiers: _cshopTaxTiers,
            updatedAt: new Date().toISOString(),
            updatedBy: currentUser?.displayName || 'Panel'
        });
        showToast('success', `Próg "${_cshopTaxTiers[idx]?.name}" zapisany! Plugin pobierze zmiany w ciągu 60s.`);
    } catch(e) { showToast('error', 'Błąd: ' + e.message); }
};

window.cshopSaveTaxEnabled = async function(enabled) {
    if (!requirePermission('all', 'edycja podatków')) return;
    _updateTaxToggleUI(enabled);
    try {
        await updateDoc(doc(db, 'cshop_config', 'taxes'), {
            enabled,
            updatedAt: new Date().toISOString(),
            updatedBy: currentUser?.displayName || 'Panel'
        });
        showToast('success', `Podatki ${enabled ? 'włączone' : 'wyłączone'}! Plugin pobierze zmianę w ciągu 60s.`);
    } catch(e) { showToast('error', 'Błąd: ' + e.message); }
};

function _updateTaxToggleUI(enabled) {
    const slider = document.getElementById('cshop-tax-slider');
    if (!slider) return;
    slider.style.background = enabled ? '#10b981' : '#374151';
    const knob = slider.querySelector('span');
    if (knob) knob.style.transform = enabled ? 'translateX(16px)' : 'translateX(0)';
}

window.cshopAddTier = function() {
    _cshopTaxTiers.push({
        name: 'nowy_prog',
        threshold: 0,
        entryEnabled: false, entryMin: 0, entryMax: 0,
        pricesEnabled: true, buyIncreaseMin: 0, buyIncreaseMax: 0,
        sellDecreaseMin: 0, sellDecreaseMax: 0
    });
    _renderTaxTiers();
    // Przewiń do nowego
    const tiers = document.getElementById('cshop-tax-tiers');
    if (tiers) tiers.lastElementChild?.scrollIntoView({ behavior: 'smooth' });
};

window.cshopDeleteTier = function(idx) {
    if (!confirm(`Usunąć próg "${_cshopTaxTiers[idx]?.name}"?`)) return;
    _cshopTaxTiers.splice(idx, 1);
    _renderTaxTiers();
    showToast('info', 'Próg usunięty — kliknij "Zapisz" aby potwierdzić.');
};

// ── CShop Items Manager — aliasy dla kompatybilności z HTML ───────────────────

// Antigravity zaimplementował pełną wersję (window.loadCShopItemsManager,
// _cshopAllItemsData, _renderCShopItemsTable, cshopSaveItemPrice, _cshopSetCategory)
// Tutaj dodajemy tylko bridge dla przycisków w HTML które używają cshopShowItemsCat

window.cshopShowItemsCat = function(cat) {
    if (typeof window._cshopSetCategory === 'function') {
        window._cshopSetCategory(cat === '' ? 'all' : cat);
    }
};

// Bulk save — zapisuje wszystkie widoczne zmiany naraz
window.cshopSaveAllPrices = async function() {
    if (!requirePermission('cshop_manage', 'zarządzanie CShop')) return;
    const data = window._cshopAllItemsData || {};
    const entries = Object.keys(data);
    const updates = {};
    let changed = 0;
    for (const key of entries) {
        const item = data[key];
        if (!item) continue;
        const cat  = item.category;
        const slot = item.slot;
        const buyEl  = document.getElementById(`cshop-buy-${cat}-${slot}`);
        const sellEl = document.getElementById(`cshop-sell-${cat}-${slot}`);
        const rawBuy  = buyEl?.value.trim();
        const rawSell = sellEl?.value.trim();
        if (rawBuy  !== '' && parseFloat(rawBuy)  !== (item.buyPrice  ?? NaN)) { updates[`${key}.buyPrice`]  = parseFloat(rawBuy);  changed++; }
        if (rawSell !== '' && parseFloat(rawSell) !== (item.sellPrice ?? NaN)) { updates[`${key}.sellPrice`] = parseFloat(rawSell); changed++; }
    }
    if (!changed) { showToast('info', 'Brak zmian.'); return; }
    try {
        await setDoc(doc(db, 'cshop_config', 'items'), updates, { merge: true });
        showToast('success', `💾 Zapisano ${changed} zmian! Plugin odświeży za ~60s.`);
        await window.loadCShopItemsManager();
    } catch(e) { showToast('error', 'Błąd: ' + e.message); }
};

// ── Top rankingi ──────────────────────────────────────────────────────────────

// ── Top rankingi ──────────────────────────────────────────────────────────────

async function loadCStatsTop() {
    const stat = document.getElementById('cstats-top-stat')?.value || 'kills';
    const list = document.getElementById('cstats-top-list');
    if (!list) return;
    list.innerHTML = '<div style="text-align:center;padding:1.5rem;color:var(--text-secondary);font-size:.85rem;"><i class="fa-solid fa-spinner fa-spin"></i> Ładowanie...</div>';

    try {
        const snap = await getDocs(query(collection(db, 'cstats_top')));
        const topDoc = snap.docs.find(d => d.id === stat);

        if (!topDoc) {
            list.innerHTML = '<div style="text-align:center;padding:1.5rem;color:var(--text-secondary);font-size:.85rem;">Brak danych — poczekaj na sync pluginu.</div>';
            return;
        }

        const entries = (topDoc.data().entries || []).slice(0, 50);
        if (!entries.length) {
            list.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--text-secondary);">Brak graczy w rankingu.</div>';
            return;
        }

        const medals = ['🥇','🥈','🥉'];
        const activeUuid = _cstatsSelectedPlayer?.uuid;
        list.innerHTML = entries.map((e, i) => {
            const rankIcon = i < 3 ? medals[i] : `<span style="color:var(--text-secondary);font-size:.78rem;">#${e.rank}</span>`;
            const val = stat === 'playtime' ? fmtPlaytime(e.value)
                      : stat === 'kdr'     ? Number(e.value).toFixed(2)
                      : stat.includes('damage') ? Math.round(e.value).toLocaleString('pl-PL')
                      : Math.round(e.value).toLocaleString('pl-PL');
            const isActive = activeUuid === e.uuid;
            const bg = isActive ? 'rgba(139,92,246,.12)' : '';
            return `<div class="cstats-top-entry" data-name="${escapeHtml(e.player||'')}" data-uuid="${escapeHtml(e.uuid||'')}"
                        style="display:flex;align-items:center;gap:.6rem;padding:.5rem .65rem;border-bottom:1px solid var(--border);font-size:.84rem;cursor:pointer;background:${bg};border-left:${isActive ? '3px solid #8b5cf6;' : '3px solid transparent;'}padding-left:calc(.65rem - 3px);transition:background .1s;"
                        onmouseenter="if(!this.dataset.active)this.style.background='rgba(139,92,246,.06)'"
                        onmouseleave="if(!this.dataset.active)this.style.background='${bg}'">
                <span style="width:28px;text-align:center;flex-shrink:0;">${rankIcon}</span>
                <img src="https://mc-heads.net/avatar/${encodeURIComponent(e.player||'Steve')}/24" style="width:24px;height:24px;border-radius:5px;image-rendering:pixelated;flex-shrink:0;">
                <span style="flex:1;font-weight:700;">${escapeHtml(e.player||'?')}</span>
                <span style="color:var(--accent-blue);font-weight:800;">${val}</span>
                <i class="fa-solid fa-arrow-up-right-from-square" style="color:var(--text-secondary);font-size:.65rem;opacity:.6;"></i>
            </div>`;
        }).join('');
        // Podłącz click — klik na gracza w topce = wyszukaj i otwórz
        list.querySelectorAll('.cstats-top-entry').forEach(el => {
            if (activeUuid === el.getAttribute('data-uuid')) el.dataset.active = '1';
            el.onclick = () => {
                const n = el.getAttribute('data-name');
                const u = el.getAttribute('data-uuid');
                if (n && u) {
                    document.getElementById('cstats-edit-nick').value = n;
                    cstatsSelectPlayer(n, u);
                    showToast('info', '📊 Wczytano ' + n + ' z rankingu');
                }
            };
        });
    } catch(err) {
        list.innerHTML = `<div style="padding:.8rem;color:#ef4444;font-size:.82rem;">Błąd: ${err.message}</div>`;
    }
}

function fmtPlaytime(secs) {
    const s = Math.round(secs);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

// ── Wyszukiwanie gracza CStats ────────────────────────────────────────────────

// Debounce dla wyszukiwarki gracza — nie pobieraj Firestore przy każdej literze
let _cstatsSearchTimer = null;
let _cstatsAllPlayers = null; // cache całej listy graczy (jedno pobranie)

/** Wyczyść wybór gracza — ukryj staty, wyczyść input */
window.cstatsClearPlayer = function() {
    _cstatsSelectedPlayer = null;
    const input = document.getElementById('cstats-edit-nick');
    if (input) input.value = '';
    const statsDiv = document.getElementById('cstats-player-stats');
    if (statsDiv) statsDiv.style.display = 'none';
    const sug = document.getElementById('cstats-suggestions');
    if (sug) sug.style.display = 'none';
    const grid = document.getElementById('cstats-player-statgrid');
    if (grid) grid.innerHTML = '<div style="color:var(--text-secondary);text-align:center;padding:2rem;font-size:.88rem;">Wpisz nick powyżej, aby zobaczyć statystyki.</div>';
    const achDiv = document.getElementById('cstats-achievements');
    if (achDiv) achDiv.innerHTML = '<div style="color:var(--text-secondary);text-align:center;padding:1.5rem;font-size:.85rem;">Wpisz nick powyżej.</div>';
    const achName = document.getElementById('cstats-ach-player');
    if (achName) achName.textContent = '';
    loadCStatsTop(); // odśwież topkę (usuń podświetlenie)
    if (input) input.focus();
};

window.cstatsSearchPlayer = function(val) {
    const sug = document.getElementById('cstats-suggestions');
    if (!sug) return;
    // Debounce 200ms — czeka aż user skończy pisać
    clearTimeout(_cstatsSearchTimer);
    if (!val || val.trim().length < 1) { sug.style.display = 'none'; return; }
    _cstatsSearchTimer = setTimeout(() => _cstatsDoSearch(val.trim()), 200);
};

async function _cstatsDoSearch(val) {
    const sug = document.getElementById('cstats-suggestions');
    if (!sug) return;
    sug.innerHTML = '<div style="padding:.6rem .8rem;color:var(--text-secondary);font-size:.8rem;"><i class="fa-solid fa-spinner fa-spin"></i> Szukam...</div>';
    sug.style.display = 'block';

    try {
        // Pobierz cache graczy raz (z cstats_players) — potem filtruj lokalnie
        if (!_cstatsAllPlayers) {
            const snap = await getDocs(query(collection(db, 'cstats_players'), limit(2000)));
            _cstatsAllPlayers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
        const q = val.toLowerCase();
        // Pasuje po name, nick, uuid — posortowane: dokładne > zaczyna się od > zawiera
        const all = _cstatsAllPlayers.map(p => {
            const n = (p.name || p.nick || p.id || '').toLowerCase();
            let score = -1;
            if (n === q) score = 100;
            else if (n.startsWith(q)) score = 80;
            else if (n.includes(q)) score = 60;
            else if ((p.uuid||'').toLowerCase().includes(q)) score = 40;
            return { p, score, name: p.name || p.nick || p.id };
        }).filter(x => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 10);

        if (!all.length) {
            sug.innerHTML = `<div style="padding:.7rem .8rem;color:var(--text-secondary);font-size:.82rem;text-align:center;">❌ Brak gracza "${escapeHtml(val)}"</div>`;
            return;
        }

        sug.innerHTML = all.map(({p, name}) => {
            // Bezpieczne przekazanie danych — używamy data-attr zamiast onclick string
            const uuid = p.uuid || p.id;
            const kills = Math.round(p.kills||0);
            // Podświetl pasujący fragment
            const hl = _highlightMatch(name, val);
            return `<div class="cstats-sug-item" data-name="${escapeHtml(name)}" data-uuid="${escapeHtml(uuid)}"
                        style="padding:.55rem .8rem;cursor:pointer;display:flex;align-items:center;gap:.6rem;font-size:.88rem;font-weight:600;border-bottom:1px solid var(--border);transition:background .1s;"
                        onmouseenter="this.style.background='rgba(139,92,246,.1)';this.style.borderLeft='3px solid #8b5cf6';this.style.paddingLeft='calc(.8rem - 3px)';"
                        onmouseleave="this.style.background='';this.style.borderLeft='';this.style.paddingLeft='.8rem';">
                    <img src="https://mc-heads.net/avatar/${encodeURIComponent(name||'Steve')}/28" style="width:28px;height:28px;border-radius:5px;image-rendering:pixelated;flex-shrink:0;">
                    <span style="flex:1;">${hl}</span>
                    <span style="font-size:.72rem;color:#dc2626;font-weight:700;">⚔ ${kills}</span>
                    <i class="fa-solid fa-chevron-right" style="color:var(--text-secondary);font-size:.7rem;"></i>
                </div>`;
        }).join('');

        // Podłącz click przez event delegation (bezpieczne — bez onclick string)
        sug.querySelectorAll('.cstats-sug-item').forEach(el => {
            el.onclick = () => {
                const n = el.getAttribute('data-name');
                const u = el.getAttribute('data-uuid');
                cstatsSelectPlayer(n, u);
            };
        });
    } catch(e) {
        console.error('[CStats] search error:', e);
        sug.innerHTML = `<div style="padding:.6rem .8rem;color:#ef4444;font-size:.8rem;">Błąd: ${escapeHtml(e.message)}</div>`;
    }
}

/** Podświetla pasujący fragment pogrubieniem */
function _highlightMatch(name, query) {
    if (!name || !query) return escapeHtml(name||'');
    const n = String(name);
    const idx = n.toLowerCase().indexOf(query.toLowerCase());
    if (idx < 0) return escapeHtml(n);
    return escapeHtml(n.substring(0, idx))
         + '<b style="color:#8b5cf6;">' + escapeHtml(n.substring(idx, idx + query.length)) + '</b>'
         + escapeHtml(n.substring(idx + query.length));
}

/** Renderuje siatkę kart statystyk gracza w div #cstats-player-statgrid */
function renderCStatsGrid(p) {
    const grid = document.getElementById('cstats-player-statgrid');
    if (!grid) return;
    const fmt = v => (v === undefined || v === null) ? '0' : (typeof v === 'number' ? Math.round(v).toLocaleString('pl-PL') : v);
    // Karty: [ikona, etykieta, wartość, kolor]
    const cards = [
        ['⚔️', 'Zabójstwa',    fmt(p.kills),        '#dc2626'],
        ['💀', 'Śmierci',      fmt(p.deaths),       '#9ca3af'],
        ['🔥', 'Killstreak',   fmt(p.killstreak),   '#f59e0b'],
        ['⭐', 'Max Streak',   fmt(p.maxKillstreak),'#8b5cf6'],
        ['⛏️', 'Wykopane',     fmt(p.blocksMined),  '#38bdf8'],
        ['💎', 'Rudy',         fmt(p.oresMined),    '#22d3ee'],
        ['🧱', 'Postawione',   fmt(p.blocksPlaced), '#84cc16'],
        ['🧟', 'Zabite moby',  fmt(p.mobsKilled),   '#a3e635'],
        ['💥', 'Zadane dmg',   fmt(p.damageDealt),  '#f43f5e'],
        ['🛡️', 'Otrzymane',    fmt(p.damageReceived),'#fb923c'],
        ['🏃', 'Dystans',      fmt(p.distanceTraveled) + ' m', '#60a5fa'],
        ['🦘', 'Skoki',        fmt(p.jumps),        '#34d399'],
        ['⏱️', 'Czas gry',     fmtPlaytime(p.playtime||0), '#eab308'],
        ['🎯', 'Punkty',       fmt(p.points),       '#f59e0b'],
        ['🍏', 'Koksy',        fmt(p.koksyEaten),   '#ef4444'],
        ['🥇', 'Refy',         fmt(p.refyEaten),    '#fbbf24'],
        ['🧪', 'Mikstury',     fmt(p.potionsDrunk), '#a78bfa'],
        ['🔮', 'Perły',        fmt(p.pearlsThrown), '#c084fc'],
        ['🏹', 'Strzały',      fmt(p.arrowsShot),   '#fbbf24'],
        ['💬', 'Wiadomości',   fmt(p.messagesSent), '#94a3b8'],
        ['⌨️', 'Komendy',      fmt(p.commandsUsed), '#64748b'],
        ['🛠️', 'Craftowane',   fmt(p.itemsCrafted), '#fb923c'],
        ['📦', 'Skrzynie prem.',fmt(p.premiumChests),'#ec4899'],
        ['🏆', 'Wygrane eventy',fmt(p.eventsWon),   '#f59e0b'],
    ];
    grid.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:.6rem;">` +
        cards.map(([icon, label, val, color]) =>
            `<div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:.7rem .6rem;text-align:center;transition:transform .12s,border-color .12s;"
                  onmouseenter="this.style.transform='translateY(-2px)';this.style.borderColor='${color}';"
                  onmouseleave="this.style.transform='';this.style.borderColor='var(--border)';">
                <div style="font-size:1.3rem;margin-bottom:.2rem;">${icon}</div>
                <div style="font-size:.65rem;color:var(--text-secondary);text-transform:uppercase;font-weight:600;margin-bottom:.15rem;">${escapeHtml(label)}</div>
                <div style="font-size:.95rem;font-weight:800;color:${color};">${escapeHtml(String(val))}</div>
            </div>`
        ).join('') +
        `</div>`;
}

window.cstatsSelectPlayer = async function(name, uuid) {
    const sug = document.getElementById('cstats-suggestions');
    const input = document.getElementById('cstats-edit-nick');
    if (sug) sug.style.display = 'none';
    if (input) input.value = name;

    const statsDiv = document.getElementById('cstats-player-stats');
    const infoDiv  = document.getElementById('cstats-player-info');
    if (!statsDiv || !infoDiv) return;

    try {
        const snap = await getDoc(doc(db, 'cstats_players', uuid));
        if (!snap.exists()) { statsDiv.style.display = 'none'; return; }

        const p = snap.data();
        _cstatsSelectedPlayer = { name, uuid, stats: p };

        infoDiv.innerHTML = `
            <img src="https://mc-heads.net/avatar/${encodeURIComponent(name)}/40" style="width:40px;height:40px;border-radius:8px;image-rendering:pixelated;">
            <div style="flex:1;">
                <div style="font-weight:800;font-size:1rem;">${escapeHtml(name)}</div>
                <div style="font-size:.74rem;color:var(--text-secondary);margin-top:.15rem;">
                    Kille: <b style="color:#dc2626;">${(p.kills||0).toLocaleString('pl-PL')}</b> •
                    Śmierci: <b>${(p.deaths||0).toLocaleString('pl-PL')}</b> •
                    KDR: <b style="color:#8b5cf6;">${(p.deaths > 0 ? (p.kills/p.deaths).toFixed(2) : (p.kills||0)).toString()}</b>
                </div>
                <div style="font-size:.74rem;color:var(--text-secondary);margin-top:.1rem;">
                    Czas: <b>${fmtPlaytime(p.playtime||0)}</b> •
                    Punkty: <b style="color:#f59e0b;">${Math.round(p.points||0).toLocaleString('pl-PL')}</b>
                </div>
            </div>`;

        // Renderuj siatkę statystyk (nowy div)
        renderCStatsGrid(p);

        statsDiv.style.display = 'block';

        // Załaduj osiągnięcia
        loadCStatsAchievements(p, name);
    } catch(e) {
        statsDiv.style.display = 'none';
        showToast('error', 'Błąd ładowania: ' + e.message);
    }
};

document.addEventListener('click', function(e) {
    const sug = document.getElementById('cstats-suggestions');
    const inp = document.getElementById('cstats-edit-nick');
    if (sug && inp && !inp.contains(e.target) && !sug.contains(e.target)) sug.style.display = 'none';
});

// ── Zapis statystyki ──────────────────────────────────────────────────────────

window.cstatsSaveStat = async function() {
    if (!requirePermission('all', 'edycja statystyk')) return;
    if (!_cstatsSelectedPlayer) { showToast('error', 'Wybierz gracza!'); return; }

    const stat    = document.getElementById('cstats-stat-name')?.value;
    const valStr  = document.getElementById('cstats-stat-value')?.value;
    const msgEl   = document.getElementById('cstats-edit-msg');
    if (!stat || valStr === '') { showToast('error', 'Wybierz statystykę i wartość!'); return; }

    const value = parseFloat(valStr);
    if (isNaN(value) || value < 0) { showToast('error', 'Nieprawidłowa wartość!'); return; }

    const oldValue = _cstatsSelectedPlayer.stats[stat] || 0;

    try {
        // Zapisz do Firestore cstats_players
        await updateDoc(doc(db, 'cstats_players', _cstatsSelectedPlayer.uuid), {
            [stat]: value,
            lastSync: new Date().toISOString()
        });

        // Zapisz log edycji
        await addDoc(collection(db, 'cstats_editlog'), {
            admin:     currentUser?.displayName || 'Panel',
            player:    _cstatsSelectedPlayer.name,
            stat,
            oldValue,
            newValue:  value,
            timestamp: serverTimestamp()
        });

        if (msgEl) {
            msgEl.className = 'success';
            msgEl.style.cssText = 'display:block;margin-top:.4rem;padding:.45rem .7rem;border-radius:6px;font-size:.8rem;font-weight:600;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.25);color:#059669;';
            msgEl.textContent = '✓ Zapisano! Zmiana zostanie pobrana przez plugin przy następnym sync.';
            setTimeout(() => { if(msgEl) msgEl.style.display = 'none'; }, 4000);
        }
        showToast('success', `Zaktualizowano ${stat} gracza ${_cstatsSelectedPlayer.name}`);
        await loadCStatsEditLog();
    } catch(e) {
        if (msgEl) {
            msgEl.style.cssText = 'display:block;margin-top:.4rem;padding:.45rem .7rem;border-radius:6px;font-size:.8rem;font-weight:600;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);color:#dc2626;';
            msgEl.textContent = 'Błąd: ' + e.message;
        }
    }
};

// ── Osiągnięcia gracza ────────────────────────────────────────────────────────

function loadCStatsAchievements(playerData, name) {
    const div     = document.getElementById('cstats-achievements');
    const nameEl  = document.getElementById('cstats-ach-player');
    if (!div) return;
    if (nameEl) nameEl.textContent = name;

    const unlocked = playerData.unlockedAchievements || [];
    const pending  = playerData.pendingAchievements  || [];
    const claimed  = playerData.claimedAchievements  || [];

    if (!unlocked.length && !pending.length && !claimed.length) {
        div.innerHTML = '<div style="text-align:center;padding:1.2rem;color:var(--text-secondary);font-size:.85rem;">Gracz nie ma jeszcze żadnych osiągnięć.</div>';
        return;
    }

    const all = [...new Set([...unlocked, ...pending, ...claimed])];
    div.innerHTML = `
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.75rem;">
            <span style="background:rgba(16,185,129,.1);color:#059669;border:1px solid rgba(16,185,129,.2);padding:.2rem .6rem;border-radius:999px;font-size:.75rem;font-weight:700;">✔ Odebrane: ${claimed.length}</span>
            <span style="background:rgba(245,158,11,.1);color:#d97706;border:1px solid rgba(245,158,11,.2);padding:.2rem .6rem;border-radius:999px;font-size:.75rem;font-weight:700;">⏳ Oczekujące: ${pending.length}</span>
            <span style="background:rgba(99,102,241,.1);color:#6366f1;border:1px solid rgba(99,102,241,.2);padding:.2rem .6rem;border-radius:999px;font-size:.75rem;font-weight:700;">🔓 Wszystkie: ${all.length}</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:.35rem;">
            ${all.map(id => {
                const isClaimed = claimed.includes(id);
                const isPending = pending.includes(id);
                const color = isClaimed ? '#059669' : isPending ? '#d97706' : '#6366f1';
                const bg    = isClaimed ? 'rgba(16,185,129,.08)' : isPending ? 'rgba(245,158,11,.08)' : 'rgba(99,102,241,.06)';
                const icon  = isClaimed ? '✔' : isPending ? '⏳' : '🔓';
                return `<span style="background:${bg};border:1px solid ${color}33;color:${color};padding:.2rem .55rem;border-radius:6px;font-size:.72rem;font-weight:700;" title="${id}">${icon} ${id}</span>`;
            }).join('')}
        </div>`;
}

// ── Historia edycji ───────────────────────────────────────────────────────────

async function loadCStatsEditLog() {
    const list = document.getElementById('cstats-editlog-list');
    if (!list) return;
    list.innerHTML = '<div style="text-align:center;padding:1.5rem;color:var(--text-secondary);font-size:.85rem;"><i class="fa-solid fa-spinner fa-spin"></i> Ładowanie...</div>';

    try {
        const snap = await getDocs(query(collection(db, 'cstats_editlog'), orderBy('timestamp', 'desc')));
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() })).slice(0, 100);

        if (!items.length) {
            list.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-secondary);font-size:.85rem;">Brak historii edycji.</div>';
            return;
        }

        list.innerHTML = items.map(log => {
            const diff = (log.newValue - log.oldValue);
            const sign = diff >= 0 ? '+' : '';
            const diffColor = diff >= 0 ? '#10b981' : '#ef4444';
            const ts = log.timestamp?.seconds
                ? new Date(log.timestamp.seconds * 1000).toLocaleString('pl-PL')
                : (log.timestamp || '—');
            return `<div style="display:flex;align-items:center;gap:.6rem;padding:.55rem 1rem;border-bottom:1px solid var(--border);font-size:.8rem;">
                <img src="https://mc-heads.net/avatar/${encodeURIComponent(log.player||'Steve')}/20" style="width:20px;height:20px;border-radius:3px;image-rendering:pixelated;flex-shrink:0;">
                <span style="font-weight:700;min-width:80px;">${escapeHtml(log.player||'?')}</span>
                <span style="background:rgba(59,130,246,.1);color:#3b82f6;padding:.1rem .45rem;border-radius:5px;font-size:.72rem;font-weight:700;">${escapeHtml(log.stat||'?')}</span>
                <span style="color:var(--text-secondary);">${Math.round(log.oldValue||0)} →</span>
                <span style="font-weight:800;">${Math.round(log.newValue||0)}</span>
                <span style="color:${diffColor};font-weight:700;">(${sign}${Math.round(diff)})</span>
                <span style="margin-left:auto;color:var(--text-secondary);font-size:.72rem;">👤 ${escapeHtml(log.admin||'?')} • ${ts}</span>
            </div>`;
        }).join('');
    } catch(e) {
        list.innerHTML = `<div style="padding:.8rem;color:#ef4444;font-size:.82rem;">Błąd: ${e.message}</div>`;
    }
}

// ── Status połączeń pluginów ──────────────────────────────────────────────────

async function loadPluginConnections() {
    const grid = document.getElementById('plugin-connections-grid');
    if (!grid) return;
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--text-secondary);"><i class="fa-solid fa-spinner fa-spin"></i> Sprawdzanie...</div>';

    const plugins = [
        {
            name: 'CritMC Panel',
            key: 'server_stats/current',
            icon: 'fa-shield-halved',
            color: '#ff1744',
            check: async () => {
                const snap = await getDoc(doc(db, 'server_stats', 'current'));
                if (!snap.exists()) return { ok: false, detail: 'Brak danych' };
                const d = snap.data();
                const last = d.lastUpdate ? new Date(d.lastUpdate) : null;
                const ageSec = last ? Math.floor((Date.now() - last) / 1000) : 9999;
                return {
                    ok: ageSec < 60,
                    detail: d.serverOnline
                        ? `Online: ${d.online}/${d.max} graczy • TPS: ${d.tps?.toFixed(1)||'?'}`
                        : 'Serwer offline',
                    lastUpdate: last ? last.toLocaleTimeString('pl-PL') : '—'
                };
            }
        },
        {
            name: 'CStats Plugin',
            key: 'cstats_players',
            icon: 'fa-chart-bar',
            color: '#10b981',
            check: async () => {
                const snap = await getDocs(query(collection(db, 'cstats_players')));
                const count = snap.size;
                if (!count) return { ok: false, detail: 'Brak danych graczy' };
                // Sprawdź ostatni sync
                const docs = snap.docs.map(d => d.data());
                const lastSync = docs.reduce((max, d) => {
                    if (!d.lastSync) return max;
                    const t = new Date(d.lastSync).getTime();
                    return t > max ? t : max;
                }, 0);
                const ageSec = lastSync ? Math.floor((Date.now() - lastSync) / 1000) : 9999;
                return {
                    ok: ageSec < 300,
                    detail: `${count} graczy w bazie`,
                    lastUpdate: lastSync ? new Date(lastSync).toLocaleTimeString('pl-PL') : '—'
                };
            }
        },
        {
            name: 'Cloudflare Worker (R2)',
            key: 'worker',
            icon: 'fa-cloud',
            color: '#f59e0b',
            check: async () => {
                const t0 = Date.now();
                try {
                    const res = await fetch(FILE_WORKER_URL + '/health', { signal: AbortSignal.timeout(5000) });
                    const ping = Date.now() - t0;
                    return { ok: res.ok || res.status === 404, detail: `Ping: ${ping}ms`, lastUpdate: 'teraz' };
                } catch(e) {
                    return { ok: false, detail: 'Niedostępny: ' + e.message };
                }
            }
        },
        {
            name: 'Firestore (REST API)',
            key: 'firestore',
            icon: 'fa-database',
            color: '#ff6d00',
            check: async () => {
                const t0 = Date.now();
                try {
                    await getDoc(doc(db, 'panel_settings', 'health_check'));
                    return { ok: true, detail: `Ping: ${Date.now() - t0}ms`, lastUpdate: 'teraz' };
                } catch(e) {
                    return { ok: false, detail: 'Błąd: ' + e.message };
                }
            }
        }
    ];

    const results = await Promise.allSettled(plugins.map(p => p.check()));

    grid.innerHTML = plugins.map((p, i) => {
        const r = results[i].status === 'fulfilled' ? results[i].value : { ok: false, detail: results[i].reason?.message || 'Błąd' };
        const statusColor = r.ok ? '#10b981' : '#ef4444';
        const statusText  = r.ok ? 'Połączony' : 'Brak połączenia';
        const statusIcon  = r.ok ? 'fa-circle-check' : 'fa-circle-xmark';
        return `<div class="table-card" style="padding:1.2rem;">
            <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.8rem;">
                <div style="width:40px;height:40px;border-radius:10px;background:${p.color}18;display:flex;align-items:center;justify-content:center;font-size:1.1rem;color:${p.color};">
                    <i class="fa-solid ${p.icon}"></i>
                </div>
                <div>
                    <div style="font-weight:800;font-size:.92rem;">${p.name}</div>
                    <div style="font-size:.72rem;color:${statusColor};font-weight:700;display:flex;align-items:center;gap:.3rem;">
                        <i class="fa-solid ${statusIcon}"></i> ${statusText}
                    </div>
                </div>
            </div>
            <div style="font-size:.8rem;color:var(--text-secondary);">${r.detail || ''}</div>
            ${r.lastUpdate ? `<div style="font-size:.72rem;color:var(--text-secondary);margin-top:.3rem;">Ostatni sync: ${r.lastUpdate}</div>` : ''}
        </div>`;
    }).join('');
}

// ─── CSHOP — PANEL (Antigravity extra stats) ─────────────────────────────────

/** loadCShopStats — alias do loadCShopOverview (Antigravity compat) */
async function loadCShopStats() { return loadCShopOverview(); }
/** loadCShopTransactions — alias do loadCShopHistory (Antigravity compat) */
async function loadCShopTransactions() { return loadCShopHistory(); }
/** loadCShopTop — alias do zbiorczego ładowania topek (Antigravity compat) */
async function loadCShopTop() {
    return Promise.allSettled([
        loadCShopTopList('top_spent',        'cshop-top-spent',        '#ef4444', '$'),
        loadCShopTopList('top_earned',       'cshop-top-earned',       '#10b981', '$'),
        loadCShopTopList('top_transactions', 'cshop-top-transactions', '#8b5cf6', 'transakcji')
    ]);
}

/** Karty ze statystykami ogólnymi CShop */
async function loadCShopStats() {
    const el = document.getElementById('cshop-stats-cards');
    if (!el) return;
    try {
        const snap = await getDocs(query(collection(db, 'cshop_stats')));
        const docs = snap.docs.map(d => d.data());
        const totalSpent       = docs.reduce((s, d) => s + (d.totalSpent || 0), 0);
        const totalEarned      = docs.reduce((s, d) => s + (d.totalEarned || 0), 0);
        const totalTaxes       = docs.reduce((s, d) => s + (d.totalTaxes || 0), 0);
        const totalTransactions= docs.reduce((s, d) => s + (d.totalTransactions || 0), 0);
        const playerCount      = docs.length;
        el.innerHTML = `
            <div class="stat-card"><div class="stat-icon" style="background:rgba(16,185,129,.12);color:#10b981;"><i class="fa-solid fa-cart-shopping"></i></div><div class="stat-info"><div class="stat-value">${totalTransactions.toLocaleString('pl-PL')}</div><div class="stat-label">Transakcje ogółem</div></div></div>
            <div class="stat-card"><div class="stat-icon" style="background:rgba(239,68,68,.12);color:#ef4444;"><i class="fa-solid fa-coins"></i></div><div class="stat-info"><div class="stat-value">${Math.round(totalSpent).toLocaleString('pl-PL')}$</div><div class="stat-label">Wydano łącznie</div></div></div>
            <div class="stat-card"><div class="stat-icon" style="background:rgba(34,197,94,.12);color:#22c55e;"><i class="fa-solid fa-sack-dollar"></i></div><div class="stat-info"><div class="stat-value">${Math.round(totalEarned).toLocaleString('pl-PL')}$</div><div class="stat-label">Zarobiono łącznie</div></div></div>
            <div class="stat-card"><div class="stat-icon" style="background:rgba(245,158,11,.12);color:#f59e0b;"><i class="fa-solid fa-percent"></i></div><div class="stat-info"><div class="stat-value">${Math.round(totalTaxes).toLocaleString('pl-PL')}$</div><div class="stat-label">Pobrane podatki</div></div></div>
            <div class="stat-card"><div class="stat-icon" style="background:rgba(139,92,246,.12);color:#8b5cf6;"><i class="fa-solid fa-users"></i></div><div class="stat-info"><div class="stat-value">${playerCount}</div><div class="stat-label">Graczy w bazie</div></div></div>`;
    } catch(e) {
        el.innerHTML = `<div style="color:#ef4444;font-size:.82rem;padding:.5rem;">Błąd: ${escapeHtml(e.message)}</div>`;
    }
}

/** Tabela ostatnich transakcji */
async function loadCShopTransactions() {
    const tb = document.getElementById('cshop-transactions-tbody');
    if (!tb) return;
    tb.innerHTML = '<tr><td colspan="7" class="table-loading"><i class="fa-solid fa-spinner fa-spin"></i> Ładowanie...</td></tr>';
    try {
        const snap = await getDocs(query(collection(db, 'cshop_transactions'), orderBy('timestamp', 'desc')));
        const rows = snap.docs.map(d => d.data()).slice(0, 200);
        if (!rows.length) { tb.innerHTML = '<tr><td colspan="7" class="table-empty">Brak transakcji — wgraj CShop z włączonym firebase.enabled=true</td></tr>'; return; }
        tb.innerHTML = rows.map(t => {
            const isB = t.type === 'BUY';
            const col = isB ? '#22c55e' : '#f59e0b';
            const icon= isB ? 'fa-cart-plus' : 'fa-money-bill-wave';
            const ts  = t.timestamp ? new Date(t.timestamp).toLocaleString('pl-PL') : '—';
            return `<tr>
                <td><span style="color:${col};font-weight:700;font-size:.8rem;"><i class="fa-solid ${icon}"></i> ${t.type||'?'}</span></td>
                <td><div class="player-cell">${head(t.playerName||'?')}<div class="player-name">${escapeHtml(t.playerName||'?')}</div></div></td>
                <td style="font-weight:700;">${escapeHtml(t.itemName||'?')}</td>
                <td style="text-align:center;">${t.amount||1}</td>
                <td style="font-weight:800;color:${col};">${Number(t.price||0).toFixed(2)}$</td>
                <td style="font-size:.78rem;color:var(--text-secondary);">${escapeHtml(t.category||'—')}</td>
                <td style="font-size:.78rem;color:var(--text-secondary);">${ts}</td>
            </tr>`;
        }).join('');
    } catch(e) {
        tb.innerHTML = `<tr><td colspan="7" style="color:#ef4444;padding:.8rem;">${escapeHtml(e.message)}</td></tr>`;
    }
}

window.filterCShopTransactions = function() {
    const s  = (document.getElementById('cshop-tx-search')?.value || '').toLowerCase();
    const ty = document.getElementById('cshop-tx-type')?.value || '';
    document.querySelectorAll('#cshop-transactions-tbody tr').forEach(row => {
        const txt = row.textContent.toLowerCase();
        const typeCell = row.cells?.[0]?.textContent?.trim() || '';
        row.style.display = ((!s || txt.includes(s)) && (!ty || typeCell.includes(ty))) ? '' : 'none';
    });
};

/** Topki CShop */
async function loadCShopTop() {
    const stat = document.getElementById('cshop-top-stat')?.value || 'top_spent';
    const list = document.getElementById('cshop-top-list');
    if (!list) return;
    list.innerHTML = '<div style="text-align:center;padding:1.5rem;color:var(--text-secondary);font-size:.85rem;"><i class="fa-solid fa-spinner fa-spin"></i> Ładowanie...</div>';
    try {
        const snap = await getDoc(doc(db, 'cshop_top', stat));
        if (!snap.exists()) { list.innerHTML = '<div style="text-align:center;padding:1.5rem;color:var(--text-secondary);">Brak danych — poczekaj na sync pluginu.</div>'; return; }
        const entries = (snap.data().entries || []).slice(0, 20);
        if (!entries.length) { list.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--text-secondary);">Brak graczy w rankingu.</div>'; return; }
        const medals = ['🥇','🥈','🥉'];
        const isMoney = stat !== 'top_transactions';
        list.innerHTML = entries.map((e, i) => {
            const icon = i < 3 ? medals[i] : `<span style="color:var(--text-secondary);font-size:.78rem;">#${e.rank||i+1}</span>`;
            const val  = isMoney ? `${Math.round(e.value||0).toLocaleString('pl-PL')}$` : `${(e.value||0).toLocaleString('pl-PL')} transakcji`;
            return `<div style="display:flex;align-items:center;gap:.6rem;padding:.5rem .65rem;border-bottom:1px solid var(--border);font-size:.84rem;">
                <span style="width:28px;text-align:center;flex-shrink:0;">${icon}</span>
                ${head(e.player||'Steve')}
                <span style="flex:1;font-weight:700;">${escapeHtml(e.player||'?')}</span>
                <span style="color:#10b981;font-weight:800;">${val}</span>
            </div>`;
        }).join('');
    } catch(e) {
        list.innerHTML = `<div style="padding:.8rem;color:#ef4444;font-size:.82rem;">Błąd: ${escapeHtml(e.message)}</div>`;
    }
}

// ─── CSHOP — EDYTOR PODATKÓW ──────────────────────────────────────────────────

let _cshopTaxConfig = null; // lokalny cache podatków

/** Pobiera konfigurację podatków z Firestore i wypełnia edytor */
async function loadCShopTaxConfig() {
    const el = document.getElementById('cshop-tax-editor');
    if (!el) return;
    el.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-secondary);"><i class="fa-solid fa-spinner fa-spin"></i> Ładowanie...</div>';
    try {
        const snap = await getDoc(doc(db, 'cshop_config', 'taxes'));
        if (!snap.exists()) {
            el.innerHTML = `<div style="padding:1rem;color:var(--text-secondary);font-size:.85rem;text-align:center;">
                Brak konfiguracji — uruchom CShop z <code>firebase.enabled: true</code> aby przesłać domyślne podatki.
            </div>`;
            return;
        }
        _cshopTaxConfig = snap.data();
        renderCShopTaxEditor(_cshopTaxConfig);
    } catch(e) {
        el.innerHTML = `<div style="color:#ef4444;padding:.8rem;font-size:.82rem;">Błąd: ${escapeHtml(e.message)}</div>`;
    }
}

function renderCShopTaxEditor(cfg) {
    const el = document.getElementById('cshop-tax-editor');
    if (!el) return;
    const tiers = (cfg.tiers || []).sort((a, b) => (b.threshold || 0) - (a.threshold || 0));

    const enabled = cfg.enabled !== false;
    el.innerHTML = `
        <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.2rem;padding:.8rem 1rem;background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.2);border-radius:10px;">
            <span style="font-weight:700;font-size:.9rem;"><i class="fa-solid fa-toggle-on" style="color:#10b981;"></i> System podatków</span>
            <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;margin-left:auto;">
                <input type="checkbox" id="cshop-tax-enabled" ${enabled ? 'checked' : ''}
                    style="width:18px;height:18px;accent-color:#10b981;cursor:pointer;">
                <span style="font-weight:700;font-size:.85rem;">${enabled ? 'Włączony' : 'Wyłączony'}</span>
            </label>
        </div>
        <div id="cshop-tax-tiers" style="display:flex;flex-direction:column;gap:1rem;">
            ${tiers.map((tier, i) => renderTierEditor(tier, i)).join('')}
        </div>
        <div style="display:flex;gap:.6rem;margin-top:1.2rem;flex-wrap:wrap;">
            <button onclick="saveCShopTaxConfig()" style="flex:1;padding:.75rem;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:8px;font-weight:800;cursor:pointer;font-family:var(--font);font-size:.9rem;">
                <i class="fa-solid fa-floppy-disk"></i> Zapisz zmiany podatków
            </button>
            <button onclick="loadCShopTaxConfig()" style="padding:.75rem 1rem;background:transparent;border:1.5px solid var(--border);border-radius:8px;color:var(--text-secondary);cursor:pointer;font-family:var(--font);">
                <i class="fa-solid fa-rotate-right"></i>
            </button>
        </div>
        <div id="cshop-tax-msg" style="display:none;margin-top:.6rem;"></div>`;
}

function renderTierEditor(tier, idx) {
    const n = tier.name || `tier_${idx}`;
    return `<div style="background:var(--bg);border:1.5px solid var(--border);border-radius:12px;padding:1rem;transition:border-color .15s;" onmouseenter="this.style.borderColor='rgba(245,158,11,.4)'" onmouseleave="this.style.borderColor='var(--border)'">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.8rem;">
            <div style="font-weight:800;font-size:.92rem;">
                <i class="fa-solid fa-layer-group" style="color:#f59e0b;margin-right:.4rem;"></i>
                Próg: <span style="color:#f59e0b;">${escapeHtml(n)}</span>
            </div>
            <div style="font-size:.72rem;color:var(--text-secondary);">ID: ${escapeHtml(n)}</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;">
            <div>
                <label style="font-size:.72rem;color:var(--text-secondary);font-weight:700;display:block;margin-bottom:.2rem;">Od kwoty ($)</label>
                <input type="number" data-tier="${n}" data-field="threshold" value="${tier.threshold||0}" min="0"
                    style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:8px;font-size:.88rem;background:var(--bg-card);color:var(--text-primary);font-family:var(--font);">
            </div>
            <div style="display:flex;align-items:flex-end;gap:.5rem;">
                <div style="flex:1;">
                    <label style="font-size:.72rem;color:var(--text-secondary);font-weight:700;display:block;margin-bottom:.2rem;">Podatek wejściowy</label>
                    <label style="display:flex;align-items:center;gap:.4rem;font-size:.8rem;cursor:pointer;">
                        <input type="checkbox" data-tier="${n}" data-field="entryEnabled" ${tier.entryEnabled ? 'checked' : ''}
                            style="accent-color:#ef4444;cursor:pointer;">
                        <span>Włączony</span>
                    </label>
                </div>
            </div>
            <div>
                <label style="font-size:.72rem;color:var(--text-secondary);font-weight:700;display:block;margin-bottom:.2rem;">Wejściowy Min % </label>
                <input type="number" data-tier="${n}" data-field="entryMin" value="${tier.entryMin||0}" min="0" max="100" step="0.01"
                    style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:8px;font-size:.88rem;background:var(--bg-card);color:var(--text-primary);font-family:var(--font);">
            </div>
            <div>
                <label style="font-size:.72rem;color:var(--text-secondary);font-weight:700;display:block;margin-bottom:.2rem;">Wejściowy Max %</label>
                <input type="number" data-tier="${n}" data-field="entryMax" value="${tier.entryMax||0}" min="0" max="100" step="0.01"
                    style="width:100%;padding:.5rem .7rem;border:1.5px solid var(--border);border-radius:8px;font-size:.88rem;background:var(--bg-card);color:var(--text-primary);font-family:var(--font);">
            </div>
        </div>
        <div style="margin-top:.7rem;padding-top:.7rem;border-top:1px solid var(--border);">
            <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem;">
                <label style="font-size:.72rem;color:var(--text-secondary);font-weight:700;">Modyfikatory cen na sesję</label>
                <label style="display:flex;align-items:center;gap:.4rem;font-size:.8rem;cursor:pointer;margin-left:auto;">
                    <input type="checkbox" data-tier="${n}" data-field="pricesEnabled" ${tier.pricesEnabled ? 'checked' : ''}
                        style="accent-color:#3b82f6;cursor:pointer;">
                    <span>Włączone</span>
                </label>
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:.5rem;">
                <div>
                    <label style="font-size:.68rem;color:#22c55e;font-weight:700;display:block;margin-bottom:.15rem;">Kupno +Min %</label>
                    <input type="number" data-tier="${n}" data-field="buyIncreaseMin" value="${tier.buyIncreaseMin||0}" min="0" step="0.1"
                        style="width:100%;padding:.4rem .5rem;border:1.5px solid rgba(34,197,94,.3);border-radius:7px;font-size:.82rem;background:var(--bg-card);color:var(--text-primary);font-family:var(--font);">
                </div>
                <div>
                    <label style="font-size:.68rem;color:#22c55e;font-weight:700;display:block;margin-bottom:.15rem;">Kupno +Max %</label>
                    <input type="number" data-tier="${n}" data-field="buyIncreaseMax" value="${tier.buyIncreaseMax||0}" min="0" step="0.1"
                        style="width:100%;padding:.4rem .5rem;border:1.5px solid rgba(34,197,94,.3);border-radius:7px;font-size:.82rem;background:var(--bg-card);color:var(--text-primary);font-family:var(--font);">
                </div>
                <div>
                    <label style="font-size:.68rem;color:#ef4444;font-weight:700;display:block;margin-bottom:.15rem;">Sprzedaż -Min %</label>
                    <input type="number" data-tier="${n}" data-field="sellDecreaseMin" value="${tier.sellDecreaseMin||0}" min="0" step="0.1"
                        style="width:100%;padding:.4rem .5rem;border:1.5px solid rgba(239,68,68,.3);border-radius:7px;font-size:.82rem;background:var(--bg-card);color:var(--text-primary);font-family:var(--font);">
                </div>
                <div>
                    <label style="font-size:.68rem;color:#ef4444;font-weight:700;display:block;margin-bottom:.15rem;">Sprzedaż -Max %</label>
                    <input type="number" data-tier="${n}" data-field="sellDecreaseMax" value="${tier.sellDecreaseMax||0}" min="0" step="0.1"
                        style="width:100%;padding:.4rem .5rem;border:1.5px solid rgba(239,68,68,.3);border-radius:7px;font-size:.82rem;background:var(--bg-card);color:var(--text-primary);font-family:var(--font);">
                </div>
            </div>
        </div>
    </div>`;
}

window.saveCShopTaxConfig = async function() {
    const msgEl = document.getElementById('cshop-tax-msg');
    if (!requirePermission('all', 'edycja podatków')) return;

    // Zbierz dane z formularza
    const enabled = document.getElementById('cshop-tax-enabled')?.checked ?? true;
    const tiersMap = {};
    document.querySelectorAll('#cshop-tax-tiers [data-tier]').forEach(el => {
        const t = el.getAttribute('data-tier');
        const f = el.getAttribute('data-field');
        if (!tiersMap[t]) tiersMap[t] = { name: t };
        if (el.type === 'checkbox') tiersMap[t][f] = el.checked;
        else tiersMap[t][f] = parseFloat(el.value) || 0;
    });

    const tiers = Object.values(tiersMap);
    const data = { enabled, tiers, updatedAt: new Date().toISOString(), updatedBy: currentUser?.displayName || 'Panel' };

    try {
        await setDoc(doc(db, 'cshop_config', 'taxes'), data);
        _cshopTaxConfig = data;
        if (msgEl) {
            msgEl.style.cssText = 'display:block;padding:.55rem .8rem;border-radius:8px;font-size:.82rem;font-weight:700;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.25);color:#059669;';
            msgEl.textContent = '✓ Zapisano! Plugin CShop pobierze zmiany w ciągu ~60s.';
            setTimeout(() => { if(msgEl) msgEl.style.display = 'none'; }, 5000);
        }
        showToast('success', 'Konfiguracja podatków zapisana!');
    } catch(e) {
        if (msgEl) {
            msgEl.style.cssText = 'display:block;padding:.55rem .8rem;border-radius:8px;font-size:.82rem;font-weight:700;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);color:#dc2626;';
            msgEl.textContent = 'Błąd: ' + e.message;
        }
    }
};

// Aktualizuj też stronę Informacje — dodaj sekcję połączeń pluginów
const _origLoadInfoPage = window.loadInfoPage;
window.loadInfoPage = async function() {
    if (_origLoadInfoPage) await _origLoadInfoPage();
    // Odśwież status połączeń jeśli sekcja istnieje
    const pluginStatusEl = document.getElementById('info-plugin-status');
    if (!pluginStatusEl) return;
    pluginStatusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sprawdzanie...';
    try {
        const statsSnap = await getDoc(doc(db, 'server_stats', 'current'));
        const cstatsSnap = await getDocs(query(collection(db, 'cstats_players')));
        const sData = statsSnap.exists() ? statsSnap.data() : null;
        const cstatsOk = cstatsSnap.size > 0;

        const _setPluginStatus = (elId, ok, label, detail) => {
            const el = document.getElementById(elId); if(!el)return;
            const c = ok ? '#10b981' : '#ef4444';
            el.innerHTML = `<span style="width:9px;height:9px;border-radius:50%;background:${c};flex-shrink:0;box-shadow:0 0 5px ${c}88;"></span><span style="font-size:.82rem;font-weight:700;color:${c};">${label}</span>`;
            const d = document.getElementById(elId.replace('-status','-detail')); if(d)d.textContent=detail||'';
        };
        _setPluginStatus('info-mc-plugin-status', !!sData?.serverOnline, sData?.serverOnline ? 'CritMC Panel Online' : 'CritMC Panel Offline', sData ? `Online: ${sData.online||0}/${sData.max||20} graczy` : 'Brak danych');
        _setPluginStatus('info-cstats-status', cstatsOk, cstatsOk ? 'CStats Aktywny' : 'CStats Offline', `${cstatsSnap.size} graczy w bazie`);
    } catch(e) { if(pluginStatusEl) pluginStatusEl.innerHTML = '<span style="color:#ef4444;font-size:.8rem;">Błąd sprawdzania</span>'; }
};

// ─── AI ASYSTENT ──────────────────────────────────────────────────────────────

const AI_SYSTEM_PROMPT = `Jesteś CritAI — wszechstronnym asystentem AI panelu administracyjnego serwera Minecraft CritMC.
Działasz w imieniu zalogowanego admina. Odpowiadasz naturalnie po polsku, jesteś pomocny, konkretny i świadomy kontekstu serwera.

WAŻNE: Zawsze zwracaj TYLKO czysty JSON (bez markdown, bez \`\`\`). Dwa możliwe formaty:

━━━ FORMAT 1: ROZMOWA (pytania, info, porady, analiza) ━━━
{"reply": "twoja odpowiedź"}

━━━ FORMAT 2: AKCJA ADMINA (gdy user WPROST prosi o wykonanie czegoś) ━━━
{"reply": "krótkie potwierdzenie", "action": "NAZWA_AKCJI", ...pola akcji}

════════════════════════════════════════════
DOSTĘPNE AKCJE (pełna lista):
════════════════════════════════════════════

── KARY ──
ban:        {action:"ban",    player:"nick", reason:"powód", duration:"7d"}
unban:      {action:"unban",  player:"nick", reason:"powód"}
mute:       {action:"mute",   player:"nick", reason:"powód", duration:"1h"}
unmute:     {action:"unmute", player:"nick", reason:"powód"}
kick:       {action:"kick",   player:"nick", reason:"powód"}
warn:       {action:"warn",   player:"nick", reason:"powód"}

── RANGI (LuckPerms) ──
set_rank:   {action:"set_rank",   player:"nick", rank:"vip|boss|crit|chatmod|pomocnik|moderator|admin", duration:"30d|permanent"}
remove_rank:{action:"remove_rank",player:"nick", rank:"vip|boss|crit"}

── SKLEP / NAGRODY ──
shop_grant: {action:"shop_grant", player:"nick", itemType:"ranga|klucz|zestaw|inne", itemId:"ID", qty:1}
give_item:  {action:"give_item",  player:"nick", item:"DIAMOND_SWORD|NETHERITE_INGOT|...", qty:1, enchants:"sharpness:5,unbreaking:3"}

── KOMUNIKACJA ──
broadcast:  {action:"broadcast", message:"treść", color:"gold|red|green|aqua|yellow|white"}
message:    {action:"message",   player:"nick",   message:"treść"}
title:      {action:"title",     player:"nick",   title:"nagłówek", subtitle:"podtytuł", fadein:10, stay:60, fadeout:10}
actionbar:  {action:"actionbar", player:"nick",   message:"treść"}

── GRACZ ──
check:      {action:"check",     player:"nick"}
heal:       {action:"heal",      player:"nick"}
feed:       {action:"feed",      player:"nick"}
fly:        {action:"fly",       player:"nick", enable:true}
god:        {action:"god",       player:"nick", enable:true}
gamemode:   {action:"gamemode",  player:"nick", mode:"survival|creative|adventure|spectator"}
tp:         {action:"tp",        player:"nick", target:"nick2|x,y,z"}
speed:      {action:"speed",     player:"nick", value:2}
clear_inv:  {action:"clear_inv", player:"nick"}

── SERWER ──
console_cmd:{action:"console_cmd", command:"say Hello|time set day|weather clear|..."}
op:         {action:"op",        player:"nick", remove:false}
whitelist:  {action:"whitelist", player:"nick", add:true}

── CSTATS ──
set_stat:   {action:"set_stat",  player:"nick", stat:"kills|deaths|points|playtime|...", value:100}
add_stat:   {action:"add_stat",  player:"nick", stat:"kills", value:10}

── SPECJALNE ──
schedule:   {action:"schedule",  delaySeconds:300, innerAction:{action:"broadcast", message:"Restart!"}}
multi:      {action:"multi",     actions:[{action:"ban",...},{action:"broadcast",...}]}

════════════════════════════════════════════
ZASADY:
- Czas: 1h 6h 12h 1d 3d 7d 14d 30d permanent
- Jeśli brakuje nicku — zapytaj, nie zakładaj
- Możesz wykonać multi: kilka akcji naraz
- console_cmd pozwala na KAŻDĄ komendę serwera
- ZAWSZE pole "reply" z sensowną odpowiedzią
- NIE pytaj o potwierdzenie gdy akcja jest jasna — panel sam pokaże kartę potwierdzenia
════════════════════════════════════════════`;

let _aiHistory = [];
let _aiUsageToday = parseInt(localStorage.getItem('ai_usage_' + new Date().toDateString()) || '0');

window.loadAiPage = function() {
    // Sprawdź klucz API
    const key = localStorage.getItem('critmc_ai_key');
    const setupDiv = document.getElementById('ai-api-setup');
    const keyStatus = document.getElementById('ai-key-status');
    const usageEl = document.getElementById('ai-usage-count');
    // Sekcja setup jest ZAWSZE widoczna — w środku przełączamy stany (zapisany/brak/formularz)
    if (setupDiv) setupDiv.style.display = 'block';

    // Przełącz widok wewnętrzny: jeśli jest klucz → pokaż podgląd (zwinięty), jeśli brak → formularz
    const savedView = document.getElementById('ai-key-saved-view');
    const formView = document.getElementById('ai-key-form-view');
    const cancelBtn = document.getElementById('ai-cancel-btn');
    const formTitle = document.getElementById('ai-key-form-title');
    if (key) {
        if (savedView) savedView.style.display = 'block';
        if (formView) formView.style.display = 'none';
        // Zamaskowany podgląd: AIza + 4 gwiazdki + ostatnie 4 znaki
        const masked = key.length > 8 ? `AIza****…${key.slice(-4)}` : 'AIza****';
        const maskedEl = document.getElementById('ai-key-masked');
        if (maskedEl) maskedEl.textContent = masked;
    } else {
        if (savedView) savedView.style.display = 'none';
        if (formView) formView.style.display = 'block';
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (formTitle) formTitle.innerHTML = '<i class="fa-solid fa-key" style="color:#8b5cf6;"></i> Skonfiguruj klucz Gemini API';
        const input = document.getElementById('ai-api-key-input');
        if (input) input.value = '';
    }

    if (keyStatus) { keyStatus.textContent = key ? 'Skonfigurowany ✓' : 'Nie skonfigurowany'; keyStatus.style.color = key ? '#10b981' : '#ef4444'; }
    if (usageEl) usageEl.textContent = _aiUsageToday;

    // Pokaż wyraźnie chip dla Zarządzającego
    const advChip = document.getElementById('ai-chip-advanced');
    const ecoChip = document.getElementById('ai-chip-economy');
    if (advChip && currentUser?.role === 'Zarządzający') advChip.style.display = '';
    if (ecoChip && currentUser?.role === 'Zarządzający') ecoChip.style.display = '';
};

// Rozwiń formularz zmiany klucza (z podglądu zwiniętego)
window.showAiKeyForm = function() {
    const savedView = document.getElementById('ai-key-saved-view');
    const formView = document.getElementById('ai-key-form-view');
    const formTitle = document.getElementById('ai-key-form-title');
    const cancelBtn = document.getElementById('ai-cancel-btn');
    if (savedView) savedView.style.display = 'none';
    if (formView) formView.style.display = 'block';
    if (formTitle) formTitle.innerHTML = '<i class="fa-solid fa-key" style="color:#8b5cf6;"></i> Zmień klucz Gemini API';
    if (cancelBtn) cancelBtn.style.display = '';
    const input = document.getElementById('ai-api-key-input');
    if (input) { input.value = ''; input.focus(); }
};

// Anuluj edycję klucza (wróć do zwiniętego podglądu) — tylko jeśli klucz już istnieje
window.cancelAiKeyEdit = function() {
    const key = localStorage.getItem('critmc_ai_key');
    if (!key) return; // brak klucza = nie można anulować, zostaw formularz
    window.loadAiPage();
};

window.removeAiApiKey = function() {
    localStorage.removeItem('critmc_ai_key');
    showToast('success', 'Klucz usunięty.');
    window.loadAiPage();
};

window.saveAiApiKey = function() {
    const val = document.getElementById('ai-api-key-input')?.value?.trim();
    // Walidacja: klucze Gemini mają różne formaty — stare "AIza..." oraz nowe "AQ.Ab...".
    // Wymagamy tylko rozsądnej długości (min 25 znaków) i braku spacji.
    if (!val || val.length < 25) { showToast('error', 'Klucz jest zbyt krótki (min. 25 znaków).'); return; }
    if (val.includes(' ')) { showToast('error', 'Klucz nie może zawierać spacji.'); return; }
    localStorage.setItem('critmc_ai_key', val);
    showToast('success', 'Klucz zapisany!');
    window.loadAiPage();
};

/** Lista modeli do wypróbowania w kolejności. Pierwszy działający wygrywa. */
// Pełna lista modeli — każdy ma OSOBNY dzienny limit (przydatne gdy jeden się wyczerpie).
// Kolejność: najlepsze/najszybsze najpierw, lżejsze (lite) jako fallback.
const AI_MODELS = [
    'gemini-2.5-flash',          // główny, najlepszy stosunek jako/limit
    'gemini-3.5-flash',          // nowszy, często dostępny
    'gemini-3-flash-preview',    // preview 3.x
    'gemini-flash-latest',       // zawsze dostępny alias
    'gemini-2.0-flash',          // stabilny 2.0
    'gemini-2.0-flash-001',      // konkretna wersja = osobny limit!
    'gemini-2.5-flash-lite',     // lżejszy, często ma limit gdy reszta padła
    'gemini-2.0-flash-lite',     // lite 2.0
    'gemini-2.0-flash-lite-001', // konkretna wersja lite
    'gemini-3.1-flash-lite',     // lite 3.1
    'gemini-flash-lite-latest',  // alias lite
];

/** Zwraca dzisiejszy klucz oznaczania wyczerpanych modeli (resetuje się o północy). */
function _aiExhaustedKey() {
    return 'critmc_ai_exhausted_' + new Date().toDateString();
}

/** Oznacz model jako wyczerpany dzisiaj (429) — pomijany do północy. */
function _aiMarkExhausted(model) {
    try {
        const k = _aiExhaustedKey();
        const list = JSON.parse(localStorage.getItem(k) || '[]');
        if (!list.includes(model)) { list.push(model); localStorage.setItem(k, JSON.stringify(list)); }
        console.log('[AI] Model wyczerpany dzisiaj:', model);
    } catch(e) {}
}

/** Czyści stare listy wyczerpanych modeli (z poprzednich dni). */
function _aiCleanupExhausted() {
    try {
        const today = _aiExhaustedKey();
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (k && k.startsWith('critmc_ai_exhausted_') && k !== today) localStorage.removeItem(k);
        }
    } catch(e) {}
}

/** Lista modeli wyczerpanych dzisiaj. */
function _aiGetExhausted() {
    try { return JSON.parse(localStorage.getItem(_aiExhaustedKey()) || '[]'); } catch(e) { return []; }
}

/**
 * Zwraca pierwszy DZIAŁAJĄCY model.
 * - Pomija modele wyczerpane dzisiaj (zapamiętane w localStorage z 429).
 * - Pomija modele które nie istnieją (404) lub są niedostępne (503).
 * - Przy 429 oznacza model jako wyczerpany i próbuje następnego.
 * - Zwraca {model, status, msg}.
 */
async function _aiPickWorkingModel(key, skipTest = false) {
    _aiCleanupExhausted();
    const exhausted = _aiGetExhausted();
    // Szybka ścieżka: zapamiętany działający model (jeśli nie jest wyczerpany)
    const cached = localStorage.getItem('critmc_ai_model');
    const candidates = [];
    if (cached && !exhausted.includes(cached)) candidates.push(cached);
    for (const m of AI_MODELS) {
        if (!candidates.includes(m) && !exhausted.includes(m)) candidates.push(m);
    }
    console.log('[AI] Kandydaci:', candidates, '| wyczerpane:', exhausted);

    if (skipTest && cached && !exhausted.includes(cached)) {
        // Szybka ścieżka dla sendAiMessage — ufamy cache, testujemy dopiero gdy wywali
        return { model: cached, status: 200 };
    }

    let lastStatus = 0, lastMsg = '';
    for (const model of candidates) {
        try {
            const r = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ role: 'user', parts: [{ text: 'OK' }] }],
                        generationConfig: { temperature: 0, maxOutputTokens: 5 }
                    })
                }
            );
            if (r.ok) {
                localStorage.setItem('critmc_ai_model', model);
                console.log('[AI] Działający model:', model);
                return { model, status: 200 };
            }
            lastStatus = r.status;
            if (r.status === 429) {
                // Quota — oznacz jako wyczerpany i próbuj następnego (osobny limit per model!)
                _aiMarkExhausted(model);
                continue;
            }
            if (r.status === 404 || r.status === 503) {
                // Model nie istnieje lub niedostępny — spróbuj następnego
                continue;
            }
            if (r.status === 400 || r.status === 403) {
                // Problem klucza — nie próbuj dalej (to nie wina modelu)
                const e = await r.json().catch(() => ({}));
                return { model, status: r.status, msg: e.error?.message || '' };
            }
        } catch (e) {
            lastStatus = -1; // błąd sieci
            lastMsg = e.message || '';
        }
    }
    return { model: null, status: lastStatus, msg: lastMsg };
}

/** Test klucza API — próbuje modele po kolei, pokazuje który działa */
window.testAiKey = async function() {
    const key = localStorage.getItem('critmc_ai_key');
    const btn = document.getElementById('ai-test-btn');
    if (!key) { showToast('error', 'Najpierw wpisz i zapisz klucz API.'); return; }
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Testuję...'; }

    // DIAGNOSTYKA: pokaż w konsoli co testujemy
    console.log('[AI Test] Klucz z localStorage:', key ? key.substring(0,10) + '...' + key.substring(key.length-4) : '(brak)', 'długość:', key.length);

    try {
        const result = await _aiPickWorkingModel(key);
        console.log('[AI Test] Wynik _aiPickWorkingModel:', result);

        if (result.status === 200 && result.model) {
            const exhausted = _aiGetExhausted();
            const totalModels = AI_MODELS.length;
            const availModels = totalModels - exhausted.length;
            const extra = exhausted.length > 0
                ? ` | ${availModels}/${totalModels} modeli aktywnych (${exhausted.length} wyczerpanych)`
                : ` | wszystkie ${totalModels} modeli aktywne`;
            showToast('success', '✅ Klucz działa! Model: ' + result.model + extra);
            const modelEl = document.getElementById('ai-active-model');
            if (modelEl) modelEl.textContent = result.model;
        } else if (result.status === 400 || result.status === 403) {
            const msg = result.msg || '';
            console.log('[AI Test] Błąd API pełny komunikat:', msg);
            if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid') || msg.includes('API key')) {
                showToast('error', '❌ Klucz jest nieprawidłowy. Sprawdź konsolę (F12) — pełny błąd.');
            } else {
                showToast('error', '❌ Błąd API (' + result.status + '): ' + msg.substring(0, 80));
            }
        } else if (result.status === 429) {
            showToast('error', '⏳ Wszystkie modele (' + AI_MODELS.length + ') mają wyczerpany limit dzienny. Spróbuj jutro (reset o północy UTC).');
        } else if (result.status === -1) {
            showToast('error', '🌐 Błąd sieci — sprawdź połączenie. Konsola (F12) ma szczegóły.');
        } else {
            showToast('error', '❌ Status ' + result.status + '. Sprawdź konsolę (F12).');
        }
    } catch (e) {
        console.error('[AI Test] Wyjątek:', e);
        showToast('error', '🌐 Błąd: ' + (e.message || 'nieznany') + '. Konsola (F12) ma szczegóły.');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-vial"></i> Testuj klucz API'; }
    }
};

window._aiUseExample = function(el) {
    const input = document.getElementById('ai-input');
    if (input) { input.value = el.textContent.replace(/^[^\s]+\s/, ''); input.focus(); }
};

window.sendAiMessage = async function() {
    const input = document.getElementById('ai-input');
    const btn   = document.getElementById('ai-send-btn');
    const hist  = document.getElementById('ai-chat-history');
    if (!input || !btn || !hist) return;

    const text = input.value.trim();
    if (!text) return;

    const key = localStorage.getItem('critmc_ai_key');
    if (!key) { showToast('error', 'Skonfiguruj klucz Gemini API!'); window.loadAiPage(); const inp = document.getElementById('ai-api-key-input'); if (inp) inp.focus(); return; }

    if (!requirePermission('check', 'AI asystent')) return;

    // Ukryj welcome
    const welcome = document.getElementById('ai-welcome');
    if (welcome) welcome.style.display = 'none';

    // Pokaż wiadomość użytkownika
    _aiAppendMsg('user', text, currentUser?.displayName?.charAt(0) || 'A');
    input.value = '';
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    // Typing indicator
    const typingId = 'ai-typing-' + Date.now();
    hist.insertAdjacentHTML('beforeend', `
        <div class="ai-msg ai-msg-ai" id="${typingId}">
            <div class="ai-msg-avatar"><i class="fa-solid fa-robot"></i></div>
            <div class="ai-typing"><span></span><span></span><span></span></div>
        </div>`);
    hist.scrollTop = hist.scrollHeight;

    try {
        // Pobierz kontekst serwera asynchronicznie
        let serverContext = '';
        try {
            const statsSnap = await getDoc(doc(db, 'server_stats', 'current'));
            if (statsSnap.exists()) {
                const s = statsSnap.data();
                const online = s.online || 0;
                const max = s.max || 20;
                const tps = s.tps?.toFixed(1) || '?';
                const playerList = (s.playerList || []).slice(0, 20).join(', ') || 'brak';
                serverContext = `\n\nKONTEKST SERWERA (aktualny):\n- Online: ${online}/${max} graczy\n- TPS: ${tps}\n- Gracze: ${playerList}\n- Admin: ${currentUser?.displayName} (${currentUser?.role})\n- Czas: ${new Date().toLocaleString('pl-PL')}`;
            }
        } catch(e) { /* cicho — kontekst nieobowiązkowy */ }

        // Pobierz ostatnie 5 logów dla kontekstu
        try {
            const logsSnap = await getDocs(query(collection(db, 'admin_logs'), orderBy('date', 'desc'), limit(5)));
            const recentLogs = logsSnap.docs.map(d => {
                const l = d.data();
                return `${l.action} ${l.player} przez ${l.admin}`;
            }).join(', ');
            if (recentLogs) serverContext += `\n- Ostatnie akcje: ${recentLogs}`;
        } catch(e) {}

        // Wyślij zapytanie z automatyczną rotacją modeli przy 429/503.
        // Max 4 próby — za każdym razem nowy model z _aiPickWorkingModel.
        let data = null, usedModel = null, lastErr = null;
        for (let attempt = 0; attempt < 4; attempt++) {
            // Znajdź działający model (pomija wyczerpane dzisiaj)
            const picked = await _aiPickWorkingModel(key, attempt > 0); // skipTest=true od 2. próby
            if (!picked.model || picked.status !== 200) {
                // Pierwsza próba bez modelu = problem klucza
                if (attempt === 0) {
                    if (picked.status === 400 || picked.status === 403) {
                        throw new Error('API_KEY_INVALID: ' + (picked.msg || 'nieprawidłowy klucz'));
                    } else if (picked.status === 429) {
                        throw new Error('RESOURCE_EXHAUSTED: wszystkie modele mają wyczerpany limit dzienny. Spróbuj jutro lub włącz plan płatny.');
                    } else {
                        throw new Error('Nie udało się połączyć z żadnym modelem Gemini (status ' + picked.status + ')');
                    }
                }
                break; // kolejna próba nie ma sensu
            }
            usedModel = picked.model;
            try {
                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${usedModel}:generateContent?key=${encodeURIComponent(key)}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            systemInstruction: { parts: [{ text: AI_SYSTEM_PROMPT + serverContext }] },
                            contents: [
                                ..._aiHistory.slice(-8),
                                { role: 'user', parts: [{ text }] }
                            ],
                            generationConfig: { temperature: 0.1, maxOutputTokens: 512, responseMimeType: 'application/json' }
                        })
                    }
                );
                if (response.ok) {
                    data = await response.json();
                    break; // sukces!
                }
                if (response.status === 429) {
                    // Ten model wyczerpany — oznacz i próbuj następnego
                    _aiMarkExhausted(usedModel);
                    lastErr = new Error('Model ' + usedModel + ' wyczerpany (429) — przełączam...');
                    continue;
                }
                if (response.status === 503 || response.status === 500) {
                    // Serwer niedostępny — spróbuj następnego modelu
                    lastErr = new Error('Model ' + usedModel + ' niedostępny (' + response.status + ') — próbuję inny...');
                    continue;
                }
                // Inny błąd (400/403) — nie próbuj dalej
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error?.message || `HTTP ${response.status}`);
            } catch (e) {
                lastErr = e;
                // Błąd sieci — spróbuj następnego modelu
                if (attempt < 3) continue;
                throw e;
            }
        }
        if (!data) {
            throw lastErr || new Error('Nie udało się uzyskać odpowiedzi od żadnego modelu.');
        }
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        console.log('[AI Chat] Pytanie:', text, '| model:', usedModel);
        console.log('[AI Chat] Surowa odpowiedź:', raw);

        // Zapisz w historii
        _aiHistory.push({ role: 'user',  parts: [{ text }] });
        _aiHistory.push({ role: 'model', parts: [{ text: raw }] });

        // Aktualizuj licznik
        _aiUsageToday++;
        localStorage.setItem('ai_usage_' + new Date().toDateString(), _aiUsageToday);
        const usageEl = document.getElementById('ai-usage-count');
        if (usageEl) usageEl.textContent = _aiUsageToday;

        // Usuń typing
        document.getElementById(typingId)?.remove();

        // Parsuj JSON — CritAI zawsze zwraca {reply: "..."} + opcjonalnie {action: "..."}
        let parsed;
        try {
            parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
        } catch(e) {
            // Jeśli model nie zwrócił JSON (np. zwykły tekst), traktuj jako zwykłą odpowiedź
            console.log('[AI Chat] Nie-JSON odpowiedź, traktuję jako tekst:', raw);
            parsed = { reply: raw };
        }

        // ZAWSZE pokaż tekstową odpowiedź (reply) — to jest normalna rozmowa
        const replyText = parsed.reply || parsed.message || '...';
        _aiAppendMsg('ai', replyText, '🤖');

        // DODATKOWO — jeśli model wykrył akcję admina, pokaż kartę potwierdzenia pod odpowiedzią
        if (parsed.action && parsed.action !== 'unknown' && parsed.action !== 'ready' && parsed.action !== 'chat') {
            _aiShowConfirmCard(parsed, text);
        }


    } catch(err) {
        document.getElementById(typingId)?.remove();
        let errMsg = err.message || 'Nieznany błąd';
        // Czytelne komunikaty po polsku
        if (errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError') || errMsg.includes('network')) {
            errMsg = '🌐 Błąd sieci — sprawdź połączenie z internetem lub czy przeglądarka nie blokuje żądania.';
        } else if (errMsg.includes('quota') || errMsg.includes('Quota') || errMsg.includes('RESOURCE_EXHAUSTED')) {
            errMsg = '⏳ Przekroczono limit zapytań Gemini API. Poczekaj kilka sekund i spróbuj ponownie. Jeśli problem się powtarza — limit dzienny się wyczerpał (reset o północy UTC).';
        } else if (errMsg.includes('API_KEY') || errMsg.includes('API key') || errMsg.includes('API_KEY_INVALID') || errMsg.includes('401') || errMsg.includes('403')) {
            errMsg = '🔑 Błędny lub nieaktywny klucz API. Wejdź na aistudio.google.com, wygeneruj nowy klucz i zaktualizuj go w ustawieniach (przycisk "Zmień klucz").';
        } else if (errMsg.includes('429')) {
            errMsg = '⏳ Za dużo zapytań naraz. Poczekaj chwilę i spróbuj ponownie.';
        } else if (errMsg.includes('404') || errMsg.includes('nie istnieje')) {
            errMsg = '⚠️ Model AI jest tymczasowo niedostępny. Spróbuj ponownie za chwilę.';
        }
        _aiAppendMsg('ai', errMsg, '🤖');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
        hist.scrollTop = hist.scrollHeight;
    }
};

function _aiAppendMsg(role, text, avatar) {
    const hist = document.getElementById('ai-chat-history');
    if (!hist) return;
    const isUser = role === 'user';
    hist.insertAdjacentHTML('beforeend', `
        <div class="ai-msg ${isUser ? 'ai-msg-user' : 'ai-msg-ai'}">
            <div class="ai-msg-avatar">${avatar}</div>
            <div class="ai-msg-bubble">${escapeHtml(text)}</div>
        </div>`);
    hist.scrollTop = hist.scrollHeight;
}

function _aiShowConfirmCard(parsed, originalText) {
    const hist = document.getElementById('ai-chat-history');
    if (!hist) return;

    const actionLabels = {
        ban: '🔨 BAN gracza', unban: '✅ UNBAN gracza', mute: '🔇 MUTE gracza',
        unmute: '🔊 UNMUTE gracza', kick: '👢 KICK gracza', warn: '⚠️ WARN gracza',
        shop_grant: '🎁 Nadaj produkt', broadcast: '📢 Broadcast', message: '💬 Wiadomość',
        set_rank: '👑 Ustaw rangę', remove_rank: '🗑️ Usuń rangę', give_item: '📦 Daj przedmiot',
        heal: '❤️ Ulecz gracza', feed: '🍖 Nakarmi gracza', fly: '✈️ Latanie (fly)',
        god: '🛡️ Nieśmiertelność (god)', gamemode: '🎮 Tryb gry', tp: '🌀 Teleportacja',
        speed: '⚡ Szybkość', clear_inv: '🧹 Wyczyść EQ', console_cmd: '💻 Komenda konsoli',
        op: '⭐ Nadaj opa', deop: '❌ Odbierz opa', whitelist: '📝 Biała lista (dodaj)',
        unwhitelist: '❌ Biała lista (usuń)', title: '📺 Wyświetl Title', actionbar: '💬 Actionbar',
        set_stat: '📊 Ustaw statystykę CStats', add_stat: '📈 Dodaj do statystyki CStats',
        multi: '⚡ Wiele akcji naraz', schedule: '⏰ Zaplanowana akcja'
    };

    const fields = [];
    if (parsed.player)   fields.push(['Gracz',    parsed.player]);
    if (parsed.reason)   fields.push(['Powód',    parsed.reason]);
    if (parsed.duration) fields.push(['Czas',     parsed.duration]);
    if (parsed.rank)     fields.push(['Ranga',    parsed.rank]);
    if (parsed.itemType) fields.push(['Typ',      parsed.itemType]);
    if (parsed.itemId)   fields.push(['Produkt',  parsed.itemId]);
    if (parsed.qty > 1)  fields.push(['Ilość',    parsed.qty]);
    if (parsed.message)  fields.push(['Treść',    parsed.message]);

    const cardId = 'ai-confirm-' + Date.now();
    hist.insertAdjacentHTML('beforeend', `
        <div class="ai-msg ai-msg-ai">
            <div class="ai-msg-avatar"><i class="fa-solid fa-robot"></i></div>
            <div style="max-width:80%;">
                <div class="ai-msg-bubble" style="margin-bottom:.4rem;">Rozumiem polecenie. Czy wykonać?</div>
                <div class="ai-confirm-card" id="${cardId}">
                    <div class="ai-confirm-card-title">${actionLabels[parsed.action] || parsed.action.toUpperCase()}</div>
                    ${fields.map(([l,v]) => `<div class="ai-confirm-field"><span class="ai-confirm-field-label">${l}:</span><span class="ai-confirm-field-value">${escapeHtml(String(v))}</span></div>`).join('')}
                    <div class="ai-confirm-btns">
                        <button class="ai-confirm-yes" onclick="aiExecuteAction(${cardId.replace('ai-confirm-','')}, ${JSON.stringify(parsed).replace(/"/g,'&quot;')})">
                            <i class="fa-solid fa-check"></i> Wykonaj
                        </button>
                        <button class="ai-confirm-no" onclick="document.getElementById('${cardId}').innerHTML='<span style=\\'color:var(--text-secondary);font-size:.82rem;\\'>Anulowano.</span>'">
                            Anuluj
                        </button>
                    </div>
                </div>
            </div>
        </div>`);
    hist.scrollTop = hist.scrollHeight;
}

window.aiExecuteAction = async function(cardTimestamp, parsed) {
    const cardId = 'ai-confirm-' + cardTimestamp;
    const card   = document.getElementById(cardId);

    // Sprawdź uprawnienie AI actions
    if (!requirePermission('ai_actions', 'wykonywanie akcji AI')) return;

    // Sprawdź dodatkowe uprawnienia dla niebezpiecznych akcji
    const dangerousActions = ['console_cmd', 'op', 'deop'];
    if (dangerousActions.includes(parsed.action) && !requirePermission('console', 'komendy konsoli')) return;
    if (['set_rank','remove_rank'].includes(parsed.action) && !requirePermission('rank_manage', 'zarządzanie rangami')) return;
    if (['set_stat','add_stat'].includes(parsed.action) && !requirePermission('stats_edit', 'edycja statystyk')) return;

    const aiAdmin = 'AI (' + (currentUser?.displayName || 'Panel') + ')';

    // Mapuj akcję AI → executeAction lub addDoc do panel_commands
    try {
        if (['ban','unban','mute','unmute','kick','warn'].includes(parsed.action)) {
            await executeAction(
                parsed.action,
                parsed.player || '',
                '',
                parsed.reason || 'AI: ' + parsed.action,
                parsed.duration || '—'
            );
            if (card) card.innerHTML = `<span style="color:#10b981;font-weight:700;"><i class="fa-solid fa-check"></i> Wykonano: ${parsed.action.toUpperCase()} na ${escapeHtml(parsed.player)}</span>`;

        } else if (parsed.action === 'shop_grant') {
            await addDoc(collection(db, 'orders'), {
                playerNick: parsed.player,
                items: [{ type: parsed.itemType, id: parsed.itemId, label: parsed.itemId, qty: parsed.qty || 1 }],
                admin: aiAdmin, status: 'pending', type: 'admin_grant', createdAt: serverTimestamp()
            });
            if (card) card.innerHTML = `<span style="color:#10b981;font-weight:700;"><i class="fa-solid fa-check"></i> Nadano ${parsed.itemType} ${parsed.itemId} dla ${escapeHtml(parsed.player)}</span>`;

        } else if (parsed.action === 'set_stat' || parsed.action === 'add_stat') {
            // Bezpośrednio do Firestore cstats_players
            try {
                const pSnap = await getDocs(query(collection(db, 'cstats_players')));
                const pDoc = pSnap.docs.find(d => (d.data().name||d.data().nick||'').toLowerCase() === (parsed.player||'').toLowerCase());
                if (pDoc) {
                    const curVal = pDoc.data()[parsed.stat] || 0;
                    const newVal = parsed.action === 'add_stat' ? curVal + (parsed.value||0) : (parsed.value||0);
                    await updateDoc(pDoc.ref, { [parsed.stat]: newVal, lastSync: new Date().toISOString() });
                    await addDoc(collection(db, 'cstats_editlog'), {
                        admin: aiAdmin, player: parsed.player, stat: parsed.stat,
                        oldValue: curVal, newValue: newVal, timestamp: serverTimestamp()
                    });
                    if (card) card.innerHTML = `<span style="color:#10b981;font-weight:700;"><i class="fa-solid fa-check"></i> ${parsed.stat}: ${curVal} → ${newVal} (${parsed.player})</span>`;
                } else {
                    if (card) card.innerHTML = `<span style="color:#ef4444;font-weight:700;"><i class="fa-solid fa-xmark"></i> Gracz "${escapeHtml(parsed.player)}" nie znaleziony w CStats</span>`;
                    return;
                }
            } catch(e) {
                throw e;
            }

        } else if (parsed.action === 'multi') {
            // Wiele akcji naraz
            const actions = parsed.actions || [];
            let doneCount = 0;
            for (const innerAction of actions) {
                await window.aiExecuteAction(null, innerAction);
                doneCount++;
            }
            if (card) card.innerHTML = `<span style="color:#10b981;font-weight:700;"><i class="fa-solid fa-check"></i> Wykonano ${doneCount} akcji naraz!</span>`;
            return;

        } else if (parsed.action === 'schedule') {
            // Zaplanowana akcja
            const delaySec = parsed.delaySeconds || 0;
            if (card) card.innerHTML = `<span style="color:#f59e0b;font-weight:700;"><i class="fa-solid fa-clock"></i> Zaplanowano za ${delaySec}s...</span>`;
            setTimeout(() => window.aiExecuteAction(null, parsed.innerAction), delaySec * 1000);
            showToast('info', `Akcja zaplanowana za ${delaySec} sekund!`);
            return;

        } else {
            // Wszystkie pozostałe akcje → panel_commands (plugin odbierze)
            await addDoc(collection(db, 'panel_commands'), {
                action:   parsed.action,
                player:   parsed.player   || '',
                reason:   parsed.reason   || '',
                duration: parsed.duration || '',
                rank:     parsed.rank     || '',
                message:  parsed.message  || parsed.command || '',
                admin:    aiAdmin,
                executed: false,
                createdAt: serverTimestamp()
            });
            if (card) card.innerHTML = `<span style="color:#10b981;font-weight:700;"><i class="fa-solid fa-check"></i> ${parsed.action.toUpperCase()} → ${escapeHtml(parsed.player || parsed.message || '✓')}</span>`;
        }

        // Log akcji do admin_logs
        await logAction(parsed.action, parsed.player || 'broadcast', aiAdmin,
            parsed.reason || parsed.message || '', parsed.duration || '—');
        showToast('success', 'AI: Akcja wykonana!');
    } catch(e) {
        if (card) card.innerHTML = `<span style="color:#ef4444;font-weight:700;"><i class="fa-solid fa-xmark"></i> Błąd: ${escapeHtml(e.message)}</span>`;
        showToast('error', 'Błąd AI: ' + e.message);
    }
};



 : '0.00
    } catch(e) { body.innerHTML = '<p style="color:#ef4444;">Błąd: '+e.message+'</p>'; }
});

// ─── EKWIPUNEK GRACZA ────────────────────────────────────────────────────────

// ─── EKWIPUNEK GRACZA — ulepszona wersja ─────────────────────────────────────

// Timer auto-odświeżania ekwipunku gdy modal otwarty