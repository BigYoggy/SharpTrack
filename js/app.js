/* ============================================
   SHARPTRACK — SHARED APPLICATION JS
   ============================================ */

const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:')
    ? 'http://localhost:3000'
    : 'https://sharptrack-api.onrender.com';

/* ── AUTH HELPERS ── */
function getToken() {
    return localStorage.getItem('token') || localStorage.getItem('st_token');
}

function getUser() {
    try {
        return JSON.parse(localStorage.getItem('st_user') || 'null');
    } catch { return null; }
}

function setAuth(token, user) {
    localStorage.setItem('st_token', token);
    localStorage.setItem('token', token);
    localStorage.setItem('st_user', JSON.stringify(user));
}

function clearAuth() {
    localStorage.removeItem('st_token');
    localStorage.removeItem('token');
    localStorage.removeItem('st_user');
    localStorage.removeItem('pendingSignup');
}

function isLoggedIn() {
    const token = getToken();
    if (!token) return false;
    // Basic JWT expiry check (decode payload)
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.exp * 1000 > Date.now();
    } catch { return false; }
}

function authGuard() {
    if (!isLoggedIn()) {
        clearAuth();
        window.location.href = 'index.html';
        return false;
    }
    const user = getUser();
    if (user && user.onboardingCompleted === false && !window.location.pathname.endsWith('onboarding.html')) {
        window.location.href = 'onboarding.html';
        return false;
    }
    return true;
}

/* ── API REQUEST WRAPPER ── */
async function apiRequest(endpoint, options = {}) {
    const token = getToken();
    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            ...options.headers
        },
        ...options
    };

    try {
        const response = await fetch(`${API_URL}${endpoint}`, config);
        const data = await response.json();

        if (response.status === 401) {
            clearAuth();
            window.location.href = 'index.html';
            throw new Error('Session expired');
        }

        if (!response.ok) {
            throw new Error(data.error || 'Something went wrong');
        }

        return data;
    } catch (err) {
        if (err.message === 'Session expired') throw err;
        if (err.name === 'TypeError' && err.message.includes('fetch')) {
            throw new Error('Cannot connect to server. Please check your internet connection.');
        }
        throw err;
    }
}

/* ── TOAST NOTIFICATION SYSTEM ── */
function ensureToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    return container;
}

const toastIcons = {
    success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warning: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
};

function showToast(type, title, message, duration = 4000) {
    const container = ensureToastContainer();
    const id = 'toast-' + Date.now();

    const toast = document.createElement('div');
    toast.id = id;
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-icon">${toastIcons[type] || toastIcons.info}</div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            ${message ? `<div class="toast-message">${message}</div>` : ''}
        </div>
        <button class="toast-close" onclick="dismissToast('${id}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
    `;

    container.appendChild(toast);

    if (duration > 0) {
        setTimeout(() => dismissToast(id), duration);
    }
}

function dismissToast(id) {
    const toast = document.getElementById(id);
    if (!toast) return;
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 250);
}

/* ── FORMATTING HELPERS ── */
function formatCurrency(amount) {
    if (!amount && amount !== 0) return '₦0.00';
    return '₦' + Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatNumber(num) {
    return Number(num || 0).toLocaleString();
}

function getGreeting(name) {
    const firstName = name ? name.split(' ')[0] : 'Merchant';
    const hour = new Date().getHours();
    
    let timeOfDay = 'morning';
    if (hour >= 12 && hour < 16) timeOfDay = 'afternoon';
    else if (hour >= 16 && hour < 22) timeOfDay = 'evening';
    else if (hour >= 22 || hour < 4) timeOfDay = 'night';

    const greetings = {
        morning: [
            { text: `Time to open shop, ${firstName}!`, emoji: "☀️" },
            { text: `Welcome back, ${firstName}! Wishing you a productive day.`, emoji: "⚡" },
            { text: `Ready to manage your inventory, ${firstName}?`, emoji: "📦" },
            { text: `Let's drive some sales today, ${firstName}!`, emoji: "🚀" },
            { text: `Good morning, ${firstName}!`, emoji: "👋" },
            { text: `A brand new day of business, ${firstName}!`, emoji: "💼" }
        ],
        afternoon: [
            { text: `How is business going this afternoon, ${firstName}?`, emoji: "📈" },
            { text: `Welcome back, ${firstName}! Keep up the great work.`, emoji: "💪" },
            { text: `Good afternoon, ${firstName}!`, emoji: "👋" },
            { text: `Ready to log your afternoon sales, ${firstName}?`, emoji: "💸" },
            { text: `Active session monitoring, ${firstName}.`, emoji: "🏬" },
            { text: `Have a successful afternoon, ${firstName}!`, emoji: "🌟" }
        ],
        evening: [
            { text: `How was your sales day, ${firstName}?`, emoji: "📊" },
            { text: `Time to review your daily summary, ${firstName}.`, emoji: "💰" },
            { text: `Good evening, ${firstName}!`, emoji: "👋" },
            { text: `Hope it was a successful business day, ${firstName}!`, emoji: "🚀" },
            { text: `Ready to review today's final count, ${firstName}?`, emoji: "📦" },
            { text: `Closing hours review, ${firstName}.`, emoji: "🌜" }
        ],
        night: [
            { text: `Checking night shift logs, ${firstName}?`, emoji: "🌙" },
            { text: `Reviewing store analytics, ${firstName}.`, emoji: "📊" },
            { text: `Still working hard, ${firstName}? Rest up soon.`, emoji: "🔍" },
            { text: `Late night summary check, ${firstName}.`, emoji: "💸" },
            { text: `Active inventory review, ${firstName}.`, emoji: "🏬" }
        ]
    };

    const options = greetings[timeOfDay];
    const randomIndex = Math.floor(Math.random() * options.length);
    return options[randomIndex];
}

function timeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
    return date.toLocaleDateString('en-NG', { month: 'short', day: 'numeric' });
}

function formatTime(dateString) {
    return new Date(dateString).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true });
}

/* ── THEME MANAGEMENT ── */
function getTheme() {
    const local = localStorage.getItem('st_theme');
    if (local) return local;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }
    return 'light';
}

function setTheme(mode) {
    localStorage.setItem('st_theme', mode);
    document.documentElement.setAttribute('data-theme', mode);
}

function initTheme() {
    const user = getUser();
    let savedTheme;
    if (user && user.darkMode !== undefined) {
        savedTheme = user.darkMode ? 'dark' : 'light';
    } else {
        savedTheme = getTheme();
    }
    setTheme(savedTheme);
}

function toggleTheme() {
    const current = getTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    setTheme(next);
    // Dispatch custom event for charts to update colors
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: next } }));
    // Persist to server
    const token = getToken();
    if (token) {
        apiRequest('/api/auth/profile', {
            method: 'PUT',
            body: JSON.stringify({ darkMode: next === 'dark' })
        }).catch(() => {});
    }
}

/* ── NOTIFICATION BELL ── */
async function loadNotificationCount() {
    try {
        const data = await apiRequest('/api/notifications/count');
        updateBellBadge(data.unreadCount);
    } catch { /* silent */ }
}

function updateBellBadge(count) {
    document.querySelectorAll('.bell-badge').forEach(badge => {
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    });
}

/* ── NOTIFICATION PANEL ── */
let notifPanelOpen = false;

function toggleNotifPanel() {
    notifPanelOpen = !notifPanelOpen;
    const overlay = document.getElementById('notif-overlay');
    const panel = document.getElementById('notif-panel');
    if (overlay && panel) {
        overlay.classList.toggle('open', notifPanelOpen);
        panel.classList.toggle('open', notifPanelOpen);
        if (notifPanelOpen) loadNotifications();
    }
}

function closeNotifPanel() {
    notifPanelOpen = false;
    const overlay = document.getElementById('notif-overlay');
    const panel = document.getElementById('notif-panel');
    if (overlay) overlay.classList.remove('open');
    if (panel) panel.classList.remove('open');
}

async function loadNotifications() {
    const body = document.getElementById('notif-panel-body');
    if (!body) return;

    body.innerHTML = `
        <div class="notif-panel-skeleton" style="display:flex; flex-direction:column; gap:10px; opacity:0.8; animation:pulse 1.5s infinite alternate;">
            <div style="display:flex; gap:12px; align-items:center; padding:12px; background:var(--card-bg); border-radius:var(--radius-md); border:1px solid var(--border);">
                <div class="skeleton skeleton-circle" style="width:36px; height:36px; flex-shrink:0;"></div>
                <div style="flex:1;">
                    <div class="skeleton skeleton-text w-75" style="height:12px; margin-bottom:6px;"></div>
                    <div class="skeleton skeleton-text w-40" style="height:10px; margin-bottom:0;"></div>
                </div>
            </div>
            <div style="display:flex; gap:12px; align-items:center; padding:12px; background:var(--card-bg); border-radius:var(--radius-md); border:1px solid var(--border);">
                <div class="skeleton skeleton-circle" style="width:36px; height:36px; flex-shrink:0;"></div>
                <div style="flex:1;">
                    <div class="skeleton skeleton-text w-75" style="height:12px; margin-bottom:6px;"></div>
                    <div class="skeleton skeleton-text w-40" style="height:10px; margin-bottom:0;"></div>
                </div>
            </div>
            <div style="display:flex; gap:12px; align-items:center; padding:12px; background:var(--card-bg); border-radius:var(--radius-md); border:1px solid var(--border);">
                <div class="skeleton skeleton-circle" style="width:36px; height:36px; flex-shrink:0;"></div>
                <div style="flex:1;">
                    <div class="skeleton skeleton-text w-75" style="height:12px; margin-bottom:6px;"></div>
                    <div class="skeleton skeleton-text w-40" style="height:10px; margin-bottom:0;"></div>
                </div>
            </div>
        </div>
    `;

    try {
        const data = await apiRequest('/api/notifications');
        if (data.notifications.length === 0) {
            body.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">
                        <svg class="icon" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                    </div>
                    <h3>No notifications</h3>
                    <p>You're all caught up! New notifications will appear here.</p>
                </div>`;
            return;
        }

        body.innerHTML = data.notifications.map(n => `
            <div class="notif-item ${n.type} ${n.read ? '' : 'unread'}" data-id="${n.id}" onclick="markNotifRead('${n.id}', this)">
                <div class="notif-item-icon">${toastIcons[n.type] || toastIcons.info}</div>
                <div class="notif-item-content">
                    <div class="notif-item-title">${n.title}</div>
                    <div class="notif-item-msg">${n.message}</div>
                    <div class="notif-item-time">${timeAgo(n.createdAt)}</div>
                </div>
            </div>
        `).join('');
    } catch (err) {
        body.innerHTML = `<div class="empty-state"><h3>Failed to load</h3><p>${err.message}</p></div>`;
    }
}

async function markNotifRead(id, el) {
    try {
        await apiRequest(`/api/notifications/${id}/read`, { method: 'PUT' });
        if (el) el.classList.remove('unread');
        loadNotificationCount();
    } catch { /* silent */ }
}

async function markAllRead() {
    try {
        await apiRequest('/api/notifications/read-all', { method: 'PUT' });
        document.querySelectorAll('.notif-item.unread').forEach(el => el.classList.remove('unread'));
        updateBellBadge(0);
    } catch { /* silent */ }
}

/* ── NOTIFICATION PANEL HTML INJECTOR ── */
function injectNotifPanel() {
    if (document.getElementById('notif-overlay')) return;

    const html = `
        <div id="notif-overlay" class="notif-overlay" onclick="closeNotifPanel()"></div>
        <div id="notif-panel" class="notif-panel">
            <div class="notif-panel-header">
                <h2>Notifications</h2>
                <div style="display:flex;gap:8px;">
                    <button class="btn btn-ghost btn-sm" onclick="markAllRead()">Mark all read</button>
                    <button class="btn btn-ghost btn-sm" onclick="closeNotifPanel()">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
            </div>
            <div class="notif-panel-body" id="notif-panel-body"></div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
}

/* ── NAVBAR INJECTOR ── */
function injectNavbar() {
    const existing = document.getElementById('st-navbar');
    if (existing) return;

    const navbar = document.createElement('nav');
    navbar.id = 'st-navbar';
    navbar.className = 'navbar';
    navbar.innerHTML = `
        <div class="avatar-menu-container">
            <button class="avatar-btn" onclick="toggleAvatarMenu(event)" aria-label="User Menu">
                <span class="avatar-initials" id="nav-avatar-initials">U</span>
            </button>
            <div id="avatar-dropdown" class="avatar-dropdown hidden">
                <div class="avatar-dropdown-user">
                    <div class="avatar-large" id="nav-dropdown-avatar">U</div>
                    <div class="avatar-user-info">
                        <div class="avatar-user-name" id="nav-dropdown-name">Loading...</div>
                        <div class="avatar-user-store" id="nav-dropdown-store">My Shop</div>
                    </div>
                </div>
                <div class="avatar-dropdown-divider"></div>
                <a href="more.html" class="avatar-dropdown-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    Profile Settings
                </a>
                <button onclick="toggleNotifPanel(); closeAvatarMenu();" class="avatar-dropdown-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                    Notifications
                </button>
                <button onclick="toggleTheme(); closeAvatarMenu();" class="avatar-dropdown-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                    Toggle Dark Mode
                </button>
                <button onclick="showShortcutGuide(); closeAvatarMenu();" class="avatar-dropdown-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"/><line x1="6" y1="8" x2="6" y2="8"/><line x1="10" y1="8" x2="10" y2="8"/><line x1="14" y1="8" x2="14" y2="8"/><line x1="18" y1="8" x2="18" y2="8"/><line x1="6" y1="12" x2="6" y2="12"/><line x1="10" y1="12" x2="10" y2="12"/><line x1="14" y1="12" x2="14" y2="12"/><line x1="18" y1="12" x2="18" y2="12"/><line x1="7" y1="16" x2="17" y2="16"/></svg>
                    Keyboard Shortcuts
                </button>
                <a href="help.html" class="avatar-dropdown-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    Help & FAQs
                </a>
                <div class="avatar-dropdown-divider"></div>
                <button onclick="clearAuth(); window.location.href='index.html';" class="avatar-dropdown-item text-red">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    Sign Out
                </button>
            </div>
        </div>
        <div class="nav-logo">
            <img src="logo2.png" alt="SharpTrack">
        </div>
        <div style="display:flex;gap:4px;align-items:center;">
            <button class="bell-btn" onclick="toggleGlobalSearch(true)" aria-label="Search" title="Search (Press /)">
                <svg class="icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </button>
            <button class="bell-btn" onclick="toggleNotifPanel()" aria-label="Notifications">
                <svg class="icon" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                <span class="bell-badge hidden">0</span>
            </button>
        </div>
    `;
    document.body.prepend(navbar);
}

/* ── BOTTOM NAV INJECTOR ── */
function injectBottomNav(activePage) {
    const existing = document.getElementById('st-bottom-nav');
    if (existing) return;

    const pages = [
        { id: 'dashboard', label: 'Dashboard', href: 'dashboard.html', icon: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>' },
        { id: 'inventory', label: 'Inventory', href: 'inventory.html', icon: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>' },
        { id: 'fab', label: '', href: 'add-stock.html', icon: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>' },
        { id: 'sales', label: 'Sales', href: 'record-sale.html', icon: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>' },
        { id: 'more', label: 'More', href: 'more.html', icon: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>' }
    ];

    const nav = document.createElement('nav');
    nav.id = 'st-bottom-nav';
    nav.className = 'bottom-nav';

    nav.innerHTML = pages.map(p => {
        if (p.id === 'fab') {
            return `<div class="bottom-nav-col fab-col">
                <button class="fab" id="bottom-fab" onclick="window.location.href='${p.href}'" aria-label="Add Product">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${p.icon}</svg>
                </button>
            </div>`;
        }
        return `<div class="bottom-nav-col">
            <button class="nav-item ${activePage === p.id ? 'active' : ''}" id="nav-item-${p.id}" onclick="window.location.href='${p.href}'">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p.icon}</svg>
                <span>${p.label}</span>
            </button>
        </div>`;
    }).join('');

    document.body.appendChild(nav);
}

/* ── HELPER DYNAMIC SCRIPT LOAD ── */
async function loadScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

/* ── KEYBOARD SHORTCUTS MANAGER ── */
let lastKeyPress = '';
let lastKeyPressTime = 0;

function handleGlobalShortcuts(e) {
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
        return;
    }

    const key = e.key.toLowerCase();
    const now = Date.now();

    if (key === 't') {
        e.preventDefault();
        toggleTheme();
        showToast('success', 'Theme toggled', `Switched to ${getTheme()} mode`);
        return;
    }

    if (key === 'n') {
        e.preventDefault();
        toggleNotifPanel();
        return;
    }

    if (lastKeyPress === 'g' && (now - lastKeyPressTime < 1500)) {
        if (key === 'd') {
            e.preventDefault();
            window.location.href = 'dashboard.html';
        } else if (key === 'i') {
            e.preventDefault();
            window.location.href = 'inventory.html';
        } else if (key === 's') {
            e.preventDefault();
            window.location.href = 'record-sale.html';
        } else if (key === 'y') {
            e.preventDefault();
            window.location.href = 'analytics.html';
        } else if (key === 'a') {
            e.preventDefault();
            window.location.href = 'add-stock.html';
        } else if (key === 'm') {
            e.preventDefault();
            window.location.href = 'more.html';
        } else if (key === 'h') {
            e.preventDefault();
            window.location.href = 'help.html';
        }
        lastKeyPress = '';
    } else {
        if (key === 'g') {
            lastKeyPress = 'g';
            lastKeyPressTime = now;
        } else {
            lastKeyPress = '';
        }
    }
}

/* ── PAGE INIT ── */
function initPage(activePage, requireAuth = true) {
    initTheme();

    if (requireAuth && !authGuard()) return false;

    if (requireAuth) {
        injectNotifPanel();
        loadNotificationCount();
        
        // Dynamically load Waves 1, 2 & 3 features
        Promise.all([
            loadScript('js/command-palette.js'),
            loadScript('js/search.js'),
            loadScript('js/avatar-menu.js'),
            loadScript('js/export.js'),
            loadScript('js/feedback.js'),
            loadScript('js/whats-new.js')
        ]).then(() => {
            initCommandPalette();
            initGlobalSearch();
            initAvatarMenu();
            // Automatically trigger changelog check on dashboard load
            if (activePage === 'dashboard') {
                checkWhatsNew();
            }
        }).catch(err => console.error('Failed to load extensions', err));

        // Listen for global keyboard shortcuts
        document.addEventListener('keydown', handleGlobalShortcuts);
    }

    return true;
}

/* ── SKELETON HELPERS ── */
function showSkeleton(containerId, count, type = 'card') {
    const el = document.getElementById(containerId);
    if (!el) return;
    let html = '';
    for (let i = 0; i < count; i++) {
        if (type === 'card') {
            html += '<div class="skeleton skeleton-card"></div>';
        } else if (type === 'stat') {
            html += '<div class="skeleton skeleton-stat"></div>';
        } else if (type === 'list') {
            html += `<div style="display:flex;gap:12px;align-items:center;padding:12px 0;">
                <div class="skeleton skeleton-circle" style="width:46px;height:46px;flex-shrink:0;"></div>
                <div style="flex:1;"><div class="skeleton skeleton-text w-75"></div><div class="skeleton skeleton-text w-40"></div></div>
                <div style="text-align:right;"><div class="skeleton skeleton-text" style="width:70px;margin-left:auto;"></div><div class="skeleton skeleton-text" style="width:50px;margin-left:auto;"></div></div>
            </div>`;
        }
    }
    el.innerHTML = html;
}

/* ── USER DATA HELPERS ── */
function getUserInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0][0].toUpperCase();
}

function getUserFirstName(name) {
    if (!name) return 'there';
    return name.trim().split(' ')[0];
}

// Token Synchronization on load
if (localStorage.getItem('st_token') && !localStorage.getItem('token')) {
    localStorage.setItem('token', localStorage.getItem('st_token'));
}

// ── AI CHATBOT ASSISTANT CODE ──
let aiChatInitialized = false;
let lastAssistantMessage = '';
let fallbackIndex = 0;

function initAiChatbot() {
    if (aiChatInitialized) return;
    
    // Do not show the chatbot on the landing/login page or signup page
    const path = window.location.pathname.toLowerCase();
    const isLoginOrHome = path === '/' || path.endsWith('/') || path.endsWith('index.html');
    const isSignup = path.includes('signup.html') || path.endsWith('/signup');
    if (isLoginOrHome || isSignup) {
        return;
    }
    
    const chatHtml = `
        <button class="ai-chat-btn" id="ai-chat-btn" onclick="openAiChat()" aria-label="Open Shappi Chat">
            <!-- Shappi Sparkle/Robot Icon -->
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
                <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/>
            </svg>
        </button>

        <div id="aiChatModal" class="modal-overlay" onclick="closeAiChat()">
            <div class="modal ai-chat-modal" onclick="event.stopPropagation()">
                <div class="modal-handle"></div>
                <div class="ai-chat-header">
                    <div class="ai-chat-header-left">
                        <div class="shappi-avatar-container">
                            <div class="shappi-avatar">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <rect x="3" y="11" width="18" height="10" rx="2"></rect>
                                    <circle cx="12" cy="5" r="2"></circle>
                                    <path d="M12 7v4"></path>
                                    <line x1="8" y1="15" x2="8" y2="15"></line>
                                    <line x1="16" y1="15" x2="16" y2="15"></line>
                                </svg>
                            </div>
                            <span class="ai-chat-status-dot"></span>
                        </div>
                        <div class="ai-chat-header-info">
                            <span class="ai-chat-title-text">Shappi</span>
                            <span class="ai-chat-subtitle">Online</span>
                        </div>
                    </div>
                    <button class="ai-chat-close-btn" onclick="closeAiChat()" aria-label="Close Chat">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
                <div class="ai-chat-body" id="ai-chat-body"></div>
                <div class="ai-chat-suggestions" id="ai-chat-suggestions">
                    <button class="ai-suggestion-pill" onclick="sendAiSuggestion('What products are running low?')">Low stock</button>
                    <button class="ai-suggestion-pill" onclick="sendAiSuggestion('Show today\\\'s sales')">Today's sales</button>
                    <button class="ai-suggestion-pill" onclick="prefillAiSuggestion('Add 10 [Product] at ₦[Price]')">Add stock</button>
                </div>
                <div class="ai-chat-input-row">
                    <div class="ai-chat-input-wrapper">
                        <input type="text" class="ai-chat-input" id="ai-chat-input" placeholder="Message Shappi..." autocomplete="off">
                    </div>
                    <button class="ai-chat-send-btn" id="ai-chat-send-btn" onclick="sendAiMessage()">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polyline points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', chatHtml);
    aiChatInitialized = true;

    // First message from Shappi: short, clean, no long list of features
    appendAiMessage('assistant', "Hi! I'm Shappi 👋\\nI can help you add stock, record sales, check inventory and update prices.");

    document.getElementById('ai-chat-input').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            sendAiMessage();
        }
    });
}

function openAiChat() {
    const modal = document.getElementById('aiChatModal');
    if (modal) {
        modal.classList.add('open');
        document.getElementById('ai-chat-input').focus();
    }
}

function closeAiChat() {
    const modal = document.getElementById('aiChatModal');
    if (modal) {
        modal.classList.remove('open');
    }
}

function appendAiMessage(sender, text) {
    const body = document.getElementById('ai-chat-body');
    if (!body) return;

    const msgRow = document.createElement('div');
    msgRow.className = `ai-msg-row ${sender}`;
    
    const escapeHtml = (str) => {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };
    
    // Parse \\n or \n for newlines safely
    const cleanText = text.replace(/\\n/g, '\n');
    let formattedText = escapeHtml(cleanText)
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/•\s+/g, '&bull; ');
        
    let avatarHtml = '';
    if (sender === 'assistant') {
        avatarHtml = `
            <div class="shappi-msg-avatar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="10" rx="2"></rect>
                    <circle cx="12" cy="5" r="2"></circle>
                    <path d="M12 7v4"></path>
                    <line x1="8" y1="15" x2="8" y2="15"></line>
                    <line x1="16" y1="15" x2="16" y2="15"></line>
                </svg>
            </div>
        `;
    }
        
    msgRow.innerHTML = `
        ${avatarHtml}
        <div class="ai-msg-bubble">
            <div class="ai-msg-text">${formattedText}</div>
            <div class="ai-msg-time">${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
    `;
    body.appendChild(msgRow);
    body.scrollTop = body.scrollHeight;
}

function showAiThinking(show) {
    const body = document.getElementById('ai-chat-body');
    if (!body) return;

    const existing = document.getElementById('ai-thinking-row');
    if (show) {
        if (existing) return;
        const thinkingRow = document.createElement('div');
        thinkingRow.id = 'ai-thinking-row';
        thinkingRow.className = 'ai-msg-row assistant thinking-row';
        thinkingRow.innerHTML = `
            <div class="shappi-msg-avatar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="10" rx="2"></rect>
                    <circle cx="12" cy="5" r="2"></circle>
                    <path d="M12 7v4"></path>
                    <line x1="8" y1="15" x2="8" y2="15"></line>
                    <line x1="16" y1="15" x2="16" y2="15"></line>
                </svg>
            </div>
            <div class="ai-msg-bubble thinking-bubble">
                <span class="ai-dot"></span>
                <span class="ai-dot"></span>
                <span class="ai-dot"></span>
            </div>
        `;
        body.appendChild(thinkingRow);
        body.scrollTop = body.scrollHeight;
    } else {
        if (existing) existing.remove();
    }
}

let aiChatHistory = [];

async function sendAiMessage() {
    const input = document.getElementById('ai-chat-input');
    const query = input.value.trim();
    if (!query) return;

    input.value = '';
    appendAiMessage('user', query);

    const token = localStorage.getItem('token') || localStorage.getItem('st_token');
    if (!token) {
        appendAiMessage('assistant', "Please sign in to execute commands.");
        return;
    }

    showAiThinking(true);

    try {
        const response = await fetch(`${API_URL}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ message: query, history: aiChatHistory })
        });

        const parseData = await response.json();
        showAiThinking(false);

        if (!response.ok) {
            throw new Error(parseData.error || 'AI request failed');
        }

        if (parseData.success) {
            let replyText = parseData.response;
            
            // Handle new intelligence logic if rich parser data is returned
            if (parseData.data) {
                if (parseData.data.intent === 'greeting' && parseData.data.reply) {
                    replyText = parseData.data.reply;
                } else if (parseData.data.intent === 'unknown' && parseData.data.reply) {
                    replyText = parseData.data.reply;
                } else if (parseData.data.confidence !== undefined && parseData.data.confidence < 0.5 && parseData.data.reply) {
                    replyText = parseData.data.reply;
                }
            }

            // Ensure we never show the exact same message twice in a row
            if (replyText === lastAssistantMessage) {
                const fallbackQuestions = [
                    "I didn't quite catch that. You can say 'Add 10 Milo at ₦1900' or 'I sold 5 Milo'.",
                    "Could you rephrase that? Let me know if you want to check stock or record a sale.",
                    "What would you like me to do? Say 'What products are running low?' to check alerts.",
                    "I'm not sure I understand. Please let me know how I can help manage your shop."
                ];
                replyText = fallbackQuestions[fallbackIndex % fallbackQuestions.length];
                fallbackIndex++;
            }

            lastAssistantMessage = replyText;
            appendAiMessage('assistant', replyText);

            // Record conversation history
            aiChatHistory.push({ role: 'user', content: query });
            aiChatHistory.push({ role: 'assistant', content: replyText });
            if (aiChatHistory.length > 10) {
                aiChatHistory = aiChatHistory.slice(-10);
            }
        } else {
            throw new Error(parseData.error || 'Server error occurred');
        }
    } catch (err) {
        showAiThinking(false);
        let errorReply = `Error: ${err.message}`;
        if (errorReply === lastAssistantMessage) {
            errorReply = "Sorry, I'm having trouble connecting right now. Please try again in a moment.";
        }
        lastAssistantMessage = errorReply;
        appendAiMessage('assistant', errorReply);
    }
}

function sendAiSuggestion(text) {
    document.getElementById('ai-chat-input').value = text;
    sendAiMessage();
}

function prefillAiSuggestion(text) {
    const input = document.getElementById('ai-chat-input');
    if (!input) return;
    input.value = text;
    input.focus();
    
    // Select '[Product]' placeholder so user can easily type over it
    const productPlaceholder = '[Product]';
    const index = text.indexOf(productPlaceholder);
    if (index !== -1) {
        input.setSelectionRange(index, index + productPlaceholder.length);
    }
}

// Automatically initialize chatbot on page load
if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initAiChatbot);
} else {
    initAiChatbot();
}
