import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";

import {

    getFirestore, collection, getDocs, doc, getDoc,

    setDoc, updateDoc, deleteDoc, addDoc, onSnapshot,

    query, orderBy, where, serverTimestamp, Timestamp

} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";



// â”€â”€â”€ Firebase â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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



// â”€â”€â”€ Stan â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let currentUser = null;

let allPlayers = [], allBans = [], allMutes = [], allLogs = [];

let allFiles = [];



// â”€â”€â”€ Domyślne konta (fallback gdy Firestore puste) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const DEFAULT_ACCOUNTS = [

    { login: 'test', password: 'test', displayName: 'Test Admin', role: 'Zarządzający', permissions: ['all'] }

];



// â”€â”€â”€ Uprawnienia per ranga â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const ROLE_PERMISSIONS = {

    'ChatMod':      ['mute', 'warn', 'check'],

    'Pomocnik':     ['mute', 'warn', 'check', 'players'],

    'Moderator':    ['ban', 'mute', 'kick', 'warn', 'check', 'players', 'logs', 'evidence_view'],

    'Admin':        ['ban', 'unban', 'mute', 'unmute', 'kick', 'warn', 'check', 'players', 'logs', 'notes', 'site', 'shop', 'media_manage', 'evidence_view', 'evidence_delete'],

    'Zarządzający': ['all']

};



const ROLE_ORDER = ['ChatMod', 'Pomocnik', 'Moderator', 'Admin', 'Zarządzający'];

const PERMISSIONS_PL = {

    players: { label: 'Podgląd graczy', desc: 'Może przeglądać listę graczy i ich status.' },

    ban: { label: 'Nadawanie banów', desc: 'Może nadawać bany na graczy.' },

    unban: { label: 'Zdejmowanie banów', desc: 'Może odbanowywać graczy.' },

    mute: { label: 'Nadawanie mutów', desc: 'Może nadawać muty.' },

    unmute: { label: 'Zdejmowanie mutów', desc: 'Może zdejmować muty.' },

    kick: { label: 'Wyrzucanie graczy', desc: 'Może wyrzucać graczy z serwera.' },

    warn: { label: 'Ostrzeżenia', desc: 'Może nadawać ostrzeżenia administracyjne.' },

    check: { label: 'Sprawdzanie graczy', desc: 'Może wykonywać akcje kontrolne i sprawdzenia.' },

    logs: { label: 'Podgląd logów', desc: 'Może przeglądać historię akcji administracji.' },

    notes: { label: 'Notatki administracyjne', desc: 'Może dodawać notatki do graczy.' },

    site: { label: 'Zarządzanie stroną', desc: 'Może edytować konkursy, media i treści strony.' },

    shop: { label: 'Zarządzanie sklepem', desc: 'Może edytować produkty, zestawy i ceny sklepu.' },

    media_manage: { label: 'Zarządzanie mediami', desc: 'Może dodawać multimedia do strony i aktualności.' },

    evidence_view: { label: 'Podgląd załączników', desc: 'Może otwierać dowody, linki i załączniki do kar.' },

    evidence_delete: { label: 'Usuwanie załączników', desc: 'Może usuwać załączniki z bazy plików.' },

    permissions_manage: { label: 'Zarządzanie uprawnieniami', desc: 'Może edytować Domyślne uprawnienia rang.' },

    admins_manage: { label: 'Zarządzanie administratorami', desc: 'Może dodawać i edytować konta administratorów.' },

    all: { label: 'Pełny dostęp', desc: 'Ma pełny dostęp do całego panelu.' }

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



function permissionLabel(key) {

    return PERMISSIONS_PL[key]?.label || key;

}



async function loadRolePermissionsFromStore() {

    try {

        const snap = await getDoc(doc(db, 'panel_settings', 'role_permissions'));

        if (!snap.exists()) return;

        const roles = snap.data()?.roles || {};

        Object.entries(roles).forEach(([role, perms]) => {

            if (Array.isArray(perms)) {

                ROLE_PERMISSIONS[role] = ensureAdminPermissions(perms);

            }

        });

    } catch (e) {

        console.warn('loadRolePermissionsFromStore:', e.message);

    }

}



// â”€â”€â”€ Nasłuch na login z inline scriptu â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

window.checkAlts = function(isApPage = false) {

    const nick = isApPage

        ? document.getElementById('ap-nick')?.value.trim()

        : (window._actionModalPlayer?.nick || window._actionModalPlayer?.id);

    if (!nick) { showToast('error', 'Podaj nick gracza!'); return; }



    const p = allPlayers.find(pl => (pl.nick||pl.id).toLowerCase() === nick.toLowerCase());



    // Usuńń poprzedni popup jeśli byćł

    document.getElementById('alts-popup-overlay')?.remove();



    const overlay = document.createElement('div');

    overlay.id = 'alts-popup-overlay';

    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);z-index:1500;display:flex;align-items:center;justify-content:center;padding:1rem;';

    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };



    const ip = p?.ip;

    let alts = [];

    if (ip && ip !== 'unknown') {

        alts = allPlayers.filter(pl => pl.ip === ip && (pl.nick||pl.id).toLowerCase() !== nick.toLowerCase());

    }



    const ipBadge = ip ? `<span style="font-size:.75rem;background:rgba(59,130,246,.1);color:#3b82f6;border:1px solid rgba(59,130,246,.25);padding:.2rem .55rem;border-radius:999px;font-weight:700;font-family:monospace;">

        <i class="fa-solid fa-network-wired"></i> ${ip}</span>` : `<span style="font-size:.75rem;color:#9ca3af;">brak IP w bazie</span>`;



    const altsHtml = alts.length === 0

        ? `<div style="text-align:center;padding:1.5rem;color:var(--text-secondary);font-size:.9rem;"><i class="fa-solid fa-circle-check" style="color:#10b981;font-size:1.4rem;display:block;margin-bottom:.5rem;"></i>Brak powiązanych kont</div>`

        : alts.map(pl => `<div class="alt-account">

            <img class="player-head" src="https://mc-heads.net/avatar/${encodeURIComponent(pl.nick||pl.id)}/32" alt="${pl.nick||pl.id}" onerror="this.src='https://mc-heads.net/avatar/Steve/32'">

            <span>${escapeHtml(pl.nick||pl.id)}</span>

            <span style="margin-left:auto;font-size:.75rem;color:var(--text-secondary);">${pl.online ? '<span style="color:#10b981;"><i class="fa-solid fa-circle fa-xs"></i> Online</span>' : 'Offline'}</span>

        </div>`).join('');



    overlay.innerHTML = `<div class="alts-popup">

        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">

            <h3><i class="fa-solid fa-users-viewfinder" style="color:#8b5cf6;"></i> Multikonta "” ${escapeHtml(nick)}</h3>

            <button onclick="document.getElementById('alts-popup-overlay').remove()" style="background:none;border:1.5px solid var(--border);border-radius:6px;width:30px;height:30px;cursor:pointer;font-size:.9rem;color:var(--text-secondary);display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-xmark"></i></button>

        </div>

        <div style="margin-bottom:1rem;">Adres IP: ${ipBadge}</div>

        <div style="font-size:.75rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.6rem;">

            Znalezione powiązane konta (${alts.length})

        </div>

        ${altsHtml}

    </div>`;



    document.body.appendChild(overlay);

};



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



// â”€â”€â”€ initPanelUI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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



// â”€â”€â”€ applyPermissions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

    if (adminsNav) adminsNav.style.display = (hasPermission('all') || hasPermission('admins_manage')) ? '' : 'none';

    const logsNav = document.querySelector('.nav-btn[data-page="logs"]');

    if (logsNav) logsNav.style.display = hasPermission('logs') ? '' : 'none';

    const filesNav = document.querySelector('.nav-btn[data-page="files"]');

    if (filesNav) filesNav.style.display = (hasPermission('evidence_view') || hasPermission('all')) ? '' : 'none';

    const siteNav = document.querySelector('.nav-btn[data-page="site"]');

    if (siteNav) siteNav.style.display = (hasPermission('site') || hasPermission('all')) ? '' : 'none';

    const shopNav = document.querySelector('.nav-btn[data-page="shop"]');

    if (shopNav) shopNav.style.display = (hasPermission('shop') || hasPermission('all')) ? '' : 'none';

    const permNav = document.querySelector('.nav-btn[data-page="permissions"]');

    if (permNav) permNav.style.display = (hasPermission('permissions_manage') || hasPermission('all')) ? '' : 'none';

}



// â”€â”€â”€ showLoginError â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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



// â”€â”€â”€ loadAll â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function loadAll() {

    loadPlayers();

    loadBans();

    loadMutes();

    loadLogs();

    loadRolePermissionsFromStore();

}



// â”€â”€â”€ Server status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function updateServerStatus(type, text) {

    const dot = document.querySelector('.status-dot');

    if (dot) dot.className = `status-dot ${type}`;

    const span = document.getElementById('status-text');

    if (span) span.textContent = text;

}



// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function formatDate(val) {

    if (!val) return '"”';

    let d;

    if (val instanceof Timestamp) d = val.toDate();

    else if (val?.seconds) d = new Date(val.seconds * 1000);

    else d = new Date(val);

    if (isNaN(d)) return '"”';

    return d.toLocaleString('pl-PL', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });

}



function escapeHtml(value) {

    return String(value ?? '')

        .replace(/&/g, '&amp;')

        .replace(/</g, '&lt;')

        .replace(/>/g, '&gt;')

        .replace(/"/g, '&quot;')

        .replace(/'/g, '&#39;');

}



function formatBytes(bytes) {

    const n = Number(bytes) || 0;

    if (n <= 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB'];

    const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);

    const v = n / Math.pow(1024, i);

    const txt = v >= 10 || i === 0 ? v.toFixed(0) : v.toFixed(1);

    return `${txt} ${units[i]}`;

}



window.openAttachmentUrl = function(encodedUrl) {

    try {

        const url = decodeURIComponent(encodedUrl || '');

        if (!url) return;

        // Wszystkie URLe otwieramy w nowej karcie "” prywatne B2 przez Worker proxy

        window.open(url, '_blank', 'noopener,noreferrer');

    } catch(e) {

        showToast('error', 'Nie udało się otworzyć pliku.');

    }

};



window.previewShopMediaInput = function() {

    const input = document.getElementById('shop-item-media-file');

    const preview = document.getElementById('shop-item-media-preview');

    if (!input || !preview) return;

    const file = input.files?.[0];

    if (!file) {

        preview.style.display = 'none';

        preview.innerHTML = '';

        return;

    }

    const objectUrl = URL.createObjectURL(file);

    const isVideo = file.type.startsWith('video/');

    preview.style.display = 'block';

    preview.innerHTML = isVideo

        ? `<video src="${objectUrl}" controls style="width:100%;max-height:240px;border-radius:8px;object-fit:cover;"></video>`

        : `<img src="${objectUrl}" alt="Podgląd media" style="width:100%;max-height:240px;border-radius:8px;object-fit:cover;">`;

};



window.previewShopItemMedia = function() {

    const url = document.getElementById('shop-item-media-url').value.trim();

    const preview = document.getElementById('shop-item-media-preview');

    if (!preview) return;

    if (!url) {

        preview.style.display = 'none';

        preview.innerHTML = '';

        showToast('error', 'Dodaj link albo plik media.');

        return;

    }

    const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(url);

    preview.style.display = 'block';

    preview.innerHTML = isVideo

        ? `<video src="${escapeHtml(url)}" controls style="width:100%;max-height:240px;border-radius:8px;object-fit:cover;"></video>`

        : `<img src="${escapeHtml(url)}" alt="Podgląd media" style="width:100%;max-height:240px;border-radius:8px;object-fit:cover;">`;

};



window.openShopPreview = function() {

    window.open('../shop.html', '_blank', 'noopener');

};



window.showAttachmentText = function(encodedText) {

    const text = decodeURIComponent(encodedText || '');

    if (!text) return;

    alert(text);

};



function renderAttachmentCell(attachment) {

    if (!attachment || !attachment.type) return `<span style="color:var(--text-secondary);">—</span>`;



    if (attachment.type === 'link' && attachment.url) {

        return `<button class="tbl-btn" onclick="openAttachmentUrl('${encodeURIComponent(attachment.url)}')" title="Otwórz link">

            <i class="fa-solid fa-link"></i>

        </button>`;

    }



    if (attachment.type === 'text' && attachment.text) {

        const short = attachment.text.length > 24 ? attachment.text.slice(0, 24) + '…' : attachment.text;

        return `<button class="tbl-btn" onclick="showAttachmentText('${encodeURIComponent(attachment.text)}')" title="Pokaż tre>ć">

            <i class="fa-solid fa-note-sticky"></i> ${escapeHtml(short)}

        </button>`;

    }



    if (attachment.type === 'file') {

        if (attachment.url) {

            const label = escapeHtml(attachment.fileName || 'plik');

            return `<button class="tbl-btn" onclick="openAttachmentUrl('${encodeURIComponent(attachment.url)}')" title="Otwórz plik">

                <i class="fa-solid fa-paperclip"></i> ${label}

            </button>`;

        }

        if (attachment.provider === 'b2' || attachment.fileKey) {

            const label = escapeHtml(attachment.fileName || 'plik B2');

            return `<span class="tbl-btn" title="${escapeHtml(attachment.fileKey || 'Backblaze B2')}">

                <i class="fa-solid fa-paperclip"></i> ${label}

            </span>`;

        }

        return `<span style="color:var(--text-secondary);font-size:.82rem;">${escapeHtml(attachment.status || 'brak')}</span>`;

    }



    return `<span style="color:var(--text-secondary);">—</span>`;

}



async function uploadEvidenceFile(file, meta) {

    if (!file) throw new Error('Brak pliku do wyslania');



    const admin  = meta?.admin  || currentUser?.displayName || 'Panel';

    const player = meta?.player || '';

    const action = meta?.action || '';

    const reason = meta?.reason || '';



    const form = new FormData();

    form.append('file', file);

    form.append('player', player);

    form.append('action', action);

    form.append('reason', reason);

    form.append('admin', admin);



    const res = await fetch(`${FILE_WORKER_URL}/upload/evidence`, {

        method: 'POST',

        body: form

    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok || !data?.file) {

        throw new Error(data?.error || 'Nie udalo sie wyslac pliku do Backblaze');

    }



    const uploaded = data.file;



    // URL do pliku — przez Worker proxy (działa dla prywatnych i publicznych)

    const fileUrl = uploaded.url || `${FILE_WORKER_URL}/file/${encodeURIComponent(uploaded.fileKey)}`;



    const fileRefDoc = await addDoc(collection(db, 'files'), {

        kind:         'evidence',

        provider:     'r2',

        bucket:       uploaded.bucket   || 'critmc-files',

        fileKey:      uploaded.fileKey  || '',

        b2FileId:     uploaded.b2FileId || null,

        originalName: uploaded.fileName || file.name,

        mimeType:     uploaded.mimeType || file.type || 'application/octet-stream',

        size:         uploaded.size     || file.size || 0,

        url:          fileUrl,

        uploadedAt:   serverTimestamp(),

        uploadedBy:   admin,

        player,

        action,

        reason,

        status: 'ready'

    });



    return {
        type:     'file',
        provider: 'r2',
        fileId:   fileRefDoc.id,
        fileName: uploaded.fileName || file.name,
        mimeType: uploaded.mimeType || file.type || 'application/octet-stream',
        size:     uploaded.size || file.size || 0,
        bucket:   uploaded.bucket   || 'critmc-files',
        fileKey:  uploaded.fileKey  || '',
        url:      fileUrl,
        status:   'ready'
    };
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



// ——— GRACZE —————————————————————————————————————————————————————————————

let unsubscribePlayers = null;

function loadPlayers() {
    if (unsubscribePlayers) return;
    try {
        unsubscribePlayers = onSnapshot(collection(db, 'players'), (snap) => {
            const raw = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            // Deduplikuj po nicku — zostaw najnowszy wpis dla każdego gracza
            const byNick = new Map();
            raw.forEach(p => {
                const key = (p.nick || p.id || '').toLowerCase();
                const existing = byNick.get(key);
                if (!existing) {
                    byNick.set(key, p);
                } else {
                    const existTs = existing.lastSeen?.seconds || 0;
                    const newTs   = p.lastSeen?.seconds       || 0;
                    if (newTs > existTs) byNick.set(key, p);
                }
            });
            allPlayers = [...byNick.values()].sort((a, b) => {
                if (a.online && !b.online) return -1;
                if (!a.online && b.online) return 1;
                return (a.nick||a.id||'').localeCompare(b.nick||b.id||'');
            });
            filterPlayers();
            // Odśwież panel Nadaj karę jeśli aktywny
            if (document.getElementById('page-action')?.classList.contains('active')) {
                refreshApPlayers();
            }
            // Odśwież statystyki na stronie info jeśli aktywna
            const infoPage = document.getElementById('page-info');
            if (infoPage?.classList.contains('active')) {
                _setEl('info-stat-players', allPlayers.length);
                _setEl('info-stat-online',  allPlayers.filter(p => p.online).length);
            }
        }, (e) => {
            document.getElementById('players-tbody').innerHTML =
                `<tr><td colspan="5" class="table-empty" style="color:#ef4444;"><i class="fa-solid fa-circle-exclamation"></i> Błąd: ${e.message}</td></tr>`;
        });
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

            <td><span style="font-family:monospace;font-size:0.8rem;color:var(--accent-blue);"><i class="fa-solid fa-network-wired"></i> ${p.ip || 'brak'}</span></td>

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

        const ip = (p.ip||'').toLowerCase();

        if (s && !n.includes(s) && !ip.includes(s)) return false;

        if (r && (p.rank||'default').toLowerCase() !== r) return false;

        if (st === 'online'  && !p.online)  return false;

        if (st === 'offline' && p.online)   return false;

        if (st === 'banned'  && !p.banned)  return false;

        if (st === 'muted'   && !p.muted)   return false;

        return true;

    }));

};



// ——— BANY ———————————————————————————————————————————————————————————————

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

    if (!list.length) { tb.innerHTML = `<tr><td colspan="7" class="table-empty"><i class="fa-solid fa-check-circle" style="color:var(--accent-green)"></i> Brak aktywnych banów</td></tr>`; return; }

    tb.innerHTML = list.map(b => `

        <tr>

            <td><div class="player-cell">${head(b.player)}<div class="player-name">${b.player}</div></div></td>

            <td style="max-width:180px;color:var(--text-secondary);font-size:.85rem;">${b.reason||'—'}</td>

            <td><span style="font-weight:700;">${b.bannedBy||'—'}</span></td>

            <td style="font-size:.82rem;color:var(--text-secondary);">${formatDate(b.date)}</td>

            <td>${b.duration==='permanent'?`<span class="badge badge-action-ban">Permanentny</span>`:`<span style="font-size:.82rem;">${b.duration||'—'}</span>`}</td>

            <td>${renderAttachmentCell(b.attachment)}</td>

            <td><div style="display:flex;gap:.4rem;flex-wrap:wrap;">

                <button class="tbl-btn" onclick="viewBanDetails('${b.id}')"><i class="fa-solid fa-eye"></i> Zobacz</button>

                <button class="tbl-btn" onclick="openEditBanModal('${b.id}')"><i class="fa-solid fa-pen"></i> Edytuj</button>

                <button class="tbl-btn tbl-btn-green" onclick="quickUnban('${b.player}','${b.id}')"><i class="fa-solid fa-check"></i> Unban</button>

            </div></td>

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



function banById(banId) {

    return allBans.find(b => b.id === banId) || null;

}



function toDatetimeLocalValue(value) {

    let d;

    if (value instanceof Timestamp) d = value.toDate();

    else if (value?.seconds) d = new Date(value.seconds * 1000);

    else if (value) d = new Date(value);

    else d = new Date();

    if (isNaN(d)) d = new Date();

    const pad = n => String(n).padStart(2, '0');

    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

}



function datetimeLocalToDate(value) {

    if (!value) return null;

    const d = new Date(value);

    return isNaN(d) ? null : d;

}



function attachmentSummary(attachment) {

    if (!attachment || !attachment.type) return 'Brak';

    if (attachment.type === 'link') return attachment.url || 'Link';

    if (attachment.type === 'text') return attachment.text || 'Notatka';

    if (attachment.type === 'file') return attachment.fileName || attachment.fileKey || 'Plik';

    return attachment.type;

}



function ensureBanModals() {

    if (document.getElementById('ban-detail-modal')) return;



    const wrap = document.createElement('div');

    wrap.innerHTML = `

        <div class="modal-overlay" id="ban-detail-modal" onclick="closeModal(event)">

            <div class="modal-box" style="max-width:720px;">

                <div class="modal-header">

                    <div class="modal-title">Szczegóły bana</div>

                    <button class="modal-close" onclick="document.getElementById('ban-detail-modal').classList.remove('open')"><i class="fa-solid fa-xmark"></i></button>

                </div>

                <div class="modal-body" id="ban-detail-body"></div>

            </div>

        </div>

        <div class="modal-overlay" id="ban-edit-modal" onclick="closeModal(event)">

            <div class="modal-box" style="max-width:760px;">

                <div class="modal-header">

                    <div class="modal-title">Edytuj bana</div>

                    <button class="modal-close" onclick="document.getElementById('ban-edit-modal').classList.remove('open')"><i class="fa-solid fa-xmark"></i></button>

                </div>

                <div class="modal-body">

                    <input type="hidden" id="ban-edit-id">

                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">

                        <div class="modal-field"><label>Gracz</label><input type="text" id="ban-edit-player"></div>

                        <div class="modal-field"><label>Nadany przez</label><input type="text" id="ban-edit-być"></div>

                    </div>

                    <div class="modal-field"><label>Powod</label><input type="text" id="ban-edit-reason"></div>

                    <div class="modal-field"><label>Opis / notatka</label><textarea id="ban-edit-description" rows="3" style="width:100%;padding:.7rem .9rem;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:.9rem;color:var(--text-primary);background:var(--bg-card);outline:none;font-family:var(--font);resize:vertical;"></textarea></div>

                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">

                        <div class="modal-field"><label>Czas bana</label><input type="text" id="ban-edit-duration" placeholder="permanent, 7d, 12h..."></div>

                        <div class="modal-field"><label>Data i godzina nadania</label><input type="datetime-local" id="ban-edit-date"></div>

                    </div>

                    <div class="modal-field">

                        <label>Załącznik</label>

                        <select id="ban-edit-attachment-type" style="width:100%;padding:.7rem .9rem;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:.92rem;color:var(--text-primary);background:var(--bg-card);outline:none;font-family:var(--font);margin-bottom:.6rem;" onchange="toggleActionAttachmentFields('ban-edit')">

                            <option value="">Bez zmian</option>

                            <option value="remove">Usuń załącznik</option>

                            <option value="link">Nowy link</option>

                            <option value="text">Nowa notatka</option>

                            <option value="file">Nowy plik Backblaze</option>

                        </select>

                        <input type="text" id="ban-edit-attachment-link" placeholder="https://..." style="display:none;width:100%;padding:.7rem .9rem;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:.92rem;color:var(--text-primary);background:var(--bg-card);outline:none;font-family:var(--font);margin-bottom:.6rem;">

                        <textarea id="ban-edit-attachment-text" rows="3" placeholder="Tresc notatki..." style="display:none;width:100%;padding:.7rem .9rem;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:.9rem;color:var(--text-primary);background:var(--bg-card);outline:none;font-family:var(--font);resize:vertical;margin-bottom:.6rem;"></textarea>

                        <input type="file" id="ban-edit-attachment-file" accept="image/*,video/*,.zip,.rar,.7z,.txt,.pdf" style="display:none;width:100%;padding:.55rem .7rem;border:1.5px dashed var(--border);border-radius:var(--radius-sm);font-size:.88rem;color:var(--text-primary);background:var(--bg-card);outline:none;font-family:var(--font);margin-bottom:.45rem;">

                        <div id="ban-edit-current-attachment" style="font-size:.78rem;color:var(--text-secondary);"></div>

                    </div>

                    <div id="ban-edit-msg" class="modal-msg" style="display:none;"></div>

                    <button class="modal-submit-btn" onclick="saveEditedBan()"><i class="fa-solid fa-floppy-disk"></i> Zapisz zmiany</button>

                </div>

            </div>

        </div>`;

    Array.from(wrap.children).forEach(el => document.body.appendChild(el));

}



window.viewBanDetails = function(banId) {

    const b = banById(banId);

    if (!b) { showToast('error', 'Nie znaleziono bana.'); return; }

    ensureBanModals();

    const body = document.getElementById('ban-detail-body');

    body.innerHTML = `

        <div class="modal-player-info">${head(b.player)}<div><div style="font-weight:800;">${escapeHtml(b.player || 'Brak gracza')}</div><div style="font-size:.78rem;color:var(--text-secondary);">ID: ${escapeHtml(b.id)}</div></div></div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.8rem;">

            <div><label style="font-size:.72rem;color:var(--text-secondary);font-weight:800;text-transform:uppercase;">Powod</label><div>${escapeHtml(b.reason || 'Brak')}</div></div>

            <div><label style="font-size:.72rem;color:var(--text-secondary);font-weight:800;text-transform:uppercase;">Przez kogo</label><div>${escapeHtml(b.bannedBy || 'Brak')}</div></div>

            <div><label style="font-size:.72rem;color:var(--text-secondary);font-weight:800;text-transform:uppercase;">Data</label><div>${formatDate(b.date)}</div></div>

            <div><label style="font-size:.72rem;color:var(--text-secondary);font-weight:800;text-transform:uppercase;">Czas</label><div>${escapeHtml(b.duration || 'Brak')}</div></div>

            <div><label style="font-size:.72rem;color:var(--text-secondary);font-weight:800;text-transform:uppercase;">UUID</label><div>${escapeHtml(b.uuid || 'Brak')}</div></div>

            <div><label style="font-size:.72rem;color:var(--text-secondary);font-weight:800;text-transform:uppercase;">Zalacznik</label><div>${escapeHtml(attachmentSummary(b.attachment))}</div></div>

        </div>

        <div><label style="font-size:.72rem;color:var(--text-secondary);font-weight:800;text-transform:uppercase;">Opis / notatka</label><div style="white-space:pre-wrap;">${escapeHtml(b.description || b.note || 'Brak')}</div></div>

        <div style="display:flex;gap:.5rem;flex-wrap:wrap;">

            ${b.attachment ? renderAttachmentCell(b.attachment) : ''}

            <button class="tbl-btn" onclick="document.getElementById('ban-detail-modal').classList.remove('open');openEditBanModal('${b.id}')"><i class="fa-solid fa-pen"></i> Edytuj</button>

        </div>`;

    document.getElementById('ban-detail-modal').classList.add('open');

};



window.openEditBanModal = function(banId) {

    const b = banById(banId);

    if (!b) { showToast('error', 'Nie znaleziono bana.'); return; }

    if (!requirePermission('ban', 'edycja bana')) return;

    ensureBanModals();

    document.getElementById('ban-edit-id').value = b.id;

    document.getElementById('ban-edit-player').value = b.player || '';

    document.getElementById('ban-edit-być').value = b.bannedBy || '';

    document.getElementById('ban-edit-reason').value = b.reason || '';

    document.getElementById('ban-edit-description').value = b.description || b.note || '';

    document.getElementById('ban-edit-duration').value = b.duration || '';

    document.getElementById('ban-edit-date').value = toDatetimeLocalValue(b.date);

    document.getElementById('ban-edit-attachment-type').value = '';

    document.getElementById('ban-edit-attachment-link').value = '';

    document.getElementById('ban-edit-attachment-text').value = '';

    document.getElementById('ban-edit-attachment-file').value = '';

    document.getElementById('ban-edit-current-attachment').textContent = `Obecny: ${attachmentSummary(b.attachment)}`;

    document.getElementById('ban-edit-msg').style.display = 'none';

    window.toggleActionAttachmentFields('ban-edit');

    document.getElementById('ban-edit-modal').classList.add('open');

};



window.saveEditedBan = async function() {

    const banId = document.getElementById('ban-edit-id').value;

    const b = banById(banId);

    if (!b) { showToast('error', 'Nie znaleziono bana.'); return; }

    if (!requirePermission('ban', 'edycja bana')) return;

    const msg = document.getElementById('ban-edit-msg');

    const showEditMsg = (type, text) => {

        if (!msg) return;

        msg.className = `modal-msg ${type}`;

        msg.textContent = text;

        msg.style.display = 'block';

    };



    try {

        const date = datetimeLocalToDate(document.getElementById('ban-edit-date').value);

        const updates = {

            player: document.getElementById('ban-edit-player').value.trim(),

            bannedBy: document.getElementById('ban-edit-być').value.trim(),

            reason: document.getElementById('ban-edit-reason').value.trim(),

            description: document.getElementById('ban-edit-description').value.trim(),

            duration: document.getElementById('ban-edit-duration').value.trim(),

            editedAt: serverTimestamp(),

            editedBy: currentUser?.displayName || 'Admin'

        };

        if (date) updates.date = Timestamp.fromDate(date);



        const attachmentMode = document.getElementById('ban-edit-attachment-type').value;

        if (attachmentMode === 'remove') {

            updates.attachment = null;

        } else if (attachmentMode === 'link') {

            const url = document.getElementById('ban-edit-attachment-link').value.trim();

            if (!url) throw new Error('Podaj link zalacznika.');

            updates.attachment = { type: 'link', url };

        } else if (attachmentMode === 'text') {

            const text = document.getElementById('ban-edit-attachment-text').value.trim();

            if (!text) throw new Error('Podaj tresc notatki.');

            updates.attachment = { type: 'text', text };

        } else if (attachmentMode === 'file') {

            const file = document.getElementById('ban-edit-attachment-file').files?.[0];

            if (!file) throw new Error('Wybierz plik.');

            showEditMsg('success', 'Wysylam plik do Backblaze...');

            updates.attachment = await uploadEvidenceFile(file, {

                player: updates.player,

                action: 'ban',

                reason: updates.reason,

                admin: currentUser?.displayName || 'Panel'

            });

        }



        await updateDoc(doc(db, 'bans', banId), updates);

        await logAction('edit-ban', updates.player || b.player, currentUser?.displayName || 'Admin', 'Edytowano bana', updates.duration || '---', { banId });

        showToast('success', 'Ban zapisany.');

        document.getElementById('ban-edit-modal').classList.remove('open');

        await loadBans();

        await loadLogs();

    } catch (e) {

        showEditMsg('error', 'Blad: ' + e.message);

    }

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



// ——— MUTY ———————————————————————————————————————————————————————————————

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

    if (!list.length) { tb.innerHTML = `<tr><td colspan="7" class="table-empty"><i class="fa-solid fa-check-circle" style="color:var(--accent-green)"></i> Brak aktywnych mutów</td></tr>`; return; }

    tb.innerHTML = list.map(m => `

        <tr>

            <td><div class="player-cell">${head(m.player)}<div class="player-name">${m.player}</div></div></td>

            <td style="max-width:180px;color:var(--text-secondary);font-size:.85rem;">${m.reason||'—'}</td>

            <td><span style="font-weight:700;">${m.mutedBy||'—'}</span></td>

            <td style="font-size:.82rem;color:var(--text-secondary);">${formatDate(m.date)}</td>

            <td>${m.duration==='permanent'?`<span class="badge badge-action-mute">Permanentny</span>`:`<span style="font-size:.82rem;">${m.duration||'—'}</span>`}</td>

            <td>${renderAttachmentCell(m.attachment)}</td>

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



// ——— LOGI ———————————————————————————————————————————————————————————————

async function loadLogs() {

    try {

        const snap = await getDocs(query(collection(db, 'admin_logs'), orderBy('date', 'desc')));

        allLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        renderLogs(allLogs);

        buildAdminFilter();

        refreshApPlayers();

        loadStats();

    } catch (e) { console.error('loadLogs:', e); }

}



function renderLogs(list) {

    const tb = document.getElementById('logs-tbody');

    if (!list.length) { tb.innerHTML = `<tr><td colspan="7" class="table-empty">Brak logów</td></tr>`; return; }

    tb.innerHTML = list.map(l => `

        <tr>

            <td>${actionBadge(l.action)}</td>

            <td><div class="player-cell">${head(l.player)}<div class="player-name">${l.player}</div></div></td>

            <td><span style="font-weight:700;">${l.admin||'—'}</span></td>

            <td style="max-width:180px;color:var(--text-secondary);font-size:.85rem;">${l.reason||'—'}</td>

            <td style="font-size:.82rem;color:var(--text-secondary);">${l.duration||'—'}</td>

            <td>${renderAttachmentCell(l.attachment)}</td>

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



// ——— STATYSTYKI —————————————————————————————————————————————————————————

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



// ——— GRACZE NA STRONIE "NADAJ KARĘ" ——————————————————————————————————————

function renderApPlayers(list) {
    const el = document.getElementById('ap-players-list');
    if (!el) return;
    if (!list.length) {
        el.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-secondary);font-size:.88rem;"><i class="fa-solid fa-users-slash"></i><br>Brak graczy w bazie</div>`;
        return;
    }
    el.innerHTML = list.map(p => {
        const nick = p.nick || p.id || '?';
        const online = p.online;
        const banned = p.banned;
        const muted  = p.muted;
        let statusDot = online
            ? `<span style="width:7px;height:7px;border-radius:50%;background:#10b981;display:inline-block;flex-shrink:0;box-shadow:0 0 4px #10b981;"></span>`
            : `<span style="width:7px;height:7px;border-radius:50%;background:#9ca3af;display:inline-block;flex-shrink:0;"></span>`;
        let flags = '';
        if (banned) flags += `<span style="font-size:.65rem;background:rgba(239,68,68,.12);color:#dc2626;border:1px solid rgba(220,38,38,.2);padding:.1rem .4rem;border-radius:999px;font-weight:700;">BAN</span>`;
        if (muted)  flags += `<span style="font-size:.65rem;background:rgba(245,158,11,.12);color:#d97706;border:1px solid rgba(217,119,6,.2);padding:.1rem .4rem;border-radius:999px;font-weight:700;margin-left:.2rem;">MUTE</span>`;
        return `<div style="display:flex;align-items:center;gap:.65rem;padding:.6rem 1rem;border-bottom:1px solid var(--border);cursor:pointer;transition:background .15s;"
            onmouseenter="this.style.background='var(--bg)'" onmouseleave="this.style.background=''"
            onclick="apSelectPlayer('${escapeHtml(nick)}')">
            ${statusDot}
            <img src="https://mc-heads.net/avatar/${encodeURIComponent(nick)}/28" style="width:28px;height:28px;border-radius:5px;image-rendering:pixelated;border:1px solid var(--border);flex-shrink:0;" onerror="this.src='https://mc-heads.net/avatar/Steve/28'">
            <div style="flex:1;min-width:0;">
                <div style="font-weight:700;font-size:.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(nick)}</div>
                <div style="font-size:.72rem;color:var(--text-secondary);">${p.ip ? `<i class="fa-solid fa-network-wired" style="font-size:.65rem;"></i> ${p.ip}` : ''} ${flags}</div>
            </div>
            <button style="background:var(--accent);border:none;color:#fff;padding:.3rem .65rem;border-radius:5px;font-size:.75rem;font-weight:700;cursor:pointer;flex-shrink:0;font-family:var(--font);"
                onclick="event.stopPropagation();apSelectPlayer('${escapeHtml(nick)}')">
                Wybierz
            </button>
        </div>`;
    }).join('');
}

window.apFilterPlayers = function() {
    const s = (document.getElementById('ap-players-search')?.value || '').toLowerCase();
    const filtered = s
        ? allPlayers.filter(p => (p.nick||p.id||'').toLowerCase().includes(s) || (p.ip||'').includes(s))
        : allPlayers;
    renderApPlayers(filtered.slice(0, 50));
};

window.apSelectPlayer = function(nick) {
    const input = document.getElementById('ap-nick');
    if (input) {
        input.value = nick;
        apSearchPlayer(nick);
    }
};

// Odśwież listę graczy przy wejściu na stronę Nadaj karę
function refreshApPlayers() {
    renderApPlayers(allPlayers.slice(0, 50));
}

// ——— LOG AKCJI —————————————————————————————————————————————————————————

async function logAction(action, player, admin, reason, duration, extra = {}) {

    try {

        await addDoc(collection(db, 'admin_logs'), {

            action, player, admin, reason,

            duration: duration || '—',

            ...extra,

            date: serverTimestamp()

        });

    } catch (e) { console.error('logAction:', e); }

}



// ——— AKCJA NA GRACZU (modal) ———————————————————————————————————————————

window.addEventListener('submitModalAction', async () => {

    const reason   = document.getElementById('action-reason').value.trim();

    const custom   = document.getElementById('duration-custom').value.trim();

    const duration = custom || window._selectedDuration;

    const action   = window._selectedAction;

    const player   = window._actionModalPlayer;



    if (!action)   { showModalMsg('error', 'Wybierz akcję!'); return; }

    if (action === 'message') {

        if (!reason) { showModalMsg('error', 'Podaj tre>ć wiadomo>ci!'); return; }

    } else {

        if (!reason) { showModalMsg('error', 'Podaj powód!'); return; }

    }

    const noDur = ['unban', 'unmute', 'kick', 'check', 'warn', 'message'];

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



// ——— AKCJA ZE STRONY "NADAJ KARĘ" —————————————————————————————————————

window.addEventListener('apSubmitAction', async () => {

    const nick     = document.getElementById('ap-nick').value.trim();

    const action   = window._apAction;

    const custom   = document.getElementById('ap-duration-custom').value.trim();

    const duration = custom || window._apDuration;

    const reason   = document.getElementById('ap-reason').value.trim();

    let attachment = buildActionAttachmentPayload('ap');



    if (!nick)   { showApMsg('error', 'Podaj nick gracza!'); return; }

    if (!action) { showApMsg('error', 'Wybierz rodzaj akcji!'); return; }

    if (action === 'message') {

        if (!reason) { showApMsg('error', 'Podaj tre>ć wiadomo>ci!'); return; }

    } else {

        if (!reason) { showApMsg('error', 'Podaj powód!'); return; }

    }

    const noDur = ['unban', 'unmute', 'kick', 'check', 'warn', 'message'];

    if (!noDur.includes(action) && !duration) { showApMsg('error', 'Wybierz czas trwania!'); return; }



    try {

        if (attachment?.type === 'file') {

            if (!requirePermission('evidence_view', 'podgląd załączników')) return;

            showApMsg('info', 'Wysyłam plik...');

            attachment = await uploadEvidenceFile(attachment.file, {

                player: nick,

                action,

                reason,

                admin: currentUser?.displayName || 'Panel'

            });

        }



        await executeAction(action, nick, '', reason, duration, attachment);

        showApMsg('success', `✓ ${action.toUpperCase()} na ${nick} wykonane`);

        showToast('success', `${action.toUpperCase()} na ${nick} wykonane`);

        document.getElementById('ap-nick').value = '';

        document.getElementById('ap-reason').value = '';

        document.getElementById('ap-duration-custom').value = '';

        resetActionAttachmentFields('ap');

        document.querySelectorAll('#page-action .action-btn').forEach(b => b.classList.remove('selected'));

        document.querySelectorAll('#page-action .dur-btn').forEach(b => b.classList.remove('selected'));

        window._apAction = null; window._apDuration = null;

        loadAll();

    } catch (e) {

        showApMsg('error', 'Błąd: ' + e.message);

    }

});



// ——— WYKONAJ AKCJĘ —————————————————————————————————————————————————————

async function executeAction(action, nick, uuid, reason, duration, attachment = null) {

    const admin = currentUser?.displayName || 'Panel';

    const actionPerm = {

        ban: 'ban', unban: 'unban', mute: 'mute', unmute: 'unmute',

        kick: 'kick', warn: 'warn', check: 'check'

    }[action];



    if (actionPerm && !requirePermission(actionPerm, action.toUpperCase())) {

        throw new Error(`Brak uprawnienia do akcji ${action.toUpperCase()}`);

    }



    // Helper — usuwa undefined z obiektu przed zapisem do Firestore
    const cleanAttachment = (att) => {
        if (!att) return null;
        const cleaned = {};
        for (const [k, v] of Object.entries(att)) {
            if (v !== undefined && v !== null) cleaned[k] = v;
        }
        return Object.keys(cleaned).length > 0 ? cleaned : null;
    };
    const att = cleanAttachment(attachment);

    if (action === 'ban') {
        const doc_data = { player: nick, uuid: uuid || '', reason, bannedBy: admin, duration, date: serverTimestamp() };
        if (att) doc_data.attachment = att;
        await addDoc(collection(db, 'bans'), doc_data);
        const snap = await getDocs(query(collection(db, 'players'), where('nick', '==', nick)));
        snap.forEach(async d => await updateDoc(d.ref, { banned: true }));

    } else if (action === 'unban') {
        const snap = await getDocs(query(collection(db, 'bans'), where('player', '==', nick)));
        snap.forEach(async d => await deleteDoc(d.ref));
        const pSnap = await getDocs(query(collection(db, 'players'), where('nick', '==', nick)));
        pSnap.forEach(async d => await updateDoc(d.ref, { banned: false }));

    } else if (action === 'mute') {
        const doc_data = { player: nick, uuid: uuid || '', reason, mutedBy: admin, duration, date: serverTimestamp() };
        if (att) doc_data.attachment = att;
        await addDoc(collection(db, 'mutes'), doc_data);
        const snap = await getDocs(query(collection(db, 'players'), where('nick', '==', nick)));
        snap.forEach(async d => await updateDoc(d.ref, { muted: true }));

    } else if (action === 'unmute') {
        const snap = await getDocs(query(collection(db, 'mutes'), where('player', '==', nick)));
        snap.forEach(async d => await deleteDoc(d.ref));
        const pSnap = await getDocs(query(collection(db, 'players'), where('nick', '==', nick)));
        pSnap.forEach(async d => await updateDoc(d.ref, { muted: false }));
    }



    // Wysyłamy do panel_commands aby plugin MC wykonał akcję
    // check nie wymaga komendy do serwera MC (tylko podgląd)
    const noMcCmd = ['check'];

    if (!noMcCmd.includes(action)) {

        const cmdMsg    = (action === 'message') ? reason : '';
        const cmdReason = (action === 'message') ? 'Wiadomość z panelu' : (reason || '—');

        await addDoc(collection(db, 'panel_commands'), {
            action,
            player:    nick,
            reason:    cmdReason,
            duration:  duration || '—',
            message:   cmdMsg,
            admin,
            executed:  false,
            createdAt: serverTimestamp()
        });
    }

    // Dla warn — zapisz też do kolekcji warns (plugin liczy z niej ostrzeżenia)
    if (action === 'warn') {
        const pSnap = await getDocs(query(collection(db, 'players'), where('nick', '==', nick)));
        const playerUuid = pSnap.docs[0]?.data()?.uuid || '';
        await addDoc(collection(db, 'warns'), {
            uuid:    playerUuid,
            player:  nick,
            reason:  reason || '—',
            admin,
            active:  true,
            date:    serverTimestamp()
        });
        // Zaktualizuj licznik warns w dokumencie gracza
        if (!pSnap.empty) {
            const warnSnap = await getDocs(query(collection(db, 'warns'), where('player', '==', nick), where('active', '==', true)));
            await updateDoc(pSnap.docs[0].ref, { warns: warnSnap.size });
        }
    }



    await logAction(action, nick, admin, reason || '—', duration || '—', attachment ? { attachment } : {});

}





window.toggleActionAttachmentFields = function(prefix) {

    const typeEl = document.getElementById(`${prefix}-attachment-type`);

    const type = typeEl ? typeEl.value : '';

    const linkEl = document.getElementById(`${prefix}-attachment-link`);

    const textEl = document.getElementById(`${prefix}-attachment-text`);

    const fileEl = document.getElementById(`${prefix}-attachment-file`);

    if (linkEl) linkEl.style.display = type === 'link' ? 'block' : 'none';

    if (textEl) textEl.style.display = type === 'text' ? 'block' : 'none';

    if (fileEl) fileEl.style.display = type === 'file' ? 'block' : 'none';

};



function resetActionAttachmentFields(prefix) {

    ['type', 'link', 'text'].forEach(name => {

        const el = document.getElementById(`${prefix}-attachment-${name}`);

        if (el) el.value = '';

    });

    const fileEl = document.getElementById(`${prefix}-attachment-file`);

    if (fileEl) fileEl.value = '';

    window.toggleActionAttachmentFields(prefix);

}



function buildActionAttachmentPayload(prefix) {

    const type = document.getElementById(`${prefix}-attachment-type`).value || '';

    if (!type) return null;

    if (type === 'link') {

        const url = document.getElementById(`${prefix}-attachment-link`).value.trim();

        return url ? { type, url } : null;

    }

    if (type === 'text') {

        const text = document.getElementById(`${prefix}-attachment-text`).value.trim();

        return text ? { type, text } : null;

    }

    if (type === 'file') {

        const file = document.getElementById(`${prefix}-attachment-file`).files?.[0];

        if (!file) return null;

        return { type, file };

    }

    return null;

}



// ——— BAZA PLIKÓW (dowody) ——————————————————————————————————————————————

function renderFiles(list) {

    const tb = document.getElementById('files-tbody');

    if (!tb) return;

    if (!list.length) {

        tb.innerHTML = `<tr><td colspan="7" class="table-empty">Brak plików.</td></tr>`;

        return;

    }



    tb.innerHTML = list.map(f => {

        const isDeleted = f.status === 'deleted';

        const openBtn = f.url && !isDeleted

            ? `<button class="tbl-btn" onclick="openAttachmentUrl('${encodeURIComponent(f.url)}')" title="Otwórz"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>`

            : '';

        const delBtn = (!isDeleted && hasPermission('evidence_delete'))

            ? `<button class="tbl-btn tbl-btn-red" onclick="deleteEvidenceFile('${f.id}')" title="Usuń"><i class="fa-solid fa-trash"></i></button>`

            : '';



        return `<tr>

            <td style="max-width:220px;">

                <div style="display:flex;align-items:center;gap:.5rem;min-width:0;">

                    <i class="fa-solid fa-paperclip" style="color:var(--text-secondary);"></i>

                    <div style="min-width:0;">

                        <div style="font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(f.originalName || '—')}</div>

                        <div style="font-size:.75rem;color:var(--text-secondary);">${escapeHtml(f.mimeType || '—')} · ${formatBytes(f.size)}</div>

                    </div>

                </div>

            </td>

            <td><span style="font-weight:700;">${escapeHtml(f.player || '—')}</span></td>

            <td>${f.action ? actionBadge(f.action) : '<span style="color:var(--text-secondary);">—</span>'}</td>

            <td><span style="font-weight:700;">${escapeHtml(f.uploadedBy || '—')}</span></td>

            <td style="font-size:.82rem;color:var(--text-secondary);white-space:nowrap;">${formatDate(f.uploadedAt)}</td>

            <td style="font-size:.82rem;color:var(--text-secondary);">${escapeHtml(f.status || '—')}</td>

            <td><div style="display:flex;gap:.4rem;flex-wrap:wrap;">${openBtn}${delBtn}</div></td>

        </tr>`;

    }).join('');

}



window.loadFilesPage = async function() {

    if (!requirePermission('evidence_view', 'podgląd załączników')) return;

    const tb = document.getElementById('files-tbody');

    if (tb) {

        tb.innerHTML = `<tr><td colspan="7" class="table-loading"><i class="fa-solid fa-spinner fa-spin"></i> Ładowanie...</td></tr>`;

    }

    try {

        const snap = await getDocs(query(collection(db, 'files'), orderBy('uploadedAt', 'desc')));

        allFiles = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        renderFiles(allFiles);

    } catch (e) {

        if (tb) tb.innerHTML = `<tr><td colspan="7" class="table-empty" style="color:#ef4444;">Błąd: ${escapeHtml(e.message)}</td></tr>`;

    }

};



window.filterFiles = function() {

    const s = (document.getElementById('files-search').value || '').toLowerCase();

    const st = document.getElementById('files-filter-status').value || '';

    renderFiles(allFiles.filter(f => {

        const name = String(f.originalName || '').toLowerCase();

        const player = String(f.player || '').toLowerCase();

        if (s && !name.includes(s) && !player.includes(s)) return false;

        if (st && String(f.status || '') !== st) return false;

        return true;

    }));

};



window.deleteEvidenceFile = async function(fileId) {

    if (!requirePermission('evidence_delete', 'usuwanie załączników')) return;

    if (!confirm('Usunąć ten plik? Linki w logach mogą przestać działać.')) return;

    try {

        const refDoc = doc(db, 'files', fileId);

        const snap = await getDoc(refDoc);

        if (!snap.exists()) throw new Error('Nie znaleziono pliku w bazie.');



        await updateDoc(refDoc, {

            status: 'deleted',

            deletedAt: serverTimestamp(),

            deletedBy: currentUser?.displayName || 'Admin'

        });



        showToast('success', 'Plik usunięty.');

        await window.loadFilesPage();

    } catch (e) {

        showToast('error', 'Błąd: ' + e.message);

    }

};



// ——— SZCZEGÓŁY GRACZA ——————————————————————————————————————————————————

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

                    <div style="font-size:.78rem;color:var(--text-secondary);margin-top:.2rem;">${p.uuid||'"”'}</div>

                    <div style="font-size:.78rem;color:var(--accent);margin-top:.1rem;font-weight:600;"><i class="fa-solid fa-network-wired"></i> ${p.ip||'brak ip'}</div>

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

                    Notatki (${notes.length}) "” <span style="color:#f59e0b;font-weight:600;">nie można usunąćąć</span>

                </div>

                ${notes.length === 0 ? '<div style="text-align:center;padding:.75rem;color:var(--text-secondary);font-size:.88rem;">Brak notatek</div>' :

                    notes.slice(0,5).map(n => `

                        <div style="background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.2);border-radius:8px;padding:.65rem .9rem;margin-bottom:.5rem;">

                            <div style="font-size:.85rem;color:var(--text-primary);">${n.content||'"”'}</div>

                            <div style="font-size:.72rem;color:var(--text-secondary);margin-top:.3rem;">${n.author||'"”'} Â· ${formatDate(n.date)}</div>

                        </div>`).join('')

                }

            </div>

            <div style="margin-bottom:1.5rem;">

                <div style="font-size:.78rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:.75rem;">Historia akcji (${hist.length})</div>

                ${hist.length === 0 ? '<div style="text-align:center;padding:1rem;color:var(--text-secondary);font-size:.88rem;">Brak historii</div>' :

                    hist.slice(0,10).map(h => `

                        <div style="display:flex;align-items:center;gap:.75rem;padding:.6rem 0;border-bottom:1px solid var(--border);">

                            ${actionBadge(h.action)}

                            <span style="font-size:.82rem;color:var(--text-secondary);flex:1;">${h.reason||'"”'}</span>

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



// â”€â”€â”€ NOTATKI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

    if (!content) { showNoteMsg('error', 'Wpisz tre>ć notatki!'); return; }



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



// â”€â”€â”€ HELPERS MSG â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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



// â”€â”€â”€ TOAST â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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



// â”€â”€â”€ ZARZĄDZANIE ADMINAMI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let allAdmins = [];

let allShopItems = [];



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

        tb.innerHTML = `<tr><td colspan="7" class="table-empty">Brak kont administracyjnych</td></tr>`;

        return;

    }

    tb.innerHTML = list.map(a => `

        <tr>

            <td>

                <div style="font-weight:700;">${a.displayName || a.login}</div>

            </td>

            <td style="max-width:260px;font-size:.82rem;color:var(--text-secondary);line-height:1.45;">${a.desc || '"”'}</td>

            <td><span style="font-family:monospace;font-size:.82rem;color:var(--text-secondary);">${a.login}</span></td>

            <td>${rankBadge(a.role)}</td>

            <td>

                <div style="display:flex;flex-wrap:wrap;gap:.3rem;">

                    ${(a.permissions||[]).map(p => `<span class="badge badge-default" style="font-size:.68rem;" title="${PERMISSIONS_PL[p]?.desc || p}">${permissionLabel(p)}</span>`).join('')}

                </div>

            </td>

            <td>

                <span class="badge ${a.disabled ? 'badge-banned' : 'badge-online'}">${a.disabled ? 'Zablokowane' : 'Aktywne'}</span>

            </td>

            <td>

                <div style="display:flex;gap:.4rem;">

                    <button class="tbl-btn" onclick="editAdminAccount('${a.id}')"><i class="fa-solid fa-pen"></i></button>

                    <button class="tbl-btn tbl-btn-red" onclick="toggleAdminDisable('${a.id}','${a.disabled?'false':'true'}')" title="${a.disabled?'Odblokuj':'Zablokuj'}">

                        <i class="fa-solid fa-${a.disabled?'unlock':'lock'}"></i>

                    </button>

                    <button class="tbl-btn tbl-btn-red" onclick="deleteAdminAccount('${a.id}','${escapeHtml(a.displayName||a.login)}')" title="Usuń konto">

                        <i class="fa-solid fa-trash"></i>

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

window.deleteAdminAccount = async function(id, name) {
    if (!requirePermission('admins_manage', 'zarządzanie administratorami') && !hasPermission('all')) return;
    // Nie pozwól usunąć własnego konta
    if (currentUser && currentUser.id === id) {
        showToast('error', 'Nie możesz usunąć własnego konta!');
        return;
    }
    if (!confirm(`Usunąć konto "${name}" na stałe? Tej operacji nie można cofnąć.`)) return;
    try {
        await deleteDoc(doc(db, 'admins', id));
        showToast('success', `Konto "${name}" zostało usunięte.`);
        await window.loadAdminAccounts();
    } catch (e) {
        showToast('error', 'Błąd usuwania: ' + e.message);
    }
};



window.loadPermissionsPage = async function() {
    await loadRolePermissionsFromStore();

    const grid = document.getElementById('permissions-grid');
    if (!grid) return;

    // Domyślne uprawnienia (hardcoded) — do porównania
    const DEFAULT_ROLE_PERMISSIONS = {
        'ChatMod':      ['mute', 'warn', 'check'],
        'Pomocnik':     ['mute', 'warn', 'check', 'players'],
        'Moderator':    ['ban', 'mute', 'kick', 'warn', 'check', 'players', 'logs', 'evidence_view'],
        'Admin':        ['ban', 'unban', 'mute', 'unmute', 'kick', 'warn', 'check', 'players', 'logs', 'notes', 'site', 'shop', 'media_manage', 'evidence_view', 'evidence_delete'],
        'Zarządzający': ['all']
    };

    grid.innerHTML = ROLE_ORDER.map(role => {
        const perms   = permissionsForRole(role);
        const defaults = DEFAULT_ROLE_PERMISSIONS[role] || [];
        const options  = Object.entries(PERMISSIONS_PL).filter(([key]) => key !== 'all');

        // Czy uprawnienia różnią się od domy>lnych?
        const isEdited = role !== 'Zarządzający' && (
            perms.length !== defaults.length ||
            perms.some(p => !defaults.includes(p)) ||
            defaults.some(p => !perms.includes(p))
        );

        return `
            <div class="table-card" style="padding:1.2rem;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:.8rem;margin-bottom:1rem;">
                    <div>
                        <div style="display:flex;align-items:center;gap:.6rem;">
                            <div style="font-size:1rem;font-weight:800;color:var(--text-primary);">${role}</div>
                            ${isEdited ? `<span style="background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.35);color:#f59e0b;font-size:.7rem;font-weight:700;padding:.15rem .5rem;border-radius:6px;"><i class="fa-solid fa-pen-to-square"></i> Edytowane</span>` : `<span style="background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.25);color:#10b981;font-size:.7rem;font-weight:700;padding:.15rem .5rem;border-radius:6px;">Domyślne</span>`}
                        </div>
                        <div style="font-size:.78rem;color:var(--text-secondary);margin-top:.15rem;">Uprawnienia tej rangi</div>
                    </div>
                    <div style="display:flex;gap:.5rem;">
                        ${isEdited ? `<button class="tbl-btn" onclick="resetRolePermissions('${role}')" title="Przywróć Domyślne"><i class="fa-solid fa-rotate-left"></i></button>` : ''}
                        <button class="modal-submit-btn" style="width:auto;padding:.45rem 1rem;" onclick="saveRolePermissions('${role}')">
                            <i class="fa-solid fa-floppy-disk"></i> Zapisz
                        </button>
                    </div>
                </div>
                <div style="display:flex;flex-direction:column;gap:.65rem;">
                    ${options.map(([key, meta]) => `
                        <label style="display:flex;gap:.75rem;align-items:flex-start;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:.7rem .8rem;cursor:pointer;">
                            <input type="checkbox" class="role-permission-checkbox" data-role="${role}" value="${key}" ${perms.includes(key) ? 'checked' : ''} style="margin-top:.15rem;">
                            <div>
                                <div style="font-size:.88rem;font-weight:700;color:var(--text-primary);">${meta.label}</div>
                                <div style="font-size:.76rem;color:var(--text-secondary);line-height:1.45;">${meta.desc}</div>
                            </div>
                        </label>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
};



window.saveRolePermissions = async function(role) {

    if (!requirePermission('permissions_manage', 'zarządzanie uprawnieniami')) return;

    const selected = [...document.querySelectorAll(`.role-permission-checkbox[data-role="${role}"]:checked`)].map(cb => cb.value);

    ROLE_PERMISSIONS[role] = ensureAdminPermissions(selected);

    try {

        await setDoc(doc(db, 'panel_settings', 'role_permissions'), {

            roles: ROLE_ORDER.reduce((acc, roleName) => {

                acc[roleName] = ROLE_PERMISSIONS[roleName] || [];

                return acc;

            }, {}),

            updatedAt: serverTimestamp(),

            updatedBy: currentUser?.displayName || 'Panel'

        });

        showToast('success', `Zapisano uprawnienia dla roli ${role}`);

    } catch (e) {

        showToast('error', 'Błąd zapisu uprawnień: ' + e.message);

    }

};

window.resetRolePermissions = async function(role) {
    if (!requirePermission('permissions_manage', 'zarządzanie uprawnieniami')) return;
    if (!confirm(`Przywrócić domyślne uprawnienia dla roli ${role}?`)) return;
    const DEFAULT_ROLE_PERMISSIONS = {
        'ChatMod':      ['mute', 'warn', 'check'],
        'Pomocnik':     ['mute', 'warn', 'check', 'players'],
        'Moderator':    ['ban', 'mute', 'kick', 'warn', 'check', 'players', 'logs', 'evidence_view'],
        'Admin':        ['ban', 'unban', 'mute', 'unmute', 'kick', 'warn', 'check', 'players', 'logs', 'notes', 'site', 'shop', 'media_manage', 'evidence_view', 'evidence_delete'],
        'Zarządzający': ['all']
    };
    const defaults = DEFAULT_ROLE_PERMISSIONS[role] || [];
    ROLE_PERMISSIONS[role] = [...defaults];
    try {
        await setDoc(doc(db, 'panel_settings', 'role_permissions'), {
            roles: ROLE_ORDER.reduce((acc, roleName) => {
                acc[roleName] = ROLE_PERMISSIONS[roleName] || [];
                return acc;
            }, {}),
            updatedAt: serverTimestamp(),
            updatedBy: currentUser?.displayName || 'Panel'
        });
        showToast('success', `Przywrócono domyślne uprawnienia dla roli ${role}`);
        window.loadPermissionsPage();
    } catch (e) {
        showToast('error', 'Błąd resetu uprawnień: ' + e.message);
    }
};

window.loadShopPage = async function() {

    const tb = document.getElementById('shop-items-tbody');

    if (!tb) return;

    tb.innerHTML = `<tr><td colspan="6" class="table-loading"><i class="fa-solid fa-spinner fa-spin"></i> Ładowanie...</td></tr>`;

    try {

        const snap = await getDocs(collection(db, 'shop_items'));

        allShopItems = snap.docs.map(d => ({ id: d.id, ...d.data() }))

            .sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99));

        window.filterShopItems();

    } catch (e) {

        tb.innerHTML = `<tr><td colspan="6" class="table-empty" style="color:#ef4444;">Błąd: ${e.message}</td></tr>`;

    }

};



function renderShopGrid(list) {
    const grid = document.getElementById('shop-grid-view');
    if (!grid) return;
    if (!list.length) {
        grid.innerHTML = `<div class="table-card" style="padding:3rem;text-align:center;color:var(--text-secondary);grid-column:1/-1;">
            <i class="fa-solid fa-shop" style="font-size:2rem;margin-bottom:.75rem;display:block;opacity:.4;"></i>
            Brak produktów. Kliknij <strong>+ Dodaj produkt</strong> aby dodać pierwszy.
        </div>`;
        return;
    }
    const typeColors = { ranga:'#8b5cf6', zestaw:'#3b82f6', item:'#10b981', klucz:'#f59e0b' };
    const typeIcons  = { ranga:'fa-crown', zestaw:'fa-box', item:'fa-sword', klucz:'fa-key' };
    grid.innerHTML = list.map(item => {
        const color = typeColors[item.type] || '#6b7280';
        const icon  = typeIcons[item.type]  || 'fa-shop';
        const active = item.active !== false;
        const hasMedia = item.mediaUrl && item.mediaUrl.length > 5;
        const isVideo  = hasMedia && /\.(mp4|webm|mov)/i.test(item.mediaUrl);
        const mediaBg  = hasMedia && !isVideo
            ? `background-image:url('${item.mediaUrl}');background-size:cover;background-position:center;`
            : `background:linear-gradient(135deg,${color}22,${color}11);`;
        const items = item.itemsText
            ? item.itemsText.split('\n').filter(Boolean).slice(0,4)
                .map(i => `<div style="display:flex;align-items:center;gap:.4rem;font-size:.78rem;color:var(--text-secondary);padding:.15rem 0;">
                    <i class="fa-solid fa-check" style="color:${color};font-size:.65rem;flex-shrink:0;"></i>${escapeHtml(i.trim())}
                </div>`).join('')
            : '';
        return `
        <div class="shop-item-card ${active?'':'shop-item-hidden'}" data-id="${item.id}">
            <div class="shop-item-media" style="${mediaBg}">
                ${isVideo ? `<video src="${item.mediaUrl}" autoplay muted loop playsinline style="width:100%;height:100%;object-fit:cover;"></video>` : ''}
                ${!active ? '<div class="shop-item-hidden-badge"><i class="fa-solid fa-eye-slash"></i> Ukryty</div>' : ''}
                <div class="shop-item-type-badge" style="background:${color};">
                    <i class="fa-solid ${icon}"></i> ${item.type||'—'}
                </div>
            </div>
            <div class="shop-item-body">
                <div class="shop-item-name">${escapeHtml(item.name||'—')}</div>
                ${item.desc ? `<div class="shop-item-desc">${escapeHtml(item.desc)}</div>` : ''}
                <div class="shop-item-items">${items}</div>
                <div class="shop-item-price-row">
                    <div>
                        <span class="shop-item-price">${item.price != null ? item.price : '—'}<span style="font-size:.75rem;font-weight:600;color:var(--text-secondary);margin-left:.2rem;">PLN</span></span>
                        ${item.oldPrice ? `<span class="shop-item-old-price">${item.oldPrice} PLN</span>` : ''}
                    </div>
                    <div style="font-size:.72rem;color:var(--text-secondary);">#${item.sortOrder??99}</div>
                </div>
                <div class="shop-item-actions">
                    <button class="tbl-btn" style="flex:1;justify-content:center;" onclick="editShopItem('${item.id}')">
                        <i class="fa-solid fa-pen"></i> Edytuj
                    </button>
                    <button class="tbl-btn tbl-btn-red" onclick='deleteShopItem("${item.id}","${escapeHtml(item.name||"")}")'
                        style="padding:.35rem .6rem;" title="Usuń">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');
}

// ═══════════════════════════════════════════════════════════════════════
// ─── SKLEP — renderowanie ───────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

let _shopView = 'grid'; // 'grid' | 'table'

window.toggleShopView = function() {
    _shopView = _shopView === 'grid' ? 'table' : 'grid';
    const grid  = document.getElementById('shop-grid-view');
    const table = document.getElementById('shop-table-view');
    const btn   = document.getElementById('shop-view-toggle');
    if (!grid || !table) return;
    if (_shopView === 'grid') {
        grid.style.display  = 'grid';
        table.style.display = 'none';
        if (btn) btn.innerHTML = '<i class="fa-solid fa-table-cells-large"></i>';
    } else {
        grid.style.display  = 'none';
        table.style.display = 'block';
        if (btn) btn.innerHTML = '<i class="fa-solid fa-table-list"></i>';
    }
    filterShopItems();
};

const SHOP_TYPE_CONFIG = {
    ranga:  { icon: '🏆', color: '#8b5cf6', bg: 'rgba(139,92,246,.1)',  border: 'rgba(139,92,246,.25)' },
    zestaw: { icon: '📦', color: '#3b82f6', bg: 'rgba(59,130,246,.1)',  border: 'rgba(59,130,246,.25)' },
    item:   { icon: '⚔️', color: '#10b981', bg: 'rgba(16,185,129,.1)',  border: 'rgba(16,185,129,.25)' },
    klucz:  { icon: '🔑', color: '#f59e0b', bg: 'rgba(245,158,11,.1)',  border: 'rgba(245,158,11,.25)' },
};

function _shopTypeCfg(type) {
    return SHOP_TYPE_CONFIG[(type||'').toLowerCase()] || { icon: '🛒', color: '#6b7280', bg: 'rgba(107,114,128,.1)', border: 'rgba(107,114,128,.2)' };
}

function renderShopGrid(list) {
    const grid = document.getElementById('shop-grid-view');
    if (!grid) return;
    if (!list.length) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:4rem 2rem;color:var(--text-secondary);">
            <i class="fa-solid fa-shop" style="font-size:3rem;margin-bottom:1rem;display:block;opacity:.3;"></i>
            <div style="font-size:1.1rem;font-weight:700;">Brak produktów w sklepie</div>
            <div style="font-size:.85rem;margin-top:.4rem;">Kliknij "+ Dodaj produkt" aby dodać pierwszy</div>
        </div>`;
        return;
    }

    grid.innerHTML = list.map(item => {
        const cfg = _shopTypeCfg(item.type);
        const isActive = item.active !== false;
        const items = (item.itemsText || '').split('\n').filter(Boolean).slice(0, 6);

        const mediaHtml = item.mediaUrl
            ? (/\.(mp4|webm|mov)/i.test(item.mediaUrl)
                ? `<video src="${item.mediaUrl}" style="width:100%;height:160px;object-fit:cover;border-radius:10px 10px 0 0;" muted autoplay loop playsinline></video>`
                : `<img src="${item.mediaUrl}" alt="${escapeHtml(item.name)}" style="width:100%;height:160px;object-fit:cover;border-radius:10px 10px 0 0;" onerror="this.style.display='none'">`)
            : `<div style="width:100%;height:120px;display:flex;align-items:center;justify-content:center;font-size:3.5rem;border-radius:10px 10px 0 0;background:${cfg.bg};">${cfg.icon}</div>`;

        const itemsList = items.length
            ? `<ul style="list-style:none;padding:0;margin:.5rem 0 0;display:flex;flex-direction:column;gap:.2rem;">${items.map(i => `<li style="font-size:.75rem;color:var(--text-secondary);display:flex;align-items:center;gap:.35rem;"><span style="color:${cfg.color};font-size:.6rem;">✦</span>${escapeHtml(i)}</li>`).join('')}</ul>`
            : '';

        return `<div class="shop-card ${isActive ? '' : 'shop-card-hidden'}" style="background:var(--bg-card);border:1.5px solid var(--border);border-radius:12px;overflow:hidden;box-shadow:var(--shadow-sm);transition:all .2s ease;cursor:pointer;" onmouseenter="this.style.boxShadow='var(--shadow-md)';this.style.transform='translateY(-2px)'" onmouseleave="this.style.boxShadow='var(--shadow-sm)';this.style.transform=''" onclick="editShopItem('${item.id}')">
            ${mediaHtml}
            <div style="padding:.9rem 1rem;">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem;margin-bottom:.4rem;">
                    <div style="font-weight:800;font-size:.95rem;color:var(--text-primary);line-height:1.3;">${escapeHtml(item.name || '—')}</div>
                    <span style="flex-shrink:0;font-size:.68rem;font-weight:700;padding:.2rem .55rem;border-radius:999px;background:${cfg.bg};color:${cfg.color};border:1px solid ${cfg.border};">${item.type || '—'}</span>
                </div>
                ${item.desc ? `<div style="font-size:.78rem;color:var(--text-secondary);line-height:1.45;margin-bottom:.5rem;">${escapeHtml(item.desc)}</div>` : ''}
                ${itemsList}
                <div style="display:flex;align-items:center;justify-content:space-between;margin-top:.8rem;padding-top:.7rem;border-top:1px solid var(--border);">
                    <div>
                        <span style="font-size:1.15rem;font-weight:900;color:var(--text-primary);">${item.price != null ? item.price : '—'}</span>
                        <span style="font-size:.72rem;font-weight:600;color:var(--text-secondary);"> PLN</span>
                        ${item.oldPrice ? `<span style="font-size:.72rem;color:var(--text-secondary);text-decoration:line-through;margin-left:.3rem;">${item.oldPrice} PLN</span>` : ''}
                    </div>
                    <div style="display:flex;gap:.35rem;">
                        <span style="font-size:.7rem;font-weight:700;padding:.2rem .5rem;border-radius:999px;background:${isActive ? 'rgba(16,185,129,.1)' : 'rgba(239,68,68,.1)'};color:${isActive ? '#059669' : '#dc2626'};border:1px solid ${isActive ? 'rgba(5,150,105,.2)' : 'rgba(220,38,38,.2)'};">${isActive ? '✓ Aktywny' : '✗ Ukryty'}</span>
                    </div>
                </div>
                <div style="display:flex;gap:.4rem;margin-top:.6rem;" onclick="event.stopPropagation()">
                    <button class="tbl-btn" style="flex:1;justify-content:center;" onclick="editShopItem('${item.id}')"><i class="fa-solid fa-pen"></i> Edytuj</button>
                    <button class="tbl-btn tbl-btn-red" onclick='deleteShopItem("${item.id}","${escapeHtml(item.name||"")}")'><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        </div>`;
    }).join('');
}

let _shopView = 'grid'; // 'grid' | 'table'

window.toggleShopView = function() {
    _shopView = _shopView === 'grid' ? 'table' : 'grid';
    const grid  = document.getElementById('shop-grid-view');
    const table = document.getElementById('shop-table-view');
    const btn   = document.getElementById('shop-view-toggle');
    if (!grid || !table) return;
    if (_shopView === 'grid') {
        grid.style.display  = 'grid';
        table.style.display = 'none';
        if (btn) btn.innerHTML = '<i class="fa-solid fa-table-list"></i>';
    } else {
        grid.style.display  = 'none';
        table.style.display = 'block';
        if (btn) btn.innerHTML = '<i class="fa-solid fa-table-cells-large"></i>';
    }
    window.filterShopItems();
};

function renderShopGrid(list) {
    const grid = document.getElementById('shop-grid-view');
    if (!grid) return;
    if (!list.length) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-secondary);">
            <i class="fa-solid fa-shop" style="font-size:2.5rem;margin-bottom:1rem;display:block;opacity:.3;"></i>
            Brak produktów. Kliknij <strong>+ Dodaj produkt</strong> aby dodać pierwszy.
        </div>`;
        return;
    }
    const typeColors = { ranga:'#8b5cf6', zestaw:'#3b82f6', item:'#10b981', klucz:'#f59e0b' };
    const typeIcons  = { ranga:'fa-crown', zestaw:'fa-box', item:'fa-sword', klucz:'fa-key' };
    grid.innerHTML = list.map(item => {
        const color = typeColors[item.type] || '#6b7280';
        const icon  = typeIcons[item.type]  || 'fa-tag';
        const isHidden = item.active === false;
        const hasMedia = item.mediaUrl;
        const mediaHtml = hasMedia
            ? (/\.(mp4|webm|mov)/i.test(item.mediaUrl)
                ? `<video src="${item.mediaUrl}" style="width:100%;height:160px;object-fit:cover;" muted playsinline loop></video>`
                : `<img src="${item.mediaUrl}" style="width:100%;height:160px;object-fit:cover;" alt="${escapeHtml(item.name||'')}" onerror="this.parentElement.innerHTML='<div style=\'height:160px;display:flex;align-items:center;justify-content:center;color:var(--text-secondary);font-size:2rem;\'><i class=\'fa-solid fa-${icon}\'></i></div>'">`)
            : `<div style="height:160px;display:flex;align-items:center;justify-content:center;background:${color}11;"><i class="fa-solid fa-${icon}" style="font-size:3rem;color:${color};opacity:.5;"></i></div>`;

        const items = item.itemsText ? item.itemsText.split('\n').filter(Boolean) : [];
        const itemsList = items.slice(0,4).map(i => `<div style="font-size:.75rem;color:var(--text-secondary);padding:.15rem 0;display:flex;align-items:center;gap:.4rem;"><i class="fa-solid fa-check" style="color:${color};font-size:.65rem;"></i>${escapeHtml(i.trim())}</div>`).join('');

        return `<div class="shop-card ${isHidden ? 'shop-card-hidden' : ''}" onclick="editShopItem('${item.id}')">
            <div class="shop-card-media">${mediaHtml}</div>
            ${isHidden ? '<div class="shop-card-badge-hidden"><i class="fa-solid fa-eye-slash"></i> Ukryty</div>' : ''}
            <div class="shop-card-body">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem;margin-bottom:.4rem;">
                    <div>
                        <span class="badge" style="background:${color}18;color:${color};border:1px solid ${color}33;font-size:.68rem;margin-bottom:.35rem;display:inline-flex;">
                            <i class="fa-solid fa-${icon}" style="margin-right:.3rem;"></i>${item.type || '—'}
                        </span>
                        <div style="font-weight:800;font-size:1rem;color:var(--text-primary);line-height:1.2;">${escapeHtml(item.name || '—')}</div>
                    </div>
                    <div style="text-align:right;flex-shrink:0;">
                        <div style="font-size:1.2rem;font-weight:900;color:${color};">${item.price != null ? item.price : '—'}<span style="font-size:.7rem;font-weight:600;color:var(--text-secondary);"> PLN</span></div>
                        ${item.oldPrice ? `<div style="font-size:.72rem;color:var(--text-secondary);text-decoration:line-through;">${item.oldPrice} PLN</div>` : ''}
                    </div>
                </div>
                ${item.desc ? `<div style="font-size:.78rem;color:var(--text-secondary);margin-bottom:.5rem;line-height:1.4;">${escapeHtml(item.desc)}</div>` : ''}
                ${itemsList ? `<div style="margin-bottom:.7rem;">${itemsList}</div>` : ''}
                <div style="display:flex;gap:.4rem;margin-top:auto;padding-top:.6rem;border-top:1px solid var(--border);">
                    <button class="tbl-btn" style="flex:1;justify-content:center;" onclick="event.stopPropagation();editShopItem('${item.id}')">
                        <i class="fa-solid fa-pen"></i> Edytuj
                    </button>
                    <button class="tbl-btn tbl-btn-red" onclick="event.stopPropagation();deleteShopItem('${item.id}','${escapeHtml(item.name||'')}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');
}

let _shopViewMode = 'grid'; // 'grid' | 'table'

window.toggleShopView = function() {
    _shopViewMode = _shopViewMode === 'grid' ? 'table' : 'grid';
    const btn = document.getElementById('shop-view-toggle');
    if (btn) btn.innerHTML = _shopViewMode === 'grid'
        ? '<i class="fa-solid fa-table-cells-large"></i>'
        : '<i class="fa-solid fa-list"></i>';
    const grid  = document.getElementById('shop-grid-view');
    const table = document.getElementById('shop-table-view');
    if (grid)  grid.style.display  = _shopViewMode === 'grid'  ? 'grid' : 'none';
    if (table) table.style.display = _shopViewMode === 'table' ? 'block' : 'none';
    window.filterShopItems();
};

let _shopViewMode = 'grid'; // 'grid' | 'table'

window.toggleShopView = function() {
    _shopViewMode = _shopViewMode === 'grid' ? 'table' : 'grid';
    const btn = document.getElementById('shop-view-toggle');
    if (btn) btn.innerHTML = _shopViewMode === 'grid'
        ? '<i class="fa-solid fa-table-cells-large"></i>'
        : '<i class="fa-solid fa-list"></i>';
    window.filterShopItems();
};

// ─── Shop view state ────────────────────────────────────────────────────────
let _shopViewMode = 'grid'; // 'grid' | 'table'

window.toggleShopView = function() {
    _shopViewMode = _shopViewMode === 'grid' ? 'table' : 'grid';
    const btn = document.getElementById('shop-view-toggle');
    if (btn) btn.innerHTML = _shopViewMode === 'grid'
        ? '<i class="fa-solid fa-table-cells-large"></i>'
        : '<i class="fa-solid fa-table-list"></i>';
    renderShopItems(
        _lastShopList || allShopItems
    );
};

let _lastShopList = [];

function renderShopItems(list) {
    _lastShopList = list;
    const grid = document.getElementById('shop-grid-view');
    const tb   = document.getElementById('shop-items-tbody');
    const tableView = document.getElementById('shop-table-view');

    if (!grid && !tb) return;

    if (!list.length) {
        if (grid) grid.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:3rem 1rem;color:var(--text-secondary);">
                <i class="fa-solid fa-shop" style="font-size:2.5rem;display:block;margin-bottom:.75rem;opacity:.4;"></i>
                <div style="font-weight:700;font-size:1rem;margin-bottom:.4rem;">Brak produktów</div>
                <div style="font-size:.85rem;">Kliknij &quot;+ Dodaj produkt&quot; aby dodać pierwszy.</div>
            </div>`;
        if (tb) tb.innerHTML = `<tr><td colspan="7" class="table-empty"><i class="fa-solid fa-shop"></i> Brak produktów</td></tr>`;
        return;
    }

    // ── WIDOK SIATKI KART ────────────────────────────────────────────────────
    if (_shopViewMode === 'grid' && grid) {
        if (tableView) tableView.style.display = 'none';
        grid.style.display = 'grid';

        const typeColors = { ranga:'#8b5cf6', zestaw:'#3b82f6', item:'#10b981', klucz:'#f59e0b' };
        const typeIcons  = { ranga:'fa-crown', zestaw:'fa-box', item:'fa-sword', klucz:'fa-key' };

        grid.innerHTML = list.map(item => {
            const color = typeColors[item.type] || '#6b7280';
            const icon  = typeIcons[item.type]  || 'fa-shop';
            const isHidden = item.active === false;

            const mediaHtml = item.mediaUrl
                ? (/\.(mp4|webm|mov)/i.test(item.mediaUrl)
                    ? `<video src="${item.mediaUrl}" style="width:100%;height:160px;object-fit:cover;" muted playsinline></video>`
                    : `<img src="${item.mediaUrl}" alt="${escapeHtml(item.name||'')}" style="width:100%;height:160px;object-fit:cover;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                       <div style="display:none;width:100%;height:160px;align-items:center;justify-content:center;background:${color}11;color:${color};font-size:2rem;"><i class="fa-solid ${icon}"></i></div>`)
                : `<div style="width:100%;height:160px;display:flex;align-items:center;justify-content:center;background:${color}11;color:${color};font-size:2.5rem;"><i class="fa-solid ${icon}"></i></div>`;

            const itemsList = item.itemsText
                ? item.itemsText.split('\n').filter(Boolean).slice(0,5).map(i =>
                    `<div style="font-size:.75rem;color:var(--text-secondary);display:flex;align-items:center;gap:.35rem;"><i class="fa-solid fa-check" style="color:${color};font-size:.65rem;flex-shrink:0;"></i>${escapeHtml(i.trim())}</div>`
                  ).join('') : '';

            return `<div class="shop-card ${isHidden ? 'shop-card-hidden' : ''}" style="--card-color:${color};">
                <div class="shop-card-media" onclick="editShopItem('${item.id}')" style="cursor:pointer;">
                    ${mediaHtml}
                    <div class="shop-card-type-badge">
                        <i class="fa-solid ${icon}"></i> ${item.type || '—'}
                    </div>
                    ${isHidden ? '<div class="shop-card-hidden-badge"><i class="fa-solid fa-eye-slash"></i> Ukryty</div>' : ''}
                </div>
                <div class="shop-card-body">
                    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem;margin-bottom:.4rem;">
                        <div style="font-weight:800;font-size:1rem;color:var(--text-primary);line-height:1.2;">${escapeHtml(item.name || '—')}</div>
                        <div style="text-align:right;flex-shrink:0;">
                            <div style="font-weight:900;font-size:1.1rem;color:${color};">${item.price != null ? item.price : '—'}<span style="font-size:.7rem;font-weight:600;color:var(--text-secondary);"> PLN</span></div>
                            ${item.oldPrice ? `<div style="font-size:.72rem;color:var(--text-secondary);text-decoration:line-through;">${item.oldPrice} PLN</div>` : ''}
                        </div>
                    </div>
                    ${item.desc ? `<div style="font-size:.8rem;color:var(--text-secondary);margin-bottom:.6rem;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(item.desc)}</div>` : ''}
                    ${itemsList ? `<div style="display:flex;flex-direction:column;gap:.2rem;margin-bottom:.6rem;">${itemsList}</div>` : ''}
                    <div style="display:flex;gap:.4rem;margin-top:auto;padding-top:.6rem;border-top:1px solid var(--border);">
                        <button class="tbl-btn" style="flex:1;justify-content:center;" onclick="editShopItem('${item.id}')"><i class="fa-solid fa-pen"></i> Edytuj</button>
                        <button class="tbl-btn" onclick="toggleShopItemActive('${item.id}',${!isHidden})" title="${isHidden ? 'Aktywuj' : 'Ukryj'}">
                            <i class="fa-solid ${isHidden ? 'fa-eye' : 'fa-eye-slash'}"></i>
                        </button>
                        <button class="tbl-btn tbl-btn-red" onclick='deleteShopItem("${item.id}","${escapeHtml(item.name||"")}")' title="Usuń"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            </div>`;
        }).join('');
        return;
    }

    // ── WIDOK TABELI ─────────────────────────────────────────────────────────
    if (grid) grid.style.display = 'none';
    if (tableView) tableView.style.display = 'block';
    if (!tb) return;

    tb.innerHTML = list.map(item => {
        const color = { ranga:'#8b5cf6', zestaw:'#3b82f6', item:'#10b981', klucz:'#f59e0b' }[item.type] || '#6b7280';
        const mediaThumb = item.mediaUrl
            ? (/\.(mp4|webm|mov)/i.test(item.mediaUrl)
                ? `<span style="color:#3b82f6;font-size:.75rem;"><i class="fa-solid fa-video"></i></span>`
                : `<img src="${item.mediaUrl}" style="width:36px;height:36px;object-fit:cover;border-radius:6px;" onerror="this.style.display='none'">`)
            : `<span style="color:var(--text-secondary);font-size:.75rem;">—</span>`;
        return `<tr>
            <td><div style="font-weight:700;">${escapeHtml(item.name||'—')}</div>${item.desc?`<div style="font-size:.72rem;color:var(--text-secondary);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(item.desc)}</div>`:''}</td>
            <td><span class="badge" style="background:${color}22;color:${color};border:1px solid ${color}44;">${item.type||'—'}</span></td>
            <td><strong>${item.price??'—'}</strong>${item.price!=null?' PLN':''}<br>${item.oldPrice?`<s style="font-size:.72rem;color:var(--text-secondary);">${item.oldPrice} PLN</s>`:''}</td>
            <td>${mediaThumb}</td>
            <td><span class="badge ${item.active===false?'badge-banned':'badge-online'}">${item.active===false?'Ukryty':'Aktywny'}</span></td>
            <td style="color:var(--text-secondary);">${item.sortOrder??99}</td>
            <td><div style="display:flex;gap:.3rem;">
                <button class="tbl-btn" onclick="editShopItem('${item.id}')"><i class="fa-solid fa-pen"></i></button>
                <button class="tbl-btn" onclick="toggleShopItemActive('${item.id}',${item.active===false})"><i class="fa-solid ${item.active===false?'fa-eye':'fa-eye-slash'}"></i></button>
                <button class="tbl-btn tbl-btn-red" onclick='deleteShopItem("${item.id}","${escapeHtml(item.name||"")}")'><i class="fa-solid fa-trash"></i></button>
            </div></td>
        </tr>`;
    }).join('');
}

window.toggleShopItemActive = async function(id, makeActive) {
    if (!requirePermission('shop','zarządzanie sklepem')) return;
    try {
        await updateDoc(doc(db,'shop_items',id), { active: makeActive, updatedAt: serverTimestamp(), updatedBy: currentUser?.displayName||'Panel' });
        showToast('success', makeActive ? 'Produkt aktywowany' : 'Produkt ukryty');
        await window.loadShopPage();
    } catch(e) { showToast('error','Błąd: '+e.message); }
};
window.filterShopItems = function() {
    const type   = document.getElementById('shop-type-filter')?.value   || '';
    const status = document.getElementById('shop-status-filter')?.value || '';
    const search = (document.getElementById('shop-search')?.value || '').toLowerCase();
    const filtered = allShopItems.filter(item => {
        if (type   && item.type !== type)                           return false;
        if (status === 'active'  && item.active === false)          return false;
        if (status === 'hidden'  && item.active !== false)          return false;
        if (search && !(item.name||'').toLowerCase().includes(search) &&
                      !(item.desc||'').toLowerCase().includes(search)) return false;
        return true;
    });
    renderShopItems(filtered);
};

window.filterShopItems = function() {

    const type = document.getElementById('shop-type-filter')?.value || '';

    const filtered = type ? allShopItems.filter(item => item.type === type) : allShopItems;

    renderShopItems(filtered);

};



window.openShopItemModal = function() {

    document.getElementById('shop-item-modal-title').textContent = 'Dodaj produkt sklepu';

    document.getElementById('shop-item-id').value = '';

    document.getElementById('shop-item-type').value = 'ranga';

    document.getElementById('shop-item-name').value = '';

    document.getElementById('shop-item-desc').value = '';

    document.getElementById('shop-item-price').value = '';

    document.getElementById('shop-item-old-price').value = '';

    document.getElementById('shop-item-order').value = '99';

    document.getElementById('shop-item-items').value = '';

    document.getElementById('shop-item-media-url').value = '';

    document.getElementById('shop-item-active').checked = true;

    const msg = document.getElementById('shop-item-msg');

    if (msg) msg.style.display = 'none';

    document.getElementById('shop-item-modal').classList.add('open');

};



window.editShopItem = function(id) {

    const item = allShopItems.find(entry => entry.id === id);

    if (!item) return;

    document.getElementById('shop-item-modal-title').textContent = 'Edytuj produkt sklepu';

    document.getElementById('shop-item-id').value = item.id;

    document.getElementById('shop-item-type').value = item.type || 'ranga';

    document.getElementById('shop-item-name').value = item.name || '';

    document.getElementById('shop-item-desc').value = item.desc || '';

    document.getElementById('shop-item-price').value = item.price ?? '';

    document.getElementById('shop-item-old-price').value = item.oldPrice ?? '';

    document.getElementById('shop-item-order').value = item.sortOrder || 99;

    document.getElementById('shop-item-items').value = item.itemsText || '';

    document.getElementById('shop-item-media-url').value = item.mediaUrl || '';

    document.getElementById('shop-item-active').checked = item.active !== false;

    const msg = document.getElementById('shop-item-msg');

    if (msg) msg.style.display = 'none';

    document.getElementById('shop-item-modal').classList.add('open');

};



window.saveShopItem = async function() {

    if (!requirePermission('shop', 'zarządzanie sklepem')) return;

    const id   = document.getElementById('shop-item-id').value;

    const name = document.getElementById('shop-item-name').value.trim();

    const type = document.getElementById('shop-item-type').value;

    if (!name) { showShopItemMsg('error', 'Podaj nazwę produktu.'); return; }



    let mediaUrl = document.getElementById('shop-item-media-url').value.trim();



    // Upload pliku do Backblaze jeśli wybrany

    const fileInput = document.getElementById('shop-item-media-file');

    const file = fileInput?.files?.[0];

    if (file) {

        showShopItemMsg('info', '<i class="fa-solid fa-spinner fa-spin"></i> Wysyłam plik do Backblaze...');

        try {

            const form = new FormData();

            form.append('file', file);

            form.append('folder', 'shop');

            form.append('admin', currentUser?.displayName || 'Panel');

            const res  = await fetch(`${FILE_WORKER_URL}/upload/shop`, { method: 'POST', body: form });

            const data = await res.json().catch(() => null);

            if (!res.ok || !data?.ok || !data?.file) {

                throw new Error(data?.error || 'Błąd uploadu do Backblaze');

            }

            // Zapisz URL publiczny do Firestore

            mediaUrl = data.file.publicUrl || data.file.fileKey || mediaUrl;

            // Wyczy>ć input pliku

            if (fileInput) fileInput.value = '';

        } catch (e) {

            showShopItemMsg('error', 'Błąd uploadu: ' + e.message);

            return;

        }

    }



    const data = {

        type,

        name,

        desc:      document.getElementById('shop-item-desc').value.trim(),

        price:     Number(document.getElementById('shop-item-price').value || 0),

        oldPrice:  Number(document.getElementById('shop-item-old-price').value || 0) || null,

        sortOrder: parseInt(document.getElementById('shop-item-order').value || '99', 10),

        itemsText: document.getElementById('shop-item-items').value.trim(),

        mediaUrl,

        active:    document.getElementById('shop-item-active').checked,

        updatedAt: serverTimestamp(),

        updatedBy: currentUser?.displayName || 'Panel'

    };

    try {

        if (id) {

            await updateDoc(doc(db, 'shop_items', id), data);

        } else {

            data.createdAt = serverTimestamp();

            await addDoc(collection(db, 'shop_items'), data);

        }

        showShopItemMsg('success', '✓ Produkt zapisany!');

        await window.loadShopPage();

        setTimeout(() => {

            document.getElementById('shop-item-modal').classList.remove('open');

            const prev = document.getElementById('shop-item-media-preview');

            if (prev) { prev.style.display = 'none'; prev.innerHTML = ''; }

        }, 1000);

    } catch (e) {

        showShopItemMsg('error', 'Błąd: ' + e.message);

    }

};



window.deleteShopItem = async function(id, name) {

    if (!requirePermission('shop', 'zarządzanie sklepem')) return;

    if (!confirm(`Usunąć produkt "${name}"?`)) return;

    try {

        await deleteDoc(doc(db, 'shop_items', id));

        showToast('success', `Usunięto produkt ${name}`);

        await window.loadShopPage();

    } catch (e) {

        showToast('error', 'Błąd: ' + e.message);

    }

};



function showShopItemMsg(type, text) {

    const el = document.getElementById('shop-item-msg');

    if (!el) return;

    el.className = `modal-msg ${type}`;

    el.innerHTML = text;

    el.style.display = 'block';

}



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

            console.log('[CritMC] Utworzono Domyślne konto test/test w Firestore');

        }

    } catch (e) { console.log('[CritMC] ensureDefaultAdmin:', e.message); }

}

ensureDefaultAdmin();



// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// â”€â”€â”€ PERSONEL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•



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

    if (!nick) { showToast('error', 'Podaj nick wła>ciciela!'); return; }

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

        showToast('success', 'Wła>ciciel zapisany!');

    } catch(e) { showToast('error', 'Błąd: ' + e.message); }

};



window.saveCowowner = async function() {

    try {

        const ref = doc(db, 'server_content', 'owners');

        const snap = await getDoc(ref);

        const existing = snap.exists() ? snap.data() : {};

        await setDoc(ref, { ...existing, cowowner: {

            nick: document.getElementById('cowowner-nick').value.trim() || '',

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

    if (!list.length) { tb.innerHTML = `<tr><td colspan="7" class="table-empty">Brak personelu "” dodaj pierwszego!</td></tr>`; return; }

    tb.innerHTML = list.map(p => {

        const color = RANK_COLORS[p.rank] || '#6b7280';

        const socials = [

            p.dc && `<a href="${p.dc}" target="_blank" style="color:#7289da;text-decoration:none;font-size:.8rem;"><i class="fa-brands fa-discord"></i></a>`,

            p.yt && `<a href="${p.yt}" target="_blank" style="color:#ff0000;text-decoration:none;font-size:.8rem;"><i class="fa-brands fa-youtube"></i></a>`,

            p.tt && `<a href="${p.tt}" target="_blank" style="color:#00f0ff;text-decoration:none;font-size:.8rem;"><i class="fa-brands fa-tiktok"></i></a>`

        ].filter(Boolean).join(' ');

        return `<tr>

            <td><img src="https://mc-heads.net/avatar/${encodeURIComponent(p.nick||'Steve')}/36" style="width:36px;height:36px;border-radius:6px;image-rendering:pixelated;" onerror="this.src='https://mc-heads.net/avatar/Steve/36'"></td>

            <td><span style="font-weight:700;">${p.nick||'"”'}</span></td>

            <td><span class="badge" style="background:${color}22;border:1px solid ${color}44;color:${color};">${p.rank||'"”'}</span></td>

            <td style="max-width:180px;font-size:.82rem;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.desc||'"”'}</td>

            <td style="display:flex;gap:.4rem;padding:.5rem 0;">${socials||'"”'}</td>

            <td style="font-size:.82rem;color:var(--text-secondary);">${p.order || 99}</td>

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

    document.getElementById('pm-order').value = p.order || 99;

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



// â”€â”€â”€ TWĂ“RCY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€



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

            <td><span style="font-weight:700;">${c.nick||'"”'}</span></td>

            <td style="max-width:180px;font-size:.82rem;color:var(--text-secondary);">${c.desc||'"”'}</td>

            <td style="display:flex;gap:.4rem;padding:.5rem 0;">${socials||'"”'}</td>

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



// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// â”€â”€â”€ STRONA (SITE PAGE) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•



// â”€â”€â”€ _currentContestId â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function _currentContestId() {

    const sel = document.getElementById('site-contest-select');

    return (sel && sel.value) ? sel.value : 'start';

}



function formatDatetimeLocalValue(date) {

    const pad = (value) => String(value).padStart(2, '0');

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

}



function normalizeContestDateValue(value) {

    if (!value) return '';

    if (typeof value === 'string') {

        return value.includes('T') ? value.slice(0, 16) : `${value}T20:00`;

    }

    if (value instanceof Timestamp) {

        return formatDatetimeLocalValue(value.toDate());

    }

    if (value instanceof Date) {

        return formatDatetimeLocalValue(value);

    }

    if (typeof value.toDate === 'function') {

        return formatDatetimeLocalValue(value.toDate());

    }

    return '';

}



function renderContestStatusBadge(data = null, contestId = '') {

    const badge = document.getElementById('site-contest-status-badge');

    if (!badge) return;

    if (!data) {

        badge.innerHTML = `<span class="badge badge-default">${contestId || 'Brak konkursu'}</span>`;

        return;

    }

    const isActive = data.aktywny !== false;

    const participants = Number(data.participants || 0);

    badge.innerHTML = `

        <span class="badge ${isActive ? 'badge-online' : 'badge-banned'}">${isActive ? 'Aktywny' : 'Zakończony'}</span>

        <span class="badge badge-default" style="margin-left:.35rem;">ID: ${contestId}</span>

        <span class="badge badge-default" style="margin-left:.35rem;">Uczestnicy: ${participants}</span>

    `;

}



// â”€â”€â”€ siteLoadContestList â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function siteLoadContestList() {

    const sel = document.getElementById('site-contest-select');

    if (!sel) return;

    const previousVal = sel.value;

    try {

        const snap = await getDocs(collection(db, 'contests'));

        const ids = snap.docs.map(d => d.id).sort();

        if (!ids.length) {

            sel.innerHTML = '<option value="start">start (brak)</option>';

            sel.value = 'start';

            return;

        }

        sel.innerHTML = ids.map(id => `<option value="${id}">${id}</option>`).join('');

        // Zachowaj poprzedni wybór jeśli nadal istnieje

        if (previousVal && ids.includes(previousVal)) {

            sel.value = previousVal;

        } else {

            sel.value = ids[0];

        }

    } catch(e) {

        sel.innerHTML = '<option value="start">start</option>';

        sel.value = 'start';

        console.error('siteLoadContestList:', e);

    }

}



// â”€â”€â”€ siteNewContest â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

window.siteNewContest = async function() {

    if (!requirePermission('site', 'zarządzanie stroną')) return;

    const id = prompt('Podaj ID nowego konkursu (np. "konkurs2025"):');

    if (!id || !id.trim()) return;

    const contestId = id.trim().replace(/[\/\\?#\[\]]+/g, '-').replace(/\s+/g, '-');

    if (!contestId) {

        showToast('error', 'ID konkursu jest nieprawidłowe.');

        return;

    }

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

        await siteLoadEntries();

    } catch(e) { showToast('error', 'Błąd: ' + e.message); }

};



// â”€â”€â”€ loadSitePage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

window.loadSitePage = async function() {

    await siteLoadContestList();

    await Promise.all([siteLoadContestInfo(), siteLoadEntries(), siteLoadChanges(), siteLoadMedia(), siteLoadProposals()]);

};



// â”€â”€â”€ switchSiteTab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

window.switchSiteTab = function(tab) {

    document.querySelectorAll('.site-tab-btn').forEach(b => {

        b.classList.toggle('active', b.getAttribute('data-site-tab') === tab);

    });

    document.querySelectorAll('.site-tab-panel').forEach(p => {

        p.classList.toggle('sp-active', p.id === 'site-tab-' + tab);

    });

};



// â”€â”€â”€ siteLoadContestInfo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function siteLoadContestInfo() {

    const contestId = _currentContestId();

    const n  = document.getElementById('site-contest-nagroda');

    const dt = document.getElementById('site-contest-date');

    const wc = document.getElementById('site-contest-winners-count');

    try {

        const snap = await getDoc(doc(db, 'contests', contestId));

        if (snap.exists()) {

            const d = snap.data();

            if (n)  n.value  = d.nagroda || '';

            if (dt) dt.value = normalizeContestDateValue(d.wyniki);

            if (wc) wc.value = d.winnersCount || 2;

            _buildWinnersInputs(d.winnersCount || 2);

            renderContestStatusBadge(d, contestId);

        } else {

            if (n) n.value = '';

            if (dt) dt.value = '';

            if (wc) wc.value = 2;

            _buildWinnersInputs(2);

            renderContestStatusBadge(null, contestId);

        }

    } catch(e) {

        console.error('siteLoadContestInfo:', e);

        if (n) n.value = '';

        if (dt) dt.value = '';

        if (wc) wc.value = 2;

        _buildWinnersInputs(2);

        renderContestStatusBadge(null, contestId);

    }

}



// â”€â”€â”€ _buildWinnersInputs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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



// â”€â”€â”€ siteUpdateContest â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

window.siteUpdateContest = async function() {

    if (!requirePermission('site', 'zarządzanie stroną')) return;

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

        await siteLoadContestInfo();

        showSiteContestMsg('✓ Zapisano!', '#00e676');

    } catch(e) { showSiteContestMsg('Błąd: ' + e.message, '#ef4444'); }

};



// â”€â”€â”€ siteAnnounceWinners â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

window.siteAnnounceWinners = async function() {

    if (!requirePermission('site', 'zarządzanie stroną')) return;

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

        await siteLoadContestInfo();

        showSiteContestMsg('✓ Zwycięzcy ogłoszeni!', '#00e676');

    } catch(e) { showSiteContestMsg('Błąd: ' + e.message, '#ef4444'); }

};



// â”€â”€â”€ siteEndContest â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

window.siteEndContest = async function() {

    if (!requirePermission('site', 'zarządzanie stroną')) return;

    const contestId = _currentContestId();

    if (!confirm('Zakończyć konkurs bez wyników?')) return;

    try {

        const ref = doc(db, 'contests', contestId);

        const snap = await getDoc(ref);

        if (snap.exists()) { await updateDoc(ref, { aktywny: false }); }

        await siteLoadContestInfo();

        showSiteContestMsg('Konkurs zakończony.', '#f59e0b');

    } catch(e) { showSiteContestMsg('Błąd: ' + e.message, '#ef4444'); }

};



// â”€â”€â”€ siteDeleteContest â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

window.siteDeleteContest = async function() {

    if (!requirePermission('site', 'zarządzanie stroną')) return;

    const contestId = _currentContestId();

    if (!confirm(`USUNĄĆ konkurs "${contestId}"? Tej operacji nie można cofnąć!`)) return;

    try {

        const entriesSnap = await getDocs(collection(db, 'contests', contestId, 'entries'));

        for (const d of entriesSnap.docs) await deleteDoc(d.ref);

        await deleteDoc(doc(db, 'contests', contestId));

        showSiteContestMsg('Konkurs usunąćięty.', '#ef4444');

        showToast('success', `Usunięto konkurs "${contestId}"`);

        await siteLoadContestList();

        const sel = document.getElementById('site-contest-select');

        if (sel && sel.options.length > 0) {

            sel.selectedIndex = 0;

        }

        await siteLoadContestInfo();

        await siteLoadEntries();

    } catch(e) { showSiteContestMsg('Błąd: ' + e.message, '#ef4444'); }

};



// â”€â”€â”€ siteRestartContest â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

window.siteRestartContest = async function() {

    if (!requirePermission('site', 'zarządzanie stroną')) return;

    const contestId = _currentContestId();

    if (!confirm('Zresetować konkurs (usunąćąć uczestników i ustawić aktywny)?')) return;

    try {

        const entriesSnap = await getDocs(collection(db, 'contests', contestId, 'entries'));

        for (const d of entriesSnap.docs) await deleteDoc(d.ref);

        const ref = doc(db, 'contests', contestId);

        await setDoc(ref, {

            participants: 0, aktywny: true,

            winners: [], nagroda: document.getElementById('site-contest-nagroda').value.trim() || '2x Ranga CRIT na 14 dni',

            winnersCount: parseInt(document.getElementById('site-contest-winners-count').value) || 2

        });

        await siteLoadContestInfo();

        showSiteContestMsg('✓ Konkurs zresetowany!', '#00e676');

        await siteLoadEntries();

    } catch(e) { showSiteContestMsg('Błąd: ' + e.message, '#ef4444'); }

};



// â”€â”€â”€ showSiteContestMsg â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function showSiteContestMsg(text, color) {

    const el = document.getElementById('site-contest-msg');

    if (!el) return;

    el.textContent = text; el.style.color = color;

    setTimeout(() => { el.textContent = ''; }, 3500);

}



// â”€â”€â”€ siteLoadEntries â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

                <td style="color:var(--text-secondary);">${e.nickDC||'"”'}</td>

                <td><span style="color:#f59e0b;font-style:italic;">${e.secret||'"”'}</span></td>

                <td style="font-size:.8rem;color:var(--text-secondary);">${e.joinedAt ? new Date(e.joinedAt).toLocaleString('pl-PL') : '"”'}</td>

                <td><button class="tbl-btn tbl-btn-red" onclick="siteRemoveEntry('${e.nickMC||e.id}')"><i class="fa-solid fa-trash"></i> Usuńń</button></td>

            </tr>`).join('');

    } catch(e) { tb.innerHTML = `<tr><td colspan="5" class="table-empty" style="color:#ef4444;">Błąd: ${e.message}</td></tr>`; }

};



// â”€â”€â”€ siteRemoveEntry â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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



// â”€â”€â”€ siteLoadChanges â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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



// â”€â”€â”€ siteSaveChanges â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

        showToast('success', 'Zmieńany serwerowe opublikowane!');

    } catch(e) {

        if (msgEl) { msgEl.textContent = 'Błąd: ' + e.message; msgEl.style.color = '#ef4444'; }

    }

};



// â”€â”€â”€ siteLoadMedia â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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



// â”€â”€â”€ siteSaveMedia â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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



// â”€â”€â”€ siteLoadProposals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

window.siteLoadProposals = async function() {

    const tb = document.getElementById('site-proposals-tbody');

    if (!tb) return;

    tb.innerHTML = `<tr><td colspan="5" class="table-loading"><i class="fa-solid fa-spinner fa-spin"></i> Ładowanie...</td></tr>`;

    try {

        const snap = await getDocs(query(collection(db, 'proposals'), orderBy('createdAt', 'desc')));

        if (snap.empty) { tb.innerHTML = `<tr><td colspan="5" class="table-empty">Brak propozycji.</td></tr>`; return; }

        tb.innerHTML = snap.docs.map(d => {

            const p = { id: d.id, ...d.data() };

            const date = p.createdAt ? new Date(p.createdAt).toLocaleString('pl-PL', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '"”';

            const total = (p.yes||0) + (p.no||0);

            const yesPct = total ? Math.round((p.yes||0)/total*100) : 0;

            return `<tr>

                <td style="max-width:300px;font-size:.88rem;">${p.text||'"”'}</td>

                <td><span style="color:#00e676;font-weight:700;">${p.yes||0}</span></td>

                <td><span style="color:#ef4444;font-weight:700;">${p.no||0}</span> ${total > 0 ? `<span style="color:var(--text-secondary);font-size:.75rem;">(${yesPct}% TAK)</span>` : ''}</td>

                <td style="font-size:.8rem;color:var(--text-secondary);">${date}</td>

                <td><button class="tbl-btn tbl-btn-red" onclick="siteDeleteProposal('${p.id}')"><i class="fa-solid fa-trash"></i></button></td>

            </tr>`;

        }).join('');

    } catch(e) { tb.innerHTML = `<tr><td colspan="5" class="table-empty" style="color:#ef4444;">Błąd: ${e.message}</td></tr>`; }

};



// â”€â”€â”€ siteDeleteProposal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

window.siteDeleteProposal = async function(id) {

    if (!confirm('Usunąć tę propozycję?')) return;

    try {

        await deleteDoc(doc(db, 'proposals', id));

        showToast('success', 'Propozycja usunąćięta');

        await siteLoadProposals();

    } catch(e) { showToast('error', 'Błąd: ' + e.message); }

};



// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// â”€â”€â”€ ROZSZERZENIE UPRAWNIEŃ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•



function _extendedApplyPermissions() {

    const siteNav     = document.querySelector('.nav-btn[data-page="site"]');

    const shopNav     = document.querySelector('.nav-btn[data-page="shop"]');

    const personelNav = document.querySelector('.nav-btn[data-page="personel"]');

    const adminsNav   = document.querySelector('.nav-btn[data-page="admins"]');

    const permsNav    = document.querySelector('.nav-btn[data-page="permissions"]');

    const filesNav    = document.querySelector('.nav-btn[data-page="files"]');



    if (siteNav)     siteNav.style.display     = (hasPermission('site') || hasPermission('all')) ? '' : 'none';

    if (shopNav)     shopNav.style.display     = (hasPermission('shop') || hasPermission('all')) ? '' : 'none';

    if (personelNav) personelNav.style.display = hasPermission('all') ? '' : 'none';

    if (adminsNav)   adminsNav.style.display   = (hasPermission('admins_manage') || hasPermission('all')) ? '' : 'none';

    if (permsNav)    permsNav.style.display    = (hasPermission('permissions_manage') || hasPermission('all')) ? '' : 'none';

    if (filesNav)    filesNav.style.display    = (hasPermission('evidence_view') || hasPermission('all')) ? '' : 'none';

}



// Expose to window so inline scripts can call it if needed

window._extendedApplyPermissions = _extendedApplyPermissions;




// ═══════════════════════════════════════════════════════════════════════════
// ─── STRONA INFORMACJE ──────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

const _panelStartTime = Date.now();

function _setInfoStatus(elId, ok, label, detail) {
    const el = document.getElementById(elId);
    if (!el) return;
    const color = ok ? '#10b981' : '#ef4444';
    const icon  = ok ? 'fa-circle-check' : 'fa-circle-xmark';
    el.innerHTML = `<span style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0;box-shadow:0 0 6px ${color}88;"></span>
        <span style="font-size:.88rem;font-weight:700;color:${color};"><i class="fa-solid ${icon}" style="margin-right:.3rem;"></i>${label}</span>`;
    const det = document.getElementById(elId.replace('-status', '-detail'));
    if (det) det.textContent = detail || '';
}

function _setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val ?? '—';
}

function _formatUptime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
}

window.loadInfoPage = async function() {
    const refreshedEl = document.getElementById('info-refreshed-at');
    if (refreshedEl) refreshedEl.textContent = 'Odświeżanie...';

    // ── Uptime ──────────────────────────────────────────────────────────────
    const uptimeEl = document.getElementById('info-uptime');
    if (uptimeEl) uptimeEl.textContent = _formatUptime(Date.now() - _panelStartTime);
    // Aktualizuj co sekundę
    if (!window._uptimeInterval) {
        window._uptimeInterval = setInterval(() => {
            const el = document.getElementById('info-uptime');
            if (el) el.textContent = _formatUptime(Date.now() - _panelStartTime);
        }, 1000);
    }

    // ── Statystyki z cache ───────────────────────────────────────────────────
    _setEl('info-stat-players', allPlayers.length);
    _setEl('info-stat-online',  allPlayers.filter(p => p.online).length);
    _setEl('info-stat-bans',    allBans.length);
    _setEl('info-stat-mutes',   allMutes.length);
    _setEl('info-stat-logs',    allLogs.length);
    _setEl('info-stat-files',   allFiles.length);
    _setEl('info-stat-admins',  typeof allAdmins !== 'undefined' ? allAdmins.length : '—');
    _setEl('info-stat-shop',    typeof allShopItems !== 'undefined' ? allShopItems.length : '—');

    // ── Sesja ────────────────────────────────────────────────────────────────
    _setEl('info-s-user',       currentUser?.displayName || '—');
    _setEl('info-s-role',       currentUser?.role || '—');
    _setEl('info-s-login-time', new Date(Date.now() - _panelStartTime < 1000 ? Date.now() : Date.now() - (Date.now() - _panelStartTime)).toLocaleTimeString('pl-PL'));
    _setEl('info-s-browser',    navigator.userAgent.split(') ').pop().split(' ')[0] || navigator.userAgent.substring(0,60));
    _setEl('info-s-res',        `${window.screen.width}×${window.screen.height} (viewport: ${window.innerWidth}×${window.innerHeight})`);
    _setEl('info-s-tz',         Intl.DateTimeFormat().resolvedOptions().timeZone);

    // ── Zasoby strony ────────────────────────────────────────────────────────
    _setEl('info-worker-url', FILE_WORKER_URL);
    _setEl('info-scripts',    document.scripts.length);
    const mem = performance?.memory;
    _setEl('info-memory', mem ? `${Math.round(mem.usedJSHeapSize / 1048576)} MB / ${Math.round(mem.jsHeapSizeLimit / 1048576)} MB` : 'N/A (Chrome only)');
    _setEl('info-last-refresh', new Date().toLocaleTimeString('pl-PL'));

    // ── Test Firebase ─────────────────────────────────────────────────────────
    const t0 = performance.now();
    try {
        await getDoc(doc(db, 'panel_settings', 'health_check'));
        const ping = Math.round(performance.now() - t0);
        _setInfoStatus('info-db-status', true, `Połączono (${ping}ms)`, `Projekt: stronacritmcpl · Firebase 12.14.0`);
    } catch (e) {
        _setInfoStatus('info-db-status', false, 'Błąd połączenia', e.message);
    }

    // ── Test Worker B2 ───────────────────────────────────────────────────────
    const t1 = performance.now();
    try {
        const res = await fetch(`${FILE_WORKER_URL}/health`, { method: 'GET', signal: AbortSignal.timeout(5000) });
        const ping2 = Math.round(performance.now() - t1);
        if (res.ok || res.status === 404) {
            _setInfoStatus('info-b2-status', true, `Dostępny (${ping2}ms)`, FILE_WORKER_URL);
        } else {
            _setInfoStatus('info-b2-status', false, `HTTP ${res.status}`, FILE_WORKER_URL);
        }
    } catch (e) {
        const ping2 = Math.round(performance.now() - t1);
        // Jeśli CORS error lub network — worker może nadal działać
        _setInfoStatus('info-b2-status', ping2 < 5000, ping2 < 5000 ? `Dostępny (CORS: ${ping2}ms)` : 'Timeout / niedostępny', FILE_WORKER_URL);
    }

    // ── Status MC (online gracze) ────────────────────────────────────────────
    const onlineCount = allPlayers.filter(p => p.online).length;
    const totalPlayers = allPlayers.length;
    if (totalPlayers > 0 || allLogs.length > 0) {
        _setInfoStatus('info-mc-status', true, `Online: ${onlineCount} graczy`, `${totalPlayers} graczy w bazie · ${allLogs.length} wpisów w logach`);
    } else {
        _setInfoStatus('info-mc-status', null, 'Brak danych', 'Nie odebrano jeszcze danych z pluginu');
        const mcEl = document.getElementById('info-mc-status');
        if (mcEl) {
            const dot = mcEl.querySelector('span');
            if (dot) dot.style.background = '#f59e0b';
        }
    }

    // ── Czas logowania ────────────────────────────────────────────────────────
    const loginTime = new Date(Date.now() - (Date.now() - _panelStartTime));
    _setEl('info-s-login-time', loginTime.toLocaleTimeString('pl-PL'));

    if (refreshedEl) refreshedEl.textContent = `Odświeżono: ${new Date().toLocaleTimeString('pl-PL')}`;
};
