/**
 * CritMC - Cloudflare Worker dla Backblaze B2
 * Wdróż na: critmc-b2-files.marcinstella.workers.dev
 *
 * Wymagane sekrety (wdroż przez: wrangler secret put NAZWA):
 *   B2_KEY_ID              - Application Key ID z Backblaze
 *   B2_APPLICATION_KEY     - Application Key z Backblaze
 *   B2_BUCKET_ID_EVIDENCE  - ID bucketu dla dowodów/nagrań
 *   B2_BUCKET_ID_MEDIA     - ID bucketu dla mediów publicznych (sklep, strona)
 *   B2_BUCKET_NAME_EVIDENCE
 *   B2_BUCKET_NAME_MEDIA
 *   ALLOWED_ORIGIN         - np. https://critmc.pl (lub * podczas testów)
 */

// ─── CORS ────────────────────────────────────────────────────────────────
function corsHeaders(env) {
    return {
        'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
}

function jsonResponse(data, status = 200, env) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(env) }
    });
}

// ─── B2 AUTH ─────────────────────────────────────────────────────────────
async function b2Authorize(env) {
    const creds = btoa(`${env.B2_KEY_ID}:${env.B2_APPLICATION_KEY}`);
    // Używamy v2 — kompatybilne ze wszystkimi typami kluczy
    const res = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
        headers: { Authorization: `Basic ${creds}` }
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`B2 auth failed: ${res.status} — ${body.slice(0,200)}`);
    }
    return res.json();
    // v2 response: { apiUrl, authorizationToken, downloadUrl, recommendedPartSize, ... }
}

async function b2GetUploadUrl(apiUrl, authToken, bucketId) {
    const res = await fetch(`${apiUrl}/b2api/v2/b2_get_upload_url`, {
        method: 'POST',
        headers: { Authorization: authToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucketId })
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`B2 get_upload_url failed: ${res.status} — ${body.slice(0,200)}`);
    }
    return res.json();
}

async function b2UploadFile(uploadUrl, uploadAuth, fileName, fileData, mimeType, fileInfo = {}) {
    const sha1 = await sha1Hex(fileData);
    const infoHeaders = {};
    for (const [k, v] of Object.entries(fileInfo)) {
        if (v) infoHeaders[`X-Bz-Info-${k}`] = encodeURIComponent(String(v).slice(0, 1024));
    }
    const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
            Authorization: uploadAuth,
            'X-Bz-File-Name': encodeURIComponent(fileName),
            'Content-Type': mimeType || 'application/octet-stream',
            'Content-Length': fileData.byteLength.toString(),
            'X-Bz-Content-Sha1': sha1,
            ...infoHeaders
        },
        body: fileData
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'B2 upload failed: ' + res.status);
    }
    return res.json();
}

async function sha1Hex(buffer) {
    const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
    return [...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── HELPERS ─────────────────────────────────────────────────────────────
function safeName(name) {
    return name.replace(/[^a-zA-Z0-9._\-]/g, '_').slice(0, 200);
}

function datePath() {
    const d = new Date();
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────
export default {
    async fetch(request, env) {
        const url    = new URL(request.url);
        const method = request.method.toUpperCase();

        // Preflight CORS
        if (method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders(env) });
        }

        // Health check
        if (url.pathname === '/health') {
            return jsonResponse({ ok: true, service: 'critmc-b2-worker' }, 200, env);
        }

        // ── POST /upload/evidence ─────────────────────────────────────────
        if (method === 'POST' && url.pathname === '/upload/evidence') {
            return handleUpload(request, env, {
                bucketId:   env.B2_BUCKET_ID_EVIDENCE,
                bucketName: env.B2_BUCKET_NAME_EVIDENCE,
                folder:     'evidence',
                isPublic:   false
            });
        }

        // ── POST /upload/shop ─────────────────────────────────────────────
        if (method === 'POST' && url.pathname === '/upload/shop') {
            return handleUpload(request, env, {
                bucketId:   env.B2_BUCKET_ID_MEDIA,
                bucketName: env.B2_BUCKET_NAME_MEDIA,
                folder:     'shop',
                isPublic:   true
            });
        }

        // ── POST /upload/media ────────────────────────────────────────────
        if (method === 'POST' && url.pathname === '/upload/media') {
            return handleUpload(request, env, {
                bucketId:   env.B2_BUCKET_ID_MEDIA,
                bucketName: env.B2_BUCKET_NAME_MEDIA,
                folder:     'media',
                isPublic:   true
            });
        }

        // ── GET /file?key=... ─────────────────────────────────────────────
        // Proxy dla prywatnych plików (dowody)
        if (method === 'GET' && url.pathname === '/file') {
            return handleDownload(request, env, url);
        }

        // ── DELETE /file?key=... ──────────────────────────────────────────
        if (method === 'DELETE' && url.pathname === '/file') {
            return handleDelete(request, env, url);
        }

        return jsonResponse({ ok: false, error: 'Not found' }, 404, env);
    }
};

// ─── UPLOAD HANDLER ───────────────────────────────────────────────────────
async function handleUpload(request, env, opts) {
    let formData;
    try {
        formData = await request.formData();
    } catch {
        return jsonResponse({ ok: false, error: 'Wymagany multipart/form-data' }, 400, env);
    }

    const file = formData.get('file');
    if (!file || typeof file === 'string') {
        return jsonResponse({ ok: false, error: 'Brak pliku w żądaniu' }, 400, env);
    }

    const originalName = safeName(file.name || 'upload');
    const mimeType     = file.type || 'application/octet-stream';
    const ts           = Date.now();
    const fileName     = `${opts.folder}/${datePath()}/${ts}-${originalName}`;

    // Dodatkowe meta z formularza
    const meta = {
        admin:   formData.get('admin')  || '',
        player:  formData.get('player') || '',
        action:  formData.get('action') || '',
        reason:  formData.get('reason') || '',
        folder:  opts.folder
    };

    let fileData;
    try {
        fileData = await file.arrayBuffer();
    } catch {
        return jsonResponse({ ok: false, error: 'Nie udało się odczytać pliku' }, 400, env);
    }

    // Sprawdź rozmiar (max 200 MB)
    if (fileData.byteLength > 200 * 1024 * 1024) {
        return jsonResponse({ ok: false, error: 'Plik za duży (max 200 MB)' }, 413, env);
    }

    try {
        const auth       = await b2Authorize(env);
        // v2: auth.apiUrl i auth.downloadUrl bezpośrednio
        const apiUrl     = auth.apiUrl;
        const uploadInfo = await b2GetUploadUrl(apiUrl, auth.authorizationToken, opts.bucketId);
        const uploaded   = await b2UploadFile(
            uploadInfo.uploadUrl,
            uploadInfo.authorizationToken,
            fileName,
            fileData,
            mimeType,
            meta
        );

        // URL publiczny (tylko dla publicznych bucketów)
        const publicUrl = opts.isPublic
            ? `${auth.downloadUrl}/file/${opts.bucketName}/${encodeURIComponent(fileName)}`
            : null;

        return jsonResponse({
            ok: true,
            file: {
                fileKey:      fileName,
                b2FileId:     uploaded.fileId,
                bucket:       opts.bucketName,
                fileName:     originalName,
                mimeType,
                size:         fileData.byteLength,
                publicUrl,
                isPublic:     opts.isPublic
            }
        }, 200, env);

    } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 500, env);
    }
}

// ─── DOWNLOAD PROXY (dla prywatnych plików) ───────────────────────────────
async function handleDownload(_request, env, url) {
    const fileKey = url.searchParams.get('key');
    if (!fileKey) return jsonResponse({ ok: false, error: 'Brak klucza pliku' }, 400, env);

    try {
        const auth = await b2Authorize(env);
        // v2 API
        const res = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_download_authorization`, {
            method: 'POST',
            headers: { Authorization: auth.authorizationToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                bucketId:               env.B2_BUCKET_ID_EVIDENCE,
                fileNamePrefix:         decodeURIComponent(fileKey),
                validDurationInSeconds: 3600
            })
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error('B2 download_auth failed: ' + body.slice(0,200));
        }
        const authData    = await res.json();
        const downloadUrl = `${auth.downloadUrl}/file/${env.B2_BUCKET_NAME_EVIDENCE}/${encodeURIComponent(fileKey)}?Authorization=${authData.authorizationToken}`;
        return Response.redirect(downloadUrl, 302);

    } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 500, env);
    }
}

// ─── DELETE ───────────────────────────────────────────────────────────────
async function handleDelete(_request, env, url) {
    const fileKey  = url.searchParams.get('key');
    const b2FileId = url.searchParams.get('id');
    if (!fileKey || !b2FileId) return jsonResponse({ ok: false, error: 'Brak key lub id' }, 400, env);

    try {
        const auth = await b2Authorize(env);
        // v2 API
        const res  = await fetch(`${auth.apiUrl}/b2api/v2/b2_delete_file_version`, {
            method: 'POST',
            headers: { Authorization: auth.authorizationToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileId: b2FileId, fileName: decodeURIComponent(fileKey) })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || 'B2 delete failed: ' + res.status);
        }
        return jsonResponse({ ok: true }, 200, env);
    } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 500, env);
    }
}
