/* SharpTrack Admin Dashboard Core Script */

document.addEventListener('DOMContentLoaded', () => {
    // --- STATE MANAGEMENT ---
    const state = {
        users: [],
        products: [],
        businesses: [],
        admins: [],
        currentAdminRole: null,
        ingestion: {
            review: [],
            imported: [],
            duplicate: [],
            failed: []
        },
        categories: [],
        notifications: [],
        auditLogs: [],
        chartDataRange: '30',
        activeIngestionTab: 'review',
        usersPagination: { current: 1, limit: 10 },
        productsPagination: { current: 1, limit: 8 },
        businessesPagination: { current: 1, limit: 10 }
    };

    let filteredUsers = [];
    let filteredProducts = [];
    let filteredBusinesses = [];

    // --- UTILITY: LOAD ALL DATA FROM BACKEND ---
    async function loadAllData() {
        try {
            // Verify authenticated administrator
            const authRes = await fetch('/api/admin/me');
            if (!authRes.ok) {
                window.location.href = '/admin/login';
                return;
            }
            const authData = await authRes.json();
            const admin = authData.admin;
            const adminEmail = admin.email;
            const adminName = admin.name || adminEmail.split('@')[0];
            const adminRole = admin.role;
            state.currentAdminRole = adminRole;

            // Apply role-based UI permissions
            applyRolePermissions(adminRole);
            
            // Render profile header details
            document.querySelectorAll('.profile-name').forEach(el => el.textContent = adminName);
            document.querySelectorAll('.profile-email').forEach(el => el.textContent = adminEmail);
            document.querySelectorAll('.profile-avatar, .profile-avatar-btn').forEach(el => el.textContent = adminEmail.substring(0, 2).toUpperCase());

            // Populate settings form with values
            const adminNameInput = document.getElementById('admin-name');
            const adminEmailInput = document.getElementById('admin-email');
            const adminRoleInput = document.getElementById('admin-role');
            if (adminNameInput) adminNameInput.value = admin.name || '';
            if (adminEmailInput) adminEmailInput.value = admin.email || '';
            if (adminRoleInput) adminRoleInput.value = admin.role || '';

            // Load counts stats card (Only if permitted)
            if (['SUPER_ADMIN', 'ADMIN', 'SUPPORT'].includes(adminRole)) {
                await loadStatsSummary();
            }

            // Load admins list if SUPER_ADMIN
            if (adminRole === 'SUPER_ADMIN') {
                await loadAdmins();
            }

            // Load users list (All roles can view users)
            const usersRes = await fetch('/api/admin/users');
            if (usersRes.ok) {
                const usersData = await usersRes.json();
                state.users = usersData.users;
                filteredUsers = [...state.users];
                renderUsers();
            }

            // Load products list (All roles can view products)
            const productsRes = await fetch('/api/admin/products');
            if (productsRes.ok) {
                const productsData = await productsRes.json();
                state.products = productsData.products;
                filteredProducts = [...state.products];
                renderProducts();
            }

            // Load businesses list (SUPER_ADMIN, ADMIN, SUPPORT)
            if (['SUPER_ADMIN', 'ADMIN', 'SUPPORT'].includes(adminRole)) {
                const businessesRes = await fetch('/api/admin/businesses');
                if (businessesRes.ok) {
                    const businessesData = await businessesRes.json();
                    state.businesses = businessesData.businesses;
                    filteredBusinesses = [...state.businesses];
                    renderBusinesses();
                }
            }

            // Load categories (All roles can view categories)
            const categoriesRes = await fetch('/api/admin/categories');
            if (categoriesRes.ok) {
                const categoriesData = await categoriesRes.json();
                state.categories = categoriesData.categories;
                renderCategoriesSettings();
                populateProductCategoriesFilter();
            }

            // Load ingestion center pipeline (SUPER_ADMIN, ADMIN, MODERATOR)
            if (['SUPER_ADMIN', 'ADMIN', 'MODERATOR'].includes(adminRole)) {
                const ingestionRes = await fetch('/api/admin/ingestion');
                if (ingestionRes.ok) {
                    const ingestionData = await ingestionRes.json();
                    state.ingestion = ingestionData.ingestion;
                    renderIngestionTable();
                }
            }

            // Load notifications alerts (SUPER_ADMIN, ADMIN, SUPPORT)
            if (['SUPER_ADMIN', 'ADMIN', 'SUPPORT'].includes(adminRole)) {
                const notificationsRes = await fetch('/api/admin/notifications');
                if (notificationsRes.ok) {
                    const notificationsData = await notificationsRes.json();
                    state.notifications = notificationsData.notifications;
                    renderNotifications();
                }
            }

            // Load activity feed (SUPER_ADMIN, ADMIN)
            if (['SUPER_ADMIN', 'ADMIN'].includes(adminRole)) {
                const activityRes = await fetch('/api/admin/activity');
                if (activityRes.ok) {
                    const activityData = await activityRes.json();
                    state.auditLogs = activityData.activityLogs;
                    renderAuditLogs();
                }
            }

            // Draw charts
            if (['SUPER_ADMIN', 'ADMIN', 'SUPPORT'].includes(adminRole)) {
                renderOverviewCharts();
            }

        } catch (err) {
            console.error('Failed to load admin dashboard data:', err);
            showToast('error', 'Server Error', 'Failed to fetch live database records.');
        }
    }

    async function loadStatsSummary() {
        try {
            const statsRes = await fetch('/api/admin/stats');
            if (!statsRes.ok) throw new Error('Failed to load stats');
            const stats = await statsRes.json();

            document.getElementById('stat-total-users').textContent = stats.totalUsers.toLocaleString();
            document.getElementById('stat-active-users').textContent = stats.activeUsers.toLocaleString();
            document.getElementById('stat-suspended-users').textContent = stats.suspendedUsers.toLocaleString();
            document.getElementById('stat-products-count').textContent = stats.totalProducts.toLocaleString();
            document.getElementById('stat-total-sales').textContent = stats.totalSales.toLocaleString();
            document.getElementById('stat-revenue-today').textContent = '₦' + stats.revenueToday.toLocaleString('en-NG');
            document.getElementById('stat-revenue-month').textContent = '₦' + stats.revenueMonth.toLocaleString('en-NG');
            document.getElementById('stat-ai-idents').textContent = stats.totalIngestion.toLocaleString();
            document.getElementById('stat-pending-reviews').textContent = stats.pendingIngestion.toLocaleString();
            document.getElementById('stat-failed-imports').textContent = stats.failedIngestion.toLocaleString();
        } catch (err) {
            console.error('Failed to reload stats summary:', err);
        }
    }

    function applyRolePermissions(role) {
        // Hide sidebar navigation items based on role permissions
        const productsNav = document.querySelector('.nav-item[data-target="products"]');
        if (productsNav) {
            productsNav.parentElement.style.display = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR'].includes(role) ? 'block' : 'none';
        }
        
        const businessesNav = document.querySelector('.nav-item[data-target="businesses"]');
        if (businessesNav) {
            businessesNav.parentElement.style.display = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'].includes(role) ? 'block' : 'none';
        }
        
        const analyticsNav = document.querySelector('.nav-item[data-target="analytics"]');
        if (analyticsNav) {
            analyticsNav.parentElement.style.display = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'].includes(role) ? 'block' : 'none';
        }
        
        const ingestionNav = document.querySelector('.nav-item[data-target="ingestion"]');
        if (ingestionNav) {
            ingestionNav.parentElement.style.display = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR'].includes(role) ? 'block' : 'none';
        }
        
        const adminsNav = document.getElementById('nav-item-admins');
        if (adminsNav) {
            adminsNav.style.display = (role === 'SUPER_ADMIN') ? 'block' : 'none';
        }

        // Hide specific buttons
        const addProductBtn = document.getElementById('btn-add-product');
        if (addProductBtn) {
            addProductBtn.style.display = ['SUPER_ADMIN', 'ADMIN'].includes(role) ? 'inline-flex' : 'none';
        }

        const addCategoryBtn = document.getElementById('btn-add-category');
        if (addCategoryBtn) {
            addCategoryBtn.style.display = ['SUPER_ADMIN', 'ADMIN'].includes(role) ? 'inline-block' : 'none';
        }

        const categorySettingsTab = document.querySelector('.settings-nav-item[data-subtarget="categories"]');
        const sourcesSettingsTab = document.querySelector('.settings-nav-item[data-subtarget="sources"]');
        if (categorySettingsTab) {
            categorySettingsTab.style.display = ['SUPER_ADMIN', 'ADMIN'].includes(role) ? 'block' : 'none';
        }
        if (sourcesSettingsTab) {
            sourcesSettingsTab.style.display = ['SUPER_ADMIN', 'ADMIN'].includes(role) ? 'block' : 'none';
        }
    }

    async function loadAdmins() {
        if (state.currentAdminRole !== 'SUPER_ADMIN') return;
        try {
            const res = await fetch('/api/admin/admins');
            if (!res.ok) throw new Error('Failed to load administrators');
            const data = await res.json();
            state.admins = data.admins;
            renderAdmins();
        } catch (err) {
            console.error('Failed to load admins:', err);
            showToast('error', 'Error', 'Failed to retrieve administrator list.');
        }
    }

    function renderAdmins() {
        const tbody = document.getElementById('admins-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!state.admins || state.admins.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)">No administrators found</td></tr>';
            return;
        }

        state.admins.forEach(adm => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <span class="font-semibold">${adm.name || 'N/A'}</span>
                </td>
                <td>
                    <span>${adm.email}</span>
                </td>
                <td>
                    <span class="badge badge-secondary">${adm.role}</span>
                </td>
                <td>
                    <span class="status-pill ${adm.status === 'Active' ? 'status-active' : 'status-suspended'}">${adm.status === 'Active' ? 'Active' : 'Disabled'}</span>
                </td>
                <td>
                    <span>${new Date(adm.createdAt).toISOString().split('T')[0]}</span>
                </td>
                <td class="text-right">
                    <div class="actions-cell">
                        <button class="btn btn-secondary btn-sm btn-icon-only btn-edit-admin" data-id="${adm.id}" title="Edit Admin">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button class="btn btn-secondary btn-sm btn-icon-only btn-toggle-admin-status" data-id="${adm.id}" title="${adm.status === 'Active' ? 'Disable Admin' : 'Enable Admin'}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"></circle><line x1="8" y1="12" x2="16" y2="12"></line></svg>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Edit Admin Click Handler
        tbody.querySelectorAll('.btn-edit-admin').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const adm = state.admins.find(a => a.id === id);
                if (adm) {
                    document.getElementById('admin-modal-title').textContent = 'Edit Administrator Details';
                    document.getElementById('admin-modal-id').value = adm.id;
                    document.getElementById('admin-modal-name').value = adm.name || '';
                    document.getElementById('admin-modal-email').value = adm.email;
                    document.getElementById('admin-modal-role').value = adm.role;
                    
                    // Hide password group during editing
                    document.getElementById('admin-password-group').style.display = 'none';
                    document.getElementById('admin-modal-password').required = false;
                    document.getElementById('admin-modal-password').value = '';
                    
                    openModal('admin-modal');
                }
            });
        });

        // Toggle Admin Status Handler
        tbody.querySelectorAll('.btn-toggle-admin-status').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                try {
                    const res = await fetch(`/api/admin/admins/${id}/toggle-status`, {
                        method: 'POST'
                    });
                    if (!res.ok) {
                        const data = await res.json();
                        throw new Error(data.error || 'Failed to toggle status');
                    }
                    const data = await res.json();
                    showToast('success', 'Status Toggled', data.message);
                    loadAllData();
                } catch (err) {
                    showToast('error', 'Status Change Error', err.message);
                }
            });
        });
    }

    // Set up Admin form submission
    document.getElementById('admin-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('admin-modal-id').value;
        const name = document.getElementById('admin-modal-name').value.trim();
        const email = document.getElementById('admin-modal-email').value.trim();
        const password = document.getElementById('admin-modal-password').value;
        const role = document.getElementById('admin-modal-role').value;

        try {
            if (id) {
                // Update Admin
                const res = await fetch(`/api/admin/admins/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, role })
                });
                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || 'Failed to update admin');
                }
                showToast('success', 'Admin Updated', 'Administrator profile updated successfully.');
            } else {
                // Create Admin
                if (!password) {
                    throw new Error('Password is required for new administrator accounts.');
                }
                const res = await fetch('/api/admin/admins', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, password, role })
                });
                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || 'Failed to create admin');
                }
                showToast('success', 'Admin Created', 'Administrator account created successfully.');
            }
            closeModal('admin-modal');
            loadAllData();
        } catch (err) {
            showToast('error', 'Write Error', err.message);
        }
    });

    // Setup clear state for new admin button
    const addAdminBtn = document.getElementById('btn-add-admin');
    if (addAdminBtn) {
        addAdminBtn.addEventListener('click', (e) => {
            document.getElementById('admin-modal-title').textContent = 'Create Administrator';
            document.getElementById('admin-modal-id').value = '';
            document.getElementById('admin-form').reset();
            
            // Show password group for creation
            document.getElementById('admin-password-group').style.display = 'block';
            document.getElementById('admin-modal-password').required = true;
        });
    }

    function populateProductCategoriesFilter() {
        const select = document.getElementById('products-filter-category');
        if (select) {
            select.innerHTML = '<option value="all">All Categories</option>';
            state.categories.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c;
                opt.textContent = c;
                select.appendChild(opt);
            });
        }
    }

    // --- CLIENT-SIDE ROUTER (SPA VIEWS) ---
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.panel-section');
    const breadcrumbCurrent = document.getElementById('breadcrumb-current');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-target');
            
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            sections.forEach(sec => sec.classList.remove('active'));
            const activeSec = document.getElementById(target);
            if (activeSec) {
                activeSec.classList.add('active');
                
                const animItems = activeSec.querySelectorAll('.metrics-grid > *, .card, .products-grid-layout > *');
                animItems.forEach((el, index) => {
                    el.style.animation = 'none';
                    el.offsetHeight; // Trigger reflow
                    el.style.animation = `fadeSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both ${index * 0.04}s`;
                });
            }

            const navLabel = item.querySelector('span').textContent;
            breadcrumbCurrent.textContent = navLabel;

            if (target === 'overview' || target === 'analytics') {
                setTimeout(renderOverviewCharts, 50);
            }

            document.getElementById('sidebar').classList.remove('mobile-open');
        });
    });

    // --- MOBILE MENU EVENTS ---
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileCloseBtn = document.getElementById('mobile-close-btn');
    const sidebar = document.getElementById('sidebar');

    mobileMenuBtn.addEventListener('click', () => sidebar.classList.add('mobile-open'));
    mobileCloseBtn.addEventListener('click', () => sidebar.classList.remove('mobile-open'));

    // --- THEME SWAP LOGIC ---
    const themeToggle = document.getElementById('theme-toggle');
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', nextTheme);
        
        localStorage.setItem('admin-dashboard-theme', nextTheme);
        showToast('info', 'Theme Swapped', `Switched theme layout to ${nextTheme} mode.`);
        
        renderOverviewCharts();
    });

    const storedTheme = localStorage.getItem('admin-dashboard-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', storedTheme);

    // --- DROPDOWN ANIMATION MANAGEMENT ---
    function setupDropdown(triggerId, panelId) {
        const trigger = document.getElementById(triggerId);
        const panel = document.getElementById(panelId);

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            panel.classList.toggle('show');
            document.querySelectorAll('.dropdown-panel').forEach(other => {
                if (other.id !== panelId) other.classList.remove('show');
            });
        });

        panel.addEventListener('click', (e) => e.stopPropagation());
    }

    setupDropdown('notification-btn', 'notification-dropdown');
    setupDropdown('profile-menu-btn', 'profile-dropdown');

    document.addEventListener('click', () => {
        document.querySelectorAll('.dropdown-panel').forEach(p => p.classList.remove('show'));
    });

    // --- TOAST NOTIFICATIONS PIPELINE ---
    window.showToast = function(type, title, message) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let iconMarkup = '';
        if (type === 'success') {
            iconMarkup = '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        } else if (type === 'error') {
            iconMarkup = '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
        } else if (type === 'warning') {
            iconMarkup = '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
        } else {
            iconMarkup = '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
        }

        toast.innerHTML = `
            ${iconMarkup}
            <div class="toast-details">
                <span class="toast-title">${title}</span>
                <p class="toast-message">${message}</p>
            </div>
        `;
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('toast-hide');
            toast.addEventListener('animationend', () => toast.remove());
        }, 3500);
    };

    // --- ALERTS NOTIFICATIONS ---
    function renderNotifications() {
        const notifList = document.getElementById('notification-list');
        const pulse = document.querySelector('.pulse-dot');
        const unreadCount = state.notifications.filter(n => !n.read).length;
        
        pulse.style.display = unreadCount > 0 ? 'block' : 'none';
        notifList.innerHTML = '';
        
        if (state.notifications.length === 0) {
            notifList.innerHTML = '<li style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px;">No unread alerts</li>';
            return;
        }

        state.notifications.forEach(n => {
            const li = document.createElement('li');
            li.className = `dropdown-item-notification ${!n.read ? 'unread' : ''}`;
            li.innerHTML = `
                <span class="notif-desc">${n.text}</span>
                <span class="notif-time">${n.time}</span>
            `;
            li.addEventListener('click', async () => {
                try {
                    await fetch('/api/admin/notifications/mark-read', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: n.id })
                    });
                    n.read = true;
                    renderNotifications();
                    showToast('success', 'Alert Read', 'Notification marked as viewed.');
                } catch (e) {
                    console.error(e);
                }
            });
            notifList.appendChild(li);
        });
    }

    document.getElementById('mark-all-read').addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
            await fetch('/api/admin/notifications/mark-read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            state.notifications.forEach(n => n.read = true);
            renderNotifications();
            showToast('success', 'All Read', 'Marked all notifications as read.');
        } catch (err) {
            console.error(err);
        }
    });

    // --- GLOBAL MODAL CONTROLS ---
    window.openModal = function(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('show');
            document.body.style.overflow = 'hidden';
        }
    };

    window.closeModal = function(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('show');
            document.body.style.overflow = '';
        }
    };

    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                closeModal(backdrop.id);
            }
        });
    });

    // --- DATABASE SALES TREND CHARTS ENGINE (SVG) ---
    async function renderOverviewCharts() {
        const container = document.getElementById('overview-chart-container');
        const revenueContainer = document.getElementById('analytics-revenue-chart');
        const categoryContainer = document.getElementById('analytics-categories-chart');
        
        if (!['SUPER_ADMIN', 'ADMIN', 'SUPPORT'].includes(state.currentAdminRole)) {
            return;
        }
        
        // 1. RENDER OVERVIEW LINE CHART (SVG)
        if (container) {
            const range = parseInt(state.chartDataRange);
            let trend = [];
            try {
                const res = await fetch(`/api/admin/charts/sales-trend?range=${range}`);
                const data = await res.json();
                trend = data.trend;
            } catch (err) {
                console.error(err);
            }

            if (!trend || trend.length === 0) return;
            
            const rawData = trend.map(x => x.amount);
            const maxRawVal = Math.max(...rawData, 1000);
            
            const formatYLabel = (val) => {
                if (val >= 1000000) return '₦' + (val / 1000000).toFixed(1) + 'M';
                if (val >= 1000) return '₦' + (val / 1000).toFixed(0) + 'k';
                return '₦' + val.toFixed(0);
            };

            const width = container.clientWidth || 500;
            const height = container.clientHeight || 280;
            const padding = { top: 20, right: 30, bottom: 30, left: 60 };
            
            const pointsCount = trend.length;
            const maxVal = maxRawVal * 1.1;
            const minVal = 0;
            
            const getX = (index) => padding.left + (index * (width - padding.left - padding.right) / (pointsCount - 1));
            const getY = (val) => height - padding.bottom - ((val - minVal) * (height - padding.top - padding.bottom) / (maxVal - minVal));
            
            let gridHtml = '';
            for (let i = 0; i <= 4; i++) {
                const yVal = minVal + (i * (maxVal - minVal) / 4);
                const yPos = getY(yVal);
                gridHtml += `
                    <line class="chart-grid-line" x1="${padding.left}" y1="${yPos}" x2="${width - padding.right}" y2="${yPos}" />
                    <text class="chart-axis-text" x="${padding.left - 10}" y="${yPos + 4}" text-anchor="end">${formatYLabel(yVal)}</text>
                `;
            }
            
            for (let i = 0; i < pointsCount; i += Math.ceil(pointsCount / 5)) {
                const xPos = getX(i);
                gridHtml += `<text class="chart-axis-text" x="${xPos}" y="${height - 8}" text-anchor="middle">${trend[i].formattedDate}</text>`;
            }
            
            let pathD = '';
            let fillD = `M ${getX(0)} ${height - padding.bottom}`;
            
            for (let i = 0; i < pointsCount; i++) {
                const x = getX(i);
                const y = getY(rawData[i]);
                if (i === 0) {
                    pathD += `M ${x} ${y}`;
                } else {
                    pathD += ` L ${x} ${y}`;
                }
                fillD += ` L ${x} ${y}`;
            }
            fillD += ` L ${getX(pointsCount - 1)} ${height - padding.bottom} Z`;
            
            let pointsHtml = '';
            trend.forEach((item, i) => {
                const x = getX(i);
                const y = getY(item.amount);
                pointsHtml += `
                    <circle class="chart-data-point" cx="${x}" cy="${y}" r="4" 
                            fill="var(--secondary)" stroke="var(--bg-main)" 
                            data-index="${i}" data-val="₦${item.amount.toLocaleString()}" data-date="${item.formattedDate}, 2026"/>
                `;
            });

            container.innerHTML = `
                <svg class="chart-svg" width="100%" height="100%">
                    <defs>
                        <linearGradient id="chart-grad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="var(--secondary)" stop-opacity="0.25" />
                            <stop offset="100%" stop-color="var(--secondary)" stop-opacity="0.0" />
                        </linearGradient>
                    </defs>
                    ${gridHtml}
                    <path class="chart-gradient-fill" d="${fillD}" fill="url(#chart-grad)" />
                    <path class="chart-path-line" d="${pathD}" stroke="var(--secondary)" />
                    ${pointsHtml}
                </svg>
                <div class="chart-tooltip-box" id="overview-chart-tooltip"></div>
            `;
            
            const tooltip = container.querySelector('#overview-chart-tooltip');
            container.querySelectorAll('.chart-data-point').forEach(pt => {
                pt.addEventListener('mouseenter', (e) => {
                    const value = e.target.getAttribute('data-val');
                    const date = e.target.getAttribute('data-date');
                    const cx = parseFloat(e.target.getAttribute('cx'));
                    const cy = parseFloat(e.target.getAttribute('cy'));
                    
                    tooltip.innerHTML = `<strong>${value}</strong><br><span style="color:var(--text-muted)">${date}</span>`;
                    tooltip.style.left = `${cx}px`;
                    tooltip.style.top = `${cy}px`;
                    tooltip.style.opacity = '1';
                });
                
                pt.addEventListener('mouseleave', () => {
                    tooltip.style.opacity = '0';
                });
            });
        }

        // 2. RENDER LARGE ANALYTICS CHART
        if (revenueContainer) {
            let trend = [];
            try {
                const res = await fetch(`/api/admin/charts/sales-trend?range=30`);
                const data = await res.json();
                trend = data.trend;
            } catch (err) {
                console.error(err);
            }

            if (!trend || trend.length === 0) return;
            const rawData = trend.map(x => x.amount);
            const width = revenueContainer.clientWidth || 600;
            const height = revenueContainer.clientHeight || 350;
            const padding = { top: 30, right: 30, bottom: 45, left: 60 };
            const pointsCount = trend.length;
            const maxVal = Math.max(...rawData, 1000) * 1.1;
            
            const getX = (index) => padding.left + (index * (width - padding.left - padding.right) / (pointsCount - 1));
            const getY = (val) => height - padding.bottom - (val * (height - padding.top - padding.bottom) / maxVal);
            
            const formatYLabel = (val) => {
                if (val >= 1000000) return '₦' + (val / 1000000).toFixed(1) + 'M';
                if (val >= 1000) return '₦' + (val / 1000).toFixed(0) + 'k';
                return '₦' + val.toFixed(0);
            };

            let gridHtml = '';
            for (let i = 0; i <= 4; i++) {
                const yVal = (i * maxVal / 4);
                const yPos = getY(yVal);
                gridHtml += `
                    <line class="chart-grid-line" x1="${padding.left}" y1="${yPos}" x2="${width - padding.right}" y2="${yPos}" />
                    <text class="chart-axis-text" x="${padding.left - 10}" y="${yPos + 4}" text-anchor="end">${formatYLabel(yVal)}</text>
                `;
            }
            
            for (let i = 0; i < pointsCount; i += Math.ceil(pointsCount / 5)) {
                const xPos = getX(i);
                gridHtml += `<text class="chart-axis-text" x="${xPos}" y="${height - 20}" text-anchor="middle">${trend[i].formattedDate}</text>`;
            }

            let pathMerchant = '';
            for (let i = 0; i < pointsCount; i++) {
                const x = getX(i);
                if (i === 0) {
                    pathMerchant += `M ${x} ${getY(rawData[i])}`;
                } else {
                    pathMerchant += ` L ${x} ${getY(rawData[i])}`;
                }
            }

            revenueContainer.innerHTML = `
                <svg class="chart-svg" width="100%" height="100%">
                    ${gridHtml}
                    <path class="chart-path-line" d="${pathMerchant}" stroke="var(--primary)" />
                    <!-- Legend -->
                    <g transform="translate(${width - 240}, 15)">
                        <circle cx="10" cy="5" r="4" fill="var(--primary)" />
                        <text class="chart-axis-text" x="20" y="9" fill="var(--text-primary)">Total Merchant Revenue</text>
                    </g>
                </svg>
            `;
        }

        // 3. RENDER CATEGORIES BAR CHART
        if (categoryContainer) {
            const counts = {};
            state.products.forEach(p => {
                const cat = p.category || 'General';
                counts[cat] = (counts[cat] || 0) + 1;
            });
            
            let barHtml = '<div style="display:flex; flex-direction:column; gap: 14px; width: 100%; height:100%; justify-content:center;">';
            const categories = Object.keys(counts);
            const totalProducts = state.products.length || 1;
            
            categories.forEach(cat => {
                const val = counts[cat];
                const pct = (val / totalProducts * 100).toFixed(0);
                barHtml += `
                    <div>
                        <div style="display:flex; justify-content:space-between; font-size:12.5px; margin-bottom:4px; font-weight:600;">
                            <span>${cat}</span>
                            <span style="color:var(--secondary)">${val} items (${pct}%)</span>
                        </div>
                        <div style="width:100%; height:8px; background-color:rgba(255,255,255,0.03); border-radius:var(--radius-full); overflow:hidden;">
                            <div style="width:${pct}%; height:100%; background:linear-gradient(90deg, var(--secondary) 0%, var(--primary) 100%); border-radius:var(--radius-full); transition: width 0.8s ease-out;"></div>
                        </div>
                    </div>
                `;
            });
            barHtml += '</div>';
            categoryContainer.innerHTML = barHtml;
        }
    }

    const rangeSelector = document.getElementById('overview-chart-range');
    if (rangeSelector) {
        rangeSelector.addEventListener('change', (e) => {
            state.chartDataRange = e.target.value;
            renderOverviewCharts();
        });
    }

    const timeTabs = document.getElementById('analytics-time-tabs');
    if (timeTabs) {
        timeTabs.querySelectorAll('.btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                timeTabs.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.chartDataRange = btn.getAttribute('data-range');
                renderOverviewCharts();
                showToast('success', 'Range Filtered', `Analytics scope set to last ${state.chartDataRange} intervals.`);
            });
        });
    }

    // --- AUDIT SYSTEM LOG RENDERING ---
    function renderAuditLogs() {
        const feed = document.getElementById('overview-activity-feed');
        if (!feed) return;
        feed.innerHTML = '';
        state.auditLogs.slice(0, 5).forEach(log => {
            const li = document.createElement('li');
            li.className = 'activity-item';
            li.innerHTML = `
                <div class="activity-badge ${log.badgeType}">
                    ${log.icon}
                </div>
                <div class="activity-details">
                    <span class="activity-text">${log.details}</span>
                    <span class="activity-time">${log.time} • Operator: ${log.operator}</span>
                </div>
            `;
            feed.appendChild(li);
        });
    }

    // --- USER MANAGEMENT CONTROLS ---
    function renderUsers() {
        const tbody = document.getElementById('users-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        const start = (state.usersPagination.current - 1) * state.usersPagination.limit;
        const end = start + state.usersPagination.limit;
        const pageUsers = filteredUsers.slice(start, end);
        
        if (pageUsers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted)">No merchant records matches active filter criteria</td></tr>';
            document.getElementById('users-pagination-info').textContent = 'Showing 0 items';
            return;
        }

        pageUsers.forEach(u => {
            let statusClass = 'status-active';
            if (u.status === 'Suspended') statusClass = 'status-suspended';
            if (u.status === 'Pending') statusClass = 'status-pending';

            const initials = u.name.split(' ').map(n => n[0]).join('').substring(0, 2);
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div class="user-identity-cell">
                        <div class="user-table-avatar">${initials}</div>
                        <div>
                            <span class="font-semibold">${u.name}</span>
                            <span class="cell-subtext">${u.email || 'No Email'}</span>
                        </div>
                    </div>
                </td>
                <td>
                    <span>${u.phone}</span>
                </td>
                <td>
                    <span class="font-semibold">${u.storeName || 'N/A'}</span>
                </td>
                <td>
                    <span class="badge ${u.phone === '0000000000' ? 'badge-accent' : 'badge-secondary'}">Merchant</span>
                </td>
                <td>
                    <span class="status-pill ${statusClass}">${u.status}</span>
                </td>
                <td>
                    <span>${new Date(u.createdAt).toISOString().split('T')[0]}</span>
                </td>
                <td class="text-right">
                    <div class="actions-cell">
                        ${['SUPER_ADMIN', 'ADMIN', 'MODERATOR'].includes(state.currentAdminRole) ? `
                        <button class="btn btn-secondary btn-sm btn-icon-only btn-suspend" data-id="${u.id}" title="${u.status === 'Suspended' ? 'Unsuspend User' : 'Suspend User'}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"></circle><line x1="8" y1="12" x2="16" y2="12"></line></svg>
                        </button>
                        <button class="btn btn-danger btn-sm btn-icon-only btn-delete-user" data-id="${u.id}" title="Delete User">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                        ` : `<span class="text-xs text-muted">Read-Only</span>`}
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        document.getElementById('users-pagination-info').textContent = `Showing ${start + 1}-${Math.min(end, filteredUsers.length)} of ${filteredUsers.length} users`;
        document.getElementById('users-prev-page').disabled = state.usersPagination.current === 1;
        document.getElementById('users-next-page').disabled = end >= filteredUsers.length;
        
        // Action: Suspend User
        tbody.querySelectorAll('.btn-suspend').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const user = state.users.find(u => u.id === id);
                if (user) {
                    const actionName = user.status === 'Suspended' ? 'Activate' : 'Suspend';
                    const confirmBtn = document.getElementById('user-modal-confirm-btn');
                    
                    document.getElementById('user-modal-title').textContent = `${actionName} User Account`;
                    document.getElementById('user-modal-message').textContent = `Are you sure you want to change status of this user?`;
                    document.getElementById('user-modal-details').innerHTML = `
                        <strong>Name:</strong> ${user.name}<br>
                        <strong>Store Name:</strong> ${user.storeName || 'N/A'}<br>
                        <strong>Current Status:</strong> <span class="font-bold">${user.status}</span>
                    `;
                    
                    confirmBtn.className = actionName === 'Activate' ? 'btn btn-primary' : 'btn btn-danger';
                    confirmBtn.textContent = `Yes, ${actionName}`;
                    
                    const newConfirmBtn = confirmBtn.cloneNode(true);
                    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
                    
                    newConfirmBtn.addEventListener('click', async () => {
                        try {
                            const res = await fetch(`/api/admin/users/${user.id}/suspend`, { method: 'POST' });
                            if (!res.ok) throw new Error('Failed to update status');
                            const data = await res.json();
                            
                            user.status = data.user.status;
                            showToast('success', 'Status Modified', `User set to ${user.status}`);
                            
                            // Reload logs & status
                            loadAllData();
                            closeModal('user-action-modal');
                        } catch (err) {
                            showToast('error', 'Status Update Error', err.message);
                        }
                    });
                    
                    openModal('user-action-modal');
                }
            });
        });

        // Action: Delete User
        tbody.querySelectorAll('.btn-delete-user').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const user = state.users.find(u => u.id === id);
                if (user) {
                    const confirmBtn = document.getElementById('user-modal-confirm-btn');
                    document.getElementById('user-modal-title').textContent = `Delete Account Archive`;
                    document.getElementById('user-modal-message').textContent = `Danger: Are you sure you want to permanently delete this account? All associated catalog listings and transaction sales will be wiped.`;
                    document.getElementById('user-modal-details').innerHTML = `
                        <strong>Name:</strong> ${user.name}<br>
                        <strong>Registered Phone:</strong> ${user.phone}<br>
                        <strong>Merchant Store:</strong> ${user.storeName || 'N/A'}
                    `;
                    confirmBtn.className = 'btn btn-danger';
                    confirmBtn.textContent = 'Permanently Delete';

                    const newConfirm = confirmBtn.cloneNode(true);
                    confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
                    newConfirm.addEventListener('click', async () => {
                        try {
                            const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
                            if (!res.ok) throw new Error('Failed to delete account');
                            
                            state.users = state.users.filter(u => u.id !== id);
                            filteredUsers = filteredUsers.filter(u => u.id !== id);
                            showToast('success', 'User Deleted', 'Account has been removed from database.');
                            
                            if ((state.usersPagination.current - 1) * state.usersPagination.limit >= filteredUsers.length) {
                                state.usersPagination.current = Math.max(1, state.usersPagination.current - 1);
                            }
                            
                            loadAllData();
                            closeModal('user-action-modal');
                        } catch (err) {
                            showToast('error', 'Deletion Error', err.message);
                        }
                    });
                    openModal('user-action-modal');
                }
            });
        });
    }

    function applyUserFilters() {
        const q = document.getElementById('users-search').value.trim().toLowerCase();
        const role = document.getElementById('users-filter-role').value;
        const status = document.getElementById('users-filter-status').value;
        
        filteredUsers = state.users.filter(u => {
            const matchesQuery = u.name.toLowerCase().includes(q) || u.phone.includes(q) || (u.storeName && u.storeName.toLowerCase().includes(q)) || (u.email && u.email.toLowerCase().includes(q));
            const matchesRole = role === 'all' || (role === 'Merchant' && u.phone !== '0000000000') || (role === 'Admin' && u.phone === '0000000000');
            const matchesStatus = status === 'all' || u.status === status;
            return matchesQuery && matchesRole && matchesStatus;
        });

        state.usersPagination.current = 1;
        renderUsers();
    }

    if (document.getElementById('users-search')) {
        document.getElementById('users-search').addEventListener('input', applyUserFilters);
        document.getElementById('users-filter-role').addEventListener('change', applyUserFilters);
        document.getElementById('users-filter-status').addEventListener('change', applyUserFilters);
        
        document.getElementById('users-prev-page').addEventListener('click', () => {
            if (state.usersPagination.current > 1) {
                state.usersPagination.current--;
                renderUsers();
            }
        });
        document.getElementById('users-next-page').addEventListener('click', () => {
            if (state.usersPagination.current * state.usersPagination.limit < filteredUsers.length) {
                state.usersPagination.current++;
                renderUsers();
            }
        });
    }

    // --- PRODUCTS CATALOGUE CONTROLS ---
    function renderProducts() {
        const grid = document.getElementById('products-grid');
        if (!grid) return;
        grid.innerHTML = '';
        
        const start = (state.productsPagination.current - 1) * state.productsPagination.limit;
        const end = start + state.productsPagination.limit;
        const pageProds = filteredProducts.slice(start, end);
        
        if (pageProds.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--text-muted);">No products registered in the global catalog matches the filter.</div>';
            document.getElementById('products-pagination-info').textContent = 'Showing 0 items';
            return;
        }

        pageProds.forEach(p => {
            const card = document.createElement('div');
            card.className = 'product-card-item';
            
            const imageSrc = p.image || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100&auto=format&fit=crop&q=60';
            
            card.innerHTML = `
                <div class="prod-img-container">
                    <img src="${imageSrc}" alt="${p.name}" class="prod-img-avatar">
                </div>
                <div class="prod-info-block">
                    <span class="prod-cat-tag">${p.category || 'General'}</span>
                    <h4 class="prod-name-title">${p.name}</h4>
                    <span class="product-barcode-pill">EAN: ${p.barcode || 'N/A'}</span>
                    <span class="prod-spec-text">${p.specifications || 'Standard packaging'}</span>
                    <span class="prod-brand-text">Brand: ${p.brand || 'Unbranded'}</span>
                </div>
                ${['SUPER_ADMIN', 'ADMIN', 'MODERATOR'].includes(state.currentAdminRole) ? `
                <div class="prod-action-block">
                    <button class="btn btn-secondary btn-sm btn-icon-only btn-edit-prod" data-id="${p.id}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    <button class="btn btn-danger btn-sm btn-icon-only btn-delete-prod" data-id="${p.id}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
                ` : ''}
            `;
            grid.appendChild(card);
        });

        document.getElementById('products-pagination-info').textContent = `Showing ${start + 1}-${Math.min(end, filteredProducts.length)} of ${filteredProducts.length} products`;
        document.getElementById('products-prev-page').disabled = state.productsPagination.current === 1;
        document.getElementById('products-next-page').disabled = end >= filteredProducts.length;

        // Action: Edit Product Modal Trigger
        grid.querySelectorAll('.btn-edit-prod').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const prod = state.products.find(p => p.id === id);
                if (prod) {
                    document.getElementById('product-modal-title').textContent = 'Edit Product Registry';
                    document.getElementById('product-modal-id').value = prod.id;
                    document.getElementById('prod-name').value = prod.name;
                    document.getElementById('prod-barcode').value = prod.barcode || '';
                    document.getElementById('prod-brand').value = prod.brand || '';
                    document.getElementById('prod-spec').value = prod.specifications || '';
                    document.getElementById('prod-img').value = prod.image || '';

                    const select = document.getElementById('prod-category');
                    select.innerHTML = '';
                    state.categories.forEach(cat => {
                        const opt = document.createElement('option');
                        opt.value = cat;
                        opt.textContent = cat;
                        if (cat === prod.category) opt.selected = true;
                        select.appendChild(opt);
                    });

                    openModal('product-modal');
                }
            });
        });

        // Action: Delete Product Entry
        grid.querySelectorAll('.btn-delete-prod').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const prod = state.products.find(p => p.id === id);
                if (prod) {
                    if (confirm(`Are you sure you want to remove "${prod.name}" from the global product scan directory?`)) {
                        fetch(`/api/admin/products/${id}`, { method: 'DELETE' })
                            .then(res => {
                                if (!res.ok) throw new Error('Failed to delete product');
                                return res.json();
                            })
                            .then(() => {
                                showToast('success', 'Product Deleted', 'Wiped catalog entry from database.');
                                loadAllData();
                            })
                            .catch(err => showToast('error', 'Deletion Error', err.message));
                    }
                }
            });
        });
    }

    // Product form submission
    document.getElementById('product-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('product-modal-id').value;
        const name = document.getElementById('prod-name').value.trim();
        const barcode = document.getElementById('prod-barcode').value.trim();
        const brand = document.getElementById('prod-brand').value.trim();
        const category = document.getElementById('prod-category').value;
        const specifications = document.getElementById('prod-spec').value.trim();
        const image = document.getElementById('prod-img').value.trim();

        const bodyData = { name, barcode, brand, category, specifications, image };

        try {
            if (id) {
                // Update product
                const res = await fetch(`/api/admin/products/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(bodyData)
                });
                if (!res.ok) throw new Error('Failed to update product');
                showToast('success', 'Catalog Updated', 'Global catalog listing successfully modified.');
            } else {
                // Add product
                const res = await fetch('/api/admin/products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(bodyData)
                });
                if (!res.ok) throw new Error('Failed to add product');
                showToast('success', 'Catalog Inserted', 'Global catalog listing successfully created.');
            }

            closeModal('product-modal');
            loadAllData();
        } catch (err) {
            showToast('error', 'Database Write Error', err.message);
        }
    });

    // Add Product Modal Trigger
    document.getElementById('btn-add-product').addEventListener('click', () => {
        document.getElementById('product-modal-title').textContent = 'Add Global Item Entry';
        document.getElementById('product-modal-id').value = '';
        document.getElementById('product-form').reset();
        
        const select = document.getElementById('prod-category');
        select.innerHTML = '';
        state.categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            select.appendChild(opt);
        });
        openModal('product-modal');
    });

    function applyProductFilters() {
        const q = document.getElementById('products-search').value.toLowerCase();
        const cat = document.getElementById('products-filter-category').value;

        filteredProducts = state.products.filter(p => {
            const matchesQuery = p.name.toLowerCase().includes(q) || (p.brand && p.brand.toLowerCase().includes(q)) || (p.barcode && p.barcode.includes(q));
            const matchesCat = cat === 'all' || p.category === cat;
            return matchesQuery && matchesCat;
        });

        state.productsPagination.current = 1;
        renderProducts();
    }

    if (document.getElementById('products-search')) {
        document.getElementById('products-search').addEventListener('input', applyProductFilters);
        document.getElementById('products-filter-category').addEventListener('change', applyProductFilters);
        
        document.getElementById('products-prev-page').addEventListener('click', () => {
            if (state.productsPagination.current > 1) {
                state.productsPagination.current--;
                renderProducts();
            }
        });
        document.getElementById('products-next-page').addEventListener('click', () => {
            if (state.productsPagination.current * state.productsPagination.limit < filteredProducts.length) {
                state.productsPagination.current++;
                renderProducts();
            }
        });
    }

    // --- BUSINESS MANAGEMENT CONTROLS ---
    function renderBusinesses() {
        const tbody = document.getElementById('businesses-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        const start = (state.businessesPagination.current - 1) * state.businessesPagination.limit;
        const end = start + state.businessesPagination.limit;
        const pageStores = filteredBusinesses.slice(start, end);

        if (pageStores.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted)">No business stores matches selection filters.</td></tr>';
            document.getElementById('businesses-pagination-info').textContent = 'Showing 0 items';
            return;
        }

        pageStores.forEach(s => {
            const valFormatted = '₦' + s.inventoryValue.toLocaleString('en-NG');
            const revFormatted = '₦' + s.revenue.toLocaleString('en-NG');

            const tr = document.createElement('tr');
            tr.className = s.status === 'Suspended' ? 'text-muted' : '';
            tr.innerHTML = `
                <td>
                    <span class="font-bold">${s.name}</span>
                    <span class="cell-subtext">Store ID: ST-${s.id.substring(0, 8).toUpperCase()}</span>
                </td>
                <td>
                    <span>${s.owner}</span>
                </td>
                <td>
                    <span>${s.location}</span>
                </td>
                <td class="text-right">
                    <span>${s.inventoryItems} items</span>
                </td>
                <td class="text-right font-semibold">
                    <span>${valFormatted}</span>
                </td>
                <td class="text-right font-bold" style="color:var(--primary)">
                    <span>${revFormatted}</span>
                </td>
                <td class="text-right">
                    <span class="status-pill ${s.status === 'Active' ? 'status-active' : 'status-suspended'}">${s.status === 'Active' ? 'Live' : 'Frozen'}</span>
                </td>
            `;
            tbody.appendChild(tr);
        });

        document.getElementById('businesses-pagination-info').textContent = `Showing ${start + 1}-${Math.min(end, filteredBusinesses.length)} of ${filteredBusinesses.length} merchants`;
        document.getElementById('businesses-prev-page').disabled = state.businessesPagination.current === 1;
        document.getElementById('businesses-next-page').disabled = end >= filteredBusinesses.length;
    }

    function applyBusinessFilters() {
        const q = document.getElementById('businesses-search').value.toLowerCase();
        const valueFilter = document.getElementById('businesses-filter-value').value;

        filteredBusinesses = state.businesses.filter(b => {
            const matchesQuery = b.name.toLowerCase().includes(q) || b.owner.toLowerCase().includes(q) || b.location.toLowerCase().includes(q);
            
            let matchesVal = true;
            if (valueFilter === 'high') matchesVal = b.inventoryValue > 500000;
            else if (valueFilter === 'medium') matchesVal = b.inventoryValue >= 100000 && b.inventoryValue <= 500000;
            else if (valueFilter === 'low') matchesVal = b.inventoryValue < 100000;

            return matchesQuery && matchesVal;
        });

        state.businessesPagination.current = 1;
        renderBusinesses();
    }

    if (document.getElementById('businesses-search')) {
        document.getElementById('businesses-search').addEventListener('input', applyBusinessFilters);
        document.getElementById('businesses-filter-value').addEventListener('change', applyBusinessFilters);

        document.getElementById('businesses-prev-page').addEventListener('click', () => {
            if (state.businessesPagination.current > 1) {
                state.businessesPagination.current--;
                renderBusinesses();
            }
        });
        document.getElementById('businesses-next-page').addEventListener('click', () => {
            if (state.businessesPagination.current * state.businessesPagination.limit < filteredBusinesses.length) {
                state.businessesPagination.current++;
                renderBusinesses();
            }
        });
    }

    // --- PRODUCT INGESTION PIPELINE ---
    const ingestionTabs = document.querySelectorAll('.ingestion-tab');
    ingestionTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            ingestionTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            state.activeIngestionTab = tab.getAttribute('data-tab');
            renderIngestionTable();
        });
    });

    function updateIngestionBadges() {
        document.getElementById('ingestion-tab-count-review').textContent = state.ingestion.review.length;
        document.getElementById('ingestion-tab-count-imported').textContent = state.ingestion.imported.length;
        document.getElementById('ingestion-tab-count-duplicate').textContent = state.ingestion.duplicate.length;
        document.getElementById('ingestion-tab-count-failed').textContent = state.ingestion.failed.length;
        
        document.getElementById('ingestion-badge').textContent = state.ingestion.review.length;
    }

    function renderIngestionTable() {
        const head = document.getElementById('ingestion-table-head');
        const body = document.getElementById('ingestion-table-body');
        if (!body) return;
        
        updateIngestionBadges();
        body.innerHTML = '';
        const currentTab = state.activeIngestionTab;

        if (currentTab === 'review') {
            head.innerHTML = `
                <tr>
                    <th>Product Ingestion Info</th>
                    <th>Scraped Barcode</th>
                    <th>Reported Category</th>
                    <th>Source Crawled</th>
                    <th>Review Warning</th>
                    <th class="text-right">Actions</th>
                </tr>
            `;

            if (state.ingestion.review.length === 0) {
                body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)">Review queue is empty! All items catalogued correctly.</td></tr>';
                return;
            }

            state.ingestion.review.forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <span class="font-bold">${item.name}</span>
                        <span class="cell-subtext">Brand: ${item.brand} • ${item.spec || 'Standard package'}</span>
                    </td>
                    <td><span class="product-barcode-pill">${item.barcode || 'N/A'}</span></td>
                    <td><span>${item.category}</span></td>
                    <td><span class="badge badge-secondary">${item.source}</span></td>
                    <td><span class="badge badge-warning">${item.reason || 'Flagged'}</span></td>
                    <td class="text-right">
                        <div class="actions-cell">
                            <button class="btn btn-primary btn-sm btn-approve" data-id="${item.id}">Approve</button>
                            <button class="btn btn-danger btn-sm btn-dismiss" data-id="${item.id}">Dismiss</button>
                        </div>
                    </td>
                `;
                body.appendChild(tr);
            });

            // Action: Approve Ingestion Item
            body.querySelectorAll('.btn-approve').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.getAttribute('data-id');
                    try {
                        const res = await fetch(`/api/admin/ingestion/${id}/approve`, { method: 'POST' });
                        if (!res.ok) throw new Error('Approval request failed');
                        showToast('success', 'Approved', 'Catalog entry verified and saved to database.');
                        loadAllData();
                    } catch (err) {
                        showToast('error', 'Write Error', err.message);
                    }
                });
            });

            // Action: Dismiss Ingestion Item
            body.querySelectorAll('.btn-dismiss').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.getAttribute('data-id');
                    try {
                        const res = await fetch(`/api/admin/ingestion/${id}/dismiss`, { method: 'POST' });
                        if (!res.ok) throw new Error('Dismissal request failed');
                        showToast('info', 'Dismissed', 'Scraper entry rejected.');
                        loadAllData();
                    } catch (err) {
                        showToast('error', 'Write Error', err.message);
                    }
                });
            });

        } else if (currentTab === 'imported') {
            head.innerHTML = `
                <tr>
                    <th>Product Details</th>
                    <th>Assigned Barcode</th>
                    <th>Category</th>
                    <th>Ingestion Channel</th>
                    <th>Import Timestamp</th>
                </tr>
            `;

            if (state.ingestion.imported.length === 0) {
                body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-muted)">No recently imported items.</td></tr>';
                return;
            }

            state.ingestion.imported.forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <span class="font-semibold">${item.name}</span>
                        <span class="cell-subtext">Brand: ${item.brand}</span>
                    </td>
                    <td><span class="product-barcode-pill">${item.barcode || 'N/A'}</span></td>
                    <td><span>${item.category}</span></td>
                    <td><span class="badge badge-secondary">${item.source}</span></td>
                    <td><span>${new Date(item.createdAt).toISOString().split('T')[0]}</span></td>
                `;
                body.appendChild(tr);
            });

        } else if (currentTab === 'duplicate') {
            head.innerHTML = `
                <tr>
                    <th>Suspect Duplication Entry</th>
                    <th>Duplicate Barcode</th>
                    <th>Linked Catalog Item ID</th>
                    <th>Pipeline Origin</th>
                    <th>Flag Reason</th>
                    <th class="text-right">Merge Control</th>
                </tr>
            `;

            if (state.ingestion.duplicate.length === 0) {
                body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)">Duplication indices are completely clean!</td></tr>';
                return;
            }

            state.ingestion.duplicate.forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <span class="font-bold text-danger">${item.name}</span>
                        <span class="cell-subtext">Scraped packaging: ${item.spec || 'Standard package'}</span>
                    </td>
                    <td><span class="product-barcode-pill">${item.barcode || 'N/A'}</span></td>
                    <td><span class="font-semibold" style="color:var(--secondary)">Item ID: ${item.duplicateOfId ? item.duplicateOfId.substring(0,8) : 'N/A'}</span></td>
                    <td><span class="badge badge-secondary">${item.source}</span></td>
                    <td><span class="badge badge-warning">Duplicate barcode detected</span></td>
                    <td class="text-right">
                        <button class="btn btn-secondary btn-sm btn-resolve-merge" data-id="${item.id}">Merge Files</button>
                    </td>
                `;
                body.appendChild(tr);
            });

            body.querySelectorAll('.btn-resolve-merge').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.getAttribute('data-id');
                    try {
                        const res = await fetch(`/api/admin/ingestion/${id}/dismiss`, { method: 'POST' });
                        if (!res.ok) throw new Error('Merge resolution failed');
                        showToast('success', 'Resolved', 'Merged duplication markers.');
                        loadAllData();
                    } catch (err) {
                        showToast('error', 'Write Error', err.message);
                    }
                });
            });

        } else if (currentTab === 'failed') {
            head.innerHTML = `
                <tr>
                    <th>Ingestion Product Name</th>
                    <th>Barcodes</th>
                    <th>Source Scrape Endpoint</th>
                    <th>Import Failure Log</th>
                    <th>Error Date</th>
                    <th class="text-right">Re-attempt</th>
                </tr>
            `;

            if (state.ingestion.failed.length === 0) {
                body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)">Zero failures recorded in logging cycle.</td></tr>';
                return;
            }

            state.ingestion.failed.forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <span class="font-bold">${item.name}</span>
                        <span class="cell-subtext">Brand: ${item.brand || 'Unknown'}</span>
                    </td>
                    <td><span>${item.barcode || '<em class="text-muted">None</em>'}</span></td>
                    <td><span class="badge badge-secondary">${item.source}</span></td>
                    <td><span class="font-semibold text-danger">${item.error || 'Syntax parsing error'}</span></td>
                    <td><span>${new Date(item.createdAt).toISOString().split('T')[0]}</span></td>
                    <td class="text-right">
                        <button class="btn btn-secondary btn-sm btn-retry-import" data-id="${item.id}">Retry</button>
                    </td>
                `;
                body.appendChild(tr);
            });

            // Action: Retry Failed Ingestion
            body.querySelectorAll('.btn-retry-import').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.getAttribute('data-id');
                    const item = state.ingestion.failed.find(x => x.id === id);
                    if (!item) return;

                    let barcode = item.barcode;
                    if (!barcode) {
                        barcode = prompt(`Barcode is missing for "${item.name}". Please input correct EAN/UPC digits manually to re-ingest:`);
                        if (!barcode) {
                            showToast('warning', 'Retry Aborted', 'Re-ingestion requires valid EAN details.');
                            return;
                        }
                    }

                    try {
                        const res = await fetch(`/api/admin/ingestion/${id}/retry`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ barcode })
                        });
                        if (!res.ok) throw new Error('Re-ingestion failed');
                        showToast('success', 'Synced', 'Item successfully pushed to live products.');
                        loadAllData();
                    } catch (err) {
                        showToast('error', 'Retry Sync Error', err.message);
                    }
                });
            });
        }
    }

    // --- SETTINGS CONTROLS ---
    const settingsTabs = document.querySelectorAll('.settings-nav-item');
    const settingsSubPanels = document.querySelectorAll('.settings-panel-sub');

    settingsTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const sub = tab.getAttribute('data-subtarget');
            settingsTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            settingsSubPanels.forEach(p => p.classList.remove('active'));
            document.getElementById(`settings-sub-${sub}`).classList.add('active');
        });
    });

    document.getElementById('form-profile-settings').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('admin-name').value.trim();
        const email = document.getElementById('admin-email').value.trim();
        
        try {
            const res = await fetch('/api/admin/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email })
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to update profile');
            }
            const data = await res.json();
            const admin = data.admin;

            document.querySelectorAll('.profile-name').forEach(el => el.textContent = admin.name || admin.email.split('@')[0]);
            document.querySelectorAll('.profile-email').forEach(el => el.textContent = admin.email);
            document.querySelectorAll('.profile-avatar, .profile-avatar-btn').forEach(el => el.textContent = admin.email.substring(0, 2).toUpperCase());
            
            showToast('success', 'Profile Saved', 'Profile parameters successfully updated in database.');
        } catch (err) {
            showToast('error', 'Profile Update Error', err.message);
        }
    });

    // Categories manager render
    function renderCategoriesSettings() {
        const list = document.getElementById('settings-categories-list');
        if (!list) return;
        list.innerHTML = '';
        state.categories.forEach((cat, index) => {
            const li = document.createElement('li');
            li.className = 'category-list-item';
            li.innerHTML = `
                <span>${cat}</span>
                <button class="btn btn-danger btn-sm btn-icon-only btn-delete-cat" data-index="${index}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            `;
            list.appendChild(li);
        });

        // Action: Delete Category
        list.querySelectorAll('.btn-delete-cat').forEach(btn => {
            btn.addEventListener('click', async () => {
                const index = parseInt(btn.getAttribute('data-index'));
                const cat = state.categories[index];
                if (confirm(`Do you want to delete category "${cat}"? Products under this category will remain, but category tags filters will lose references.`)) {
                    try {
                        const res = await fetch(`/api/admin/categories/${encodeURIComponent(cat)}`, {
                            method: 'DELETE'
                        });
                        if (!res.ok) throw new Error('Deletion failed');
                        showToast('success', 'Category Deleted', `Removed category tag ${cat}`);
                        loadAllData();
                    } catch (err) {
                        showToast('error', 'Category Error', err.message);
                    }
                }
            });
        });
    }

    // Action: Add Category
    if (document.getElementById('btn-add-category')) {
        document.getElementById('btn-add-category').addEventListener('click', async () => {
            const name = prompt('Input name for new catalog category:');
            if (name && name.trim()) {
                const catName = name.trim();
                try {
                    const res = await fetch('/api/admin/categories', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: catName })
                    });
                    if (!res.ok) {
                        const errData = await res.json();
                        throw new Error(errData.error || 'Failed to add category');
                    }
                    showToast('success', 'Category Added', `Created category ${catName}`);
                    loadAllData();
                } catch (err) {
                    showToast('error', 'Category Error', err.message);
                }
            }
        });
    }

    if (document.getElementById('btn-copy-key')) {
        document.getElementById('btn-copy-key').addEventListener('click', () => {
            const input = document.getElementById('api-secret');
            input.select();
            input.setSelectionRange(0, 99999);
            navigator.clipboard.writeText(input.value);
            showToast('success', 'Secret Copied', 'API secret code copied to clipboard.');
        });
    }

    document.getElementById('form-source-settings').addEventListener('submit', (e) => {
        e.preventDefault();
        showToast('success', 'Mock Sync Configured', 'Webhook sync pipelines locally cached.');
    });

    // --- QUICK ACTION TRIGGER SHORTCUTS ---
    document.getElementById('btn-settings-profile').addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelector('[data-target="settings"]').click();
        document.querySelector('[data-subtarget="profile"]').click();
        document.querySelectorAll('.dropdown-panel').forEach(p => p.classList.remove('show'));
    });
    
    document.getElementById('btn-settings-system').addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelector('[data-target="settings"]').click();
        document.querySelector('[data-subtarget="sources"]').click();
        document.querySelectorAll('.dropdown-panel').forEach(p => p.classList.remove('show'));
    });

    // Action: Logout securely
    document.getElementById('btn-logout').addEventListener('click', async () => {
        if (confirm('Are you sure you want to end the Super Admin session?')) {
            showToast('info', 'Logging out...', 'Ending secure admin token session...');
            try {
                await fetch('/api/admin/logout', { method: 'POST' });
                setTimeout(() => {
                    window.location.href = '/admin/login';
                }, 500);
            } catch (err) {
                window.location.href = '/admin/login';
            }
        }
    });

    // Ctrl+K to search
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            document.getElementById('global-search').focus();
            showToast('info', 'Command Palette', 'Search input focused.');
        }
    });

    document.getElementById('global-search').addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase().trim();
        if (!val) return;
        
        const activeNav = document.querySelector('.nav-item.active').getAttribute('data-target');
        
        if (activeNav === 'users') {
            document.getElementById('users-search').value = val;
            applyUserFilters();
        } else if (activeNav === 'products') {
            document.getElementById('products-search').value = val;
            applyProductFilters();
        } else if (activeNav === 'businesses') {
            document.getElementById('businesses-search').value = val;
            applyBusinessFilters();
        }
    });

    // --- APP BOOTSTRAPPING SEQUENCE ---
    async function bootstrap() {
        await loadAllData();
        
        window.addEventListener('resize', () => {
            renderOverviewCharts();
        });
        
        showToast('success', 'Admin Portal Live', 'Secure session initiated successfully.');
    }

    bootstrap();
});
