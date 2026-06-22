document.addEventListener('DOMContentLoaded', () => {
    // --- OBSŁUGA ZAKŁADEK ---
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');

            // Usuń klasę active ze wszystkich przycisków
            tabButtons.forEach(btn => btn.classList.remove('active'));
            // Dodaj klasę active do klikniętego przycisku
            button.classList.add('active');

            // Ukryj wszystkie sekcje i pokaż wybraną
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === targetTab) {
                    content.classList.add('active');
                }
            });
        });
    });

    // --- PODKATEGORIE ZESTAWÓW ---
    const subcategoryButtons = document.querySelectorAll('.subcategory-button');

    subcategoryButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetSubcategory = button.getAttribute('data-subcategory');
            const parentSection = button.closest('.tab-content');

            // Usuń active tylko z przycisków w tej samej sekcji
            parentSection.querySelectorAll('.subcategory-button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Usuń active tylko z paneli w tej samej sekcji
            parentSection.querySelectorAll('.subcategory-panel').forEach(panel => {
                panel.classList.remove('active');
                if (panel.id === targetSubcategory) {
                    panel.classList.add('active');
                }
            });
        });
    });

    // --- OBSŁUGA ROZWIJANIA BLOKÓW DISCORD (Event Delegation) ---
    document.addEventListener('click', (event) => {
        const collapsedBlock = event.target.closest('.discord-collapsed');
        if (collapsedBlock) {
            const discordBlock = collapsedBlock.parentElement;
            discordBlock.classList.toggle('expanded');
        }
    });

    // --- ZESTAWY: wartość, wstążka % taniej ---
    const SHOP_UNIT_PRICES = {
        ranks: { vip: 10, boss: 20, crit: 30 },
        keys: { zwykly: 0.25, zwykły: 0.25, rzadki: 0.75, epicki: 1.5, crit: 5, premium: 20 },
        coinsPer1000: 3.99
    };

    const parseCardPrice = (priceEl) => {
        if (!priceEl) return 0;
        const raw = priceEl.textContent.replace(/\s*PLN.*/i, '').trim().replace(',', '.');
        return parseFloat(raw) || 0;
    };

    const formatPln = (amount) => {
        const rounded = Math.round(amount * 100) / 100;
        const text = Number.isInteger(rounded)
            ? String(rounded)
            : rounded.toFixed(2).replace('.', ',');
        return `${text} PLN`;
    };

    const calculateBundleValue = (card) => {
        if (card.dataset.bundleValue) {
            return parseFloat(card.dataset.bundleValue);
        }

        let total = 0;
        const tags = card.querySelectorAll('.tags-container .item-tag');

        tags.forEach((tag) => {
            const text = tag.textContent.replace(/\s+/g, ' ').trim().toLowerCase();

            if (text.includes('ranga vip')) {
                total += SHOP_UNIT_PRICES.ranks.vip;
                return;
            }
            if (text.includes('ranga boss')) {
                total += SHOP_UNIT_PRICES.ranks.boss;
                return;
            }
            if (text.includes('ranga crit')) {
                total += SHOP_UNIT_PRICES.ranks.crit;
                return;
            }

            const keyMatch = text.match(/(\d+)\s*x\s*klucz\s+(zwyk\w+|rzadki|epicki|crit|premium)/i);
            if (keyMatch) {
                const count = parseInt(keyMatch[1], 10);
                const keyType = keyMatch[2].normalize('NFD').replace(/\p{Diacritic}/gu, '');
                const unit = SHOP_UNIT_PRICES.keys[keyType] ?? SHOP_UNIT_PRICES.keys[keyMatch[2]] ?? 0;
                total += count * unit;
                return;
            }

            if (/klucz\s+premium/.test(text)) {
                total += SHOP_UNIT_PRICES.keys.premium;
                return;
            }

            const coinsMatch = text.match(/(\d[\d\s]*)\s*monet/);
            if (coinsMatch) {
                const coins = parseInt(coinsMatch[1].replace(/\s/g, ''), 10);
                total += (coins / 1000) * SHOP_UNIT_PRICES.coinsPer1000;
            }
        });

        return Math.round(total * 100) / 100;
    };

    window.initBundleValues = function() {
        document.querySelectorAll('.bundle-card').forEach((card) => {
            const price = parseCardPrice(card.querySelector('.price-value'));
            const value = calculateBundleValue(card);
            const valueEl = card.querySelector('.bundle-value-amount');
            const ribbon = card.querySelector('.ribbon-save');

            if (valueEl && value > 0) {
                valueEl.textContent = formatPln(value);
            }

            if (ribbon && value > price && price > 0) {
                const savePercent = Math.round((value / price - 1) * 100);
                ribbon.textContent = `+${savePercent}% wartości`;
                ribbon.setAttribute('aria-label', `Dostajesz ${savePercent}% więcej niż płacisz`);
                ribbon.removeAttribute('aria-hidden');
            } else if (ribbon && value > 0) {
                ribbon.remove();
            }
        });
    };

    window.initBundleValues();

    // --- KLUCZ LOSOWY: zmiana koloru i gwiazdek ---
    const randomKeyCard = document.getElementById('random-key-card');
    const randomKeyStars = document.getElementById('random-key-stars');
    const randomKeyDice = document.getElementById('random-key-dice');

    if (randomKeyCard && randomKeyStars) {
        const SPEED_FACTOR = 1.67;
        const ROLL_MS = Math.round(1000 * SPEED_FACTOR);
        const CYCLE_MS = Math.round(1600 * SPEED_FACTOR);
        const IDLE_MS = Math.round(7000 * SPEED_FACTOR);

        const keyTiers = [
            { name: 'Zwykły', color: '#a8a8b3', glow: 'rgba(168, 168, 179, 0.4)', stars: 1 },
            { name: 'Rzadki', color: '#85f5a8', glow: 'rgba(133, 245, 168, 0.45)', stars: 2 },
            { name: 'Epicki', color: '#b388ff', glow: 'rgba(179, 136, 255, 0.45)', stars: 3 },
            { name: 'CRIT', color: '#ff1744', glow: 'rgba(255, 23, 68, 0.45)', stars: 4 },
            { name: 'Premium', color: '#f2c84a', glow: 'rgba(242, 200, 74, 0.45)', stars: 5 }
        ];

        const starIcons = randomKeyStars.querySelectorAll('.random-star-icon');
        let tierIndex = 0;

        const diceLabel = randomKeyDice ? randomKeyDice.querySelector('.dice-label') : null;
        const diceCube = randomKeyDice ? randomKeyDice.querySelector('.dice-3d-cube') : null;

        const finishDiceRoll = (event) => {
            if (event.animationName !== 'diceRollSpin' || !randomKeyDice) {
                return;
            }

            randomKeyDice.classList.remove('dice-roll');
        };

        const applyKeyTier = (tier) => {
            randomKeyCard.style.setProperty('--rk-color', tier.color);
            randomKeyCard.style.setProperty('--rk-glow', tier.glow);
            randomKeyStars.setAttribute('aria-label', `Podgląd: ${tier.name} — ${tier.stars} z 5 gwiazdek`);

            if (diceLabel) {
                diceLabel.textContent = tier.name;
                diceLabel.dataset.tier = tier.name;
            }

            if (randomKeyDice && diceCube) {
                diceCube.removeEventListener('animationend', finishDiceRoll);
                randomKeyDice.classList.remove('dice-roll');
                void randomKeyDice.offsetWidth;
                randomKeyDice.classList.add('dice-roll');
                diceCube.addEventListener('animationend', finishDiceRoll, { once: true });
            }

            starIcons.forEach((star, index) => {
                const filled = index < tier.stars;

                star.className = filled
                    ? 'fa-solid fa-star random-star-icon'
                    : 'fa-regular fa-star random-star-icon';
                star.style.color = filled ? tier.color : 'rgba(255, 255, 255, 0.15)';
                star.style.textShadow = filled ? `0 0 8px ${tier.glow}` : 'none';
                star.style.transform = filled ? 'scale(1.08)' : 'scale(1)';
                star.style.opacity = '1';
            });
        };

        randomKeyCard.style.setProperty('--rk-roll-duration', `${ROLL_MS}ms`);
        randomKeyCard.style.setProperty('--rk-transition-duration', `${ROLL_MS}ms`);
        randomKeyCard.style.setProperty('--rk-idle-duration', `${IDLE_MS}ms`);

        applyKeyTier(keyTiers[0]);

        setInterval(() => {
            tierIndex = (tierIndex + 1) % keyTiers.length;
            applyKeyTier(keyTiers[tierIndex]);
        }, CYCLE_MS);
    }

    // --- KOPIOWANIE IP SERWERA ---
    const ipBox = document.getElementById('ip-box');
    if (ipBox) {
        ipBox.addEventListener('click', () => {
            const ip = ipBox.getAttribute('data-ip');
            
            // Kopiowanie do schowka
            navigator.clipboard.writeText(ip).then(() => {
                const tooltip = ipBox.querySelector('.copy-tooltip');
                if (tooltip) {
                    const originalText = tooltip.textContent;
                    tooltip.textContent = 'Skopiowano!';
                    tooltip.style.color = '#00ff66';
                    
                    // Reset tekstu po 2 sekundach
                    setTimeout(() => {
                        tooltip.textContent = originalText;
                        tooltip.style.color = '';
                    }, 2000);
                }
            }).catch(err => {
                console.error('Błąd podczas kopiowania IP: ', err);
            });
        });
    }
});
