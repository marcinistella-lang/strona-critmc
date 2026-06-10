document.addEventListener('DOMContentLoaded', () => {
    // --- OBSŁUGA ZAKŁADEK ---
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === targetTab) {
                    content.classList.add('active');
                }
            });
        });
    });

    // --- KOPIOWANIE IP ---
    const ipBox = document.getElementById('ip-box');
    if (ipBox) {
        ipBox.addEventListener('click', () => {
            const ip = ipBox.getAttribute('data-ip');
            navigator.clipboard.writeText(ip).then(() => {
                const tooltip = ipBox.querySelector('.copy-tooltip');
                if (tooltip) {
                    const orig = tooltip.textContent;
                    tooltip.textContent = 'Skopiowano!';
                    tooltip.style.color = '#00ff66';
                    setTimeout(() => {
                        tooltip.textContent = orig;
                        tooltip.style.color = '';
                    }, 2000);
                }
            });
        });
    }
});

// --- ROZWIJANIE ADMINÓW ---
function toggleAdmin(card) {
    card.classList.toggle('open');
}

// --- ZMIANY SERWEROWE ---
function openChanges() {
    document.getElementById('changes-overlay').classList.add('open');
}

function closeChanges(e) {
    if (!e || e.target === document.getElementById('changes-overlay') || e.currentTarget.classList.contains('changes-close-btn')) {
        document.getElementById('changes-overlay').classList.remove('open');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.changes-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.stopPropagation();
            const mode = tab.getAttribute('data-mode');
            const box = tab.closest('.changes-panel-box');
            box.querySelectorAll('.changes-tab').forEach(t => t.classList.remove('active'));
            box.querySelectorAll('.changes-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            box.querySelector('#mode-' + mode).classList.add('active');
        });
    });
});

// --- REGULAMIN ---
function openRegulamin() {
    document.getElementById('regulamin-overlay').classList.add('open');
}

function closeRegulamin(e) {
    if (!e || e.target === document.getElementById('regulamin-overlay') || e.currentTarget.classList.contains('changes-close-btn')) {
        document.getElementById('regulamin-overlay').classList.remove('open');
    }
}
