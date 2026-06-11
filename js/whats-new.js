/* ============================================
   SHARPTRACK — WHAT'S NEW SYSTEM (CHANGELOG)
   ============================================ */

const CHANGELOG_VERSION = '1.1.0';

const CHANGELOG_ITEMS = [
    {
        title: 'Command Palette & Search',
        desc: 'Press Ctrl+K to open the command palette. Press / to search products, sales, and navigation pages instantly.',
        type: 'feature',
        icon: '🔍'
    },
    {
        title: 'Advanced Dashboard Analytics',
        desc: 'Interactive 7-day weekly sales trend chart and top-selling product logs have been added to your dashboard.',
        type: 'feature',
        icon: '📈'
    },
    {
        title: 'Stock Valuation Tracking',
        desc: 'Monitor the total market value of all products in your inventory instantly on the dashboard stats card.',
        type: 'feature',
        icon: '💰'
    },
    {
        title: 'Portable Data Exports',
        desc: 'Export your product list and sales transaction records to standard CSV files directly from Settings.',
        type: 'feature',
        icon: '📤'
    },
    {
        title: 'SaaS Achievements System',
        desc: 'Earn badges as you restock, make sales, customize your store, and hit key milestones.',
        type: 'feature',
        icon: '🏆'
    }
];

function checkWhatsNew() {
    try {
        const seen = localStorage.getItem(`st_changelog_seen_${CHANGELOG_VERSION}`);
        if (!seen) {
            // First time seeing this version, trigger modal!
            setTimeout(() => {
                showWhatsNewModal();
                localStorage.setItem(`st_changelog_seen_${CHANGELOG_VERSION}`, 'true');
            }, 1500);
        }
    } catch {}
}

function showWhatsNewModal() {
    if (document.getElementById('st-whatsnew-modal')) {
        document.getElementById('st-whatsnew-modal').classList.remove('hidden');
        return;
    }

    const html = `
        <div id="st-whatsnew-modal" class="shortcut-modal-overlay" onclick="handleWhatsNewOverlayClick(event)">
            <div class="shortcut-modal animate-slideUp" style="max-width: 420px;">
                <div class="shortcut-modal-header" style="background: var(--primary-light);">
                    <div style="display:flex; flex-direction:column;">
                        <h3 style="color: var(--primary);">What's New in v${CHANGELOG_VERSION}</h3>
                        <span class="changelog-date" style="margin-top:2px;">Latest Release</span>
                    </div>
                    <button class="shortcut-close" onclick="closeWhatsNewModal()">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
                <div class="shortcut-modal-body" style="gap: 16px;">
                    <div class="changelog-list">
                        ${CHANGELOG_ITEMS.map(item => `
                            <div class="changelog-item">
                                <h4>${item.icon} ${item.title}</h4>
                                <p>${item.desc}</p>
                            </div>
                        `).join('')}
                    </div>
                    <button class="btn btn-primary btn-block" onclick="closeWhatsNewModal()">Awesome, Got it!</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
}

function closeWhatsNewModal() {
    const modal = document.getElementById('st-whatsnew-modal');
    if (modal) modal.classList.add('hidden');
}

function handleWhatsNewOverlayClick(e) {
    if (e.target.id === 'st-whatsnew-modal') {
        closeWhatsNewModal();
    }
}
