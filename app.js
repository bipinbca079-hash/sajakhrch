// --- SYNC CONFIGURATION ---
const SYNC_KEY = 'sajakhrch_v4_room_882947_x92'; 

// Initialize Gun with multiple relays for high reliability
const gun = Gun([
    'https://gun-manhattan.herokuapp.com/gun',
    'https://gun-us.herokuapp.com/gun',
    'https://gun-eu.herokuapp.com/gun',
    'https://gunjs.herokuapp.com/gun'
]);
const appData = gun.get(SYNC_KEY);

// State Management
const state = {
    users: [],
    expenses: [],
    currentUser: JSON.parse(localStorage.getItem('currentUser')) || null,
    currentViewingUserId: null,
    settings: JSON.parse(localStorage.getItem('settings')) || {
        currency: '₹',
        theme: 'light'
    }
};

// DOM Elements
const elements = {
    totalMonth: document.getElementById('total-month-spend'),
    balanceText: document.getElementById('balance-text'),
    balanceAmount: document.getElementById('balance-amount'),
    balanceCard: document.getElementById('balance-card'),
    recentExpenses: document.getElementById('recent-expenses'),
    fullExpenseList: document.getElementById('full-expense-list'),
    expenseModal: document.getElementById('expense-modal'),
    userModal: document.getElementById('user-modal'),
    identityModal: document.getElementById('identity-modal'),
    expenseForm: document.getElementById('expense-form'),
    userForm: document.getElementById('user-form'),
    searchInput: document.getElementById('search-input'),
    currentDate: document.getElementById('current-date'),
    themeToggle: document.getElementById('theme-toggle'),
    userFolders: document.getElementById('user-folders'),
    userPayerSelect: document.getElementById('expense-payer'),
    userStatsList: document.getElementById('user-stats-list'),
    identityList: document.getElementById('identity-list'),
    userAvatar: document.getElementById('user-avatar'),
    userWelcome: document.getElementById('user-welcome'),
    currentUserDisplay: document.getElementById('current-user-display'),
    deletionLog: document.getElementById('deletion-log'),
    syncStatus: document.getElementById('sync-status'),
    lastSyncTime: document.createElement('span') // We'll add this dynamically or use an existing element
};

// Constants
const CATEGORY_ICONS = { Food: 'utensils', Rent: 'home', Groceries: 'shopping-cart', Utilities: 'zap', Entertainment: 'film', Other: 'help-circle' };
const CATEGORY_COLORS = { Food: '#6366f1', Rent: '#ec4899', Groceries: '#10b981', Utilities: '#f59e0b', Entertainment: '#8b5cf6', Other: '#64748b' };
let categoryChart = null;

// --- DATA SYNCING WITH GUN.JS ---
function initDataSync() {
    appData.get('users').map().on((user, id) => {
        if (!user) {
            state.users = state.users.filter(u => u.id !== id);
            updateUI();
            return;
        }
        const index = state.users.findIndex(u => u.id === user.id);
        if (index > -1) state.users[index] = user;
        else state.users.push(user);
        
        // If current user's data changed, update state
        if (state.currentUser && state.currentUser.id === user.id) {
            state.currentUser = user;
            localStorage.setItem('currentUser', JSON.stringify(user));
        }
        
        updateUI();
    });

    appData.get('expenses').map().on((expense, id) => {
        if (!expense) {
            const expenseId = id;
            state.expenses = state.expenses.filter(e => e.id !== expenseId);
            updateUI();
            return;
        };
        
        const index = state.expenses.findIndex(e => e.id === expense.id);
        if (index > -1) state.expenses[index] = expense;
        else state.expenses.push(expense);
        
        // Show last updated time
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        elements.currentDate.setAttribute('data-last-sync', `Synced ${timeStr}`);
        
        updateUI();
    });

    // Monitor Connection Status
    gun.on('hi', () => {
        elements.syncStatus.classList.remove('offline');
        elements.syncStatus.classList.add('online');
    });

    gun.on('bye', () => {
        elements.syncStatus.classList.remove('online');
        elements.syncStatus.classList.add('offline');
    });
}

function init() {
    initDataSync();
    setupEventListeners();
    lucide.createIcons();
    setCurrentDate();
    applyTheme();
    updateIdentityUI();

    // Check if identity is set
    setTimeout(() => {
        if (!state.currentUser && state.users.length > 0) {
            elements.identityModal.classList.add('active');
        } else if (!state.currentUser && state.users.length === 0) {
            // No users yet, first time setup
            const welcomeTitle = document.getElementById('user-modal-title');
            if (welcomeTitle) welcomeTitle.textContent = "Welcome! Create your folder";
            elements.userModal.classList.add('active');
        }
    }, 1000);
}

function setCurrentDate() {
    const options = { weekday: 'long', month: 'long', day: 'numeric' };
    elements.currentDate.textContent = new Date().toLocaleDateString('en-US', options);
    document.getElementById('expense-date').valueAsDate = new Date();
}

function updateUI() {
    renderExpenses();
    renderUsers();
    updateSummary();
    renderChart();
    updatePayerDropdown();
    renderIdentityList();
    renderDeletionLog();
    updateIdentityUI();
    lucide.createIcons();
}

function updateIdentityUI() {
    if (state.currentUser) {
        elements.userAvatar.textContent = state.currentUser.name.charAt(0);
        elements.userWelcome.textContent = `Hello, ${state.currentUser.name}!`;
    } else {
        elements.userAvatar.textContent = '?';
        elements.userWelcome.textContent = 'Who are you?';
    }
}

function renderIdentityList() {
    if (!elements.identityList) return;
    elements.identityList.innerHTML = state.users.map(user => `
        <div class="user-folder-card" onclick="setIdentity('${user.id}')">
            <div class="avatar" style="width: 40px; height: 40px; margin-bottom: 5px;">${user.name.charAt(0)}</div>
            <h4 style="font-size: 0.9rem;">${user.name}</h4>
        </div>
    `).join('');
}

window.setIdentity = function(userId) {
    const user = state.users.find(u => u.id === userId);
    if (user) {
        state.currentUser = user;
        localStorage.setItem('currentUser', JSON.stringify(user));
        elements.identityModal.classList.remove('active');
        updateUI();
    }
};

function updateSummary() {
    const activeExpenses = state.expenses.filter(e => !e.deleted);
    const total = activeExpenses.reduce((sum, exp) => sum + (Number(exp.amount) * Number(exp.qty)), 0);
    const currency = state.settings.currency;
    elements.totalMonth.textContent = `${currency}${total.toFixed(2)}`;

    const userStats = state.users.map(user => {
        const spent = activeExpenses
            .filter(exp => exp.payerId === user.id)
            .reduce((sum, exp) => sum + (Number(exp.amount) * Number(exp.qty)), 0);
        return { ...user, spent };
    });

    const share = state.users.length > 0 ? total / state.users.length : 0;
    let summaryText = "Everyone is settled";
    let summaryAmount = 0;

    const balances = userStats.map(u => ({ ...u, balance: u.spent - share }));
    const maxOwed = balances.reduce((prev, curr) => (curr.balance > prev.balance) ? curr : prev, { balance: -Infinity });
    const maxOwes = balances.reduce((prev, curr) => (curr.balance < prev.balance) ? curr : prev, { balance: Infinity });

    elements.balanceCard.classList.remove('owe-you', 'you-owe');
    if (state.users.length < 2) {
        summaryText = "Add more roommates to split";
    } else if (maxOwed.balance > 0.01) {
        summaryText = `${maxOwed.name} is owed`;
        summaryAmount = maxOwed.balance;
        elements.balanceCard.classList.add('owe-you');
    } else if (maxOwes.balance < -0.01) {
        summaryText = `${maxOwes.name} owes money`;
        summaryAmount = Math.abs(maxOwes.balance);
        elements.balanceCard.classList.add('you-owe');
    }

    elements.balanceText.textContent = summaryText;
    elements.balanceAmount.textContent = `${currency}${summaryAmount.toFixed(2)}`;

    elements.userStatsList.innerHTML = userStats.map(u => `
        <div class="card" style="margin-bottom: 0.5rem; padding: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h4 style="margin:0">${u.name}</h4>
                    <small style="color: var(--text-muted)">Spent: ${currency}${u.spent.toFixed(2)}</small>
                </div>
                <div style="text-align: right">
                    <div style="font-weight: 700; color: ${(u.spent - share) >= 0 ? 'var(--success)' : 'var(--danger)'}">
                        ${(u.spent - share) >= 0 ? '+' : ''}${(u.spent - share).toFixed(2)}
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

function renderUsers() {
    const currency = state.settings.currency;
    const activeExpenses = state.expenses.filter(e => !e.deleted);
    elements.userFolders.innerHTML = state.users.map(user => {
        const spent = activeExpenses
            .filter(exp => exp.payerId === user.id)
            .reduce((sum, exp) => sum + (Number(exp.amount) * Number(exp.qty)), 0);
        return `
            <div class="user-folder-card" onclick="viewUserDetails('${user.id}')">
                <i data-lucide="folder"></i>
                <h4>${user.name}</h4>
                <span class="user-total">${currency}${spent.toFixed(0)}</span>
            </div>
        `;
    }).join('');
}

function updatePayerDropdown() {
    elements.userPayerSelect.innerHTML = state.users.map(user => `<option value="${user.id}">${user.name}</option>`).join('');
    // Auto-select current user if they exist
    if (state.currentUser && !document.getElementById('expense-id').value) {
        elements.userPayerSelect.value = state.currentUser.id;
    }
}

function renderExpenses(filterCategory = 'all', searchTerm = '') {
    const activeExpenses = state.expenses.filter(e => !e.deleted);
    const filtered = activeExpenses
        .filter(exp => filterCategory === 'all' || exp.category === filterCategory)
        .filter(exp => exp.name.toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    const renderList = (list, container) => {
        if (list.length === 0) { container.innerHTML = `<div class="empty-state"><p>No expenses found.</p></div>`; return; }
        container.innerHTML = list.map(exp => {
            const payer = state.users.find(u => u.id === exp.payerId) || { name: 'Unknown' };
            return `
                <div class="expense-item" onclick="editExpense('${exp.id}')">
                    <div class="category-icon" style="background: ${CATEGORY_COLORS[exp.category]}15; color: ${CATEGORY_COLORS[exp.category]}">
                        <i data-lucide="${CATEGORY_ICONS[exp.category] || 'help-circle'}"></i>
                    </div>
                    <div class="expense-details"><h4>${exp.name}</h4><p>${new Date(exp.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} • ${exp.category}</p></div>
                    <div class="expense-amount-info">
                        <span class="expense-price">${state.settings.currency}${(Number(exp.amount) * Number(exp.qty)).toFixed(2)}</span>
                        <span class="expense-payer">${payer.name}</span>
                    </div>
                </div>`;
        }).join('');
    };
    renderList(filtered.slice(0, 5), elements.recentExpenses);
    renderList(filtered, elements.fullExpenseList);
}

function renderDeletionLog() {
    if (!elements.deletionLog) return;
    const deletedExpenses = state.expenses
        .filter(e => e.deleted)
        .sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));

    if (deletedExpenses.length === 0) {
        elements.deletionLog.innerHTML = `<div class="empty-state"><p>No deletions yet.</p></div>`;
        return;
    }

    elements.deletionLog.innerHTML = deletedExpenses.map(exp => `
        <div class="expense-item" style="opacity: 0.7; border-style: dashed;">
            <div class="category-icon" style="background: #ccc; color: #666">
                <i data-lucide="trash"></i>
            </div>
            <div class="expense-details">
                <h4>${exp.name}</h4>
                <p>Deleted by <strong>${exp.deletedBy || 'Unknown'}</strong></p>
                <small>${new Date(exp.deletedAt).toLocaleString()}</small>
            </div>
            <div class="expense-amount-info">
                <span class="expense-price" style="text-decoration: line-through;">${state.settings.currency}${(Number(exp.amount) * Number(exp.qty)).toFixed(2)}</span>
                <button class="text-btn" onclick="restoreExpense('${exp.id}')" style="font-size: 0.7rem;">Restore</button>
            </div>
        </div>
    `).join('');
}

window.restoreExpense = function(id) {
    const exp = state.expenses.find(e => e.id === id);
    if (exp) {
        const updated = { ...exp, deleted: false, restoredBy: state.currentUser?.name || 'Unknown', restoredAt: Date.now() };
        appData.get('expenses').get(id).put(updated);
    }
};

window.viewUserDetails = function(userId) {
    state.currentViewingUserId = userId;
    const user = state.users.find(u => u.id === userId);
    if (!user) return;
    navigateTo('user-detail');
    document.getElementById('detail-user-name').textContent = `${user.name}'s Folder`;
    const userExpenses = state.expenses.filter(exp => exp.payerId === userId && !exp.deleted);
    const total = userExpenses.reduce((sum, exp) => sum + (Number(exp.amount) * Number(exp.qty)), 0);
    document.getElementById('detail-user-total').textContent = `${state.settings.currency}${total.toFixed(2)}`;
    const container = document.getElementById('user-specific-expenses');
    container.innerHTML = userExpenses.map(exp => `
        <div class="expense-item" onclick="editExpense('${exp.id}')">
            <div class="category-icon" style="background: ${CATEGORY_COLORS[exp.category]}15; color: ${CATEGORY_COLORS[exp.category]}">
                <i data-lucide="${CATEGORY_ICONS[exp.category] || 'help-circle'}"></i>
            </div>
            <div class="expense-details"><h4>${exp.name}</h4><p>${exp.date} • ${exp.category}</p></div>
            <div class="expense-amount-info"><span class="expense-price">${state.settings.currency}${(Number(exp.amount) * Number(exp.qty)).toFixed(2)}</span></div>
        </div>`).join('');
    lucide.createIcons();
};

function renderChart() {
    const canvas = document.getElementById('categoryChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const totals = {};
    state.expenses.filter(e => !e.deleted).forEach(exp => {
        totals[exp.category] = (totals[exp.category] || 0) + (Number(exp.amount) * Number(exp.qty));
    });
    const labels = Object.keys(totals);
    const data = Object.values(totals);
    if (categoryChart) categoryChart.destroy();
    if (data.length === 0) { 
        document.querySelectorAll('.chart-card').forEach(c => c.style.display = 'none'); 
        return; 
    }
    document.querySelectorAll('.chart-card').forEach(c => c.style.display = 'block');
    categoryChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: labels, datasets: [{ data: data, backgroundColor: labels.map(l => CATEGORY_COLORS[l]), borderWidth: 0 }] },
        options: { cutout: '70%', plugins: { legend: { position: 'bottom' } } }
    });
}

window.navigateTo = function(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`${viewId}-view`).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('onclick').includes(viewId));
    });
};

function setupEventListeners() {
    elements.currentUserDisplay.addEventListener('click', () => {
        elements.identityModal.classList.add('active');
    });

    document.getElementById('add-expense-trigger').addEventListener('click', () => { 
        if (!state.currentUser) {
            elements.identityModal.classList.add('active');
            return;
        }
        resetForm(); 
        elements.expenseModal.classList.add('active'); 
    });

    document.getElementById('add-expense-to-folder-btn').addEventListener('click', () => {
        if (!state.currentUser) {
            elements.identityModal.classList.add('active');
            return;
        }
        resetForm();
        elements.userPayerSelect.value = state.currentViewingUserId;
        elements.expenseModal.classList.add('active');
    });

    document.getElementById('edit-folder-btn').addEventListener('click', () => {
        const user = state.users.find(u => u.id === state.currentViewingUserId);
        if (user) {
            const newName = prompt('Enter new name for this folder:', user.name);
            if (newName && newName.trim()) {
                appData.get('users').get(user.id).put({ id: user.id, name: newName.trim() });
            }
        }
    });

    document.getElementById('delete-folder-btn').addEventListener('click', () => {
        if (confirm('DANGER: Delete this folder? Associated expenses will remain but the person will be removed from future calculations.')) {
            appData.get('users').get(state.currentViewingUserId).put(null);
            navigateTo('users');
        }
    });

    document.getElementById('close-modal').addEventListener('click', () => elements.expenseModal.classList.remove('active'));
    document.getElementById('add-user-btn').addEventListener('click', () => {
        document.getElementById('user-modal-title').textContent = "Add New Person";
        elements.userModal.classList.add('active');
    });
    document.getElementById('close-user-modal').addEventListener('click', () => elements.userModal.classList.remove('active'));

    elements.expenseForm.addEventListener('submit', (e) => { e.preventDefault(); saveExpense(); });
    
    elements.userForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('user-name').value;
        if (name) {
            const id = Date.now().toString();
            const newUser = { id, name };
            appData.get('users').get(id).put(newUser);
            
            // If this is the first user, auto-set as current
            if (!state.currentUser) {
                state.currentUser = newUser;
                localStorage.setItem('currentUser', JSON.stringify(newUser));
            }
            
            elements.userModal.classList.remove('active');
            elements.userForm.reset();
            updateUI();
        }
    });

    document.getElementById('delete-expense-btn').addEventListener('click', () => {
        const id = document.getElementById('expense-id').value;
        if (id && confirm('Are you sure you want to delete this expense? This will be recorded.')) {
            const exp = state.expenses.find(e => e.id === id);
            if (exp) {
                const updated = { 
                    ...exp, 
                    deleted: true, 
                    deletedBy: state.currentUser?.name || 'Someone', 
                    deletedAt: Date.now() 
                };
                appData.get('expenses').get(id).put(updated);
                elements.expenseModal.classList.remove('active');
                updateUI();
            }
        }
    });

    elements.searchInput.addEventListener('input', (e) => renderExpenses('all', e.target.value));
    document.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            renderExpenses(chip.dataset.category);
        });
    });

    elements.themeToggle.addEventListener('click', () => {
        state.settings.theme = state.settings.theme === 'light' ? 'dark' : 'light';
        applyTheme();
        localStorage.setItem('settings', JSON.stringify(state.settings));
    });

    document.getElementById('clear-btn').addEventListener('click', () => {
        if (confirm('DANGER: This will permanently delete all expenses for everyone. Continue?')) {
            state.expenses.forEach(exp => {
                appData.get('expenses').get(exp.id).put(null);
            });
            alert('All data cleared.');
        }
    });

    document.getElementById('export-btn').addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "sajakhrch_backup.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    });

    document.getElementById('refresh-btn').addEventListener('click', () => {
        updateUI();
        alert('Data refreshed from local cache and sync nodes.');
    });

    document.getElementById('share-btn').addEventListener('click', async () => {
        const shareData = {
            title: 'Sajakhrch Roommate Tracker',
            text: 'Track our roommate expenses together in real-time!',
            url: window.location.href
        };

        try {
            if (navigator.share) {
                await navigator.share(shareData);
            } else {
                await navigator.clipboard.writeText(window.location.href);
                alert('Link copied to clipboard! Send it to your friends.');
            }
        } catch (err) {
            console.error('Error sharing:', err);
        }
    });
}

function saveExpense() {
    const id = document.getElementById('expense-id').value || Date.now().toString();
    const expense = {
        id,
        name: document.getElementById('expense-name').value,
        amount: Number(document.getElementById('expense-amount').value),
        qty: Number(document.getElementById('expense-qty').value),
        category: document.getElementById('expense-category').value,
        date: document.getElementById('expense-date').value,
        payerId: elements.userPayerSelect.value,
        notes: document.getElementById('expense-notes').value,
        updatedAt: Date.now(),
        updatedBy: state.currentUser?.name || 'Unknown'
    };
    appData.get('expenses').get(id).put(expense);
    elements.expenseModal.classList.remove('active');
}

window.editExpense = function(id) {
    const exp = state.expenses.find(e => e.id === id);
    if (!exp) return;
    document.getElementById('modal-title').textContent = 'Edit Expense';
    document.getElementById('expense-id').value = exp.id;
    document.getElementById('expense-name').value = exp.name;
    document.getElementById('expense-amount').value = exp.amount;
    document.getElementById('expense-qty').value = exp.qty;
    document.getElementById('expense-category').value = exp.category;
    document.getElementById('expense-date').value = exp.date;
    document.getElementById('expense-notes').value = exp.notes || '';
    elements.userPayerSelect.value = exp.payerId;
    elements.expenseModal.classList.add('active');
    document.getElementById('delete-expense-btn').classList.remove('hidden');
};

function resetForm() {
    document.getElementById('modal-title').textContent = 'Add Expense';
    elements.expenseForm.reset();
    document.getElementById('expense-id').value = '';
    document.getElementById('expense-date').valueAsDate = new Date();
    document.getElementById('delete-expense-btn').classList.add('hidden');
    if (state.currentUser) {
        elements.userPayerSelect.value = state.currentUser.id;
    }
}

function applyTheme() {
    document.body.classList.toggle('dark-mode', state.settings.theme === 'dark');
    elements.themeToggle.innerHTML = `<i data-lucide="${state.settings.theme === 'dark' ? 'sun' : 'moon'}"></i>`;
}

document.addEventListener('DOMContentLoaded', init);

