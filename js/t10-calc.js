(() => {
    // 1. Data Definitions
    const costAdvProt = {
        herbs: [64600000, 92300000, 92300000, 158000000, 158000000, 221000000, 221000000, 287000000, 287000000, 403000000],
        grainTimber: [21700000, 31000000, 31000000, 53000000, 53000000, 74000000, 74000000, 96000000, 96000000, 134000000],
        scrolls: [1280, 1440, 1440, 1600, 1600, 1800, 1800, 2000, 2000, 2000]
    };

    const costBoost3 = {
        herbs: [92300000, 158000000, 158000000, 221000000, 221000000, 287000000, 287000000, 403000000, 403000000, 563000000],
        grainTimber: [31000000, 53000000, 53000000, 74000000, 74000000, 96000000, 96000000, 134000000, 134000000, 175000000],
        scrolls: [1440, 1600, 1600, 1800, 1800, 2000, 2000, 2200, 2200, 2400]
    };

    const costT10 = {
        herbs: 563000000,
        grainTimber: 188000000,
        scrolls: 2400
    };

    const STORAGE_KEY = 'last-asylum-t10-state';

    const state = {
        advProt: 10,
        health: 6,
        attack: 7,
        defense: 3,
        t10Unlocked: false
    };

    function loadState() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                Object.assign(state, parsed);
            } catch (e) {
                console.error("Failed to parse saved calculator state", e);
            }
        }
    }

    function saveState() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function calculateRemainingBranchCost(currentLevel, costArrayMapping) {
        let herbs = 0, grain = 0, scrolls = 0;
        for (let i = currentLevel; i < 10; i++) {
            herbs += costArrayMapping.herbs[i];
            grain += costArrayMapping.grainTimber[i];
            scrolls += costArrayMapping.scrolls[i];
        }
        return { herbs, grain, scrolls };
    }

    function formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        }
        return num.toLocaleString();
    }

    function calculateTotals() {
        const advCost = calculateRemainingBranchCost(state.advProt, costAdvProt);
        const healthCost = calculateRemainingBranchCost(state.health, costBoost3);
        const attackCost = calculateRemainingBranchCost(state.attack, costBoost3);
        const defenseCost = calculateRemainingBranchCost(state.defense, costBoost3);

        let totalHerbs = advCost.herbs + healthCost.herbs + attackCost.herbs + defenseCost.herbs;
        let totalGrain = advCost.grain + healthCost.grain + attackCost.grain + defenseCost.grain;
        let totalScrolls = advCost.scrolls + healthCost.scrolls + attackCost.scrolls + defenseCost.scrolls;

        if (!state.t10Unlocked) {
            totalHerbs += costT10.herbs;
            totalGrain += costT10.grainTimber;
            totalScrolls += costT10.scrolls;
        }

        updateDOM(totalHerbs, totalGrain, totalScrolls);
    }

    function updateDOM(herbs, grain, scrolls) {
        document.getElementById('total-herbs').textContent = formatNumber(herbs);
        document.getElementById('total-grain').textContent = formatNumber(grain);
        document.getElementById('total-scrolls').textContent = formatNumber(scrolls);

        document.getElementById('total-herbs').className = herbs === 0 ? 'total-value zero' : 'total-value';
        document.getElementById('total-grain').className = grain === 0 ? 'total-value zero' : 'total-value';
        document.getElementById('total-scrolls').className = scrolls === 0 ? 'total-value zero' : 'total-value';

        // Fetch localized "MAX" text from the parent container container, default to English
        const container = document.querySelector('.tree-container');
        const maxText = container ? (container.getAttribute('data-txt-max') || "MAX") : "MAX";

        ['advProt', 'health', 'attack', 'defense'].forEach(key => {
            const display = document.getElementById(`disp-${key}`);
            const node = document.getElementById(`node-${key.replace('Prot', '')}`);
            if (!display || !node) return;
            
            if (state[key] === 10) {
                display.textContent = maxText;
                display.classList.add('max-text');
                node.classList.add('maxed');
            } else {
                display.textContent = `${state[key]}/10`;
                display.classList.remove('max-text');
                node.classList.remove('maxed');
            }
        });

        const btnT10 = document.getElementById('btn-t10');
        const nodeT10 = document.getElementById('node-t10');
        if (btnT10 && nodeT10) {
            // Fetch localized texts from button data attributes
            const txtUnlocked = btnT10.getAttribute('data-unlocked') || "Unlocked";
            const txtLocked = btnT10.getAttribute('data-locked') || "Locked";

            if (state.t10Unlocked) {
                btnT10.textContent = `${txtUnlocked} (1/1)`;
                btnT10.classList.add('active');
                nodeT10.classList.remove('locked');
                nodeT10.classList.add('maxed');
            } else {
                btnT10.textContent = `${txtLocked} (0/1)`;
                btnT10.classList.remove('active');
                nodeT10.classList.add('locked');
                nodeT10.classList.remove('maxed');
            }
        }
    }

    function bindEvents() {
        const buttons = document.querySelectorAll('[data-action="adjust-level"]');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.getAttribute('data-type');
                const change = parseInt(btn.getAttribute('data-change'), 10);
                
                let newVal = state[type] + change;
                if (newVal >= 0 && newVal <= 10) {
                    state[type] = newVal;
                    saveState();
                    calculateTotals();
                }
            });
        });

        const toggleT10Btn = document.getElementById('btn-t10');
        if (toggleT10Btn) {
            toggleT10Btn.addEventListener('click', () => {
                state.t10Unlocked = !state.t10Unlocked;
                saveState();
                calculateTotals();
            });
        }
    }

    // Initialize
    loadState();
    calculateTotals();
    bindEvents();
})();