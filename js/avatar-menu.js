/* ============================================
   SHARPTRACK — AVATAR DROPDOWN MENU
   ============================================ */

let avatarMenuOpen = false;

function initAvatarMenu() {
    // Fill user details if loaded
    updateAvatarMenuDetails();
    
    // Global click listener to dismiss menu when clicking outside
    document.addEventListener('click', handleAvatarOutsideClick);
}

function updateAvatarMenuDetails() {
    const user = getUser();
    if (!user) return;

    const initials = getUserInitials(user.name);
    
    // Set initials in navbar and dropdown
    const navInitials = document.getElementById('nav-avatar-initials');
    if (navInitials) navInitials.textContent = initials;

    const dropInitials = document.getElementById('nav-dropdown-avatar');
    if (dropInitials) dropInitials.textContent = initials;

    const dropName = document.getElementById('nav-dropdown-name');
    if (dropName) dropName.textContent = user.name;

    const dropStore = document.getElementById('nav-dropdown-store');
    if (dropStore) dropStore.textContent = user.storeName || 'My Shop';
}

function toggleAvatarMenu(e) {
    if (e) e.stopPropagation();
    
    const dropdown = document.getElementById('avatar-dropdown');
    if (!dropdown) return;

    avatarMenuOpen = !avatarMenuOpen;
    dropdown.classList.toggle('hidden', !avatarMenuOpen);
    
    if (avatarMenuOpen) {
        updateAvatarMenuDetails();
        // Close other panels if open
        closeNotifPanel();
        if (typeof toggleCommandPalette === 'function') toggleCommandPalette(false);
        if (typeof toggleGlobalSearch === 'function') toggleGlobalSearch(false);
    }
}

function closeAvatarMenu() {
    avatarMenuOpen = false;
    const dropdown = document.getElementById('avatar-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
}

function handleAvatarOutsideClick(e) {
    if (!avatarMenuOpen) return;
    
    const container = document.querySelector('.avatar-menu-container');
    if (container && !container.contains(e.target)) {
        closeAvatarMenu();
    }
}

/* ── SHORTCUT GUIDE MODAL ── */
function showShortcutGuide() {
    if (document.getElementById('st-shortcut-modal')) {
        document.getElementById('st-shortcut-modal').classList.remove('hidden');
        return;
    }

    const html = `
        <div id="st-shortcut-modal" class="shortcut-modal-overlay" onclick="handleShortcutOverlayClick(event)">
            <div class="shortcut-modal animate-slideUp">
                <div class="shortcut-modal-header">
                    <h3>Keyboard Shortcuts</h3>
                    <button class="shortcut-close" onclick="closeShortcutGuide()">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
                <div class="shortcut-modal-body">
                    <div class="shortcut-row">
                        <span class="shortcut-desc">Open Command Palette</span>
                        <span class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>K</kbd></span>
                    </div>
                    <div class="shortcut-row">
                        <span class="shortcut-desc">Global Search</span>
                        <span class="shortcut-keys"><kbd>/</kbd></span>
                    </div>
                    <div class="shortcut-row">
                        <span class="shortcut-desc">Toggle Theme</span>
                        <span class="shortcut-keys"><kbd>T</kbd></span>
                    </div>
                    <div class="shortcut-row">
                        <span class="shortcut-desc">Toggle Notifications</span>
                        <span class="shortcut-keys"><kbd>N</kbd></span>
                    </div>
                    <div class="shortcut-divider">Navigation</div>
                    <div class="shortcut-row">
                        <span class="shortcut-desc">Go to Dashboard</span>
                        <span class="shortcut-keys"><kbd>G</kbd> then <kbd>D</kbd></span>
                    </div>
                    <div class="shortcut-row">
                        <span class="shortcut-desc">Go to Inventory</span>
                        <span class="shortcut-keys"><kbd>G</kbd> then <kbd>I</kbd></span>
                    </div>
                    <div class="shortcut-row">
                        <span class="shortcut-desc">Go to Record Sale</span>
                        <span class="shortcut-keys"><kbd>G</kbd> then <kbd>S</kbd></span>
                    </div>
                    <div class="shortcut-row">
                        <span class="shortcut-desc">Go to Add Stock</span>
                        <span class="shortcut-keys"><kbd>G</kbd> then <kbd>A</kbd></span>
                    </div>
                    <div class="shortcut-row">
                        <span class="shortcut-desc">Go to Settings (More)</span>
                        <span class="shortcut-keys"><kbd>G</kbd> then <kbd>M</kbd></span>
                    </div>
                    <div class="shortcut-row">
                        <span class="shortcut-desc">Go to Help FAQ</span>
                        <span class="shortcut-keys"><kbd>G</kbd> then <kbd>H</kbd></span>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
}

function closeShortcutGuide() {
    const modal = document.getElementById('st-shortcut-modal');
    if (modal) modal.classList.add('hidden');
}

function handleShortcutOverlayClick(e) {
    if (e.target.id === 'st-shortcut-modal') {
        closeShortcutGuide();
    }
}
