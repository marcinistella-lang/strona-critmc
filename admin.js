import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
    getFirestore, collection, getDocs, doc, getDoc,
    setDoc, updateDoc, deleteDoc, addDoc,
    query, orderBy, where, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

// ─── Firebase ───────────────────────────────────────────────────────
const app = initializeApp({
    apiKey: "AIzaSyBdwzCGhUtqGm0Ggfmrl2MC8_u10c_AuMQ",
    authDomain: "stronacritmcpl.firebaseapp.com",
    projectId: "stronacritmcpl",
    storageBucket: "stronacritmcpl.firebasestorage.app",
    messagingSenderId: "674591154096",
    appId: "1:674591154096:web:fee55d9cf1c83dcfbe8075"
});
const db = getFirestore(app);

// ─── Stan ────────────────────────────────────────────────────────────
let currentUser = null;
let allPlayers = [], allBans = [], allMutes = [], allLogs = [];

// ─── Nasłuch na login z inline scriptu ──────────────────────────────
window.addEventListener('adminLogin', (e) => {
    currentUser = e.detail;
    document.getElementById('su-name').textContent   = currentUser.displayName;
    document.getElementById('su-role').textContent   = currentUser.role;
    document.getElementById('su-avatar').textContent = currentUser.displayName.charAt(0).toUpperCase();
    updateServerStatus('loading', 'Łączenie...');
    loadAll();
    setTimeout(() => updateServerStatus('online', 'Serwer online'), 1500);
});

function loadAll() {
    loadPlayers();
    loadBans();
    loadMutes();
    loadLogs();
}

// ─── Server status ───────────────────────────────────────────────────
function updateServerStatus(type, text) {
    const dot = document.querySelector('.status-dot');
    if (dot) dot.className = `status-dot ${type}`;
    const span = document.getElementById('status-text');
    if (span) span.textContent = text;
}

// ─── Helpers ─────────────────────────────────────────────────────────
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

// ─── GRACZE ──────────────────────────────────────────────────────────
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
    const s = (document.getElementById('players-search').value||'').toLowerCase();
    const r = (document.getElementById('players-filter-rank').value||'').toLowerCase();
    const st = document.getElementById('players-filter-status').value;
    renderPlayers(allPlayers.filter(p => {
        const n = (p.nick||p.id||'').toLowerCase();
        if (s && !n.includes(s)) return false;
        if (r && (p.rank||'default').toLowerCase() !== r) return false;
        if (st === 'online' && !p.online) return false;
        if (st === 'offline' && p.online) return false;
        if (st === 'banned' && !p.banned) return false;
        if (st === 'muted' && !p.muted) return false;
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
    if (!confirm(`Odbanować ${nick}?`)) return;
    try {
        await deleteDoc(doc(db, 'bans', banId));
        const snap = await getDocs(query(collection(db, 'players'), where('nick','==',nick)));
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
    if (!confirm(`Odmutować ${nick}?`)) return;
    try {
        await deleteDoc(doc(db, 'mutes', muteId));
        const snap = await getDocs(query(collection(db, 'players'), where('nick','==',nick)));
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
    const s = (document.getElementById('logs-search').value||'').toLowerCase();
    const a = document.getElementById('logs-filter-action').value;
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

    // Ogólne
    const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    el('stat-total-bans',   allLogs.filter(l => l.action === 'ban').length);
    el('stat-total-mutes',  allLogs.filter(l => l.action === 'mute').length);
    el('stat-total-kicks',  allLogs.filter(l => l.action === 'kick').length);
    el('stat-total-admins', Object.keys(counts).length);

    // Tabela rankingu
    const tb = document.getElementById('stats-tbody');
    if (!tb) return;
    const sorted = Object.entries(counts).sort((a,b) => {
        const ta = Object.values(a[1]).reduce((s,v)=>s+v,0);
        const tb2 = Object.values(b[1]).reduce((s,v)=>s+v,0);
        return tb2 - ta;
    });
    if (!sorted.length) { tb.innerHTML = `<tr><td colspan="10" class="table-empty">Brak danych</td></tr>`; return; }
    tb.innerHTML = sorted.map(([admin, c], i) => {
        const total = Object.values(c).reduce((s,v)=>s+v,0);
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
    const noDur = ['unban','unmute','kick','check'];
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
    const noDur = ['unban','unmute','kick','check'];
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

    if (action === 'ban') {
        await addDoc(collection(db, 'bans'), {
            player: nick, uuid, reason, bannedBy: admin,
            duration, date: serverTimestamp()
        });
        const snap = await getDocs(query(collection(db, 'players'), where('nick','==',nick)));
        snap.forEach(async d => await updateDoc(d.ref, { banned: true }));

    } else if (action === 'unban') {
        const snap = await getDocs(query(collection(db, 'bans'), where('player','==',nick)));
        snap.forEach(async d => await deleteDoc(d.ref));
        const pSnap = await getDocs(query(collection(db, 'players'), where('nick','==',nick)));
        pSnap.forEach(async d => await updateDoc(d.ref, { banned: false }));

    } else if (action === 'mute') {
        await addDoc(collection(db, 'mutes'), {
            player: nick, uuid, reason, mutedBy: admin,
            duration, date: serverTimestamp()
        });
        const snap = await getDocs(query(collection(db, 'players'), where('nick','==',nick)));
        snap.forEach(async d => await updateDoc(d.ref, { muted: true }));

    } else if (action === 'unmute') {
        const snap = await getDocs(query(collection(db, 'mutes'), where('player','==',nick)));
        snap.forEach(async d => await deleteDoc(d.ref));
        const pSnap = await getDocs(query(collection(db, 'players'), where('nick','==',nick)));
        pSnap.forEach(async d => await updateDoc(d.ref, { muted: false }));
    }
    // kick, warn, check — tylko log (plugin wykonuje)
    await logAction(action, nick, admin, reason, duration || '—');
}

// ─── SZCZEGÓŁY GRACZA ────────────────────────────────────────────────
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

        const histSnap = await getDocs(query(collection(db, 'admin_logs'), where('player','==',p.nick||p.id)));
        const hist = histSnap.docs.map(d=>d.data()).sort((a,b)=>(b.date?.seconds||0)-(a.date?.seconds||0));

        // Notatki
        const notesSnap = await getDocs(collection(db, 'players', playerId, 'notes'));
        const notes = notesSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.date?.seconds||0)-(a.date?.seconds||0));

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
                    notes.slice(0,5).map(n=>`
                        <div style="background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.2);border-radius:8px;padding:.65rem .9rem;margin-bottom:.5rem;">
                            <div style="font-size:.85rem;color:var(--text-primary);">${n.content||'—'}</div>
                            <div style="font-size:.72rem;color:var(--text-secondary);margin-top:.3rem;">${n.author||'—'} · ${formatDate(n.date)}</div>
                        </div>`).join('')
                }
            </div>
            <div style="margin-bottom:1.5rem;">
                <div style="font-size:.78rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:.75rem;">Historia akcji (${hist.length})</div>
                ${hist.length === 0 ? '<div style="text-align:center;padding:1rem;color:var(--text-secondary);font-size:.88rem;">Brak historii</div>' :
                    hist.slice(0,10).map(h=>`
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

// ─── NOTATKI ─────────────────────────────────────────────────────────
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
        // Znajdź ID gracza
        const snap = await getDocs(query(collection(db, 'players'), where('nick','==',nick)));
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

// ─── HELPERS MSG ─────────────────────────────────────────────────────
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
