/**
 * CritMC - Cloudflare Worker z R2
 *
 * Konfiguracja w wrangler.toml:
 *   [[r2_buckets]]
 *   binding = "BUCKET"
 *   bucket_name = "critmc-files"
 *
 * Sekrety (wrangler secret put):
 *   ALLOWED_ORIGIN  - np. https://critmc.pl lub *
 */

// ─── CORS ────────────────────────────────────────────────────────────────
function cors(env) {
    return {
        'Access-Control-Allow-Origin':  env.ALLOWED_ORIGIN || '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
}

function json(data, status = 200, env) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...cors(env) }
    });
}

// ─── HELPERS ─────────────────────────────────────────────────────────────
function safeName(name) {
    return (name || 'upload').replace(/[^a-zA-Z0-9._\-]/g, '_').slice(0, 200);
}

function datePath() {
    const d = new Date();
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────
export default {
    async fetch(request, env) {
        const url    = new URL(request.url);
        const method = request.method.toUpperCase();

        if (method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: cors(env) });
        }

        // Health
        if (url.pathname === '/health') {
            return json({ ok: true, service: 'critmc-r2-worker' }, 200, env);
        }

        // POST /upload/:folder  (evidence | shop | media)
        if (method === 'POST' && url.pathname.startsWith('/upload/')) {
            const folder = url.pathname.split('/')[2] || 'misc';
            return handleUpload(request, env, folder);
        }

        // GET /file/:key  — publiczny dostęp do pliku
        if (method === 'GET' && url.pathname.startsWith('/file/')) {
            return handleGet(url, env);
        }

        // DELETE /file/:key
        if (method === 'DELETE' && url.pathname.startsWith('/file/')) {
            return handleDelete(url, env);
        }

        return json({ ok: false, error: 'Not found' }, 404, env);
    }
};

// ─── UPLOAD ───────────────────────────────────────────────────────────────
async function handleUpload(request, env, folder) {
    if (!env.BUCKET) {
        return json({ ok: false, error: 'R2 bucket nie jest podpięty (sprawdź wrangler.toml)' }, 500, env);
    }

    let formData;
    try { formData = await request.formData(); }
    catch { return json({ ok: false, error: 'Wymagany multipart/form-data' }, 400, env); }

    const file = formData.get('file');
    if (!file || typeof file === 'string') {
        return json({ ok: false, error: 'Brak pliku w żądaniu' }, 400, env);
    }

    if (file.size > 200 * 1024 * 1024) {
        return json({ ok: false, error: 'Plik za duży (max 200 MB)' }, 413, env);
    }

    const originalName = safeName(file.name);
    const mimeType     = file.type || 'application/octet-stream';
    const key          = `${folder}/${datePath()}/${Date.now()}-${originalName}`;
    const fileData     = await file.arrayBuffer();

    // Metadane z formularza
    const meta = {
        admin:  formData.get('admin')  || '',
        player: formData.get('player') || '',
        action: formData.get('action') || '',
        reason: formData.get('reason') || '',
        folder,
        originalName,
        uploadedAt: new Date().toISOString()
    };

    // Zapisz do R2
    await env.BUCKET.put(key, fileData, {
        httpMetadata:   { contentType: mimeType },
        customMetadata: meta
    });

    // URL publiczny — przez Worker proxy
    const baseUrl   = `${new URL(request.url).origin}/file/${encodeURIComponent(key)}`;
    const isPublic  = folder !== 'evidence';
    const publicUrl = isPublic ? baseUrl : null;

    return json({
        ok: true,
        file: {
            fileKey:      key,
            fileName:     originalName,
            mimeType,
            size:         fileData.byteLength,
            url:          baseUrl,    // zawsze dostępny przez Worker
            publicUrl,                // null dla prywatnych (evidence)
            folder,
            isPublic
        }
    }, 200, env);
}

// ─── GET FILE ─────────────────────────────────────────────────────────────
async function handleGet(url, env) {
    if (!env.BUCKET) return json({ ok: false, error: 'Bucket nie podpięty' }, 500, env);

    const key = decodeURIComponent(url.pathname.replace('/file/', ''));
    if (!key) return json({ ok: false, error: 'Brak klucza' }, 400, env);

    const object = await env.BUCKET.get(key);
    if (!object) return json({ ok: false, error: 'Plik nie istnieje' }, 404, env);

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    // Dodaj CORS
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(object.body, { headers });
}

// ─── DELETE ───────────────────────────────────────────────────────────────
async function handleDelete(url, env) {
    if (!env.BUCKET) return json({ ok: false, error: 'Bucket nie podpięty' }, 500, env);

    const key = decodeURIComponent(url.pathname.replace('/file/', ''));
    if (!key) return json({ ok: false, error: 'Brak klucza' }, 400, env);

    await env.BUCKET.delete(key);
    return json({ ok: true }, 200, env);
}
