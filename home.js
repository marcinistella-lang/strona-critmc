document.addEventListener('DOMContentLoaded', () => {

    // ─── ZAKŁADKI ─────────────────────────────────────────────────────
    const tabButtons  = document.querySelectorAll('.tab-button');
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

    // ─── PODKATEGORIE (zestawy) ───────────────────────────────────────
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

    // ─── CHANGES TABS (zakładki w modalach zmian) ─────────────────────
    document.querySelectorAll('.changes-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.stopPropagation();
            const mode = tab.getAttribute('data-mode');
            const box  = tab.closest('.changes-panel-box');
            if (!box) return;
            box.querySelectorAll('.changes-tab').forEach(t => t.classList.remove('active'));
            box.querySelectorAll('.changes-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const panel = box.querySelector('#mode-' + mode);
            if (panel) panel.classList.add('active');
        });
    });

    // ─── IP SERWERA ───────────────────────────────────────────────────
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

// ─── ADMIN ACCORDION ──────────────────────────────────────────────────
function toggleAdmin(card) {
    card.classList.toggle('open');
}

// ─── REGULAMIN ────────────────────────────────────────────────────────
function openRegulamin() {
    document.getElementById('regulamin-overlay').classList.add('open');
}
function closeRegulamin(e) {
    if (!e || e.target === document.getElementById('regulamin-overlay')) {
        document.getElementById('regulamin-overlay').classList.remove('open');
    }
}

// ─── ZMIANY SERWEROWE (tylko widok publiczny) ─────────────────────────
function openChanges() {
    document.getElementById('changes-overlay').classList.add('open');
}
function closeChanges(e) {
    if (!e || e.target === document.getElementById('changes-overlay')) {
        document.getElementById('changes-overlay').classList.remove('open');
    }
}
