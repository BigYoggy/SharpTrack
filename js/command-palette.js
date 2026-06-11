/* ============================================
   SHARPTRACK — COMMAND PALETTE (Ctrl+K)
   ============================================ */

const COMMANDS = [
    { id: 'dashboard', title: 'Go to Dashboard', subtitle: 'View sales stats, revenue, and activity', action: () => window.location.href = 'dashboard.html', category: 'Navigation' },
    { id: 'inventory', title: 'Go to Inventory', subtitle: 'Manage stock levels, view product listings', action: () => window.location.href = 'inventory.html', category: 'Navigation' },
    { id: 'add-stock', title: 'Add Stock', subtitle: 'Add a new product or restock existing items', action: () => window.location.href = 'add-stock.html', category: 'Actions' },
    { id: 'record-sale', title: 'Record a Sale', subtitle: 'Log new customer transactions and payments', action: () => window.location.href = 'record-sale.html', category: 'Actions' },
    { id: 'notifications', title: 'View Notifications', subtitle: 'Check recent alerts and low-stock indicators', action: () => { toggleNotifPanel(); toggleCommandPalette(false); }, category: 'Actions' },
    { id: 'theme', title: 'Toggle Dark Mode', subtitle: 'Switch between light and dark themes', action: () => { toggleTheme(); toggleCommandPalette(false); showToast('success', 'Theme updated', 'Theme changed successfully'); }, category: 'Preferences' },
    { id: 'settings', title: 'Open Settings', subtitle: 'Configure account, shop name, and security PIN', action: () => window.location.href = 'more.html', category: 'Navigation' },
    { id: 'help', title: 'Get Help & FAQs', subtitle: 'Read tutorials, guides, and contact support', action: () => window.location.href = 'help.html', category: 'Navigation' },
    { id: 'signout', title: 'Sign Out', subtitle: 'Log out of your SharpTrack account safely', action: () => { clearAuth(); window.location.href = 'index.html'; }, category: 'Actions' }
];

let commandPaletteOpen = false;
let selectedIndex = 0;
let filteredCommands = [];

function initCommandPalette() {
    if (document.getElementById('st-command-palette')) return;

    // Inject HTML
    const html = `
        <div id="st-command-palette" class="cmd-overlay hidden" onclick="handleCmdOverlayClick(event)">
            <div class="cmd-modal animate-slideDown">
                <div class="cmd-header">
                    <svg class="cmd-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input type="text" id="cmd-search-input" placeholder="Search commands... (e.g. 'sale', 'dark')" autocomplete="off" oninput="handleCmdSearch()">
                    <button class="cmd-close-btn" onclick="toggleCommandPalette(false)">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
                <div class="cmd-body" id="cmd-results-list"></div>
                <div class="cmd-footer">
                    <span>Use <kbd>↑</kbd> <kbd>↓</kbd> to navigate, <kbd>Enter</kbd> to select, <kbd>Esc</kbd> to dismiss</span>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);

    // Global event listeners
    document.addEventListener('keydown', handleCmdKeyDown);
}

function toggleCommandPalette(forceOpen) {
    const overlay = document.getElementById('st-command-palette');
    if (!overlay) return;

    commandPaletteOpen = forceOpen !== undefined ? forceOpen : !commandPaletteOpen;
    overlay.classList.toggle('hidden', !commandPaletteOpen);

    if (commandPaletteOpen) {
        document.body.style.overflow = 'hidden';
        const input = document.getElementById('cmd-search-input');
        if (input) {
            input.value = '';
            input.focus();
        }
        selectedIndex = 0;
        renderCommands();
        // Add to recent command logs
        trackCommandPaletteInteraction();
    } else {
        document.body.style.overflow = '';
    }
}

function handleCmdOverlayClick(event) {
    if (event.target.id === 'st-command-palette') {
        toggleCommandPalette(false);
    }
}

function handleCmdSearch() {
    selectedIndex = 0;
    renderCommands();
}

function getRecentCommands() {
    try {
        return JSON.parse(localStorage.getItem('st_recent_commands') || '[]');
    } catch {
        return [];
    }
}

function addRecentCommand(cmdId) {
    try {
        let recents = getRecentCommands();
        recents = recents.filter(id => id !== cmdId);
        recents.unshift(cmdId);
        localStorage.setItem('st_recent_commands', JSON.stringify(recents.slice(0, 3)));
    } catch {}
}

function renderCommands() {
    const listContainer = document.getElementById('cmd-results-list');
    const input = document.getElementById('cmd-search-input');
    if (!listContainer || !input) return;

    const query = input.value.toLowerCase().trim();
    const recentIds = getRecentCommands();

    // Filter list
    if (query === '') {
        // If empty, prioritize recent commands, then navigation, then others
        const recentCmds = COMMANDS.filter(c => recentIds.includes(c.id));
        const otherCmds = COMMANDS.filter(c => !recentIds.includes(c.id));
        filteredCommands = [...recentCmds, ...otherCmds];
    } else {
        filteredCommands = COMMANDS.filter(cmd => 
            cmd.title.toLowerCase().includes(query) || 
            cmd.subtitle.toLowerCase().includes(query) ||
            cmd.category.toLowerCase().includes(query)
        );
    }

    if (filteredCommands.length === 0) {
        listContainer.innerHTML = `
            <div class="cmd-no-results">
                <h3>No commands found</h3>
                <p>Try searching for "sale", "stock", "theme", or "profile"</p>
            </div>
        `;
        return;
    }

    let html = '';
    let currentCategory = '';

    filteredCommands.forEach((cmd, idx) => {
        const isRecent = query === '' && recentIds.includes(cmd.id);
        const categoryLabel = isRecent ? 'Recently Used' : cmd.category;

        if (categoryLabel !== currentCategory) {
            currentCategory = categoryLabel;
            html += `<div class="cmd-category-header">${currentCategory}</div>`;
        }

        const isSelected = idx === selectedIndex;
        html += `
            <div class="cmd-item ${isSelected ? 'selected' : ''}" onclick="executeCommandAtIndex(${idx})">
                <div class="cmd-item-info">
                    <div class="cmd-item-title">${cmd.title}</div>
                    <div class="cmd-item-subtitle">${cmd.subtitle}</div>
                </div>
                ${isRecent ? '<span class="cmd-item-badge">Recent</span>' : `<span class="cmd-item-shortcut">${getCommandShortcutLabel(cmd.id)}</span>`}
            </div>
        `;
    });

    listContainer.innerHTML = html;

    // Scroll selected item into view if necessary
    const selectedEl = listContainer.querySelector('.cmd-item.selected');
    if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
    }
}

function getCommandShortcutLabel(id) {
    switch(id) {
        case 'dashboard': return 'G + D';
        case 'inventory': return 'G + I';
        case 'add-stock': return 'G + A';
        case 'record-sale': return 'G + S';
        case 'notifications': return 'N';
        case 'settings': return 'G + M';
        case 'help': return 'G + H';
        case 'theme': return 'T';
        default: return '↵';
    }
}

function executeCommandAtIndex(idx) {
    if (idx >= 0 && idx < filteredCommands.length) {
        const cmd = filteredCommands[idx];
        addRecentCommand(cmd.id);
        toggleCommandPalette(false);
        setTimeout(() => cmd.action(), 50);
    }
}

function handleCmdKeyDown(e) {
    // Check for Ctrl+K / Cmd+K
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleCommandPalette();
        return;
    }

    if (!commandPaletteOpen) return;

    if (e.key === 'Escape') {
        e.preventDefault();
        toggleCommandPalette(false);
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % filteredCommands.length;
        renderCommands();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + filteredCommands.length) % filteredCommands.length;
        renderCommands();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        executeCommandAtIndex(selectedIndex);
    }
}

// Analytics track
function trackCommandPaletteInteraction() {
    // Can log locally or just keep it simple
}
