/* ============================================
   SHARPTRACK — GLOBAL SEARCH (/)
   ============================================ */

let searchModalOpen = false;
let searchSelectedIndex = 0;
let searchResultsList = [];
let searchCachedData = { products: [], sales: [], pages: [] };
let searchIsLoading = false;

const STATIC_PAGES = [
    { title: 'Dashboard', url: 'dashboard.html', desc: 'SaaS main metrics and activity' },
    { title: 'Inventory', url: 'inventory.html', desc: 'Product stocks, prices, reorder levels' },
    { title: 'Record a Sale', url: 'record-sale.html', desc: 'Make a cash/transfer sale' },
    { title: 'Add Stock', url: 'add-stock.html', desc: 'Add new items or update inventory' },
    { title: 'More / Settings', url: 'more.html', desc: 'Profile, dark mode, changes' },
    { title: 'Help Center & FAQs', url: 'help.html', desc: 'Frequently asked questions' }
];

function initGlobalSearch() {
    if (document.getElementById('st-global-search')) return;

    // Inject HTML
    const html = `
        <div id="st-global-search" class="cmd-overlay hidden" onclick="handleSearchOverlayClick(event)">
            <div class="cmd-modal animate-slideDown">
                <div class="cmd-header">
                    <svg class="cmd-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input type="text" id="global-search-input" placeholder="Search products, sales, settings... (press '/' to open)" autocomplete="off" oninput="handleSearchQueryChange()">
                    <button class="cmd-close-btn" onclick="toggleGlobalSearch(false)">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
                <div class="search-history-container" id="search-history-container"></div>
                <div class="cmd-body" id="search-results-list"></div>
                <div class="cmd-footer">
                    <span>Use <kbd>↑</kbd> <kbd>↓</kbd> to navigate, <kbd>Enter</kbd> to view, <kbd>Esc</kbd> to close</span>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);

    // Event listener
    document.addEventListener('keydown', handleSearchKeyDown);
}

function toggleGlobalSearch(forceOpen) {
    const overlay = document.getElementById('st-global-search');
    if (!overlay) return;

    searchModalOpen = forceOpen !== undefined ? forceOpen : !searchModalOpen;
    overlay.classList.toggle('hidden', !searchModalOpen);

    if (searchModalOpen) {
        document.body.style.overflow = 'hidden';
        const input = document.getElementById('global-search-input');
        if (input) {
            input.value = '';
            input.focus();
        }
        searchSelectedIndex = 0;
        searchResultsList = [];
        renderSearchHistory();
        renderSearchResults();
        fetchSearchData();
    } else {
        document.body.style.overflow = '';
    }
}

function handleSearchOverlayClick(e) {
    if (e.target.id === 'st-global-search') {
        toggleGlobalSearch(false);
    }
}

async function fetchSearchData() {
    if (searchIsLoading) return;
    searchIsLoading = true;
    
    try {
        // Fetch products and recent sales
        const [prodData, salesData] = await Promise.all([
            apiRequest('/api/products').catch(() => ({ products: [] })),
            apiRequest('/api/sales/recent').catch(() => ({ sales: [] }))
        ]);

        searchCachedData.products = prodData.products || [];
        searchCachedData.sales = salesData.sales || [];
        searchCachedData.pages = STATIC_PAGES;

        // Re-render in case user already typed
        renderSearchResults();
    } catch (err) {
        console.error('Error fetching search indices', err);
    } finally {
        searchIsLoading = false;
    }
}

function handleSearchQueryChange() {
    searchSelectedIndex = 0;
    renderSearchResults();
}

function getSearchHistory() {
    try {
        return JSON.parse(localStorage.getItem('st_search_history') || '[]');
    } catch { return []; }
}

function addSearchHistory(query) {
    if (!query || query.trim() === '') return;
    try {
        let history = getSearchHistory();
        history = history.filter(q => q.toLowerCase() !== query.toLowerCase());
        history.unshift(query.trim());
        localStorage.setItem('st_search_history', JSON.stringify(history.slice(0, 5)));
    } catch {}
}

function removeSearchHistoryItem(query, e) {
    if (e) e.stopPropagation();
    try {
        let history = getSearchHistory();
        history = history.filter(q => q !== query);
        localStorage.setItem('st_search_history', JSON.stringify(history));
        renderSearchHistory();
    } catch {}
}

function renderSearchHistory() {
    const container = document.getElementById('search-history-container');
    if (!container) return;

    const history = getSearchHistory();
    const input = document.getElementById('global-search-input');
    const query = input ? input.value.trim() : '';

    if (query === '' && history.length > 0) {
        container.innerHTML = `
            <div class="search-history-title">Recent Searches</div>
            <div class="search-history-tags">
                ${history.map(h => `
                    <div class="search-history-tag" onclick="applySearchHistory('${h}')">
                        <span>${h}</span>
                        <button class="search-history-tag-del" onclick="removeSearchHistoryItem('${h}', event)">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                    </div>
                `).join('')}
            </div>
        `;
        container.classList.remove('hidden');
    } else {
        container.innerHTML = '';
        container.classList.add('hidden');
    }
}

function applySearchHistory(query) {
    const input = document.getElementById('global-search-input');
    if (input) {
        input.value = query;
        input.focus();
        handleSearchQueryChange();
    }
}

function renderSearchResults() {
    const listContainer = document.getElementById('search-results-list');
    const input = document.getElementById('global-search-input');
    if (!listContainer || !input) return;

    const query = input.value.toLowerCase().trim();
    renderSearchHistory();

    if (query === '') {
        // Show onboarding help or top suggestions
        listContainer.innerHTML = `
            <div class="search-intro">
                <div class="search-intro-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </div>
                <h3>Search everything in SharpTrack</h3>
                <p>Type to find products in your inventory, sales transactions, or navigate sections.</p>
            </div>
        `;
        searchResultsList = [];
        return;
    }

    // Filter
    const matchedProducts = searchCachedData.products.filter(p => 
        p.name.toLowerCase().includes(query) || 
        (p.unit && p.unit.toLowerCase().includes(query))
    ).map(p => ({ ...p, type: 'product', group: 'Products' }));

    const matchedSales = searchCachedData.sales.filter(s => 
        (s.product && s.product.name.toLowerCase().includes(query)) ||
        s.paymentMethod.toLowerCase().includes(query)
    ).map(s => ({ ...s, type: 'sale', group: 'Recent Sales' }));

    const matchedPages = searchCachedData.pages.filter(p => 
        p.title.toLowerCase().includes(query) || 
        p.desc.toLowerCase().includes(query)
    ).map(p => ({ ...p, type: 'page', group: 'Pages & FAQ' }));

    // Flatten lists with separators
    searchResultsList = [];
    
    // Group and limit to 5 per group
    const groups = [
        { name: 'Products', items: matchedProducts.slice(0, 5) },
        { name: 'Recent Sales', items: matchedSales.slice(0, 5) },
        { name: 'Pages & FAQ', items: matchedPages.slice(0, 5) }
    ];

    let html = '';
    let flatIdx = 0;

    groups.forEach(g => {
        if (g.items.length > 0) {
            html += `<div class="cmd-category-header">${g.name}</div>`;
            g.items.forEach(item => {
                const isSelected = flatIdx === searchSelectedIndex;
                searchResultsList.push(item);

                let title = '';
                let subtitle = '';
                let badge = '';

                if (item.type === 'product') {
                    title = item.name;
                    subtitle = `Price: ₦${Number(item.sellingPrice).toLocaleString()} | Stock: ${item.quantity} ${item.unit}`;
                    badge = item.quantity <= item.reorderLevel ? '<span class="cmd-item-badge danger">Low Stock</span>' : '<span class="cmd-item-badge success">In Stock</span>';
                } else if (item.type === 'sale') {
                    title = `${item.product ? item.product.name : 'Unknown Product'} sold`;
                    subtitle = `Qty: ${item.quantitySold} | Total: ₦${Number(item.totalAmount).toLocaleString()} | Method: ${item.paymentMethod}`;
                    badge = `<span class="cmd-item-badge info">${timeAgo(item.soldAt)}</span>`;
                } else if (item.type === 'page') {
                    title = item.title;
                    subtitle = item.desc;
                    badge = '<span class="cmd-item-badge">Navigate</span>';
                }

                html += `
                    <div class="cmd-item ${isSelected ? 'selected' : ''}" onclick="executeSearchResultAtIndex(${flatIdx})">
                        <div class="cmd-item-info">
                            <div class="cmd-item-title">${title}</div>
                            <div class="cmd-item-subtitle">${subtitle}</div>
                        </div>
                        ${badge}
                    </div>
                `;
                flatIdx++;
            });
        }
    });

    if (searchResultsList.length === 0) {
        listContainer.innerHTML = `
            <div class="cmd-no-results">
                <h3>No results found for "${query}"</h3>
                <p>Try refining your spelling or searching for a different keyword</p>
            </div>
        `;
        return;
    }

    listContainer.innerHTML = html;

    const selectedEl = listContainer.querySelector('.cmd-item.selected');
    if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
    }
}

function executeSearchResultAtIndex(idx) {
    if (idx >= 0 && idx < searchResultsList.length) {
        const item = searchResultsList[idx];
        const input = document.getElementById('global-search-input');
        if (input && input.value.trim() !== '') {
            addSearchHistory(input.value);
        }
        toggleGlobalSearch(false);

        setTimeout(() => {
            if (item.type === 'product') {
                window.location.href = `inventory.html?q=${encodeURIComponent(item.name)}`;
            } else if (item.type === 'sale') {
                window.location.href = `dashboard.html`;
            } else if (item.type === 'page') {
                window.location.href = item.url;
            }
        }, 50);
    }
}

function handleSearchKeyDown(e) {
    // Check for '/' to trigger search (but not when user is writing in inputs)
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        toggleGlobalSearch(true);
        return;
    }

    if (!searchModalOpen) return;

    if (e.key === 'Escape') {
        e.preventDefault();
        toggleGlobalSearch(false);
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (searchResultsList.length > 0) {
            searchSelectedIndex = (searchSelectedIndex + 1) % searchResultsList.length;
            renderSearchResults();
        }
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (searchResultsList.length > 0) {
            searchSelectedIndex = (searchSelectedIndex - 1 + searchResultsList.length) % searchResultsList.length;
            renderSearchResults();
        }
    } else if (e.key === 'Enter') {
        e.preventDefault();
        executeSearchResultAtIndex(searchSelectedIndex);
    }
}
