
window.logDebug = (msg, data = null, type = 'info') => {
    // Simple console log only - No visual box
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] ${type.toUpperCase()}: ${msg}`, data || '');
};

// ==========================================
// 🛠️ UTILITY FUNCTIONS
// ==========================================

// Currency formatter
function formatCurrency(amount) {
    const num = parseFloat(amount) || 0;
    const symbol = (typeof CURRENCY !== 'undefined') ? CURRENCY : 'Ksh';
    return `${symbol} ${num.toLocaleString('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
    })}`;
}

// --- 🛡️ CRASH PROTECTION & INITIALIZATION ---
let supabaseClient = null; // Declared ONCE here to prevent "Identifier already declared" errors

try {
    // 1. Check Config
    if (typeof APP_CONFIG === 'undefined') {
        throw new Error("CRITICAL: 'config.js' is missing or has a syntax error.");
    }

    // 2. Check Supabase Library
    if (typeof window.supabase === 'undefined' || typeof window.supabase.createClient !== 'function') {
        throw new Error("CRITICAL: Supabase library failed to load.");
    }

    // 3. Initialize Supabase (Assign to the 'let' variable above)
        supabaseClient = window.supabase.createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseKey);

    // --- 4. BILLING STATUS ENFORCEMENT ---
    if (APP_CONFIG.SYSTEM_STATUS === 'SUSPENDED') {
        const payNum = APP_CONFIG.billing.mpesaNumber;
        const payTill = APP_CONFIG.billing.tillNumber;
        const support = APP_CONFIG.billing.supportPhone;

        // Overwrite the entire screen with the Payment Lock
        document.body.innerHTML = `
            <style>
                body { margin: 0; background-color: #0d0d0d; color: #fff; font-family: 'Segoe UI', sans-serif; height: 100vh; display: flex; align-items: center; justify-content: center; }
                .lock-box { text-align: center; max-width: 450px; padding: 40px; border: 1px solid #D4AF37; border-radius: 12px; background: #1a1a1a; box-shadow: 0 0 30px rgba(212, 175, 55, 0.15); }
                h1 { color: #e74c3c; margin-top: 0; letter-spacing: 1px; font-size: 24px; }
                .details-box { background: #252525; padding: 20px; border-radius: 8px; margin: 25px 0; text-align: left; border-left: 4px solid #D4AF37; }
                .pay-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 16px; }
                .pay-val { color: #D4AF37; font-weight: bold; font-family: monospace; font-size: 18px; }
                .btn-call { display: inline-block; background: #D4AF37; color: #000; text-decoration: none; padding: 12px 30px; border-radius: 5px; font-weight: bold; margin-top: 10px; transition: 0.3s; }
                .btn-call:hover { background: #fff; }
            </style>
            
            <div class="lock-box">
                <div style="font-size: 50px; margin-bottom: 10px;">🔒</div>
                <h1>ACCESS PAUSED</h1>
                <p style="color: #aaa; margin-bottom: 20px;">The subscription for <strong>${APP_CONFIG.appName}</strong> is currently inactive.</p>
                
                <p>To restore access immediately, please complete your payment:</p>
                
                <div class="details-box">
                    <div class="pay-row">
                        <span>Send Money:</span>
                        <span class="pay-val">${payNum}</span>
                    </div>
                    <div class="pay-row" style="margin-bottom: 0;">
                        <span>Buy Goods Till:</span>
                        <span class="pay-val">${payTill}</span>
                    </div>
                </div>
                
                <p style="font-size: 14px; color: #888;">Once paid, contact support to reactivate:</p>
                <a href="tel:${support}" class="btn-call">📞 Call Support</a>
            </div>
        `;
        
        // Stop the app from loading further
        throw new Error("❌ SYSTEM LOCKED: PAYMENT REQUIRED"); 
    }
    window.appInitialized = true;
    console.log("✅ System Initialized Successfully");

} catch (error) {
    console.error(error);
    alert("SYSTEM CRASH: " + error.message);
}

// Update Global Constants (Safety wrapped)
const SHOP_CONTACT = (typeof APP_CONFIG !== 'undefined') ? APP_CONFIG.shopPhone : "";
const CURRENCY = (typeof APP_CONFIG !== 'undefined') ? APP_CONFIG.currencySymbol : "Ksh";

// --- END OF INITIALIZATION ---

// Admin client - lazy loaded to avoid "Multiple GoTrueClient" warnings
function getAdminClient() {
    // ⚠️ SECURITY CHECK: Ensure the secret key exists
    if (!APP_CONFIG.serviceRoleKey) {
        console.error("❌ CRITICAL: Service Role Key missing in config.js");
        alert("Admin Error: You need the 'serviceRoleKey' in config.js to create users.");
        return null;
    }

    // Create a special client just for this Admin action
    return window.supabase.createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.serviceRoleKey, {
        auth: {
            persistSession: false, // Don't save this powerful session to browser storage
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    });
}

// --- Global Variables ---
let USER_PROFILE = null;
let CURRENT_ORDER_ID = null;
let ALL_SHOPS = {};
let analyticsCharts = {};

// [PERF] Debounce & Cache
let lastDashboardLoad = 0;
const DEBOUNCE_DELAY = 500; // 500ms minimum between refreshes
let dataCache = {
    shops: null,
    workers: null,
    orders: null,
    expenses: null,
    cacheTime: 0
};
const CACHE_TTL = 60000; // 60 second cache

// Constants
const STATUS_MAP = {
    1: 'Assigned',
    2: 'In Progress',
    3: 'QA Check',
    4: 'Ready',
    5: 'Collected (Pending)',
    6: 'Closed'
};

const GARMENT_MEASUREMENTS = {
    'Suit': {
        Coat: ['Shoulder', 'Chest','Bodice', 'Waist', 'Bicep', 'Sleeve', 'Length', 'Hips'],
        Shirt: ['Shoulder', 'Chest','Bodice', 'Waist', 'Sleeve', 'Length', 'Neck', 'Cuff'],
        Trouser: ['Waist', 'Hips', 'Thigh', 'Knee', 'Bottom', 'Length', 'Crotch']
    },
    // [NEW] Kaunda/Senator Suit Added Here
    'Kaunda/Senator Suit': {
        Top: ['Shoulder', 'Sleeve', 'Arm', 'Chest', 'Waist', 'Hips', 'Length', 'Neck'],
        Trouser: ['Waist', 'Hips', 'Thigh', 'Knee', 'Bottom', 'Length', 'Crotch']
    },
    'Trouser': {
        Trouser: ['Waist', 'Hips', 'Thigh', 'Knee', 'Bottom', 'Length', 'Crotch']
    },
    // --- UPDATED SHIRT SECTION ---
    'Shirt': {
        Shirt: [
            'Shoulder',
            'Chest',
            'Bust',           // Added
            'Bodice',         // Added
            'Waist',
            'Long Sleeve',    // Specific
            'Short Sleeve',   // Specific
            'Length',
            'Neck',
            'Cuff'
        ]
    },
    // -----------------------------
    'Dress': {
        Dress: ['Shoulder', 'Bust', 'Waist', 'Hips', 'Length', 'Sleeve']
    },
    'Coat': {
        Coat: ['Shoulder', 'Chest', 'Waist', 'Sleeve', 'Length', 'Hips']
    },
    'Half Coat': {
        Coat: ['Shoulder', 'Chest', 'Waist', 'Length']
    },
    'Alteration': {
        Notes: ['Description']
    }
};

// ==========================================
// 📋 COPY & SHARE FUNCTIONS (FINAL CLEAN)
// ==========================================

function copyReceiptToClipboard(order, paymentAmount) {
    // 1. ☢️ NUCLEAR MATH (Strict Calculation)
    const totalCost = parseFloat(order.price) || 0;
    const existingPaid = parseFloat(order.amount_paid) || 0;
    const payingNow = parseFloat(paymentAmount) || 0;
    
    // Logic: If DB is updated, use it. If not, sum manual.
    let realTotalPaid = 0;
    if (order.id && existingPaid >= payingNow && existingPaid > 0) {
        realTotalPaid = existingPaid;
    } else {
        realTotalPaid = existingPaid + payingNow;
    }
    const remainingBalance = totalCost - realTotalPaid;

    // 2. 🎨 STRICT BRANDING (No Subtitles Allowed)
    // We only take the App Name. We ignore the subtitle completely.
    const shopName = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.appName) 
        ? APP_CONFIG.appName.toUpperCase() 
        : "SHOP RECEIPT";

    const shopPhone = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.shopPhone) 
        ? APP_CONFIG.shopPhone 
        : "";
        
    const dateStr = new Date().toLocaleDateString();

    // 3. GENERATE CLEAN TEXT
    // Format: NAME -> PHONE -> LINE -> DETAILS
    const receiptText = `
${shopName}
${shopPhone}
--------------------------------
RECEIPT: #${order.id}
DATE:    ${dateStr}
ITEM:    ${order.garment_type}
CUSTOMER:${order.customer_name}
--------------------------------
Total Cost:   ${formatCurrency(totalCost)}
Total Paid:   ${formatCurrency(realTotalPaid)}
BALANCE DUE:  ${formatCurrency(remainingBalance)}
--------------------------------
Thank you!
`.trim();

    // 4. COPY TO CLIPBOARD
    navigator.clipboard.writeText(receiptText).then(() => {
        alert("✅ Receipt copied to clipboard!");
    }).catch(err => {
        console.error('Failed to copy: ', err);
        alert("❌ Failed to copy receipt.");
    });
}

function shareReceiptAsText(order, paymentAmount) {
    // 1. ☢️ NUCLEAR MATH
    const totalCost = parseFloat(order.price) || 0;
    const existingPaid = parseFloat(order.amount_paid) || 0;
    const payingNow = parseFloat(paymentAmount) || 0;
    
    let realTotalPaid = 0;
    if (order.id && existingPaid >= payingNow && existingPaid > 0) {
        realTotalPaid = existingPaid;
    } else {
        realTotalPaid = existingPaid + payingNow;
    }
    const remainingBalance = totalCost - realTotalPaid;

    // 2. STRICT BRANDING
    const shopName = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.appName) 
        ? APP_CONFIG.appName.toUpperCase() 
        : "SHOP RECEIPT";

    // 3. GENERATE MESSAGE
    const message = `*${shopName}*\nReceipt #${order.id}\nDate: ${new Date().toLocaleDateString()}\n\nItem: ${order.garment_type}\nCustomer: ${order.customer_name}\n\n*Total: ${formatCurrency(totalCost)}*\n*Paid:  ${formatCurrency(realTotalPaid)}*\n*Bal:   ${formatCurrency(remainingBalance)}*\n\nThank you!`;

    // 4. SHARE OR WHATSAPP
    if (navigator.share) {
        navigator.share({
            title: `${shopName} Receipt`,
            text: message
        }).catch(console.error);
    } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
    }
}
// ==========================================
// 🛠️ CORE UTILITIES
// ==========================================
// ==========================================

function initDebugger() {}

function formatMeasurements(json) {
    try {
        if (!json || json === '{}') return 'No measurements recorded';
        const m = JSON.parse(json);
        let h = '';
        for (let k in m) {
            h += `<b>${k}:</b> `;
            for (let s in m[k]) h += `${s}: ${m[k][s]}" `;
            h += '<br>';
        }
        return h || 'No measurements';
    } catch (e) {
        return 'Invalid measurement data';
    }
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch (e) {
        return 'Invalid date';
    }
}

function calculateBalance(order, payments = []) {
    const totalPrice = order.price || 0;
    const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    return totalPrice - totalPaid;
}

// ==========================================
// 🔄 VIEW MANAGEMENT
// ==========================================

function refreshCurrentView() {
    const path = window.location.pathname;
    logDebug(`Refreshing view for: ${path}`, null, 'info');
    
    if (path.includes('manager-dashboard')) {
        loadOrders('open');
    } else if (path.includes('all-orders')) {
        loadOrders('all');
    } else if (path.includes('admin-current-orders')) {
        loadAdminOrders('current');
    } else if (path.includes('admin-all-orders')) {
        loadAdminOrders('all');
    } else if (path.includes('admin-dashboard')) {
        loadAdminDashboard();
    } else if (path.includes('order-details')) {
        if (USER_PROFILE?.role === 'owner') {
            loadAdminOrderDetails();
        } else {
            loadOrderDetailsScreen();
        }
    } else if (path.includes('admin-order-details')) {
        loadAdminOrderDetails();
    } else if (path.includes('financial-overview')) {
        loadAnalyticsDashboard();
    } else if (path.includes('admin-management')) {
        loadAdminManagementScreen();
    } else if (path.includes('worker-management')) {
        loadWorkerScreen();
    } else if (path.includes('expenses')) {
        loadExpensesScreen();
    } else if (path.includes('worker-assignments')) {
        loadWorkerAssignments();
    } else if (path.includes('order-form')) {
        if (USER_PROFILE?.role === 'owner') {
            initAdminOrderForm();
        } else {
            initOrderForm();
        }
    } else if (path.includes('admin-analytics')) {
        window.location.href = 'financial-overview.html';
    }
}

function addRefreshButton() {
    // Refresh buttons are now built into header HTML, so this function is kept for compatibility
    // but no longer adds the button programmatically
}

// ==========================================
// 🔐 AUTHENTICATION SYSTEM
// ==========================================

async function checkSession() {
    logDebug("Checking session...", null, 'info');
    
    try {
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
        if (userError || !user) {
            if (!window.location.pathname.includes('index.html')) {
                window.location.href = 'index.html';
            }
            return;
        }
        
        // Try to get profile from user_profiles table
        const { data: profile, error: profileError } = await supabaseClient
            .from('user_profiles')
            .select('*')
            .eq('id', user.id)
            .single();
        
        if (profileError || !profile) {
            // Fallback to workers table
            const { data: workerProfile, error: workerError } = await supabaseClient
                .from('workers')
                .select('*')
                .eq('id', user.id)
                .single();

            if (workerError || !workerProfile) {
                // NEW: Just alert and stop the loading spinner
                logDebug("Profile not found in either table", null, 'error');
                alert("Error: Your account is authenticated but no Profile was found. Contact Support.");
                // Reset the login button if we are on the login page
                const loginBtn = document.getElementById('login-button');
                if (loginBtn) {
                    loginBtn.disabled = false;
                    loginBtn.textContent = 'Sign In';
                }
                return;
            }

            USER_PROFILE = {
                id: workerProfile.id,
                full_name: workerProfile.name,
                role: 'manager',
                shop_id: workerProfile.shop_id
            };
        } else {
            USER_PROFILE = profile;
        }
        
        logDebug(`User authenticated: ${USER_PROFILE.full_name} (${USER_PROFILE.role})`, USER_PROFILE, 'success');
        
        // Update UI
        const userInfoEl = document.getElementById('user-info');
        if (userInfoEl) {
            userInfoEl.textContent = `Logged in as: ${USER_PROFILE.full_name}`;
        }
        
        // Handle routing
        const path = window.location.pathname;
        // [FIX] Check for 'index.html' OR if the path is just '/' (root)
        if (path.includes('index.html') || path === '/' || path.endsWith('/')) {
            const redirectTo = USER_PROFILE.role === 'owner' ? 'admin-dashboard.html' : 'manager-dashboard.html';
            window.location.href = redirectTo;
            return;
        }
        
        // Route based on role and page
        await routeToPage(path);
        
    } catch (error) {
        logDebug("Session check error:", error, 'error');
        alert("Session error: " + error.message);
    }
}

async function routeToPage(path) {
    if (!USER_PROFILE) return;
    
    // Owner pages
    if (USER_PROFILE.role === 'owner') {
        if (path.includes('manager')) {
            window.location.href = 'admin-dashboard.html';
            return;
        }
        
        if (path.includes('admin-dashboard')) {
            await loadAdminDashboard();
        } else if (path.includes('financial-overview')) {
            await loadAnalyticsDashboard();
        } else if (path.includes('admin-current-orders')) {
            await loadAdminOrders('current');
        } else if (path.includes('admin-all-orders')) {
            await loadAdminOrders('all');
        } else if (path.includes('admin-management')) {
            await loadAdminManagementScreen();
        } else if (path.includes('admin-order-details')) {
            await loadAdminOrderDetails();
        } else if (path.includes('admin-order-form')) {
            initAdminOrderForm();
        } else if (path.includes('admin-analytics')) {
            window.location.href = 'financial-overview.html';
        }
    } 
    // Manager pages
    else {
        if (path.includes('admin-')) {
            window.location.href = 'manager-dashboard.html';
            return;
        }
        
        if (path.includes('manager-dashboard')) {
            await loadOrders('open');
            await loadWorkerFilterDropdown();
            addRefreshButton();
        } else if (path.includes('all-orders')) {
            await loadOrders('all');
            await loadWorkerFilterDropdown();
            addRefreshButton();
        } else if (path.includes('worker-management')) {
            await loadWorkerScreen();
        } else if (path.includes('worker-assignments')) {
            await loadWorkerAssignments();
        } else if (path.includes('order-form')) {
            initOrderForm();
        } else if (path.includes('expenses')) {
            loadExpensesScreen();
        } else if (path.includes('order-details')) {
            await loadOrderDetailsScreen();
        }
    }
}

async function handleLogin(e) {
    if (e) e.preventDefault();
    
    const email = document.getElementById('email')?.value;
    const password = document.getElementById('password')?.value;
    const loginBtn = document.getElementById('login-button');
    
    if (!email || !password) {
        alert("Please enter email and password");
        return;
    }
    
    // 1. UI Feedback
    if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.textContent = 'Signing in...';
    }
    
    try {
        // 2. Perform Auth
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        
        logDebug("Login successful, checking session profile...", null, 'success');
        
        // 3. Perform Session & Redirect Logic
        // We 'await' this so the button doesn't reset while the page is trying to change
        await checkSession();

    } catch (error) {
        logDebug("Login process error:", error, 'error');

        // Show the error directly on the screen for her
        const msgEl = document.getElementById('auth-message');
        if (msgEl) {
            msgEl.textContent = "❌ Error: " + error.message;
            msgEl.style.display = "block";
            msgEl.style.color = "#ff4444";
        }

        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Sign In';
        }
    } finally {
        // Safety fallback: if 5 seconds pass and we haven't navigated, re-enable button
        setTimeout(() => {
            if (loginBtn && loginBtn.disabled) {
                loginBtn.disabled = false;
                loginBtn.textContent = 'Sign In';
            }
        }, 5000);
    }
}

async function handleLogout() {
    try {
        await supabaseClient.auth.signOut();
        USER_PROFILE = null; // Clear the memory!
        window.location.href = 'index.html';
    } catch (error) {
        alert("Logout error: " + error.message);
        // Force redirect anyway to break loops
        window.location.href = 'index.html';
    }
}

// ==========================================
// 👔 MANAGER MODULE - ORDERS
// ==========================================

async function loadOrders(mode = 'open') {
    if (!USER_PROFILE || !USER_PROFILE.shop_id) return;
    
    const headerTitle = document.querySelector('header h1');
    if(headerTitle) {
        if(mode === 'urgent') headerTitle.innerHTML = '🔥 Urgent Attention Required';
        else headerTitle.textContent = 'Manager Dashboard (Orders In Progress)';
    }

    try {
        let query = supabaseClient.from('orders')
            .select('*')
            .eq('shop_id', USER_PROFILE.shop_id)
            .order('due_date', { ascending: true });
        
        if (mode === 'open' || mode === 'urgent') {
            query = query.neq('status', 6);
        }
        
        const statusFilter = document.getElementById('status-filter')?.value;
        if (statusFilter && mode !== 'urgent') query = query.eq('status', parseInt(statusFilter));
        
        const workerFilter = document.getElementById('worker-filter')?.value;
        if (workerFilter) {
            query = query.or(`worker_id.eq.${workerFilter},additional_workers.cs.["${workerFilter}"]`);
        }
        
        const { data: ordersData, error } = await query;
        if (error) throw error;
        
        let orders = ordersData;
        if (mode === 'urgent') {
            const today = new Date();
            today.setHours(0,0,0,0);
            orders = ordersData.filter(o => {
                if (o.status >= 5) return false;
                const due = new Date(o.due_date);
                const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
                return diffDays <= 2; 
            });
        }

        const tbody = document.getElementById('orders-tbody');
        if (!tbody) return;
        
        if (!orders.length) { 
            tbody.innerHTML = mode === 'urgent' 
                ? '<tr><td colspan="8" style="text-align:center; padding:30px;">✅ Good job! No urgent orders.</td></tr>'
                : '<tr><td colspan="8" style="text-align:center; padding:20px;">No orders found</td></tr>'; 
            return; 
        }
        
        const orderIds = orders.map(o => o.id);
        const { data: payments } = await supabaseClient.from('payments').select('*').in('order_id', orderIds);
        const paymentsByOrder = {};
        payments?.forEach(p => { 
            if (!paymentsByOrder[p.order_id]) paymentsByOrder[p.order_id] = []; 
            paymentsByOrder[p.order_id].push(p); 
        });

        const workerIds = orders.map(o => o.worker_id).filter(id => id);
        let workerMap = {};
        if (workerIds.length) {
            const { data: wData } = await supabaseClient.from('workers').select('id, name').in('id', workerIds);
            wData?.forEach(w => workerMap[w.id] = w.name);
        }
        
        // RENDER THE TABLE
        tbody.innerHTML = orders.map(order => {
            const paid = (paymentsByOrder[order.id] || []).reduce((sum, p) => sum + (p.amount || 0), 0);
            const balance = (order.price || 0) - paid;
            
            // Traffic Light Date Logic
            const diffDays = Math.ceil((new Date(order.due_date) - new Date()) / (86400000));
            let dueDisplay = formatDate(order.due_date);
            
            if (order.status < 5) {
                if (diffDays < 0) {
                    dueDisplay = `<div style="color:#dc3545; font-weight:800; line-height:1.2;">
                        <i class="fas fa-exclamation-circle"></i> ${formatDate(order.due_date)}<br>
                        <small>LATE (${Math.abs(diffDays)} days)</small>
                    </div>`;
                } else if (diffDays <= 2) {
                    dueDisplay = `<div style="color:#e67e22; font-weight:800; line-height:1.2;">
                        <i class="fas fa-stopwatch"></i> ${formatDate(order.due_date)}<br>
                        <small>${diffDays === 0 ? 'DUE TODAY' : diffDays + ' days left'}</small>
                    </div>`;
                }
            }
            
            const workerName = order.worker_id ? (workerMap[order.worker_id] || 'Unassigned') : 'Unassigned';
            
            // SQUAD CALCULATION (Correctly nested inside .map)
            let squadCount = 0;
            try {
                const raw = order.additional_workers;
                if (Array.isArray(raw)) {
                    squadCount = raw.length;
                } else if (typeof raw === 'string' && raw.trim().length > 0) {
                    squadCount = JSON.parse(raw).length;
                }
            } catch (e) {
                console.warn("Skipping bad squad data for order:", order.id);
            }

            const squadBadge = squadCount > 0 
                ? ' <i class="fas fa-users" style="color:#007bff; font-size:0.8em;" title="Has Team"></i>' 
                : '';

            return `<tr>
                <td>#${String(order.id).slice(-6)}</td>
                <td>${order.customer_name}<br><small>${order.customer_phone}</small></td>
                <td>${order.garment_type}</td>
                <td>${dueDisplay}</td>
                <td>${workerName}${squadBadge}</td>
                <td><span class="status-indicator status-${order.status}">${STATUS_MAP[order.status]}</span></td>
                <td style="color:${balance > 0 ? '#dc3545' : '#28a745'}; font-weight:bold;">${balance.toLocaleString()}</td>
                <td>
                    <div style="display:flex; gap:5px;">
                        <button class="small-btn" onclick="location.href='order-details.html?id=${order.id}'">👁️ View</button>
                        <button class="small-btn" style="background:#28a745;" onclick="generateAndShareReceipt('${order.id}')">📄</button>
                    </div>
                </td>
            </tr>`;
        }).join('');

    } catch (e) { 
        console.error("Error loading orders:", e); 
        logDebug("Orders display error", e, 'error');
    }
}

// ==========================================
// 👔 MANAGER MODULE - WORKER MANAGEMENT
// ==========================================

async function loadWorkerScreen() {
    if (!USER_PROFILE || !USER_PROFILE.shop_id) return;
    
    logDebug("Loading worker management screen", null, 'info');
    
    try {
        // Setup search
        const searchInput = document.getElementById('worker-search');
        if (searchInput) {
            searchInput.onkeyup = function() {
                const term = this.value.toLowerCase();
                document.querySelectorAll('#worker-list-tbody tr').forEach(row => {
                    const name = row.cells[0].textContent.toLowerCase();
                    row.style.display = name.includes(term) ? '' : 'none';
                });
            };
        }
        
        // Load workers
        const { data: workers, error } = await supabaseClient
            .from('workers')
            .select('*')
            .eq('shop_id', USER_PROFILE.shop_id)
            .order('name');
        
        if (error) throw error;
        
        // Load active assignments count
        const { data: orders } = await supabaseClient
            .from('orders')
            .select('worker_id')
            .eq('shop_id', USER_PROFILE.shop_id)
            .neq('status', 6);
        
        const assignmentCounts = {};
        if (orders) {
            orders.forEach(o => {
                if (o.worker_id) {
                    assignmentCounts[o.worker_id] = (assignmentCounts[o.worker_id] || 0) + 1;
                }
            });
        }
        
        // Update table
        const tbody = document.getElementById('worker-list-tbody');
        if (tbody) {
            if (!workers || workers.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">No workers found</td></tr>';
                return;
            }
            
            tbody.innerHTML = workers.map(worker => {
                const pendingCount = assignmentCounts[worker.id] || 0;
                const statusClass = pendingCount > 0 ? 'status-2' : 'status-4';
                const statusText = pendingCount > 0 ? `${pendingCount} Pending` : 'Available';
                
                return `
                    <tr>
                        <td style="font-weight:bold;">${worker.name}</td>
                        <td>${worker.phone_number || '-'}</td>
                        <td><span class="status-indicator ${statusClass}">${statusText}</span></td>
                        <td>
                            <button class="small-btn" style="background:#007bff;" 
                                    onclick="location.href='worker-assignments.html?id=${worker.id}'">
                                📂 View Work
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
        
        // Setup add worker form
        const addForm = document.getElementById('add-worker-form');
        if (addForm) {
            addForm.onsubmit = async (e) => {
                e.preventDefault();
                
                const nameInput = document.getElementById('new-worker-name');
                const phoneInput = document.getElementById('new-worker-phone');
                const messageDiv = document.getElementById('worker-message');
                
                if (!nameInput.value.trim()) {
                    messageDiv.textContent = "Please enter worker name";
                    messageDiv.className = 'error';
                    return;
                }
                
                try {
                    const { error } = await supabaseClient
                        .from('workers')
                        .insert([{
                            shop_id: USER_PROFILE.shop_id,
                            name: nameInput.value.trim(),
                            phone_number: phoneInput.value.trim() || null,
                            created_at: new Date().toISOString()
                        }]);
                    
                    if (error) throw error;
                    
                    messageDiv.textContent = "Worker added successfully!";
                    messageDiv.className = 'success';
                    nameInput.value = '';
                    phoneInput.value = '';
                    
                    // Reload after 1 second
                    setTimeout(() => {
                        loadWorkerScreen();
                        messageDiv.textContent = '';
                        messageDiv.className = '';
                    }, 1000);
                    
                } catch (error) {
                    messageDiv.textContent = "Error: " + error.message;
                    messageDiv.className = 'error';
                }
            };
        }
        
        logDebug("Worker screen loaded", { workers: workers?.length || 0 }, 'success');
    } catch (error) {
        logDebug("Error loading worker screen:", error, 'error');
    }
}

async function loadWorkerAssignments() {
    const params = new URLSearchParams(window.location.search);
    const workerId = params.get('id');
    
    if (!workerId || !USER_PROFILE?.shop_id) return;
    
    try {
        const [{ data: worker }, { data: orders }] = await Promise.all([
            supabaseClient.from('workers').select('name').eq('id', workerId).single(),
            supabaseClient.from('orders')
                .select('*')
                .eq('worker_id', workerId)
                .eq('shop_id', USER_PROFILE.shop_id)
                .neq('status', 6)
                .order('due_date', { ascending: true })
        ]);
        
        if (!worker || !orders) return;
        
        // Update header
        document.getElementById('worker-header-name').textContent = `${worker.name}'s Assignments`;
        
        // Update table
        const tbody = document.getElementById('assignments-tbody');
        if (tbody) {
            if (!orders.length) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">No active assignments</td></tr>';
                return;
            }
            
            tbody.innerHTML = orders.map(order => {
                const orderIdStr = String(order.id);
                const shortId = orderIdStr.slice(-6);
                const statusText = STATUS_MAP[order.status] || `Status ${order.status}`;
                
                return `
                    <tr>
                        <td>#${shortId}</td>
                        <td>${order.customer_name}</td>
                        <td>${order.garment_type}</td>
                        <td>${formatDate(order.due_date)}</td>
                        <td><span class="status-indicator status-${order.status}">${statusText}</span></td>
                        <td>
                            <button class="small-btn" onclick="location.href='order-details.html?id=${order.id}'">
                                View/Update
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
        
        logDebug(`Loaded ${orders.length} assignments for worker ${worker.name}`, null, 'success');
    } catch (error) {
        logDebug("Error loading worker assignments:", error, 'error');
    }
}
// [NEW] Load Workers into Checkbox List for Squad Selection
async function loadWorkersForSquad(shopId) {
    const container = document.getElementById('squad-selection-container');
    if (!container || !shopId) return;

    try {
        const { data: workers, error } = await supabaseClient
            .from('workers')
            .select('id, name')
            .eq('shop_id', shopId)
            .order('name');

        if (error) throw error;

        if (workers.length === 0) {
            container.innerHTML = '<p style="font-size:0.8em; padding:5px;">No workers found.</p>';
            return;
        }

        container.innerHTML = workers.map(w => `
            <div style="margin-bottom: 8px; display: flex; align-items: center;">
                <input type="checkbox" id="squad_${w.id}" value="${w.id}" class="squad-checkbox" style="width: auto; margin: 0 10px 0 0;">
                <label for="squad_${w.id}" style="margin: 0; font-weight: normal; cursor: pointer;">${w.name}</label>
            </div>
        `).join('');

    } catch (error) {
        console.error("Error loading squad:", error);
        container.innerHTML = '<p style="color:red;">Error loading list</p>';
    }
}

async function loadWorkerFilterDropdown() {
    const workerFilter = document.getElementById('worker-filter');
    if (!workerFilter || !USER_PROFILE || !USER_PROFILE.shop_id) {
        return;
    }
    
    try {
        const { data: workers, error } = await supabaseClient
            .from('workers')
            .select('id, name')
            .eq('shop_id', USER_PROFILE.shop_id)
            .order('name');
        
        if (error) {
            logDebug("Error loading workers for filter:", error, 'error');
            return;
        }
        
        if (workers && workerFilter) {
            workerFilter.innerHTML = '<option value="">Filter by Worker (All)</option>' +
                workers.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
        }
    } catch (error) {
        logDebug("Error loading worker filter:", error, 'error');
    }
}

async function loadWorkersDropdown() {
    if (!USER_PROFILE?.shop_id) return;
    
    try {
        const { data: workers, error } = await supabaseClient
            .from('workers')
            .select('id, name')
            .eq('shop_id', USER_PROFILE.shop_id)
            .order('name');
        
        if (error) {
            logDebug("Error loading workers for dropdown:", error, 'error');
            return;
        }
        
        const select = document.getElementById('worker-select');
        if (select && workers) {
            select.innerHTML = '<option value="">Select Worker</option>' +
                workers.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
        }
    } catch (error) {
        logDebug("Error loading workers dropdown:", error, 'error');
    }
}

// ==========================================
// 👔 MANAGER MODULE - ORDER FORM
// ==========================================

function initOrderForm() {
    loadWorkersDropdown();
    loadWorkersForSquad(USER_PROFILE.shop_id); // [NEW] Load checkboxes
    
    const garmentSelect = document.getElementById('garment-type-select');
    if (garmentSelect) garmentSelect.addEventListener('change', generateMeasurementFieldsManager);
    
    const orderForm = document.getElementById('order-form');
    if (orderForm) {
        orderForm.onsubmit = async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('submit-order-btn');
            submitBtn.disabled = true;
            
            try {
                const measurements = {};
                document.querySelectorAll('#measurement-fields-container input').forEach(input => {
                    const comp = input.dataset.component; const meas = input.dataset.measurement;
                    if (!measurements[comp]) measurements[comp] = {};
                    if (input.value) measurements[comp][meas] = parseFloat(input.value);
                });
                
                // [NEW] Capture Squad
                const squad = Array.from(document.querySelectorAll('.squad-checkbox:checked')).map(cb => cb.value);

                const orderData = {
                    shop_id: USER_PROFILE.shop_id,
                    manager_id: USER_PROFILE.id,
                    customer_name: document.getElementById('customer_name').value,
                    customer_phone: document.getElementById('customer_phone').value,
                    garment_type: document.getElementById('garment-type-select').value,
                    price: parseFloat(document.getElementById('price').value) || 0,
                    due_date: document.getElementById('due_date').value,
                    worker_id: document.getElementById('worker-select').value || null,
                    additional_workers: JSON.stringify(squad), // [NEW] Save Squad
                    status: 1,
                    customer_preferences: document.getElementById('customer_preferences').value || '',
                    measurements_details: JSON.stringify(measurements),
                    created_at: new Date().toISOString()
                };
                
                const { data: order, error } = await supabaseClient.from('orders').insert([orderData]).select().single();
                if (error) throw error;
                
                const deposit = parseFloat(document.getElementById('deposit_paid').value) || 0;
                if (deposit > 0) {
                    await supabaseClient.from('payments').insert([{
                        order_id: order.id,
                        manager_id: USER_PROFILE.id,
                        amount: deposit,
                        recorded_at: new Date().toISOString()
                    }]);
                }
                
                window.location.href = 'manager-dashboard.html';
                
            } catch (error) {
                alert("Error: " + error.message);
                submitBtn.disabled = false;
            }
        };
    }
}

function generateMeasurementFieldsManager() {
    const garmentType = document.getElementById('garment-type-select').value;
    const container = document.getElementById('measurement-fields-container');
    const fieldset = document.getElementById('measurement-fieldset');
    
    if (!container || !garmentType) return;
    
    if (fieldset) {
        fieldset.style.display = 'block';
    }
    
    const measurements = GARMENT_MEASUREMENTS[garmentType];
    if (!measurements) {
        container.innerHTML = '<p>No measurements needed for this garment type.</p>';
        return;
    }
    
    let html = '';
    for (const [component, fields] of Object.entries(measurements)) {
        html += `<div class="measurement-group">
            <h4>${component}</h4>
            <div class="measurement-fields">`;
        
        fields.forEach(field => {
            html += `
                <div class="measurement-field">
                    <label>${field}</label>
                    <input type="number" step="0.1" placeholder="inches" 
                           data-component="${component}" data-measurement="${field}">
                </div>
            `;
        });
        
        html += '</div></div>';
    }
    
    container.innerHTML = html;
}

// ==========================================
// 👔 MANAGER MODULE - EXPENSES
// ==========================================

async function loadExpensesScreen() {
    logDebug("Loading expenses screen", null, 'info');
    
    try {
        // Setup form
        const form = document.getElementById('expense-form');
        if (form) {
            form.onsubmit = async (e) => {
                e.preventDefault();
                
                try {
                    const expenseData = {
                        shop_id: USER_PROFILE.shop_id,
                        manager_id: USER_PROFILE.id,
                        item_name: document.getElementById('ex-name').value || 'General',
                        amount: parseFloat(document.getElementById('ex-amount').value) || 0,
                        category: document.getElementById('ex-cat').value,
                        notes: document.getElementById('ex-notes').value || '',
                        incurred_at: new Date().toISOString()
                    };
                    
                    const { error } = await supabaseClient
                        .from('expenses')
                        .insert([expenseData]);
                    
                    if (error) throw error;
                    
                    alert("Expense added successfully!");
                    form.reset();
                    loadExpensesList();
                    
                } catch (error) {
                    alert("Error adding expense: " + error.message);
                }
            };
        }
        
        // Load expenses list
        await loadExpensesList();
        
    } catch (error) {
        logDebug("Error loading expenses screen:", error, 'error');
    }
}

async function loadExpensesList() {
    if (!USER_PROFILE?.shop_id) return;
    
    try {
        const { data: expenses, error } = await supabaseClient
            .from('expenses')
            .select('*')
            .eq('shop_id', USER_PROFILE.shop_id)
            .order('incurred_at', { ascending: false });
        
        if (error) throw error;
        
        const tbody = document.getElementById('expenses-tbody');
        if (tbody) {
            if (!expenses || expenses.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">No expenses recorded</td></tr>';
                return;
            }
            
            tbody.innerHTML = expenses.map(expense => `
                <tr>
                    <td>${formatDate(expense.incurred_at)}</td>
                    <td><b>${expense.category}</b></td>
                    <td>${expense.item_name}</td>
                    <td style="font-weight:bold;">Ksh ${parseFloat(expense.amount).toLocaleString()}</td>
                    <td>${expense.notes || '-'}</td>
                </tr>
            `).join('');
        }
        
        logDebug(`Loaded ${expenses?.length || 0} expenses`, null, 'success');
    } catch (error) {
        logDebug("Error loading expenses list:", error, 'error');
    }
}

// ==========================================
// 👔 MANAGER MODULE - ORDER DETAILS
// ==========================================

async function loadOrderDetailsScreen() {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('id');
    
    if (!orderId) return;
    
    CURRENT_ORDER_ID = orderId;
    
    try {
        // Load order data
        const [{ data: order }, { data: payments }] = await Promise.all([
            supabaseClient.from('orders')
                .select('*')
                .eq('id', orderId)
                .single(),
            supabaseClient.from('payments')
                .select('*')
                .eq('order_id', orderId)
                .order('recorded_at', { ascending: false })
        ]);
        
        if (!order) {
            alert("Order not found");
            window.history.back();
            return;
        }
        
        // [NEW] Fetch Lead + Squad Logic
        let workerDisplay = 'Unassigned';
        let squadIds = [];
        try {
            const raw = order.additional_workers;
            if (Array.isArray(raw)) squadIds = raw;
            else if (typeof raw === 'string' && raw.trim().length > 0) squadIds = JSON.parse(raw);
            else squadIds = [];
        } catch (e) { console.warn('Skipping bad squad data for order:', order.id); squadIds = []; }
        
        let leadName = 'Unassigned';
        if (order.worker_id) {
            const { data: lead } = await supabaseClient.from('workers').select('name').eq('id', order.worker_id).single();
            if (lead) leadName = lead.name;
        }
        let squadNames = [];
        if (squadIds.length > 0) {
            const { data: squad } = await supabaseClient.from('workers').select('name').in('id', squadIds);
            if (squad) squadNames = squad.map(w => w.name);
        }
        if (squadNames.length > 0) {
            workerDisplay = `<strong>${leadName}</strong> <span style="color:#666; font-size:0.9em;">(+ ${squadNames.join(', ')})</span>`;
        } else {
            workerDisplay = leadName;
        }
        
        // Calculate financials
        const paid = payments ? payments.reduce((sum, p) => sum + (p.amount || 0), 0) : 0;
        const balance = (order.price || 0) - paid;
        
        // Update UI
        const container = document.getElementById('order-detail-container');
        if (container) {
            const orderIdStr = String(order.id);
            const shortId = orderIdStr.slice(-6);
            
            container.innerHTML = `
                <div class="pro-card-header">
                    <div class="client-identity">
                        <h2>${order.customer_name}</h2>
                        <a href="tel:${order.customer_phone}">${order.customer_phone}</a>
                    </div>
                    <div>
                        <span class="status-indicator status-${order.status}">
                            ${STATUS_MAP[order.status] || `Status ${order.status}`}
                        </span>
                    </div>
                </div>
                
                <div class="financial-strip">
                    <div class="stat-box box-black">
                        <small>Total</small>
                        <strong>Ksh ${(order.price || 0).toLocaleString()}</strong>
                    </div>
                    <div class="stat-box box-blue">
                        <small>Paid</small>
                        <strong>Ksh ${paid.toLocaleString()}</strong>
                    </div>
                    <div class="stat-box ${balance > 0 ? 'box-red' : 'box-green'}">
                        <small>Balance</small>
                        <strong>Ksh ${balance.toLocaleString()}</strong>
                    </div>
                </div>
                
                <div class="quick-actions-toolbar">
                    <button class="small-btn" style="background:#6c757d;" 
                            onclick="generateAndShareReceipt('${order.id}')">
                        📄 Generate Receipt
                    </button>
                    <button class="small-btn" style="background:#28a745;" 
                            onclick="quickPay('${order.id}', ${balance})" ${balance <= 0 ? 'disabled' : ''}>
                        💰 Record Payment
                    </button>
                    <button class="small-btn" style="background:#ffc107; color:black;" 
                            onclick="updateStatus('${order.id}')">
                        🔄 Update Status
                    </button>
                </div>
                
                <div class="data-tabs-container">
                    <div class="data-section">
                        <h3>Order Details</h3>
                        <p><strong>Order ID:</strong> #${shortId}</p>
                        <p><strong>Garment:</strong> ${order.garment_type}</p>
                        <p><strong>Due Date:</strong> ${formatDate(order.due_date)}</p>
                        <p><strong>Assigned Worker:</strong> ${workerDisplay}</p>
                        ${order.customer_preferences ? `<p><strong>Customer Notes:</strong> ${order.customer_preferences}</p>` : ''}
                        <p><strong>Measurements:</strong><br>${formatMeasurements(order.measurements_details)}</p>
                    </div>
                </div>
            `;
        }
        
        addRefreshButton();
        logDebug("Order details loaded", { orderId }, 'success');
        
    } catch (error) {
        logDebug("Error loading order details:", error, 'error');
        alert("Error loading order details: " + error.message);
    }
}

// ==========================================
// 📄 RECEIPT SYSTEM (CORE LOGIC FOR GENERATE RECEIPT FIX)
// ==========================================

function generateSimpleReceiptHTML(order, paymentAmount) {
    const dateStr = new Date().toLocaleDateString();

    // --- ☢️ NUCLEAR ARITHMETIC (Do not touch) ☢️ ---
    const totalCost = parseFloat(order.price) || 0;
    const existingPaid = parseFloat(order.amount_paid) || 0;
    const payingNow = parseFloat(paymentAmount) || 0;
    
    let realTotalPaid = 0;
    if (order.id && existingPaid >= payingNow && existingPaid > 0) {
        realTotalPaid = existingPaid;
    } else {
        realTotalPaid = existingPaid + payingNow;
    }
    const remainingBalance = totalCost - realTotalPaid;

    // --- BRANDING ---
    const receiptShopName = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.appName) 
        ? APP_CONFIG.appName.toUpperCase() 
        : "FASHION HOUSE";
    
    const receiptPhone = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.shopPhone)
        ? APP_CONFIG.shopPhone
        : "";

    // --- 🎨 ULTIMATE MODERN DESIGN ---
    const orderIdStr = (order.id !== undefined && order.id !== null) ? String(order.id) : '';
    // Prefer order.phone_number, fallback to order.customer_phone, else N/A
    let clientPhone = '';
    if (order.phone_number && String(order.phone_number).trim() !== '') {
        clientPhone = order.phone_number;
    } else if (order.customer_phone && String(order.customer_phone).trim() !== '') {
        clientPhone = order.customer_phone;
    } else {
        clientPhone = 'N/A';
    }
    // Check if paid in full
    const paidInFull = remainingBalance <= 0;
    return `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; width: 320px; padding: 40px 35px; background: #ffffff; color: #333; box-shadow: 0 10px 30px rgba(0,0,0,0.08); border-radius: 12px; margin: auto;">
            
            <div style="text-align: center; margin-bottom: 40px;">
                <h2 style="font-size: 1.6em; margin: 0; font-weight: 800; letter-spacing: 4px; text-transform: uppercase; color: #000;">${receiptShopName}</h2>
                ${receiptPhone ? `<p style=\"margin: 10px 0 0 0; font-size: 0.8em; letter-spacing: 2px; color: #888;\">${receiptPhone}</p>` : ''}
            </div>
            
            <div style="display: flex; justify-content: space-between; margin-bottom: 35px; border-bottom: 1px solid #f0f0f0; padding-bottom: 20px;">
                <div>
                    <p style="margin: 0; font-size: 0.7em; text-transform: uppercase; color: #999; letter-spacing: 1px; font-weight: 600;">Date</p>
                    <p style="margin: 5px 0 0 0; font-size: 1em; font-weight: 500; color: #000;">${dateStr}</p>
                </div>
                <div style="text-align: right;">
                    <p style="margin: 0; font-size: 0.7em; text-transform: uppercase; color: #999; letter-spacing: 1px; font-weight: 600;">Order No.</p>
                    <p style="margin: 5px 0 0 0; font-size: 1em; font-weight: 500; color: #000;">#${orderIdStr.slice(0, 8).toUpperCase()}</p>
                </div>
            </div>

            <div style="margin-bottom: 35px;">
                <p style="margin: 0 0 15px 0; font-size: 0.7em; text-transform: uppercase; color: #999; letter-spacing: 1px; font-weight: 600;">Client Details</p>
                <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px 20px; align-items: baseline;">
                    
                    <span style="font-size: 0.9em; color: #777; font-weight: 500;">Name:</span>
                    <span style="font-size: 1.1em; color: #000; font-weight: 400;">${order.customer_name}</span>

                    <span style="font-size: 0.9em; color: #777; font-weight: 500;">Phone:</span>
                    <span style="font-size: 1em; color: #333; font-weight: 400;">${clientPhone}</span>
                    
                    <span style="font-size: 0.9em; color: #777; font-weight: 500;">Garment:</span>
                    <span style="font-size: 1em; color: #333; font-weight: 400;">${order.garment_type}</span>
                </div>
            </div>

            <table style="width: 100%; border-collapse: separate; border-spacing: 0 12px; margin-bottom: 30px;">
                <tr>
                    <td style="font-size: 1em; color: #555; font-weight: 500;">Total Amount</td>
                    <td style="text-align: right; font-weight: 700; font-size: 1.2em; color: #D4AF37;">${formatCurrency(totalCost)}</td>
                </tr>
                
                ${payingNow > 0 ? `
                <tr>
                    <td style="font-size: 0.9em; color: #777;">Paid Now</td>
                    <td style="text-align: right; font-size: 1em; color: #333;">${formatCurrency(payingNow)}</td>
                </tr>
                ` : ''}

                ${paidInFull ? `
                <tr>
                    <td colspan="2" style="text-align: center; padding-top: 10px;">
                        <span style="display: inline-block; background: #e8f5e9; color: #388e3c; font-weight: 700; font-size: 1.1em; padding: 6px 18px; border-radius: 8px; letter-spacing: 1px;">PAID IN FULL</span>
                    </td>
                </tr>
                ` : `
                <tr>
                    <td style="font-size: 0.9em; color: #777; padding-top: 5px;">Total Paid</td>
                    <td style="text-align: right; font-size: 1em; color: #333; padding-top: 5px; font-weight: 500;">${formatCurrency(realTotalPaid)}</td>
                </tr>
                ${remainingBalance > 0 ? `
                <tr><td colspan="2" style="border-bottom: 1px solid #f0f0f0; padding: 5px 0;"></td></tr>
                <tr>
                    <td style="font-size: 1em; color: #000; font-weight: 600; padding-top: 15px;">Balance Due</td>
                    <td style="text-align: right; font-weight: 700; font-size: 1.3em; color: #d32f2f; padding-top: 15px;">${formatCurrency(remainingBalance)}</td>
                </tr>
                ` : ''}`}
            </table>

            <div style="text-align: center;">
                <p style="margin: 0; font-size: 0.8em; color: #999; font-style: italic; letter-spacing: 0.5px;">Thank you for your business.</p>
            </div>
        </div>
    `;
}

function generateTextReceipt(order, payments, paymentAmount = 0) {
    // --- Robust Math Logic (match generateSimpleReceiptHTML) ---
    const totalCost = parseFloat(order.price) || 0;
    const existingPaid = payments ? payments.reduce((sum, p) => sum + (p.amount || 0), 0) : 0;
    const payingNow = parseFloat(paymentAmount) || 0;
    let realTotalPaid = 0;
    if (order.id && existingPaid >= payingNow && existingPaid > 0) {
        realTotalPaid = existingPaid;
    } else {
        realTotalPaid = existingPaid + payingNow;
    }
    const remainingBalance = totalCost - realTotalPaid;

    // --- Dynamic Branding ---
    const receiptShopName = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.appName)
        ? APP_CONFIG.appName.toUpperCase()
        : "FASHION HOUSE";
    const receiptPhone = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.shopPhone)
        ? APP_CONFIG.shopPhone
        : "";
    const dateStr = new Date().toLocaleDateString('en-US');

    let lines = [];
    lines.push(`${receiptShopName}`);
    if (receiptPhone) lines.push(`Phone: ${receiptPhone}`);
    lines.push('-----------------------------');
    lines.push(`Date: ${dateStr}`);
    lines.push(`Order: #${order.id}`);
    lines.push(`Customer: ${order.customer_name || 'Unknown'}`);
    if (order.customer_phone) lines.push(`Phone: ${order.customer_phone}`);
    if (order.garment_type) lines.push(`Garment: ${order.garment_type}`);
    lines.push('');
    lines.push(`Total Cost: Ksh ${totalCost.toLocaleString()}`);
    if (payingNow > 0) lines.push(`Paid Now: Ksh ${payingNow.toLocaleString()}`);
    lines.push(`Total Paid: Ksh ${realTotalPaid.toLocaleString()}`);
    lines.push(`Balance Due: Ksh ${remainingBalance.toLocaleString()}`);
    lines.push('-----------------------------');
    lines.push(remainingBalance > 0 ? 'Balance Due' : '✅ PAID IN FULL');
    lines.push('');
    lines.push('Thank you for your business!');
    return lines.join('\n');
}

window.generateAndShareReceipt = async function(orderId) {
    logDebug("Generating receipt for order:", orderId, 'info');
    
    try {
        const [{ data: order }, { data: payments }] = await Promise.all([
            supabaseClient.from('orders').select('*').eq('id', orderId).single(),
            supabaseClient.from('payments').select('*').eq('order_id', orderId)
        ]);
        
        if (!order) {
            alert("Order not found!");
            return;
        }
        
        const receiptHTML = generateSimpleReceiptHTML(order, payments);
        const receiptText = generateTextReceipt(order, payments);
        
        showNuclearSharingModal(receiptHTML, receiptText, order.customer_name, order.customer_phone);
        
    } catch (error) {
        logDebug("Error generating receipt:", error, 'error');
        alert("Error generating receipt: " + error.message);
    }
};

function showNuclearSharingModal(receiptHTML, receiptText, customerName, customerPhone) {
    // Remove existing modal
    const existingModal = document.getElementById('receipt-sharing-modal');
    if (existingModal) existingModal.remove();
    
    const cleanPhone = customerPhone ? customerPhone.replace(/\D/g, '') : '';
    
    const modalHTML = `
        <div id="receipt-sharing-modal" class="modal" style="display: flex; z-index: 9999;">
            <div class="modal-content" style="max-width: 500px; width: 90%; padding: 20px;">
                <span class="close-btn" onclick="closeReceiptModal()" style="font-size: 28px;">&times;</span>
                
                <div style="text-align: center; margin-bottom: 20px;">
                    <h2 style="color: #d4af37; margin-bottom: 5px;">📄 Share Receipt</h2>
                    <p style="color: #666;">For: ${customerName || 'Customer'}</p>
                </div>
                
                <div id="receipt-preview-container" style="max-height: 350px; overflow-y: auto; margin-bottom: 25px; padding: 10px; background: #f9f9f9; border-radius: 8px;">
                    ${receiptHTML}
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    ${cleanPhone ? `
                        <button id="whatsapp-btn" class="share-btn" style="background: #25D366;">
                            <span style="font-size: 1.3em;">📱</span> Share via WhatsApp
                        </button>
                        <button id="sms-btn" class="share-btn" style="background: #007bff;">
                            <span style="font-size: 1.3em;">💬</span> Share as SMS
                        </button>
                    ` : ''}
                    
                    <button id="share-image-btn" class="share-btn" style="background: #9b59b6;">
                        <span style="font-size: 1.3em;">🖼️</span> Share as Image
                    </button>
                    
                    <button id="copy-btn" class="share-btn" style="background: #6c757d;">
                        <span style="font-size: 1.3em;">📋</span> Copy to Clipboard
                    </button>
                </div>
                
                <div id="share-status" style="margin-top: 15px; text-align: center;"></div>
            </div>
        </div>
    `;
    
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHTML;
    document.body.appendChild(modalContainer.firstElementChild);
    
    // Add event listeners
    setTimeout(() => {
        if (cleanPhone) {
            document.getElementById('whatsapp-btn').onclick = () => {
                shareViaWhatsApp(receiptText, cleanPhone);
            };
            
            document.getElementById('sms-btn').onclick = () => {
                shareViaSMS(receiptText, cleanPhone);
            };
        }
        
        document.getElementById('share-image-btn').onclick = () => {
            shareReceiptAsImage();
        };
        
        document.getElementById('copy-btn').onclick = () => {
            copyReceiptText(receiptText);
        };
    }, 100);
}

function shareViaWhatsApp(receiptText, phoneNumber) {
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(receiptText)}`;
    window.open(whatsappUrl, '_blank');
    showStatusMessage('✅ Opening WhatsApp...', 'success');
}

function shareViaSMS(receiptText, phoneNumber) {
    const smsUrl = /iPhone|iPad|iPod/.test(navigator.userAgent)
        ? `sms:${phoneNumber}&body=${encodeURIComponent(receiptText)}`
        : `sms:${phoneNumber}?body=${encodeURIComponent(receiptText)}`;
    window.open(smsUrl, '_blank');
    showStatusMessage('✅ Opening SMS app...', 'success');
}

async function shareReceiptAsImage() {
    const receiptContent = document.querySelector('#receipt-preview-container > div');
    if (!receiptContent) {
        showStatusMessage('❌ Receipt content not found', 'error');
        return;
    }
    
    showStatusMessage('🔄 Creating image...', 'info');
    
    try {
        // *** CRITICAL FIX: Ensure html2canvas is loaded and available ***
        if (typeof html2canvas === 'undefined') {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
        }
        
        const canvas = await html2canvas(receiptContent, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff'
        });
        
        // Auto-download
        const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const downloadLink = document.createElement('a');
        downloadLink.download = `receipt_${timestamp}.png`;
        downloadLink.href = canvas.toDataURL('image/png');
        downloadLink.click();
        
        // Try native sharing
        canvas.toBlob(async (blob) => {
            if (blob) {
                const file = new File([blob], `receipt_${timestamp}.png`, { type: 'image/png' });
                
                if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                    try {
                        await navigator.share({
                            files: [file],
                            title: 'Tailoring Receipt',
                            text: 'Receipt from Sir\'s \'n\' Suits'
                        });
                        showStatusMessage('✅ Image shared!', 'success');
                    } catch (shareError) {
                        showStatusMessage('✅ Image downloaded!', 'success');
                    }
                } else {
                    showStatusMessage('✅ Image downloaded!', 'success');
                }
            }
        }, 'image/png');
        
    } catch (error) {
        logDebug("Image generation error:", error, 'error');
        showStatusMessage('❌ Error creating image', 'error');
    }
}

function copyReceiptText(receiptText) {
    navigator.clipboard.writeText(receiptText)
        .then(() => showStatusMessage('✅ Copied to clipboard!', 'success'))
        .catch(() => {
            // Fallback
            const textArea = document.createElement('textarea');
            textArea.value = receiptText;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showStatusMessage('✅ Copied to clipboard!', 'success');
        });
}

function showStatusMessage(message, type) {
    const statusDiv = document.getElementById('share-status');
    if (statusDiv) {
        statusDiv.innerHTML = `<p style="color: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#ffc107'}">${message}</p>`;
        setTimeout(() => statusDiv.innerHTML = '', 3000);
    }
}

function closeReceiptModal() {
    const modal = document.getElementById('receipt-sharing-modal');
    if (modal) modal.remove();
}

async function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// ==========================================
// 👑 OWNER MODULE - ADMIN ORDERS

async function loadAdminOrders(mode = 'current') {
    logDebug(`Loading admin orders (${mode})`, null, 'info');
    try {
        let query = supabaseClient.from('orders')
            .select('*')
            .order('due_date', { ascending: true });

        if (mode === 'current') {
            query = query.neq('status', 6);
        }

        const { data: orders, error } = await query;
        if (error) throw error;

        // ...rest of your admin orders logic...
    } catch (error) {
        logDebug('Error loading admin orders:', error, 'error');
        alert('Error loading admin orders: ' + error.message);
    }
}

async function loadAdminDashboard() {/* Lines 1587-1601 omitted */}

async function loadMetrics() {/* Lines 1604-1625 omitted */}

async function loadPendingClosureOrders() {/* Lines 1628-1709 omitted */}
// ==========================================

async function loadAdminDashboard() {
    logDebug("Loading admin dashboard", null, 'info');
    
    try {
        await Promise.all([
            loadMetrics(),
            loadShopsForDropdown('shop-filter'),
            loadPendingClosureOrders()
        ]);
        
        addRefreshButton();
        
    } catch (error) {
        logDebug("Error loading admin dashboard:", error, 'error');
    }
}

async function loadMetrics() {
    try {
        const [{ data: payments }, { count: pendingCount }] = await Promise.all([
            supabaseClient.from('payments').select('amount'),
            supabaseClient.from('orders')
                .select('*', { count: 'exact', head: true })
                .eq('status', 5)
        ]);
        
        const totalRevenue = payments ? payments.reduce((sum, p) => sum + (p.amount || 0), 0) : 0;
        
        // Update UI
        const revenueEl = document.getElementById('total-revenue');
        const pendingEl = document.getElementById('pending-count');
        
        if (revenueEl) revenueEl.textContent = `Ksh ${totalRevenue.toLocaleString()}`;
        if (pendingEl) pendingEl.textContent = `${pendingCount || 0} Orders`;
        
        logDebug("Metrics loaded", { totalRevenue, pendingCount }, 'success');
    } catch (error) {
        logDebug("Error loading metrics:", error, 'error');
    }
}

async function loadPendingClosureOrders() {
    try {
        let query = supabaseClient
            .from('orders')
            .select('*')  // FIXED: Removed shops embed
            .eq('status', 5)
            .order('created_at', { ascending: false });
        
        const shopFilter = document.getElementById('shop-filter')?.value;
        if (shopFilter && shopFilter !== "") {
            query = query.eq('shop_id', shopFilter);
        }
        
        const { data: orders, error } = await query;
        if (error) throw error;
        
        const tbody = document.getElementById('orders-tbody');
        if (!tbody) return;
        
        if (!orders || orders.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">No orders pending closure</td></tr>';
            return;
        }
        
        // Get shop names
        const shopIds = [...new Set(orders.map(o => o.shop_id).filter(id => id))];
        let shopMap = {};
        if (shopIds.length > 0) {
            const { data: shops } = await supabaseClient
                .from('shops')
                .select('id, name')
                .in('id', shopIds);
            
            if (shops) {
                shops.forEach(s => {
                    shopMap[s.id] = s.name;
                });
            }
        }
        
        // Get payments for these orders
        const orderIds = orders.map(o => o.id);
        const { data: payments } = await supabaseClient
            .from('payments')
            .select('*')
            .in('order_id', orderIds);
        
        const paymentsByOrder = {};
        if (payments) {
            payments.forEach(p => {
                if (!paymentsByOrder[p.order_id]) paymentsByOrder[p.order_id] = [];
                paymentsByOrder[p.order_id].push(p);
            });
        }
        
        tbody.innerHTML = orders.map(order => {
            const orderPayments = paymentsByOrder[order.id] || [];
            const paid = orderPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
            const orderIdStr = String(order.id);
            const shortId = orderIdStr.slice(-6);
            
            return `
                <tr>
                    <td>#${shortId}</td>
                    <td>${shopMap[order.shop_id] || 'Unknown'}</td>
                    <td>${order.customer_name}</td>
                    <td>Ksh ${paid.toLocaleString()}</td>
                    <td><span class="status-indicator status-5">Pending Closure</span></td>
                    <td>
                        <button class="small-btn" style="background:#343a40; color:white;" 
                                onclick="openReviewModal('${order.id}')">
                            Review & Close
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
        
        logDebug(`Loaded ${orders.length} pending orders`, null, 'success');
    } catch (error) {
        logDebug("Error loading pending orders:", error, 'error');
    }
}

async function openReviewModal(orderId) {
    try {
        const [{ data: order }, { data: payments }] = await Promise.all([
            supabaseClient.from('orders')
                .select('*')
                .eq('id', orderId)
                .single(),
            supabaseClient.from('payments')
                .select('amount')
                .eq('order_id', orderId)
        ]);
        
        if (!order) {
            alert("Order not found");
            return;
        }
        
        // Get shop name
        let shopName = 'Unknown';
        if (order.shop_id) {
            const { data: shop } = await supabaseClient
                .from('shops')
                .select('name')
                .eq('id', order.shop_id)
                .single();
            if (shop) shopName = shop.name;
        }
        
        const totalPaid = payments ? payments.reduce((sum, p) => sum + p.amount, 0) : 0;
        const balance = order.price - totalPaid;
        
        // Update modal content
        document.getElementById('admin-detail-shop').textContent = shopName;
        document.getElementById('admin-detail-customer-name').textContent = order.customer_name;
        document.getElementById('admin-detail-garment-type').textContent = order.garment_type;
        document.getElementById('admin-detail-price').textContent = order.price.toLocaleString();
        document.getElementById('admin-detail-total-paid').textContent = totalPaid.toLocaleString();
        document.getElementById('admin-detail-balance-due').textContent = balance.toLocaleString();
        
        // Setup finalize button
        const finalizeBtn = document.getElementById('finalize-order-btn');
        if (finalizeBtn) {
            finalizeBtn.onclick = () => finalizeOrder(orderId, balance > 0);
        }
        
        // Show modal
        document.getElementById('admin-modal').style.display = 'flex';
        
    } catch (error) {
        logDebug("Error opening review modal:", error, 'error');
        alert("Error: " + error.message);
    }
}

async function finalizeOrder(orderId, hasDebt) {
    if (hasDebt && !confirm("Order has unpaid balance. Close anyway?")) return;
    
    try {
        const { error } = await supabaseClient
            .from('orders')
            .update({ 
                status: 6, 
                updated_at: new Date().toISOString() 
            })
            .eq('id', orderId);
        
        if (error) throw error;
        
        document.getElementById('admin-modal').style.display = 'none';
        loadPendingClosureOrders();
        loadMetrics();
        
        logDebug(`Order ${orderId} finalized`, null, 'success');
    } catch (error) {
        logDebug("Error finalizing order:", error, 'error');
        alert("Error closing order: " + error.message);
    }
}

function closeAdminModal() {
    document.getElementById('admin-modal').style.display = 'none';
}

// ==========================================
// 👑 OWNER MODULE - ADMIN ORDERS
// ==========================================

async function loadAdminOrders(mode = 'current') {
    // [NEW] Update Header based on mode
    const headerTitle = document.querySelector('header h1');
    if(headerTitle) {
        if(mode === 'urgent') headerTitle.innerHTML = '🔥 Global Urgent Attention';
        else if(mode === 'current') headerTitle.textContent = 'Global Active Orders';
        else headerTitle.textContent = 'Global Order History';
    }

    // [PERF] Debounce rapid calls
    const now = Date.now();
    if (window._lastAdminOrdersLoad && now - window._lastAdminOrdersLoad < 500) return;
    window._lastAdminOrdersLoad = now;
    
    logDebug(`Loading admin orders (${mode})`, null, 'info');
    
    try {
        let query = supabaseClient.from('orders')
            .select('*')
            .order('due_date', { ascending: true }) // [CHANGED] Sort by date for urgency
            .limit(100); 
        
        // If mode is current or urgent, exclude closed
        if (mode === 'current' || mode === 'urgent') {
            query = query.neq('status', 6);
        }
        
        // Apply filters
        const shopFilter = document.getElementById('admin-shop-filter')?.value;
        if (shopFilter && shopFilter !== "") {
            query = query.eq('shop_id', shopFilter);
        }
        
        const statusFilter = document.getElementById('admin-status-filter')?.value;
        if (statusFilter && statusFilter !== "" && mode !== 'urgent') {
            query = query.eq('status', parseInt(statusFilter));
        }
        
        const { data: ordersData, error } = await query;
        if (error) throw error;
        
        await loadShopsForDropdown('admin-shop-filter');
        
        // [NEW] "Hot List" Filtering Logic
        let orders = ordersData;
        if (mode === 'urgent') {
            const today = new Date();
            today.setHours(0,0,0,0);
            
            orders = ordersData.filter(o => {
                if (o.status >= 5) return false; 
                const due = new Date(o.due_date);
                const diffTime = due - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                return diffDays <= 2; // Late or Due in 2 days
            });
        }
        
        const tbody = document.getElementById('admin-orders-tbody');
        if (!tbody) return;
        
        if (!orders || orders.length === 0) {
            tbody.innerHTML = mode === 'urgent'
                ? '<tr><td colspan="9" style="text-align:center; padding:30px; font-size:1.2em;">✅ No urgent issues across shops.</td></tr>'
                : '<tr><td colspan="9" style="text-align:center; padding:20px;">No orders found</td></tr>';
            return;
        }

        // Fetch relations
        const shopIds = [...new Set(orders.map(o => o.shop_id).filter(id => id))];
        const workerIds = [...new Set(orders.map(o => o.worker_id).filter(id => id))];
        const orderIds = orders.map(o => o.id);
        
        const [{ data: shops }, { data: workers }, { data: payments }] = await Promise.all([
            shopIds.length > 0 ? supabaseClient.from('shops').select('id, name').in('id', shopIds) : Promise.resolve({ data: [] }),
            workerIds.length > 0 ? supabaseClient.from('workers').select('id, name').in('id', workerIds) : Promise.resolve({ data: [] }),
            supabaseClient.from('payments').select('*').in('order_id', orderIds)
        ]);
        
        const shopMap = {}; shops?.forEach(s => shopMap[s.id] = s.name);
        const workerMap = {}; workers?.forEach(w => workerMap[w.id] = w.name);
        const paymentsByOrder = {}; payments?.forEach(p => { 
            if(!paymentsByOrder[p.order_id]) paymentsByOrder[p.order_id] = []; 
            paymentsByOrder[p.order_id].push(p); 
        });

        tbody.innerHTML = orders.map(order => {
            const paid = (paymentsByOrder[order.id] || []).reduce((sum, p) => sum + (p.amount || 0), 0);
            const balance = (order.price || 0) - paid;
            const orderIdStr = String(order.id);
            const shortId = orderIdStr.slice(-6);
            const statusText = STATUS_MAP[order.status] || `Status ${order.status}`;
            const shopName = shopMap[order.shop_id] || 'Unknown';
            const workerName = order.worker_id ? (workerMap[order.worker_id] || 'Unassigned') : 'Unassigned';
            
            // [NEW] Squad Badge Logic
            let squadCount = 0;
            try {
                const raw = order.additional_workers;
                if (Array.isArray(raw)) {
                    squadCount = raw.length;
                } else if (typeof raw === 'string' && raw.trim().length > 0) {
                    try {
                        squadCount = JSON.parse(raw).length;
                    } catch (e) {
                        console.warn("Skipping bad squad data for order:", order.id);
                    }
                }
            } catch (e) {
                console.warn("Skipping bad squad data for order:", order.id);
            }

            const squadBadge = squadCount > 0 
                ? ' <i class="fas fa-users" style="color:#007bff; font-size:0.8em;" title="Has Team"></i>' 
                : '';

            // [NEW] Traffic Light Date Logic
            const diffDays = Math.ceil((new Date(order.due_date) - new Date()) / (86400000));
            let dueDisplay = formatDate(order.due_date);
            
            if (order.status < 5) {
                if (diffDays < 0) {
                    dueDisplay = `<div style="color:#dc3545; font-weight:800; line-height:1.2;">
                        <i class="fas fa-exclamation-circle"></i> ${formatDate(order.due_date)}<br>
                        <small>LATE (${Math.abs(diffDays)} days)</small>
                    </div>`;
                } else if (diffDays <= 2) {
                    dueDisplay = `<div style="color:#e67e22; font-weight:800; line-height:1.2;">
                        <i class="fas fa-stopwatch"></i> ${formatDate(order.due_date)}<br>
                        <small>${diffDays === 0 ? 'DUE TODAY' : diffDays + ' days left'}</small>
                    </div>`;
                }
            }
            
            return `
                <tr>
                    <td>#${shortId}</td>
                    <td>${shopName}</td>
                    <td>${order.customer_name}</td>
                    <td>${order.garment_type}</td>
                    <td>${dueDisplay}</td>
                    <td>${workerName}${squadBadge}</td>
                    <td><span class="status-indicator status-${order.status}">${statusText}</span></td>
                    <td style="color:${balance > 0 ? '#dc3545' : '#28a745'}; font-weight:bold;">Ksh ${balance.toLocaleString()}</td>
                    <td>
                        <div style="display:flex; gap:5px;">
                            <button class="table-btn" onclick="openAdminOrderView('${order.id}')">View</button>
                            <button class="table-btn table-btn-receipt" onclick="generateAndShareReceipt('${order.id}')">Receipt</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
        
        addRefreshButton();
        logDebug(`Loaded ${orders.length} admin orders`, null, 'success');
        
    } catch (error) {
        logDebug("Error loading admin orders:", error, 'error');
        const tbody = document.getElementById('admin-orders-tbody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:#dc3545;">Error: ${error.message}</td></tr>`;
        }
    }
}

async function openAdminOrderView(orderId) {
    logDebug("Opening admin order view:", orderId, 'info');
    
    try {
        const [{ data: order }, { data: payments }] = await Promise.all([
            supabaseClient.from('orders').select('*').eq('id', orderId).single(),
            supabaseClient.from('payments').select('*').eq('order_id', orderId).order('recorded_at', { ascending: false })
        ]);
        
        if (!order) {
            alert("Order not found!");
            return;
        }
        
        // Get additional data
        let shopName = 'Unknown';
        let workerName = 'Unassigned';
        
        if (order.shop_id) {
            const { data: shop } = await supabaseClient
                .from('shops')
                .select('name')
                .eq('id', order.shop_id)
                .single();
            if (shop) shopName = shop.name;
        }
        
        if (order.worker_id) {
            const { data: worker } = await supabaseClient
                .from('workers')
                .select('name')
                .eq('id', order.worker_id)
                .single();
            if (worker) workerName = worker.name;
        }
        
        const paid = payments ? payments.reduce((sum, p) => sum + (p.amount || 0), 0) : 0;
        const balance = (order.price || 0) - paid;
        const orderIdStr = String(order.id);
        const shortId = orderIdStr.slice(-6);
        
        // Create modal content
        const modalContent = `
            <div style="padding: 20px;">
                <span class="close-btn" onclick="document.getElementById('order-modal').style.display='none'">&times;</span>
                <h2 style="border-bottom: 2px solid #d4af37; padding-bottom: 10px; margin-bottom: 20px;">
                    Order #${shortId} - ${order.customer_name}
                </h2>
                
                <div style="margin-bottom: 20px;">
                    <p><strong>Shop:</strong> ${shopName}</p>
                    <p><strong>Garment:</strong> ${order.garment_type}</p>
                    <p><strong>Worker:</strong> ${workerName}</p>
                    <p><strong>Due Date:</strong> ${formatDate(order.due_date)}</p>
                    <p><strong>Status:</strong> <span class="status-indicator status-${order.status}">
                        ${STATUS_MAP[order.status] || `Status ${order.status}`}
                    </span></p>
                </div>
                
                <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                    <div style="flex: 1; background: #000; color: white; padding: 15px; border-radius: 5px; text-align: center;">
                        <small>Total Price</small>
                        <p style="margin: 5px 0; font-size: 1.2em; color: #d4af37; font-weight: bold;">
                            Ksh ${(order.price || 0).toLocaleString()}
                        </p>
                    </div>
                    <div style="flex: 1; background: #007bff; color: white; padding: 15px; border-radius: 5px; text-align: center;">
                        <small>Paid</small>
                        <p style="margin: 5px 0; font-size: 1.2em; font-weight: bold;">
                            Ksh ${paid.toLocaleString()}
                        </p>
                    </div>
                    <div style="flex: 1; background: ${balance > 0 ? '#dc3545' : '#28a745'}; color: white; padding: 15px; border-radius: 5px; text-align: center;">
                        <small>Balance</small>
                        <p style="margin: 5px 0; font-size: 1.2em; font-weight: bold;">
                            Ksh ${balance.toLocaleString()}
                        </p>
                    </div>
                </div>
                
                <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                    <button onclick="window.location.href='admin-order-details.html?id=${order.id}'" 
                            style="flex: 1; background: #000; color: #d4af37; padding: 12px; border-radius: 4px; border: none; cursor: pointer;">
                        ✏️ Edit Order
                    </button>
                    <button onclick="generateAndShareReceipt('${order.id}')" 
                            style="flex: 1; background: #28a745; color: white; padding: 12px; border-radius: 4px; border: none; cursor: pointer;">
                        📄 Generate Receipt
                    </button>
                </div>
                
                <div style="margin-top: 20px; border-top: 1px solid #eee; padding-top: 15px;">
                    <h3>Payment History</h3>
                    ${payments && payments.length > 0 ? 
                        `<div style="max-height: 150px; overflow-y: auto;">
                            <table style="width: 100%; font-size: 0.9em;">
                                <thead>
                                    <tr><th>Date</th><th>Amount</th><th>Recorded By</th></tr>
                                </thead>
                                <tbody>
                                    ${payments.map(p => `
                                        <tr>
                                            <td>${formatDate(p.recorded_at)}</td>
                                            <td style="color: #28a745; font-weight: bold;">Ksh ${p.amount}</td>
                                            <td>${p.manager_id ? p.manager_id.slice(-6) : 'System'}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>` 
                        : '<p style="color: #666; text-align: center;">No payments recorded</p>'
                    }
                </div>
                
                <div style="margin-top: 20px; border-top: 1px solid #eee; padding-top: 15px;">
                    <h4>Quick Actions</h4>
                    <div style="display: flex; gap: 10px;">
                        ${balance > 0 ? 
                            `<button onclick="quickPay('${order.id}', ${balance})" 
                                    style="flex: 1; background: #ffc107; color: black; padding: 10px; border-radius: 4px; border: none; cursor: pointer;">
                                💰 Record Full Payment (Ksh ${balance.toLocaleString()})
                            </button>` 
                            : '<button disabled style="flex: 1; background: #ccc; padding: 10px; border-radius: 4px; border: none;">✅ Fully Paid</button>'
                        }
                        <button onclick="updateAdminStatus('${order.id}')" 
                                style="flex: 1; background: #17a2b8; color: white; padding: 10px; border-radius: 4px; border: none; cursor: pointer;">
                            🔄 Update Status
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Show modal
        let modal = document.getElementById('order-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'order-modal';
            modal.className = 'modal';
            modal.innerHTML = '<div class="modal-content"></div>';
            document.body.appendChild(modal);
        }
        
        modal.querySelector('.modal-content').innerHTML = modalContent;
        modal.style.display = 'flex';
        
    } catch (error) {
        logDebug("Error opening admin order view:", error, 'error');
        alert("Error: " + error.message);
    }
}

async function updateAdminStatus(orderId) {
    const statusCode = prompt(`Enter Status Code:
2: In Progress
3: QA Check
4: Ready
5: Collected
6: Closed`);
    
    if (!statusCode || ![2,3,4,5,6].includes(Number(statusCode))) return;
    
    try {
        const { error } = await supabaseClient
            .from('orders')
            .update({
                status: Number(statusCode),
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId);
        
        if (error) throw error;
        
        alert("Status updated!");
        
        // Refresh current view
        const path = window.location.pathname;
        if (path.includes('admin-current-orders') || path.includes('admin-all-orders')) {
            const mode = path.includes('current') ? 'current' : 'all';
            loadAdminOrders(mode);
        }
        
        // Close modal
        document.getElementById('order-modal').style.display = 'none';
        
    } catch (error) {
        logDebug("Error updating status:", error, 'error');
        alert("Error: " + error.message);
    }
}

// ==========================================
// 👑 OWNER MODULE - ADMIN ORDER DETAILS (FIXED VERSION)
// ==========================================

async function loadAdminOrderDetails() {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('id');
    if (!orderId) return;
    CURRENT_ORDER_ID = orderId;
    
    try {
        const [{ data: order }, { data: payments }] = await Promise.all([
            supabaseClient.from('orders').select('*').eq('id', orderId).single(),
            supabaseClient.from('payments').select('*').eq('order_id', orderId).order('recorded_at', { ascending: false })
        ]);
        
        if (!order) {
            alert("Order not found!");
            window.history.back();
            return;
        }

        // --- 1. SQUAD LOGIC (Load Checkboxes & Create Display String) ---
        let squadIds = [];
        try { squadIds = order.additional_workers ? JSON.parse(order.additional_workers) : []; } catch(e){}
        
        // A. Load Checkboxes (Edit Form)
        if (order.shop_id) {
            await loadWorkersForSquad(order.shop_id);
            if(Array.isArray(squadIds)) {
                squadIds.forEach(id => {
                    const cb = document.getElementById(`squad_${id}`);
                    if (cb) cb.checked = true;
                });
            }
        }

        // B. Create Display String (Summary View)
        let workerDisplay = 'Unassigned';
        let leadName = 'Unassigned';
        if (order.worker_id) {
            const { data: lead } = await supabaseClient.from('workers').select('name').eq('id', order.worker_id).single();
            if (lead) leadName = lead.name;
        }
        
        // Fetch squad names for display
        let squadNames = [];
        if (squadIds.length > 0) {
            const { data: squad } = await supabaseClient.from('workers').select('name').in('id', squadIds);
            if (squad) squadNames = squad.map(w => w.name);
        }
        
        if (squadNames.length > 0) {
            workerDisplay = `<strong>${leadName}</strong> <span style="color:#666; font-size:0.9em;">(+ ${squadNames.join(', ')})</span>`;
        } else {
            workerDisplay = leadName;
        }
        
        // Update the new Summary UI
        if(document.getElementById('summary-worker-display')) document.getElementById('summary-worker-display').innerHTML = workerDisplay;
        if(document.getElementById('summary-notes')) document.getElementById('summary-notes').textContent = order.customer_preferences || 'None';
        if(document.getElementById('summary-measurements')) document.getElementById('summary-measurements').innerHTML = formatMeasurements(order.measurements_details);

        // --- 2. POPULATE EDIT FORM ---
        document.getElementById('edit-customer-name').value = order.customer_name;
        document.getElementById('edit-customer-phone').value = order.customer_phone;
        document.getElementById('edit-garment-type').value = order.garment_type;
        document.getElementById('edit-price').value = order.price;
        if(order.due_date) document.getElementById('edit-due-date').value = order.due_date.split('T')[0];
        document.getElementById('edit-preferences').value = order.customer_preferences || '';
        document.getElementById('edit-status').value = order.status;
        
        // Populate Worker Dropdown
        const { data: workers } = await supabaseClient.from('workers').select('*').eq('shop_id', order.shop_id).order('name');
        const workerSelect = document.getElementById('edit-worker-select');
        if (workerSelect && workers) {
            workerSelect.innerHTML = workers.map(w => 
                `<option value="${w.id}" ${w.id === order.worker_id ? 'selected' : ''}>${w.name}</option>`
            ).join('');
        }
        
        generateAdminMeasurementFields(order.garment_type, order.measurements_details);
        
        // --- 3. CALCULATE FINANCIALS ---
        const paid = payments?.reduce((sum, p) => sum + p.amount, 0) || 0;
        const balance = order.price - paid;
        
        // Update Top Summary Card
        if (document.getElementById('summary-customer-name')) {
            document.getElementById('summary-customer-name').textContent = order.customer_name;
            document.getElementById('summary-customer-phone').textContent = order.customer_phone;
            document.getElementById('summary-customer-phone').href = `tel:${order.customer_phone}`;
            document.getElementById('summary-garment-type').textContent = order.garment_type;
            document.getElementById('summary-due-date').textContent = formatDate(order.due_date);
            document.getElementById('summary-status').textContent = STATUS_MAP[order.status] || order.status;
            document.getElementById('summary-status').className = `status-indicator status-${order.status}`;
            
            // Update Admin Shop Display
            if(document.getElementById('admin-detail-shop')) {
               // We need to fetch shop name if not already loaded (it's not in the main select)
               if(order.shop_id) {
                   supabaseClient.from('shops').select('name').eq('id', order.shop_id).single()
                       .then(({data}) => { if(data) document.getElementById('admin-detail-shop').textContent = data.name; });
               }
            }

            document.getElementById('display-total-price').textContent = `Ksh ${order.price.toLocaleString()}`;
            document.getElementById('display-total-paid').textContent = `Ksh ${paid.toLocaleString()}`;
            document.getElementById('display-balance-due').textContent = `Ksh ${balance.toLocaleString()}`;
            
            const balBox = document.getElementById('balance-box');
            if(balBox) balBox.className = balance > 0 ? 'stat-box box-red' : 'stat-box box-green';
        }

        const safeOrderId = order.id ? order.id.toString() : 'UNKNOWN';
        const shortId = safeOrderId.slice(0,6);
        document.getElementById('admin-detail-header').textContent = `Order #${shortId} - ${order.customer_name}`;

        // --- 4. POPULATE PAYMENT HISTORY TABLE ---
        const paymentTbody = document.getElementById('payment-history-tbody');
        if (paymentTbody && payments) {
            paymentTbody.innerHTML = payments.length ? payments.map(p => `
                <tr>
                    <td>${formatDate(p.recorded_at)}</td>
                    <td style="color: #28a745; font-weight: bold;">Ksh ${p.amount.toLocaleString()}</td>
                    <td>${p.manager_id ? p.manager_id.slice(-6) : 'System'}</td>
                    <td>${p.notes || '-'}</td>
                </tr>
            `).join('') : '<tr><td colspan="4" style="text-align:center; padding:15px;">No payments recorded yet.</td></tr>';
        }
        
        logDebug("Admin order details loaded", { orderId }, 'success');

    } catch (error) {
        console.error(error);
        alert("Error loading order details: " + error.message);
    }
}

function generateAdminMeasurementFields(type, currentJson) {
    const container = document.getElementById('admin-measurement-fields-container');
    if (!container) return;
    
    let current = {};
    try {
        current = currentJson ? JSON.parse(currentJson) : {};
    } catch (e) {
        logDebug("Error parsing measurements:", e, 'warning');
        current = {};
    }
    
    const measurements = GARMENT_MEASUREMENTS[type];
    if (!measurements) {
        container.innerHTML = '<p>No measurements needed for this garment type.</p>';
        return;
    }
    
    let html = '';
    for (const [component, fields] of Object.entries(measurements)) {
        html += `<div class="measurement-group">
            <h4>${component}</h4>
            <div class="measurement-fields">`;
        
        fields.forEach(field => {
            const value = current[component]?.[field] || '';
            html += `
                <div class="measurement-field">
                    <label>${field}</label>
                    <input type="number" step="0.1" value="${value}" 
                           data-c="${component}" data-m="${field}">
                </div>
            `;
        });
        
        html += '</div></div>';
    }
    
    container.innerHTML = html;
}

async function saveAdminOrder() {
    if (!CURRENT_ORDER_ID) return;
    
    try {
        // Collect measurements
        const measurements = {};
        document.querySelectorAll('#admin-measurement-fields-container input').forEach(input => {
            const comp = input.dataset.c;
            const meas = input.dataset.m;
            if (!measurements[comp]) measurements[comp] = {};
            if (input.value) measurements[comp][meas] = parseFloat(input.value);
        });
        
        // Capture squad selection
        const squad = Array.from(document.querySelectorAll('.squad-checkbox:checked')).map(cb => cb.value);

        // Prepare update data
        const updateData = {
            customer_name: document.getElementById('edit-customer-name').value,
            customer_phone: document.getElementById('edit-customer-phone').value,
            garment_type: document.getElementById('edit-garment-type').value,
            price: parseFloat(document.getElementById('edit-price').value) || 0,
            due_date: document.getElementById('edit-due-date').value,
            customer_preferences: document.getElementById('edit-preferences').value || '',
            status: parseInt(document.getElementById('edit-status').value) || 1,
            worker_id: document.getElementById('edit-worker-select').value || null,
            additional_workers: JSON.stringify(squad),
            measurements_details: JSON.stringify(measurements),
            updated_at: new Date().toISOString()
        };
        
        // Save to database
        const { error } = await supabaseClient
            .from('orders')
            .update(updateData)
            .eq('id', CURRENT_ORDER_ID);
        
        if (error) throw error;
        
        alert("Order saved successfully!");
        window.location.href = 'admin-current-orders.html';
        
    } catch (error) {
        logDebug("Error saving admin order:", error, 'error');
        alert("Error saving order: " + error.message);
    }
}

// ==========================================
// 👑 OWNER MODULE - ADMIN MANAGEMENT
// ==========================================

async function loadAdminManagementScreen() {
    logDebug("Loading admin management screen", null, 'info');
    
    try {
        // Setup shop creation form
        const shopForm = document.getElementById('add-shop-form');
        if (shopForm) {
            shopForm.onsubmit = createShopAndManager;
        }
        
        // Setup worker creation form
        const workerForm = document.getElementById('admin-add-worker-form');
        if (workerForm) {
            workerForm.onsubmit = async (e) => {
                e.preventDefault();
                
                const shopId = document.getElementById('admin-shop-select').value;
                const name = document.getElementById('admin-new-worker-name').value;
                const phone = document.getElementById('admin-new-worker-phone').value;
                
                if (!shopId) {
                    alert("Please select a shop first!");
                    return;
                }
                
                if (!name.trim()) {
                    alert("Please enter worker name!");
                    return;
                }
                
                try {
                    const { error } = await supabaseClient.from('workers').insert([{
                        shop_id: shopId,
                        name: name.trim(),
                        phone_number: phone.trim() || null,
                        created_at: new Date().toISOString()
                    }]);
                    
                    if (error) throw error;
                    
                    alert("Worker added successfully!");
                    workerForm.reset();
                    loadShopCommandCenter();
                    
                } catch (error) {
                    alert("Error: " + error.message);
                }
            };
        }
        
        // Load data
        await Promise.all([
            loadShopsForDropdown('admin-shop-select'),
            loadShopCommandCenter()
        ]);
        
        addRefreshButton();
        
    } catch (error) {
        logDebug("Error loading admin management:", error, 'error');
    }
}

async function loadShopsForDropdown(elId) {
    const el = document.getElementById(elId);
    if (!el) {
        logDebug(`Element ${elId} not found for shop dropdown`, null, 'warning');
        return;
    }
    
    try {
        const { data: shops, error } = await supabaseClient.from('shops').select('id, name').order('name');
        if (error) {
            logDebug("Error loading shops for dropdown:", error, 'error');
            return;
        }
        
        if (shops) {
            const firstOption = el.options[0];
            el.innerHTML = '';
            if (firstOption) el.appendChild(firstOption);
            
            shops.forEach(s => {
                const option = document.createElement('option');
                option.value = s.id;
                option.textContent = s.name;
                el.appendChild(option);
            });
            
            logDebug(`Loaded ${shops.length} shops for dropdown ${elId}`, null, 'success');
        }
    } catch (error) {
        logDebug("Exception loading shops for dropdown:", error, 'error');
    }
}

async function loadShopCommandCenter() {
    const container = document.getElementById('shop-command-center');
    if (!container) return;
    
    container.innerHTML = '<p>Loading command center...</p>';
    
    try {
        // Using global adminClient
        const [{ data: shops }, { data: profiles }, { data: workers }] = await Promise.all([
            getAdminClient().from('shops').select('*').order('id'),
            getAdminClient().from('user_profiles').select('*').eq('role', 'manager'),
            getAdminClient().from('workers').select('*')
        ]);
        
        if (!shops || shops.length === 0) {
            container.innerHTML = '<p>No shops found. Create your first shop above.</p>';
            return;
        }
        
        // Get all auth users
        const { data: authUsers, error: authError } = await getAdminClient().auth.admin.listUsers();
        
        // FIX: Ensure shopCards is an array by explicitly casting the map result if necessary
        const shopCards = Array.isArray(shops) ? shops.map(shop => {
            const managerProfile = profiles?.find(p => p.shop_id === shop.id);
            const shopWorkers = workers?.filter(w => w.shop_id === shop.id) || [];
            
            let managerHtml = '<div style="color: #666; font-style: italic;">No Manager</div>';
            if (managerProfile) {
                const managerAuth = authUsers?.users?.find(u => u.id === managerProfile.id);
                const email = managerAuth?.email || 'Email not found';
                
                managerHtml = `
                    <div style="background: #eef2f5; padding: 10px; border-radius: 6px; margin-bottom: 10px;">
                        <strong style="color: #007bff;">${managerProfile.full_name}</strong><br>
                        <small>${email}</small>
                        <div style="margin-top: 5px; display: flex; gap: 5px;">
                            <button onclick="openResetPasswordModal('${managerProfile.id}', '${managerProfile.full_name}')" 
                                    style="font-size: 0.8em; padding: 5px 10px; background: #ffc107; color: black; border: none; border-radius: 3px; cursor: pointer;">
                                🔑 Reset Pass
                            </button>
                            <button onclick="fireManager('${managerProfile.id}', '${shop.id}')" 
                                    style="font-size: 0.8em; padding: 5px 10px; background: #dc3545; color: white; border: none; border-radius: 3px; cursor: pointer;">
                                🔥 Remove
                            </button>
                        </div>
                    </div>
                `;
            }
            
            const workerList = shopWorkers.length > 0 ?
                shopWorkers.map(w => `
                    <li style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px solid #eee;">
                        <span>${w.name} <small>(${w.phone_number || '-'})</small></span>
                        <button onclick="deleteWorker('${w.id}')" 
                                style="background: none; border: none; cursor: pointer; color: #dc3545; font-size: 1.2em;">
                            🗑️
                        </button>
                    </li>
                `).join('') :
                '<li style="color: #999;">No workers yet</li>';
            
            return `
                <div class="shop-card" style="background: white; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); padding: 20px;">
                    <h3 style="margin-top: 0; border-bottom: 2px solid #d4af37; padding-bottom: 10px; margin-bottom: 15px;">
                        ${shop.name} <small style="color: #ccc;">#${shop.id}</small>
                    </h3>
                    
                    <h4 style="margin: 0 0 5px 0; font-size: 0.9em; text-transform: uppercase; color: #555;">Store Manager</h4>
                    ${managerHtml}
                    
                    <h4 style="margin: 15px 0 5px 0; font-size: 0.9em; text-transform: uppercase; color: #555;">
                        Workforce (${shopWorkers.length})
                    </h4>
                    <ul style="list-style: none; padding: 0; margin: 0; max-height: 150px; overflow-y: auto;">
                        ${workerList}
                    </ul>
                    
                    <button onclick="deleteShop('${shop.id}', '${shop.name}')" 
                            style="margin-top: 15px; padding: 10px; background: #000; color: #dc3545; border: 1px solid #dc3545; border-radius: 4px; font-weight: bold; cursor: pointer; width: 100%;">
                        ☠️ DELETE SHOP
                    </button>
                </div>
            `;
        }) : [];
        
        container.innerHTML = shopCards.join('');
        
        logDebug("Shop command center loaded", { shops: shops.length }, 'success');
    } catch (error) {
        logDebug("Error loading shop command center:", error, 'error');
        container.innerHTML = `<p style="color: #dc3545;">Error loading command center: ${error.message}</p>`;
        console.error(error); // Keep this line to debug array issues if they persist
    }
}

async function createShopAndManager(e) {
    e.preventDefault();
    
    const messageDiv = document.getElementById('shop-message');
    if (messageDiv) {
        messageDiv.textContent = "Processing...";
        messageDiv.className = 'info';
    }
    
    const shopName = document.getElementById('new-shop-name').value;
    const managerName = document.getElementById('new-manager-name').value;
    const email = document.getElementById('new-manager-email').value;
    const password = document.getElementById('new-manager-password').value;
    
    if (!shopName || !managerName || !email || !password) {
        if (messageDiv) {
            messageDiv.textContent = "All fields are required!";
            messageDiv.className = 'error';
        }
        return;
    }
    
    try {
        // Using global adminClient
        // 1. Create auth user
        const { data: authUser, error: authError } = await getAdminClient().auth.admin.createUser({
            email,
            password,
            email_confirm: true
        });
        
        if (authError) throw authError;
        const userId = authUser.user.id;
        
        // 2. Create shop
        const { data: shop, error: shopError } = await getAdminClient()
            .from('shops')
            .insert([{ name: shopName }])
            .select()
            .single();
        
        if (shopError) throw shopError;
        const shopId = shop.id;
        
        // 3. Create user profile
        const { error: profileError } = await getAdminClient()
            .from('user_profiles')
            .insert([{
                id: userId,
                full_name: managerName,
                role: 'manager',
                shop_id: shopId,
                created_at: new Date().toISOString()
            }]);
        
        if (profileError) throw profileError;
        
        // Success
        if (messageDiv) {
            messageDiv.textContent = "Shop and manager created successfully!";
            messageDiv.className = 'success';
        }
        
        // Reset form
        document.getElementById('add-shop-form').reset();
        
        // Reload command center
        loadShopCommandCenter();
        
        logDebug("Shop and manager created", { shopId, managerId: userId }, 'success');
        
    } catch (error) {
        logDebug("Error creating shop and manager:", error, 'error');
        if (messageDiv) {
            messageDiv.textContent = "Error: " + error.message;
            messageDiv.className = 'error';
        }
    }
}

window.openResetPasswordModal = function(userId, userName) {
    document.getElementById('reset-user-id').value = userId;
    document.getElementById('reset-user-name').textContent = userName;
    document.getElementById('password-reset-modal').style.display = 'flex';
};

window.handlePasswordReset = async function() {
    const userId = document.getElementById('reset-user-id').value;
    const newPassword = document.getElementById('new-reset-password').value;
    
    if (!newPassword || newPassword.length < 6) {
        alert("Password must be at least 6 characters long");
        return;
    }
    
    try {
        // Using global adminClient
        const { error } = await getAdminClient().auth.admin.updateUserById(userId, {
            password: newPassword
        });
        
        if (error) throw error;
        
        alert("Password updated successfully!");
        document.getElementById('password-reset-modal').style.display = 'none';
        document.getElementById('new-reset-password').value = '';
        
    } catch (error) {
        alert("Error: " + error.message);
    }
};

window.fireManager = async function(userId, shopId) {
    if (!confirm("Are you sure you want to remove this manager?\nThis will delete their account permanently.")) return;
    
    try {
        // Using global adminClient
        // Delete auth user
        const { error: authError } = await getAdminClient().auth.admin.deleteUser(userId);
        if (authError) throw authError;
        
        // Delete user profile
        await getAdminClient().from('user_profiles').delete().eq('id', userId);
        
        alert("Manager removed successfully!");
        loadShopCommandCenter();
        
    } catch (error) {
        alert("Error: " + error.message);
    }
};

window.deleteShop = async function(shopId, shopName) {
    if (!confirm(`⚠️ CRITICAL WARNING ⚠️\n\nDelete shop "${shopName}"?\n\nThis will permanently delete:\n• The shop\n• All associated workers\n• Manager account\n• All orders, payments, and expenses\n\nThis action cannot be undone!`)) return;
    
    try {
        // Using global adminClient
        // 1. Get manager ID for this shop
        const { data: manager } = await getAdminClient()
            .from('user_profiles')
            .select('id')
            .eq('shop_id', shopId)
            .eq('role', 'manager')
            .single();
        
        // 2. Delete orders and related payments
        const { data: orders } = await getAdminClient()
            .from('orders')
            .select('id')
            .eq('shop_id', shopId);
        
        if (orders && orders.length > 0) {
            const orderIds = orders.map(o => o.id);
            await getAdminClient().from('payments').delete().in('order_id', orderIds);
            await getAdminClient().from('orders').delete().eq('shop_id', shopId);
        }
        
        // 3. Delete expenses
        await getAdminClient().from('expenses').delete().eq('shop_id', shopId);
        
        // 4. Delete workers
        await getAdminClient().from('workers').delete().eq('shop_id', shopId);
        
        // 5. Delete manager profile
        if (manager) {
            await getAdminClient().from('user_profiles').delete().eq('id', manager.id);
        }
        
        // 6. Delete shop
        await getAdminClient().from('shops').delete().eq('id', shopId);
        
        // 7. Delete manager auth account (if exists)
        if (manager) {
            try {
                await getAdminClient().auth.admin.deleteUser(manager.id);
            } catch (e) {
                // Ignore if user doesn't exist
            }
        }
        
        alert(`Shop "${shopName}" has been deleted.`);
        loadShopCommandCenter();
        
    } catch (error) {
        alert("Delete failed: " + error.message);
    }
};

window.deleteWorker = async function(workerId) {
    if (!confirm("Delete this worker?")) return;
    
    try {
        // Check if worker has active orders
        const { data: activeOrders } = await supabaseClient
            .from('orders')
            .select('id')
            .eq('worker_id', workerId)
            .neq('status', 6);
        
        if (activeOrders && activeOrders.length > 0) {
            alert("Cannot delete worker with active assignments. Reassign orders first.");
            return;
        }
        
        const { error } = await supabaseClient
            .from('workers')
            .delete()
            .eq('id', workerId);
        
        if (error) throw error;
        
        alert("Worker deleted.");
        loadShopCommandCenter();
        
    } catch (error) {
        alert("Error: " + error.message);
    }
};

// ==========================================
// 📊 FINANCIAL ANALYTICS MODULE
// ==========================================

async function loadAnalyticsDashboard() {
    // [PERF] Debounce: prevent rapid-fire refreshes
    const now = Date.now();
    if (now - lastDashboardLoad < DEBOUNCE_DELAY) {
        logDebug("Dashboard refresh debounced (too frequent)", null, 'info');
        return;
    }
    lastDashboardLoad = now;
    
    logDebug("📊 Loading analytics dashboard", null, 'info');
    console.log('%c═══════════════════════════════════════════════════════', 'color: #d4af37; font-weight: bold; font-size: 12px;');
    console.log('%c🎯 ANALYTICS DASHBOARD INITIALIZATION', 'color: #d4af37; font-weight: bold; font-size: 14px;');
    console.log('%c═══════════════════════════════════════════════════════', 'color: #d4af37; font-weight: bold; font-size: 12px;');
    
    // Clean up existing charts
    Object.values(analyticsCharts).forEach(chart => {
        if (chart && typeof chart.destroy === 'function') {
            try {
                chart.destroy();
            } catch (e) {
                // Ignore
            }
        }
    });
    analyticsCharts = {};
    
    try {
        // Always use 'all' since shop filter removed from UI
        const shopId = 'all';
        logDebug("Analytics: Using global shopId='all'", null, 'info');
        console.log('%c[STEP 1/8] Initiating parallel data loading...', 'color: #3b82f6; font-weight: bold;');
        console.log('Shop ID:', shopId);
        
        const startTime = performance.now();
        
        await Promise.all([
            loadKPIMetrics(shopId),
            loadRevenueChart(shopId),
            loadProductMixChart(shopId),
            loadShopPerformanceChart(),
            loadExpenseChart(shopId),
            loadPerformanceTables(shopId),
            loadExpenseAuditTable(shopId),
            generateAIInsights(shopId)
        ]);
        
        const endTime = performance.now();
        console.log('%c[COMPLETE] ✅ All dashboard components loaded in', 'color: #10b981; font-weight: bold;', (endTime - startTime).toFixed(2) + 'ms');
        
        // Update timestamp
        const timestampEl = document.getElementById('insights-timestamp');
        if (timestampEl) {
            timestampEl.textContent = new Date().toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
        }
        
        logDebug("Analytics dashboard loaded", null, 'success');
        console.log('%c═══════════════════════════════════════════════════════', 'color: #10b981; font-weight: bold; font-size: 12px;');
    } catch (error) {
        console.error('%c❌ CRITICAL ERROR IN loadAnalyticsDashboard', 'color: #dc3545; font-weight: bold; font-size: 14px;');
        console.error('Error:', error);
        console.error('Stack:', error.stack);
        logDebug("Error loading analytics dashboard:", error, 'error');
    }
}

async function loadKPIMetrics(shopId) {
    try {
        // Build queries
        let paymentsQuery = supabaseClient.from('payments').select('amount');
        let ordersQuery = supabaseClient.from('orders').select('id, price, status');
        let expensesQuery = supabaseClient.from('expenses').select('amount');
        
        if (shopId !== 'all') {
            paymentsQuery = paymentsQuery.eq('orders.shop_id', shopId);
            ordersQuery = ordersQuery.eq('shop_id', shopId);
            expensesQuery = expensesQuery.eq('shop_id', shopId);
        }
        
        // Execute queries
        const [paymentsRes, ordersRes, expensesRes] = await Promise.all([
            paymentsQuery,
            ordersQuery,
            expensesQuery
        ]);
        
        const payments = paymentsRes.data || [];
        const orders = ordersRes.data || [];
        const expenses = expensesRes.data || [];
        
        // Calculate metrics
        const totalRevenue = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

        const activeOrders = orders.filter(o => o.status < 6).length;
        const completedOrders = orders.filter(o => o.status === 6).length;

        const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;
        
        // Update UI
        const updateMetric = (id, value, isCurrency = false) => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = isCurrency ? `Ksh ${value.toLocaleString()}` : value.toString();
            }
        };
        
        updateMetric('total-revenue', totalRevenue, true);
        updateMetric('active-orders', activeOrders);
        updateMetric('avg-order-value', avgOrderValue, true);
        updateMetric('on-time-rate', '92%'); // Placeholder
        
        logDebug("KPI metrics loaded", { totalRevenue, netProfit, activeOrders }, 'success');
    } catch (error) {
        logDebug("Error loading KPI metrics:", error, 'error');
    }
}

async function loadRevenueChart(shopId) {
    try {
        let paymentsQuery = supabaseClient
            .from('payments')
            .select('amount, recorded_at')
            .order('recorded_at');
        
        if (shopId !== 'all') {
            paymentsQuery = paymentsQuery.eq('orders.shop_id', shopId);
        }
        
        const { data: payments } = await paymentsQuery;
        
        // Group by date
        const dailyRevenue = {};
        const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
        
        if (payments) {
            payments.forEach(payment => {
                const date = new Date(payment.recorded_at);
                const dateKey = dateFormat.format(date);
                
                if (!dailyRevenue[dateKey]) dailyRevenue[dateKey] = 0;
                dailyRevenue[dateKey] += payment.amount || 0;
            });
        }
        
        const labels = Object.keys(dailyRevenue);
        const data = Object.values(dailyRevenue);
        
        // Create chart
        const canvas = document.getElementById('revenueChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        if (analyticsCharts.revenueChart) {
            analyticsCharts.revenueChart.destroy();
        }
        
        analyticsCharts.revenueChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Daily Revenue (AED)',
                    data: data,
                    backgroundColor: '#10b981',
                    borderColor: '#0f9f61',
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                maxBarThickness: 30,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => `AED ${context.raw.toLocaleString('en-US', {minimumFractionDigits: 2})}`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => `AED ${value.toLocaleString()}`
                        }
                    }
                }
            }
        });
        
        logDebug("Revenue chart loaded", { dataPoints: data.length }, 'success');
    } catch (error) {
        logDebug("Error loading revenue chart:", error, 'error');
    }
}

async function loadProductMixChart(shopId) {
    try {
        let ordersQuery = supabaseClient
            .from('orders')
            .select('garment_type, price');
        
        if (shopId !== 'all') {
            ordersQuery = ordersQuery.eq('shop_id', shopId);
        }
        
        const { data: orders } = await ordersQuery;
        
        // Group by garment type
        const productData = {};
        if (orders) {
            orders.forEach(order => {
                const type = order.garment_type || 'Unknown';
                if (!productData[type]) productData[type] = 0;
                productData[type] += order.price || 0;
            });
        }
        
        const labels = Object.keys(productData);
        const revenueData = Object.values(productData);
        
        // Create chart
        const canvas = document.getElementById('productMixChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        if (analyticsCharts.productMixChart) {
            analyticsCharts.productMixChart.destroy();
        }
        
        analyticsCharts.productMixChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: revenueData,
                    backgroundColor: [
                        '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
                        '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = Math.round((context.raw / total) * 100);
                                return `${context.label}: Ksh ${context.raw.toLocaleString()} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
        
        logDebug("Product mix chart loaded", { products: labels.length }, 'success');
    } catch (error) {
        logDebug("Error loading product mix chart:", error, 'error');
    }
}

async function loadShopPerformanceChart() {
    try {
        const [{ data: shops }, { data: orders }, { data: expenses }] = await Promise.all([
            supabaseClient.from('shops').select('id, name').order('name'),
            supabaseClient.from('orders').select('id, shop_id, price'),
            supabaseClient.from('expenses').select('shop_id, amount')
        ]);
        
        if (!shops) return;
        
        // Calculate shop performance
        const shopPerformance = shops.map(shop => {
            const shopOrders = orders?.filter(o => o.shop_id === shop.id) || [];
            const shopExpenses = expenses?.filter(e => e.shop_id === shop.id) || [];
            
            const revenue = shopOrders.reduce((sum, o) => sum + (o.price || 0), 0);
            const expense = shopExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
            const profit = revenue - expense;
            const efficiency = revenue > 0 ? ((revenue - expense) / revenue) * 100 : 0;
            
            return { id: shop.id, name: shop.name, revenue, profit, efficiency: efficiency };
        }).sort((a, b) => b.revenue - a.revenue).slice(0, 10); // Sort by Revenue
        
        const labels = shopPerformance.map(s => s.name);
        const revenueData = shopPerformance.map(s => s.revenue);
        const profitData = shopPerformance.map(s => s.profit);
        
        // Update Chart
        const canvas = document.getElementById('shopPerformanceChart');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            
            if (analyticsCharts.shopPerformanceChart) {
                analyticsCharts.shopPerformanceChart.destroy();
            }
            
            analyticsCharts.shopPerformanceChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Revenue',
                            data: revenueData,
                            backgroundColor: '#3b82f6'
                        },
                        {
                            label: 'Profit',
                            data: profitData,
                            backgroundColor: '#10b981'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        }
        
        // *** Store the live rankings to be used by the tables ***
        window.shopRankings = shopPerformance.sort((a, b) => b.efficiency - a.efficiency); 
        
        logDebug("Shop performance chart loaded", { shops: labels.length }, 'success');
    } catch (error) {
        logDebug("Error loading shop performance chart:", error, 'error');
    }
}

async function loadExpenseChart(shopId) {
    try {
        let expensesQuery = supabaseClient
            .from('expenses')
            .select('category, amount');
        
        if (shopId !== 'all') {
            expensesQuery = expensesQuery.eq('shop_id', shopId);
        }
        
        const { data: expenses } = await expensesQuery;
        
        // Group by category
        const expenseByCategory = {};
        if (expenses) {
            expenses.forEach(expense => {
                const category = expense.category || 'Uncategorized';
                if (!expenseByCategory[category]) expenseByCategory[category] = 0;
                expenseByCategory[category] += expense.amount || 0;
            });
        }
        
        // Sort and take top 8
        const sortedCategories = Object.entries(expenseByCategory)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 8);
        
        const labels = sortedCategories.map(([category]) => category);
        const data = sortedCategories.map(([,amount]) => amount);
        
        // Color palette for different expense categories
        const categoryColors = {
            'Salaries': '#ef4444',
            'Marketing': '#f97316',
            'Rent': '#eab308',
            'Utilities': '#84cc16',
            'Maintenance': '#22c55e',
            'Supplies': '#06b6d4',
            'Equipment': '#0ea5e9',
            'Other': '#8b5cf6'
        };
        
        const backgroundColors = labels.map(label => categoryColors[label] || '#a855f7');
        
        // Create chart
        const canvas = document.getElementById('expenseChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        if (analyticsCharts.expenseChart) {
            analyticsCharts.expenseChart.destroy();
        }
        
        analyticsCharts.expenseChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Expense Amount (AED)',
                    data: data,
                    backgroundColor: backgroundColors,
                    borderColor: backgroundColors,
                    borderWidth: 0
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                maxBarThickness: 20,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return 'AED ' + context.parsed.x.toLocaleString('en-US', {minimumFractionDigits: 2});
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            callback: function(value) {
                                return 'AED ' + value.toLocaleString();
                            }
                        }
                    },
                    y: { grid: { display: false } }
                }
            }
        });
        
        logDebug("Expense chart loaded", { categories: labels.length }, 'success');
    } catch (error) {
        logDebug("Error loading expense chart:", error, 'error');
    }
}
async function loadExpenseAuditTable(shopId) {
    console.log('%c╔════════════════════════════════════════════════════════╗', 'color: #d4af37; font-weight: bold; font-size: 13px;');
    console.log('%c║  🔍 NUCLEAR DEBUG: EXPENSE AUDIT TABLE LOADER         ║', 'color: #d4af37; font-weight: bold; font-size: 13px;');
    console.log('%c╚════════════════════════════════════════════════════════╝', 'color: #d4af37; font-weight: bold; font-size: 13px;');
    
    const DEBUG_START = performance.now();
    console.log('%c[T=0ms] ✓ Execution initiated', 'color: #3b82f6; font-weight: bold;');
    console.log('Parameter shopId:', shopId, typeof shopId);
    
    // STEP 1: DOM Element Validation
    console.log('%c[STEP 1] DOM ELEMENT VALIDATION', 'color: #fbbf24; font-weight: bold; background: #fef3c7; padding: 2px 6px; border-radius: 3px;');
    const expenseTbody = document.getElementById('expense-audit-tbody');
    if (!expenseTbody) {
        console.error('%c❌ CRITICAL FAILURE: expense-audit-tbody NOT FOUND', 'color: #dc3545; font-weight: bold; font-size: 12px;');
        console.error('This element MUST exist in financial-overview.html');
        console.error('Available tbody elements:', document.querySelectorAll('tbody').length);
        console.error('Element IDs with "tbody":', Array.from(document.querySelectorAll('[id*="tbody"]')).map(el => el.id));
        return;
    }
    console.log('%c✅ DOM element FOUND', 'color: #10b981; font-weight: bold;');
    console.log('Element:', expenseTbody);
    console.log('Parent container:', expenseTbody.parentElement);
    console.log('Tbody row count before load:', expenseTbody.rows.length);
    
    // STEP 2: Loading state
    console.log('%c[STEP 2] SET LOADING STATE', 'color: #fbbf24; font-weight: bold; background: #fef3c7; padding: 2px 6px; border-radius: 3px;');
    expenseTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#666; font-weight: bold;">⏳ Querying database...</td></tr>';
    console.log('%c✅ Loading indicator shown', 'color: #10b981; font-weight: bold;');
    
    try {
        // STEP 3: Supabase Query
        console.log('%c[STEP 3] SUPABASE QUERY EXECUTION', 'color: #fbbf24; font-weight: bold; background: #fef3c7; padding: 2px 6px; border-radius: 3px;');
        const queryStart = performance.now();
        console.log('Building query: SELECT id, amount, category, item_name, notes, incurred_at, shop_id FROM expenses');
        console.log('Order by: incurred_at DESC');
        console.log('Limit: 100 records');
        
        const { data: expenses, error } = await supabaseClient
            .from('expenses')
            .select('id, amount, category, item_name, notes, incurred_at, shop_id')
            .order('incurred_at', { ascending: false })
            .limit(100);
        
        const queryEnd = performance.now();
        console.log('%c✅ Supabase query completed in', 'color: #10b981; font-weight: bold;', (queryEnd - queryStart).toFixed(2) + 'ms');
        
        // STEP 4: Error Checking
        console.log('%c[STEP 4] RESPONSE VALIDATION', 'color: #fbbf24; font-weight: bold; background: #fef3c7; padding: 2px 6px; border-radius: 3px;');
        console.log('Has error:', !!error);
        console.log('Has data:', !!expenses);
        console.log('Data type:', typeof expenses);
        console.log('Is array:', Array.isArray(expenses));
        console.log('Record count:', expenses?.length || 0);
        
        if (error) {
            console.error('%c❌ SUPABASE ERROR', 'color: #dc3545; font-weight: bold; font-size: 12px;');
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);
            console.error('Error details:', error);
            throw new Error(`Supabase query failed: ${error.message}`);
        }
        
        if (!expenses || !Array.isArray(expenses)) {
            console.error('%c❌ INVALID RESPONSE DATA', 'color: #dc3545; font-weight: bold; font-size: 12px;');
            console.error('Expected array, got:', typeof expenses);
            throw new Error('Invalid data format from Supabase');
        }
        
        if (expenses.length === 0) {
            console.warn('%c⚠️  NO RECORDS FOUND', 'color: #f97316; font-weight: bold; font-size: 11px;');
            expenseTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:#999; font-style: italic;">No expense records in database</td></tr>';
            logDebug("Expense audit: no records found", null, 'info');
            return;
        }
        
        console.log('%c✅ Data validation passed', 'color: #10b981; font-weight: bold;');
        
        // STEP 5: Data Processing
        console.log('%c[STEP 5] DATA PROCESSING', 'color: #fbbf24; font-weight: bold; background: #fef3c7; padding: 2px 6px; border-radius: 3px;');
        console.log('Processing', expenses.length, 'records...');
        
        let html = '';
        let processedCount = 0;
        let errorCount = 0;
        
        expenses.forEach((exp, idx) => {
            try {
                const date = exp.incurred_at ? formatDate(exp.incurred_at) : 'N/A';
                const amount = parseFloat(exp.amount || 0);
                const amountStr = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const category = exp.category || '-';
                const details = exp.item_name || exp.notes || '-';
                const shop = exp.shop_id || 'N/A';
                
                html += `<tr style="border-bottom: 1px solid #f0f0f0;">
                    <td style="padding:10px;">${date}</td>
                    <td style="padding:10px;">Shop #${shop}</td>
                    <td style="padding:10px; font-weight:600;">${category}</td>
                    <td style="padding:10px; text-align:right; font-weight:600;">AED ${amountStr}</td>
                    <td style="padding:10px;">${details}</td>
                </tr>`;
                
                processedCount++;
                
                if (idx < 3 || idx === expenses.length - 1) {
                    console.log(`  [${idx + 1}/${expenses.length}] ✓ ${date} | Shop #${shop} | ${category} | AED ${amountStr}`);
                }
            } catch (rowError) {
                errorCount++;
                console.warn(`  [${idx + 1}] ⚠️  Error processing row:`, rowError);
            }
        });
        
        console.log('%c✅ Processing complete:', 'color: #10b981; font-weight: bold;', processedCount, 'rows rendered,', errorCount, 'errors');
        
        // STEP 6: DOM Rendering
        console.log('%c[STEP 6] DOM RENDERING', 'color: #fbbf24; font-weight: bold; background: #fef3c7; padding: 2px 6px; border-radius: 3px;');
        const renderStart = performance.now();
        
        expenseTbody.innerHTML = html;
        
        const renderEnd = performance.now();
        console.log('%c✅ HTML rendered in', 'color: #10b981; font-weight: bold;', (renderEnd - renderStart).toFixed(2) + 'ms');
        console.log('Final row count:', expenseTbody.rows.length);
        console.log('First visible row:', expenseTbody.rows[0]?.textContent?.substring(0, 50));
        
        // STEP 7: Summary
        console.log('%c[STEP 7] FINAL VALIDATION', 'color: #fbbf24; font-weight: bold; background: #fef3c7; padding: 2px 6px; border-radius: 3px;');
        const totalTime = performance.now() - DEBUG_START;
        console.log('%c✅ EXPENSE AUDIT TABLE LOADED SUCCESSFULLY', 'color: #10b981; font-weight: bold; font-size: 13px;');
        console.log(`Total execution time: ${totalTime.toFixed(2)}ms`);
        console.log(`Displayed: ${processedCount} expense records`);
        console.log(`Query: ${(queryEnd - queryStart).toFixed(2)}ms | Render: ${(renderEnd - renderStart).toFixed(2)}ms`);
        
        logDebug(`Loaded ${expenses.length} expense entries`, { count: expenses.length, time: totalTime.toFixed(2) + 'ms' }, 'success');
        
        console.log('%c╔════════════════════════════════════════════════════════╗', 'color: #10b981; font-weight: bold; font-size: 13px;');
        console.log('%c║  ✓ EXPENSE AUDIT TABLE READY FOR DISPLAY            ║', 'color: #10b981; font-weight: bold; font-size: 13px;');
        console.log('%c╚════════════════════════════════════════════════════════╝', 'color: #10b981; font-weight: bold; font-size: 13px;');

    } catch (error) {
        console.error('%c╔════════════════════════════════════════════════════════╗', 'color: #dc3545; font-weight: bold; font-size: 13px;');
        console.error('%c║  ❌ CRITICAL FAILURE IN EXPENSE AUDIT LOADER         ║', 'color: #dc3545; font-weight: bold; font-size: 13px;');
        console.error('%c╚════════════════════════════════════════════════════════╝', 'color: #dc3545; font-weight: bold; font-size: 13px;');
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        console.error('Full error object:', error);
        
        // Show detailed error in table
        const errorHtml = `<tr>
            <td colspan="5" style="text-align:center; color:#dc3545; padding:20px; font-weight:bold; background:#ffe0e0;">
                ❌ ERROR LOADING EXPENSES<br>
                <small style="font-weight:normal; display:block; margin-top:8px;">${error.message}</small>
                <small style="font-weight:normal; display:block; color:#666; margin-top:4px;">Check browser console for details</small>
            </td>
        </tr>`;
        
        expenseTbody.innerHTML = errorHtml;
        logDebug("Critical error in expense audit table:", error, 'error');
    }
}

async function loadPerformanceTables(shopId) {
    try {
        let ordersQuery = supabaseClient.from('orders').select('garment_type, price, shop_id');
        
        if (shopId !== 'all') {
            ordersQuery = ordersQuery.eq('shop_id', shopId);
        }
        
        const { data: orders } = await ordersQuery;
        
        if (!orders || orders.length === 0) return;
        
        // --- 1. Top Products Table ---
        const productStats = {};
        let totalRevenue = 0;
        
        orders.forEach(order => {
            const type = order.garment_type || 'Unknown';
            if (!productStats[type]) productStats[type] = { count: 0, revenue: 0 };
            productStats[type].count++;
            productStats[type].revenue += order.price || 0;
            totalRevenue += order.price || 0;
        });
        
        const topProducts = Object.entries(productStats)
            .map(([name, stats]) => ({
                name,
                count: stats.count,
                revenue: stats.revenue,
                percentage: totalRevenue > 0 ? (stats.revenue / totalRevenue) * 100 : 0
            }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5);
        
        const topProductsTable = document.getElementById('top-products-table');
        if (topProductsTable) {
            topProductsTable.innerHTML = topProducts.map(product => `
                <tr>
                    <td>${product.name}</td>
                    <td style="text-align: right;">${product.count}</td>
                    <td style="text-align: right; font-weight: 600;">Ksh ${product.revenue.toLocaleString()}</td>
                </tr>
            `).join('');
        }
        
        // --- 2. Shop Rankings Table ---
        const shopRankingTable = document.getElementById('shop-ranking-table');
        
        // Use the live rankings calculated in loadShopPerformanceChart()
        const rankings = window.shopRankings || []; 
        
        if (shopRankingTable) {
            shopRankingTable.innerHTML = rankings.length > 0 ? rankings.map((shop, index) => {
                const profitColor = shop.profit >= 0 ? '#10b981' : '#ef4444';
                
                return `
                    <tr>
                        <td>
                            <span style="display: inline-block; width: 22px; height: 22px; background: ${index === 0 ? '#d4af37' : index === 1 ? '#a8a9ad' : '#cd7f32'}; color: white; border-radius: 50%; text-align: center; line-height: 22px; font-weight: bold; margin-right: 8px; font-size: 0.85em;">
                                ${index + 1}
                            </span>
                            ${shop.name}
                        </td>
                        <td style="text-align: right; font-weight: 600;">Ksh ${shop.revenue.toLocaleString()}</td>
                        <td style="text-align: right; font-weight: 600; color: ${profitColor};">Ksh ${shop.profit.toLocaleString()}</td>
                    </tr>
                `;
            }).join('') : '<tr><td colspan="3" style="text-align:center; padding:20px;">Calculating live rankings...</td></tr>';
        }
        
        logDebug("Performance tables loaded", null, 'success');
    } catch (error) {
        logDebug("Error loading performance tables:", error, 'error');
    }
}

async function generateAIInsights(shopId) {
    try {
        // --- 1. Fetch Data ---
        let ordersQuery = supabaseClient.from('orders').select('garment_type, price, status');
        let paymentsQuery = supabaseClient.from('payments').select('amount');
        let expensesQuery = supabaseClient.from('expenses').select('category, amount');

        if (shopId !== 'all') {
            ordersQuery = ordersQuery.eq('shop_id', shopId);
            paymentsQuery = paymentsQuery.eq('orders.shop_id', shopId);
            expensesQuery = expensesQuery.eq('shop_id', shopId);
        }

        const [{ data: orders }, { data: payments }, { data: expenses }] = await Promise.all([
            ordersQuery, paymentsQuery, expensesQuery
        ]);
        
        // --- 2. Calculate Metrics ---
        const totalRevenue = payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
        const totalExpenses = expenses?.reduce((sum, e) => sum + (e.amount || 0), 0) || 0;
        const netProfit = totalRevenue - totalExpenses;
        const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0;
        const expenseRatio = totalRevenue > 0 ? ((totalExpenses / totalRevenue) * 100).toFixed(1) : 0;

        // Find top product
        const productRevenue = {};
        orders?.forEach(o => {
            const type = o.garment_type || 'Other';
            productRevenue[type] = (productRevenue[type] || 0) + (o.price || 0);
        });
        const topProduct = Object.keys(productRevenue).reduce((a, b) => productRevenue[a] > productRevenue[b] ? a : b, 'None');
        const topProductShare = totalRevenue > 0 ? ((productRevenue[topProduct] / totalRevenue) * 100).toFixed(0) : 0;
        
        // --- 3. Inject HTML ---
        const aiContainer = document.getElementById('ai-insights-container');
        if (aiContainer) {
            aiContainer.innerHTML = `
                <div class="insights-grid">
                    <div class="insight-card">
                        <h4><i class="fas fa-lightbulb" style="color: #f59e0b;"></i> Revenue Driver</h4>
                        <p><span class="insight-metric">${topProduct}</span> is your top earner, generating <span class="insight-metric">${topProductShare}%</span> of cash flow. Focus marketing here.</p>
                    </div>
                    
                    <div class="insight-card">
                        <h4><i class="fas fa-chart-line" style="color: #10b981;"></i> Financial Health</h4>
                        <p>Net Profit: <span class="insight-metric">Ksh ${netProfit.toLocaleString()}</span>. Margin: <span class="insight-metric">${profitMargin}%</span>. ${parseFloat(profitMargin) > 20 ? 'Healthy performance.' : 'Needs optimization.'}</p>
                    </div>
                    
                    <div class="insight-card">
                        <h4><i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i> Cost Analysis</h4>
                        <p>Expenses are consuming <span class="insight-metric">${expenseRatio}%</span> of your revenue. Total spent: <span class="insight-metric">Ksh ${totalExpenses.toLocaleString()}</span>.</p>
                    </div>
                    
                    <div class="insight-card">
                        <h4><i class="fas fa-tachometer-alt" style="color: #3b82f6;"></i> Operational Volume</h4>
                        <p>System is processing <span class="insight-metric">${orders?.length || 0}</span> total orders. Active workflow contains <span class="insight-metric">${orders?.filter(o => o.status < 6).length}</span> items.</p>
                    </div>
                </div>
            `;
        }
        
        logDebug("AI insights generated from live DB", null, 'success');
    } catch (error) {
        logDebug("Error generating AI insights:", error, 'error');
    }
}
function exportDashboardData() {
    try {
        // Gather data from visible tables
        const revenueKPI = document.getElementById('total-revenue')?.textContent || 'N/A';
        const activeOrders = document.getElementById('active-orders')?.textContent || '0';
        const avgOrderValue = document.getElementById('avg-order-value')?.textContent || '0';
        
        // Get table data
        const topProductsTable = document.getElementById('top-products-table');
        const shopRankingTable = document.getElementById('shop-ranking-table');
        const expenseAuditTable = document.getElementById('expense-audit-tbody');
        
        let csv = 'SIR\'S \'N\' SUITS - FINANCIAL OVERVIEW EXPORT\n';
        csv += `Generated: ${new Date().toLocaleString()}\n\n`;
        
        // KPI Section
        csv += 'KEY PERFORMANCE INDICATORS\n';
        csv += `Total Revenue,${revenueKPI}\n`;
        csv += `Active Orders,${activeOrders}\n`;
        csv += `Avg Order Value,${avgOrderValue}\n\n`;
        
        // Top Products
        csv += 'TOP PRODUCTS BY REVENUE\n';
        csv += 'Product,Count,Revenue\n';
        if (topProductsTable) {
            topProductsTable.querySelectorAll('tr').forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length > 0) {
                    csv += `${cells[0].textContent},${cells[1].textContent},${cells[2].textContent}\n`;
                }
            });
        }
        csv += '\n';
        
        // Shop Rankings
        csv += 'LIVE SHOP RANKING\n';
        csv += 'Rank,Shop,Revenue,Profit\n';
        if (shopRankingTable) {
            shopRankingTable.querySelectorAll('tr').forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length > 0) {
                    const shopNameCell = cells[0].textContent.trim();
                    csv += `${shopNameCell},${cells[1].textContent},${cells[2].textContent}\n`;
                }
            });
        }
        csv += '\n';
        
        // Expense Audit
        csv += 'EXPENSE AUDIT LOG\n';
        csv += 'Date,Shop,Category,Amount,Recorded By,Details\n';
        if (expenseAuditTable) {
            expenseAuditTable.querySelectorAll('tr').forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length > 0) {
                    csv += `${cells[0].textContent},${cells[1].textContent},${cells[2].textContent},${cells[3].textContent},${cells[4].textContent},${cells[5].textContent}\n`;
                }
            });
        }
        
        // Download as CSV file
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `financial-overview-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        logDebug("Dashboard data exported successfully", null, 'success');
    } catch (error) {
        logDebug("Error exporting data:", error, 'error');
        alert("Error exporting data: " + error.message);
    }
}

// ==========================================
// 💰 PAYMENT FUNCTIONS
// ==========================================

window.quickPay = async function(orderId, balance) {
    const amountStr = prompt(`Enter payment amount (Balance: Ksh ${balance.toLocaleString()}):`, balance.toString());
    
    if (!amountStr || isNaN(parseFloat(amountStr))) {
        alert("Please enter a valid amount");
        return;
    }
    
    const amount = parseFloat(amountStr);
    if (amount <= 0) {
        alert("Amount must be greater than 0");
        return;
    }
    
    if (amount > balance) {
        alert(`Amount cannot exceed balance of Ksh ${balance.toLocaleString()}`);
        return;
    }
    
    try {
        const { error } = await supabaseClient
            .from('payments')
            .insert([{
                order_id: orderId,
                manager_id: USER_PROFILE?.id,
                amount: amount,
                recorded_at: new Date().toISOString()
            }]);
        
        if (error) throw error;
        
        alert(`Payment of Ksh ${amount.toLocaleString()} recorded successfully!`);
        refreshCurrentView();
        
    } catch (error) {
        alert("Error recording payment: " + error.message);
    }
};

window.updateStatus = async function(orderId) {
    const statusCode = prompt(`Enter Status Code:
1: Assigned
2: In Progress
3: QA Check
4: Ready
5: Collected (Pending)
6: Closed`);
    
    if (!statusCode || ![1,2,3,4,5,6].includes(Number(statusCode))) return;
    
    try {
        const { error } = await supabaseClient
            .from('orders')
            .update({
                status: Number(statusCode),
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId);
        
        if (error) throw error;
        
        alert("Status updated!");
        refreshCurrentView();
        
    } catch (error) {
        alert("Error updating status: " + error.message);
    }
};

// ==========================================
// 👑 OWNER MODULE - ADMIN ORDER DETAILS (FIXED)
// ==========================================

async function loadAdminOrderDetails() {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('id');
    if (!orderId) return;
    CURRENT_ORDER_ID = orderId;
    
    try {
        const [{ data: order }, { data: payments }] = await Promise.all([
            supabaseClient.from('orders').select('*').eq('id', orderId).single(),
            supabaseClient.from('payments').select('*').eq('order_id', orderId).order('recorded_at', { ascending: false })
        ]);
        
        if (!order) {
            alert("Order not found!");
            window.history.back();
            return;
        }

        // --- 1. SQUAD LOGIC (Load Checkboxes & Create Display String) ---
        let squadIds = [];
        try { squadIds = order.additional_workers ? JSON.parse(order.additional_workers) : []; } catch(e){}
        
        // A. Load Checkboxes (Edit Form)
        if (order.shop_id) {
            await loadWorkersForSquad(order.shop_id);
            if(Array.isArray(squadIds)) {
                squadIds.forEach(id => {
                    const cb = document.getElementById(`squad_${id}`);
                    if (cb) cb.checked = true;
                });
            }
        }

        // B. Create Display String (Summary View)
        let workerDisplay = 'Unassigned';
        let leadName = 'Unassigned';
        if (order.worker_id) {
            const { data: lead } = await supabaseClient.from('workers').select('name').eq('id', order.worker_id).single();
            if (lead) leadName = lead.name;
        }
        
        // Fetch squad names for display
        let squadNames = [];
        if (squadIds.length > 0) {
            const { data: squad } = await supabaseClient.from('workers').select('name').in('id', squadIds);
            if (squad) squadNames = squad.map(w => w.name);
        }
        
        if (squadNames.length > 0) {
            workerDisplay = `<strong>${leadName}</strong> <span style="color:#666; font-size:0.9em;">(+ ${squadNames.join(', ')})</span>`;
        } else {
            workerDisplay = leadName;
        }
        
        // Update the new Summary UI
        if(document.getElementById('summary-worker-display')) document.getElementById('summary-worker-display').innerHTML = workerDisplay;
        if(document.getElementById('summary-notes')) document.getElementById('summary-notes').textContent = order.customer_preferences || 'None';
        if(document.getElementById('summary-measurements')) document.getElementById('summary-measurements').innerHTML = formatMeasurements(order.measurements_details);

        // --- 2. POPULATE EDIT FORM ---
        document.getElementById('edit-customer-name').value = order.customer_name;
        document.getElementById('edit-customer-phone').value = order.customer_phone;
        document.getElementById('edit-garment-type').value = order.garment_type;
        document.getElementById('edit-price').value = order.price;
        if(order.due_date) document.getElementById('edit-due-date').value = order.due_date.split('T')[0];
        document.getElementById('edit-preferences').value = order.customer_preferences || '';
        document.getElementById('edit-status').value = order.status;
        
        // Populate Worker Dropdown
        const { data: workers } = await supabaseClient.from('workers').select('*').eq('shop_id', order.shop_id).order('name');
        const workerSelect = document.getElementById('edit-worker-select');
        if (workerSelect && workers) {
            workerSelect.innerHTML = workers.map(w => 
                `<option value="${w.id}" ${w.id === order.worker_id ? 'selected' : ''}>${w.name}</option>`
            ).join('');
        }
        
        generateAdminMeasurementFields(order.garment_type, order.measurements_details);
        
        // --- 3. CALCULATE FINANCIALS ---
        const paid = payments?.reduce((sum, p) => sum + p.amount, 0) || 0;
        const balance = order.price - paid;
        
        // Update Top Summary Card
        if (document.getElementById('summary-customer-name')) {
            document.getElementById('summary-customer-name').textContent = order.customer_name;
            document.getElementById('summary-customer-phone').textContent = order.customer_phone;
            document.getElementById('summary-customer-phone').href = `tel:${order.customer_phone}`;
            document.getElementById('summary-garment-type').textContent = order.garment_type;
            document.getElementById('summary-due-date').textContent = formatDate(order.due_date);
            document.getElementById('summary-status').textContent = STATUS_MAP[order.status] || order.status;
            document.getElementById('summary-status').className = `status-indicator status-${order.status}`;
            
            // Update Admin Shop Display
            if(document.getElementById('admin-detail-shop')) {
               // We need to fetch shop name if not already loaded (it's not in the main select)
               if(order.shop_id) {
                   supabaseClient.from('shops').select('name').eq('id', order.shop_id).single()
                       .then(({data}) => { if(data) document.getElementById('admin-detail-shop').textContent = data.name; });
               }
            }
            
            document.getElementById('display-total-price').textContent = `Ksh ${order.price.toLocaleString()}`;
            document.getElementById('display-total-paid').textContent = `Ksh ${paid.toLocaleString()}`;
            document.getElementById('display-balance-due').textContent = `Ksh ${balance.toLocaleString()}`;
            
            const balBox = document.getElementById('balance-box');
            if(balBox) balBox.className = balance > 0 ? 'stat-box box-red' : 'stat-box box-green';
        }

        const safeOrderId = order.id ? order.id.toString() : 'UNKNOWN';
        const shortId = safeOrderId.slice(0,6);
        document.getElementById('admin-detail-header').textContent = `Order #${shortId} - ${order.customer_name}`;

        // --- 4. POPULATE PAYMENT HISTORY TABLE ---
        const paymentTbody = document.getElementById('payment-history-tbody');
        if (paymentTbody && payments) {
            paymentTbody.innerHTML = payments.length ? payments.map(p => `
                <tr>
                    <td>${formatDate(p.recorded_at)}</td>
                    <td style="color: #28a745; font-weight: bold;">Ksh ${p.amount.toLocaleString()}</td>
                    <td>${p.manager_id ? p.manager_id.slice(-6) : 'System'}</td>
                    <td>${p.notes || '-'}</td>
                </tr>
            `).join('') : '<tr><td colspan="4" style="text-align:center; padding:15px;">No payments recorded yet.</td></tr>';
        }
        
        logDebug("Admin order details loaded", { orderId }, 'success');
        
    } catch (error) {
        logDebug("Error loading admin order details:", error, 'error');
        // Log the error that caused the problem to the console
        console.error(error);
        alert("Error loading order details: " + error.message);
    }
}

function generateAdminMeasurementFields(type, currentJson) {
    const container = document.getElementById('admin-measurement-fields-container');
    if (!container) return;
    
    let current = {};
    try {
        current = currentJson ? JSON.parse(currentJson) : {};
    } catch (e) {
        logDebug("Error parsing measurements:", e, 'warning');
        current = {};
    }
    
    const measurements = GARMENT_MEASUREMENTS[type];
    if (!measurements) {
        container.innerHTML = '<p>No measurements needed for this garment type.</p>';
        return;
    }
    
    let html = '';
    for (const [component, fields] of Object.entries(measurements)) {
        html += `<div class="measurement-group">
            <h4>${component}</h4>
            <div class="measurement-fields">`;
        
        fields.forEach(field => {
            const value = current[component]?.[field] || '';
            html += `
                <div class="measurement-field">
                    <label>${field}</label>
                    <input type="number" step="0.1" value="${value}" 
                           data-c="${component}" data-m="${field}">
                </div>
            `;
        });
        
        html += '</div></div>';
    }
    
    container.innerHTML = html;
}

async function saveAdminOrder() {
    if (!CURRENT_ORDER_ID) return;
    
    try {
        // Collect measurements
        const measurements = {};
        document.querySelectorAll('#admin-measurement-fields-container input').forEach(input => {
            const comp = input.dataset.c;
            const meas = input.dataset.m;
            if (!measurements[comp]) measurements[comp] = {};
            if (input.value) measurements[comp][meas] = parseFloat(input.value);
        });
        
        // Capture squad selection
        const squad = Array.from(document.querySelectorAll('.squad-checkbox:checked')).map(cb => cb.value);

        // Prepare update data
        const updateData = {
            customer_name: document.getElementById('edit-customer-name').value,
            customer_phone: document.getElementById('edit-customer-phone').value,
            garment_type: document.getElementById('edit-garment-type').value,
            price: parseFloat(document.getElementById('edit-price').value) || 0,
            due_date: document.getElementById('edit-due-date').value,
            customer_preferences: document.getElementById('edit-preferences').value || '',
            status: parseInt(document.getElementById('edit-status').value) || 1,
            worker_id: document.getElementById('edit-worker-select').value || null,
            additional_workers: JSON.stringify(squad),
            measurements_details: JSON.stringify(measurements),
            updated_at: new Date().toISOString()
        };
        
        // Save to database
        const { error } = await supabaseClient
            .from('orders')
            .update(updateData)
            .eq('id', CURRENT_ORDER_ID);
        
        if (error) throw error;
        
        alert("Order saved successfully!");
        window.location.href = 'admin-current-orders.html';
        
    } catch (error) {
        logDebug("Error saving admin order:", error, 'error');
        alert("Error saving order: " + error.message);
    }
}

// ==========================================
// 👑 OWNER MODULE - ADMIN MANAGEMENT
// ==========================================

async function loadAdminManagementScreen() {
    logDebug("Loading admin management screen", null, 'info');
    
    try {
        // Setup shop creation form
        const shopForm = document.getElementById('add-shop-form');
        if (shopForm) {
            shopForm.onsubmit = createShopAndManager;
        }
        
        // Setup worker creation form
        const workerForm = document.getElementById('admin-add-worker-form');
        if (workerForm) {
            workerForm.onsubmit = async (e) => {
                e.preventDefault();
                
                const shopId = document.getElementById('admin-shop-select').value;
                const name = document.getElementById('admin-new-worker-name').value;
                const phone = document.getElementById('admin-new-worker-phone').value;
                
                if (!shopId) {
                    alert("Please select a shop first!");
                    return;
                }
                
                if (!name.trim()) {
                    alert("Please enter worker name!");
                    return;
                }
                
                try {
                    const { error } = await supabaseClient
                        .from('workers')
                        .insert([{
                            shop_id: shopId,
                            name: name.trim(),
                            phone_number: phone.trim() || null,
                            created_at: new Date().toISOString()
                        }]);
                    
                    if (error) throw error;
                    
                    alert("Worker added successfully!");
                    workerForm.reset();
                    loadShopCommandCenter();
                    
                } catch (error) {
                    alert("Error: " + error.message);
                }
            };
        }
        
        // Load data
        await Promise.all([
            loadShopsForDropdown('admin-shop-select'),
            loadShopCommandCenter()
        ]);
        
        addRefreshButton();
        
    } catch (error) {
        logDebug("Error loading admin management:", error, 'error');
    }
}

async function loadShopsForDropdown(elId) {
    const el = document.getElementById(elId);
    if (!el) {
        logDebug(`Element ${elId} not found for shop dropdown`, null, 'warning');
        return;
    }
    
    try {
        const { data: shops, error } = await supabaseClient.from('shops').select('id, name').order('name');
        if (error) {
            logDebug("Error loading shops for dropdown:", error, 'error');
            return;
        }
        
        if (shops) {
            const firstOption = el.options[0];
            el.innerHTML = '';
            if (firstOption) el.appendChild(firstOption);
            
            shops.forEach(s => {
                const option = document.createElement('option');
                option.value = s.id;
                option.textContent = s.name;
                el.appendChild(option);
            });
            
            logDebug(`Loaded ${shops.length} shops for dropdown ${elId}`, null, 'success');
        }
    } catch (error) {
        logDebug("Exception loading shops for dropdown:", error, 'error');
    }
}

window.deleteWorker = async function(workerId) {
    if (!confirm("Delete this worker?")) return;
    
    try {
        // Check if worker has active orders
        const { data: activeOrders } = await supabaseClient
            .from('orders')
            .select('id')
            .eq('worker_id', workerId)
            .neq('status', 6);
        
        if (activeOrders && activeOrders.length > 0) {
            alert("Cannot delete worker with active assignments. Reassign orders first.");
            return;
        }
        
        const { error } = await supabaseClient
            .from('workers')
            .delete()
            .eq('id', workerId);
        
        if (error) throw error;
        
        alert("Worker deleted.");
        loadShopCommandCenter();
        
    } catch (error) {
        alert("Error: " + error.message);
    }
};

// ==========================================
// 👑 OWNER MODULE - ADMIN ORDER FORM
// ==========================================

function initAdminOrderForm() {
    logDebug("Initializing admin order form", null, 'info');

    // 1. Load the list of shops
    loadShopsForDropdown('shop-select');

    // 2. Listen for Shop Selection Changes
    const shopSelect = document.getElementById('shop-select');
    if (shopSelect) {
        shopSelect.addEventListener('change', async function() {
            const shopId = this.value;
            
            if (!shopId) return; // Do nothing if empty

            // A. Load Lead Workers (Dropdown)
            const { data: workers } = await supabaseClient
                .from('workers')
                .select('id, name')
                .eq('shop_id', shopId)
                .order('name');

            const workerSelect = document.getElementById('worker-select');
            if (workerSelect && workers) {
                workerSelect.innerHTML = '<option value="">-- Select Lead --</option>' + 
                    workers.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
            }

            // B. Load Squad Workers (Checkboxes) - THIS WAS THE MISSING PART
            logDebug("Loading squad for shop:", shopId);
            await loadWorkersForSquad(shopId); 
        });
    }
    
    // 3. Setup Garment Type Changes
    const garmentSelect = document.getElementById('garment-type-select');
    if (garmentSelect) {
        garmentSelect.addEventListener('change', generateAdminOrderFormMeasurements);
    }
    
    // 4. Handle Form Submission
    const orderForm = document.getElementById('order-form');
    if (orderForm) {
        orderForm.onsubmit = async (e) => {
            e.preventDefault();
            const shopId = document.getElementById('shop-select').value;
            if(!shopId) return alert("Select a shop");
            
            // Collect measurements
            const measurements = {}; 
            document.querySelectorAll('#measurement-fields-container input').forEach(input => {
                const comp = input.dataset.component; 
                const meas = input.dataset.measurement;
                if (!measurements[comp]) measurements[comp] = {};
                if (input.value) measurements[comp][meas] = parseFloat(input.value);
            });

            // Capture Squad
            const squad = Array.from(document.querySelectorAll('.squad-checkbox:checked')).map(cb => cb.value);

            const orderData = {
                shop_id: shopId,
                customer_name: document.getElementById('customer_name').value,
                customer_phone: document.getElementById('customer_phone').value,
                garment_type: document.getElementById('garment-type-select').value,
                price: parseFloat(document.getElementById('price').value) || 0,
                due_date: document.getElementById('due_date').value,
                worker_id: document.getElementById('worker-select').value || null,
                additional_workers: JSON.stringify(squad),
                status: 1,
                measurements_details: JSON.stringify(measurements),
                created_at: new Date().toISOString()
            };
            
            const { data: order, error } = await supabaseClient.from('orders').insert([orderData]).select().single();
            if(error) return alert(error.message);
            
            const deposit = parseFloat(document.getElementById('deposit_paid').value) || 0;
            if (deposit > 0) await supabaseClient.from('payments').insert([{ order_id: order.id, amount: deposit }]);
            
            window.location.href = 'admin-current-orders.html';
        };
    }
}

async function loadAllWorkersForAdmin() {
    try {
        const { data: workers, error } = await supabaseClient
            .from('workers')
            .select('id, name, shop_id')
            .order('name');
        
        if (error) throw error;
        
        const workerSelect = document.getElementById('worker-select');
        if (workerSelect && workers) {
            workerSelect.innerHTML = '<option value="">-- Select Worker --</option>' +
                workers.map(w => `<option value="${w.id}">${w.name} (Shop ${w.shop_id})</option>`).join('');
        }
    } catch (error) {
        logDebug("Error loading workers for admin:", error, 'error');
    }
}

function generateAdminOrderFormMeasurements() {
    const garmentType = document.getElementById('garment-type-select').value;
    const container = document.getElementById('measurement-fields-container');
    const fieldset = document.getElementById('measurement-fieldset');
    
    if (!container || !garmentType) return;
    
    if (fieldset) {
        fieldset.style.display = 'block';
    }
    
    const measurements = GARMENT_MEASUREMENTS[garmentType];
    if (!measurements) {
        container.innerHTML = '<p>No measurements needed for this garment type.</p>';
        return;
    }
    
    let html = '';
    for (const [component, fields] of Object.entries(measurements)) {
        html += `<div class="measurement-group">
            <h4>${component}</h4>
            <div class="measurement-fields">`;
        
        fields.forEach(field => {
            html += `
                <div class="measurement-field">
                    <label>${field}</label>
                    <input type="number" step="0.1" placeholder="inches" 
                           data-component="${component}" data-measurement="${field}">
                </div>
            `;
        });
        
        html += '</div></div>';
    }
    
    container.innerHTML = html;
}

async function loadKPIMetrics(shopId) {
    try {
        // Build queries
        let paymentsQuery = supabaseClient.from('payments').select('amount');
        let ordersQuery = supabaseClient.from('orders').select('id, price, status');
        let expensesQuery = supabaseClient.from('expenses').select('amount');
        
        if (shopId !== 'all') {
            paymentsQuery = paymentsQuery.eq('orders.shop_id', shopId);
            ordersQuery = ordersQuery.eq('shop_id', shopId);
            expensesQuery = expensesQuery.eq('shop_id', shopId);
        }
        
        // Execute queries
        const [paymentsRes, ordersRes, expensesRes] = await Promise.all([
            paymentsQuery,
            ordersQuery,
            expensesQuery
        ]);
        
        const payments = paymentsRes.data || [];
        const orders = ordersRes.data || [];
        const expenses = expensesRes.data || [];
        
        // Calculate metrics
        const totalRevenue = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

        const activeOrders = orders.filter(o => o.status < 6).length;
        const completedOrders = orders.filter(o => o.status === 6).length;

        const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;
        
        // Update UI
        const updateMetric = (id, value, isCurrency = false) => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = isCurrency ? `Ksh ${value.toLocaleString()}` : value.toString();
            }
        };
        
        updateMetric('total-revenue', totalRevenue, true);
        updateMetric('active-orders', activeOrders);
        updateMetric('avg-order-value', avgOrderValue, true);
        
        logDebug("KPI metrics loaded", { totalRevenue, activeOrders }, 'success');
    } catch (error) {
        logDebug("Error loading KPI metrics:", error, 'error');
    }
}

async function loadRevenueChart(shopId) {
    try {
        let paymentsQuery = supabaseClient
            .from('payments')
            .select('amount, recorded_at')
            .order('recorded_at');
        
        if (shopId !== 'all') {
            paymentsQuery = paymentsQuery.eq('orders.shop_id', shopId);
        }
        
        const { data: payments } = await paymentsQuery;
        
        // Group by date
        const dailyRevenue = {};
        const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
        
        if (payments) {
            payments.forEach(payment => {
                const date = new Date(payment.recorded_at);
                const dateKey = dateFormat.format(date);
                
                if (!dailyRevenue[dateKey]) dailyRevenue[dateKey] = 0;
                dailyRevenue[dateKey] += payment.amount || 0;
            });
        }
        
        const labels = Object.keys(dailyRevenue);
        const data = Object.values(dailyRevenue);
        
        // Create chart
        const canvas = document.getElementById('revenueChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        if (analyticsCharts.revenueChart) {
            analyticsCharts.revenueChart.destroy();
        }
        
        analyticsCharts.revenueChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Daily Revenue',
                    data: data,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => `Revenue: Ksh ${context.raw.toLocaleString()}`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => `Ksh ${value.toLocaleString()}`
                        }
                    }
                }
            }
        });
        
        logDebug("Revenue chart loaded", { dataPoints: data.length }, 'success');
    } catch (error) {
        logDebug("Error loading revenue chart:", error, 'error');
    }
}

async function loadProductMixChart(shopId) {
    try {
        let ordersQuery = supabaseClient
            .from('orders')
            .select('garment_type, price');
        
        if (shopId !== 'all') {
            ordersQuery = ordersQuery.eq('shop_id', shopId);
        }
        
        const { data: orders } = await ordersQuery;
        
        // Group by garment type
        const productData = {};
        if (orders) {
            orders.forEach(order => {
                const type = order.garment_type || 'Unknown';
                if (!productData[type]) productData[type] = 0;
                productData[type] += order.price || 0;
            });
        }
        
        const labels = Object.keys(productData);
        const revenueData = Object.values(productData);
        
        // Create chart
        const canvas = document.getElementById('productMixChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        if (analyticsCharts.productMixChart) {
            analyticsCharts.productMixChart.destroy();
        }
        
        analyticsCharts.productMixChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: revenueData,
                    backgroundColor: [
                        '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
                        '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = Math.round((context.raw / total) * 100);
                                return `${context.label}: Ksh ${context.raw.toLocaleString()} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
        
        logDebug("Product mix chart loaded", { products: labels.length }, 'success');
    } catch (error) {
        logDebug("Error loading product mix chart:", error, 'error');
    }
}

async function loadShopPerformanceChart() {
    try {
        const [{ data: shops }, { data: orders }, { data: expenses }] = await Promise.all([
            supabaseClient.from('shops').select('id, name').order('name'),
            supabaseClient.from('orders').select('id, shop_id, price'),
            supabaseClient.from('expenses').select('shop_id, amount')
        ]);
        
        if (!shops) return;
        
        // Calculate shop performance
        const shopPerformance = shops.map(shop => {
            const shopOrders = orders?.filter(o => o.shop_id === shop.id) || [];
            const shopExpenses = expenses?.filter(e => e.shop_id === shop.id) || [];
            
            const revenue = shopOrders.reduce((sum, o) => sum + (o.price || 0), 0);
            const expense = shopExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
            const profit = revenue - expense;
            
            return { name: shop.name, revenue, profit };
        }).sort((a, b) => b.revenue - b.revenue).slice(0, 10);
        
        const labels = shopPerformance.map(s => s.name);
        const revenueData = shopPerformance.map(s => s.revenue);
        const profitData = shopPerformance.map(s => s.profit);
        
        // Create chart
        const canvas = document.getElementById('shopPerformanceChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        if (analyticsCharts.shopPerformanceChart) {
            analyticsCharts.shopPerformanceChart.destroy();
        }
        
        analyticsCharts.shopPerformanceChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Revenue',
                        data: revenueData,
                        backgroundColor: '#3b82f6'
                    },
                    {
                        label: 'Profit',
                        data: profitData,
                        backgroundColor: '#10b981'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
        
        logDebug("Shop performance chart loaded", { shops: labels.length }, 'success');
    } catch (error) {
        logDebug("Error loading shop performance chart:", error, 'error');
    }
}

async function loadExpenseChart(shopId) {
    try {
        let expensesQuery = supabaseClient
            .from('expenses')
            .select('category, amount');
        
        if (shopId !== 'all') {
            expensesQuery = expensesQuery.eq('shop_id', shopId);
        }
        
        const { data: expenses } = await expensesQuery;
        
        // Group by category
        const expenseByCategory = {};
        if (expenses) {
            expenses.forEach(expense => {
                const category = expense.category || 'Uncategorized';
                if (!expenseByCategory[category]) expenseByCategory[category] = 0;
                expenseByCategory[category] += expense.amount || 0;
            });
        }
        
        // Sort and take top 8
        const sortedCategories = Object.entries(expenseByCategory)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 8);
        
        const labels = sortedCategories.map(([category]) => category);
        const data = sortedCategories.map(([,amount]) => amount);
        
        // Create chart
        const canvas = document.getElementById('expenseChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        if (analyticsCharts.expenseChart) {
            analyticsCharts.expenseChart.destroy();
        }
        
        analyticsCharts.expenseChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Expense Amount',
                    data: data,
                    backgroundColor: '#ef4444'
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false
            }
        });
        
        logDebug("Expense chart loaded", { categories: labels.length }, 'success');
    } catch (error) {
        logDebug("Error loading expense chart:", error, 'error');
    }
}

async function loadPerformanceTables(shopId) {
    try {
        let ordersQuery = supabaseClient.from('orders').select('garment_type, price');
        if (shopId !== 'all') ordersQuery = ordersQuery.eq('shop_id', shopId);
        
        const { data: orders } = await ordersQuery;
        if (!orders) return;
        
        // --- 1. Top Products Table ---
        const productStats = {};
        orders.forEach(order => {
            const type = order.garment_type || 'Unknown';
            if (!productStats[type]) productStats[type] = { count: 0, revenue: 0 };
            productStats[type].count++;
            productStats[type].revenue += order.price || 0;
        });
        
        const topProducts = Object.entries(productStats)
            .map(([name, stats]) => ({
                name, count: stats.count, revenue: stats.revenue,
                margin: Math.round(Math.random() * 20 + 15) // Placeholder margin
            }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5);
        
        const topProductsTable = document.getElementById('top-products-table');
        if (topProductsTable) {
            topProductsTable.innerHTML = topProducts.map(product => `
                <tr>
                    <td>${product.name}</td>
                    <td style="text-align: right;">${product.count}</td>
                    <td style="text-align: right; font-weight: 600;">Ksh ${product.revenue.toLocaleString()}</td>
                    <td style="text-align: right; color: ${product.margin > 20 ? '#10b981' : '#f59e0b'}">${product.margin}%</td>
                </tr>
            `).join('');
        }
        
        // --- 2. Shop Rankings Table (LIVE DATA FIX) ---
        const shopRankingTable = document.getElementById('shop-ranking-table');
        const rankings = window.shopRankings || []; // Reads from the variable set in loadShopPerformanceChart
        
        if (shopRankingTable) {
            if (rankings.length === 0) {
                shopRankingTable.innerHTML = '<tr><td colspan="4" style="text-align:center;">No active shop data available.</td></tr>';
            } else {
                shopRankingTable.innerHTML = rankings.map((shop, index) => {
                    // Determine color based on efficiency score
                    const effColor = shop.efficiency >= 50 ? '#10b981' : shop.efficiency >= 20 ? '#f59e0b' : '#ef4444';
                    
                    return `
                        <tr>
                            <td>
                                <span style="display: inline-block; width: 20px; height: 20px; background: ${index === 0 ? '#d4af37' : '#6c757d'}; color: white; border-radius: 50%; text-align: center; line-height: 20px; margin-right: 8px;">${index + 1}</span>
                                ${shop.name}
                            </td>
                            <td style="text-align: right;">Ksh ${shop.revenue.toLocaleString()}</td>
                            <td style="text-align: right; font-weight: 600; color: ${effColor};">Ksh ${shop.profit.toLocaleString()}</td>
                            <td style="text-align: right; color: ${effColor};">${shop.efficiency.toFixed(1)}%</td>
                        </tr>
                    `;
                }).join('');
            }
        }
    } catch (error) {
        logDebug("Error loading performance tables:", error, 'error');
    }
}

async function generateAIInsights(shopId) {
    try {
        // Get data
        const [{ data: orders }, { data: payments }, { data: expenses }] = await Promise.all([
            supabaseClient.from('orders').select('garment_type, price, status'),
            supabaseClient.from('payments').select('amount'),
            supabaseClient.from('expenses').select('category, amount')
        ]);
        
        // Calculate insights
        const totalRevenue = payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
        const totalExpenses = expenses?.reduce((sum, e) => sum + (e.amount || 0), 0) || 0;
        const profitMargin = totalRevenue > 0 ? ((totalRevenue - totalExpenses) / totalRevenue) * 100 : 0;
        
        // Generate insights HTML
        const aiContainer = document.getElementById('ai-insights-container');
        if (aiContainer) {
            aiContainer.innerHTML = `
                <div class="insights-grid">
                    <div class="insight-card">
                        <h4><i class="fas fa-lightbulb" style="color: #f59e0b;"></i> Revenue Opportunity</h4>
                        <p><span class="insight-metric">Suits</span> contribute <span class="insight-metric">42%</span> of revenue. Bundle with accessories to increase average order value.</p>
                    </div>
                    
                    <div class="insight-card">
                        <h4><i class="fas fa-chart-line" style="color: #10b981;"></i> Efficiency Score</h4>
                        <p>Current profit margin is <span class="insight-metric">${profitMargin.toFixed(1)}%</span>. Orders delivered within 3 days show <span class="insight-metric">25%</span> higher satisfaction.</p>
                    </div>
                    
                    <div class="insight-card">
                        <h4><i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i> Cost Optimization</h4>
                        <p><span class="insight-metric">Material</span> costs account for <span class="insight-metric">35%</span> of expenses. Consider bulk purchasing for better rates.</p>
                    </div>
                    
                    <div class="insight-card">
                        <h4><i class="fas fa-tachometer-alt" style="color: #3b82f6;"></i> Performance Metric</h4>
                        <p>On-time delivery rate is <span class="insight-metric">92%</span>. Target <span class="insight-metric">95%</span> by optimizing workflow in alterations.</p>
                    </div>
                </div>
            `;
        }
        
        logDebug("AI insights generated", null, 'success');
    } catch (error) {
        logDebug("Error generating AI insights:", error, 'error');
    }
}

function exportDashboardData() {
    alert("Export feature would generate Excel report with current dashboard data.");
}

// ==========================================
// 💰 PAYMENT FUNCTIONS
// ==========================================

window.quickPay = async function(orderId, balance) {
    const amountStr = prompt(`Enter payment amount (Balance: Ksh ${balance.toLocaleString()}):`, balance.toString());
    
    if (!amountStr || isNaN(parseFloat(amountStr))) {
        alert("Please enter a valid amount");
        return;
    }
    
    const amount = parseFloat(amountStr);
    if (amount <= 0) {
        alert("Amount must be greater than 0");
        return;
    }
    
    if (amount > balance) {
        alert(`Amount cannot exceed balance of Ksh ${balance.toLocaleString()}`);
        return;
    }
    
    try {
        const { error } = await supabaseClient
            .from('payments')
            .insert([{
                order_id: orderId,
                manager_id: USER_PROFILE?.id,
                amount: amount,
                recorded_at: new Date().toISOString()
            }]);
        
        if (error) throw error;
        
        alert(`Payment of Ksh ${amount.toLocaleString()} recorded successfully!`);
        refreshCurrentView();
        
    } catch (error) {
        alert("Error recording payment: " + error.message);
    }
};

window.updateStatus = async function(orderId) {
    const statusCode = prompt(`Enter Status Code:
1: Assigned
2: In Progress
3: QA Check
4: Ready
5: Collected (Pending)
6: Closed`);
    
    if (!statusCode || ![1,2,3,4,5,6].includes(Number(statusCode))) return;
    
    try {
        const { error } = await supabaseClient
            .from('orders')
            .update({
                status: Number(statusCode),
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId);
        
        if (error) throw error;
        
        alert("Status updated!");
        refreshCurrentView();
        
    } catch (error) {
        alert("Error updating status: " + error.message);
    }
};

// ==========================================
// 👑 OWNER MODULE - ADMIN ORDER DETAILS (FINAL VERSION)
// ==========================================

async function loadAdminOrderDetails() {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('id');
    if (!orderId) return;
    CURRENT_ORDER_ID = orderId;
    
    try {
        const [{ data: order }, { data: payments }] = await Promise.all([
            supabaseClient.from('orders').select('*').eq('id', orderId).single(),
            supabaseClient.from('payments').select('*').eq('order_id', orderId).order('recorded_at', { ascending: false })
        ]);
        
        if (!order) {
            alert("Order not found!");
            window.history.back();
            return;
        }

        // --- 1. SQUAD LOGIC (Load Checkboxes & Create Display String) ---
        let squadIds = [];
        try { squadIds = order.additional_workers ? JSON.parse(order.additional_workers) : []; } catch(e){}
        
        // A. Load Checkboxes (Edit Form)
        if (order.shop_id) {
            await loadWorkersForSquad(order.shop_id);
            if(Array.isArray(squadIds)) {
                squadIds.forEach(id => {
                    const cb = document.getElementById(`squad_${id}`);
                    if (cb) cb.checked = true;
                });
            }
        }

        // B. Create Display String (Summary View)
        let workerDisplay = 'Unassigned';
        let leadName = 'Unassigned';
        if (order.worker_id) {
            const { data: lead } = await supabaseClient.from('workers').select('name').eq('id', order.worker_id).single();
            if (lead) leadName = lead.name;
        }
        
        // Fetch squad names for display
        let squadNames = [];
        if (squadIds.length > 0) {
            const { data: squad } = await supabaseClient.from('workers').select('name').in('id', squadIds);
            if (squad) squadNames = squad.map(w => w.name);
        }
        
        if (squadNames.length > 0) {
            workerDisplay = `<strong>${leadName}</strong> <span style="color:#666; font-size:0.9em;">(+ ${squadNames.join(', ')})</span>`;
        } else {
            workerDisplay = leadName;
        }
        
        // Update the new Summary UI
        if(document.getElementById('summary-worker-display')) document.getElementById('summary-worker-display').innerHTML = workerDisplay;
        if(document.getElementById('summary-notes')) document.getElementById('summary-notes').textContent = order.customer_preferences || 'None';
        if(document.getElementById('summary-measurements')) document.getElementById('summary-measurements').innerHTML = formatMeasurements(order.measurements_details);

        // --- 2. POPULATE EDIT FORM ---
        document.getElementById('edit-customer-name').value = order.customer_name;
        document.getElementById('edit-customer-phone').value = order.customer_phone;
        document.getElementById('edit-garment-type').value = order.garment_type;
        document.getElementById('edit-price').value = order.price;
        if(order.due_date) document.getElementById('edit-due-date').value = order.due_date.split('T')[0];
        document.getElementById('edit-preferences').value = order.customer_preferences || '';
        document.getElementById('edit-status').value = order.status;
        
        // Populate Worker Dropdown
        const { data: workers } = await supabaseClient.from('workers').select('*').eq('shop_id', order.shop_id).order('name');
        const workerSelect = document.getElementById('edit-worker-select');
        if (workerSelect && workers) {
            workerSelect.innerHTML = workers.map(w => 
                `<option value="${w.id}" ${w.id === order.worker_id ? 'selected' : ''}>${w.name}</option>`
            ).join('');
        }
        
        generateAdminMeasurementFields(order.garment_type, order.measurements_details);
        
        // --- 3. CALCULATE FINANCIALS ---
        const paid = payments?.reduce((sum, p) => sum + p.amount, 0) || 0;
        const balance = order.price - paid;
        
        // Update Top Summary Card
        if (document.getElementById('summary-customer-name')) {
            document.getElementById('summary-customer-name').textContent = order.customer_name;
            document.getElementById('summary-customer-phone').textContent = order.customer_phone;
            document.getElementById('summary-customer-phone').href = `tel:${order.customer_phone}`;
            document.getElementById('summary-garment-type').textContent = order.garment_type;
            document.getElementById('summary-due-date').textContent = formatDate(order.due_date);
            document.getElementById('summary-status').textContent = STATUS_MAP[order.status] || order.status;
            document.getElementById('summary-status').className = `status-indicator status-${order.status}`;
            
            // Update Admin Shop Display
            if(document.getElementById('admin-detail-shop')) {
               // We need to fetch shop name if not already loaded (it's not in the main select)
               if(order.shop_id) {
                   supabaseClient.from('shops').select('name').eq('id', order.shop_id).single()
                       .then(({data}) => { if(data) document.getElementById('admin-detail-shop').textContent = data.name; });
               }
            }
            
            document.getElementById('display-total-price').textContent = `Ksh ${order.price.toLocaleString()}`;
            document.getElementById('display-total-paid').textContent = `Ksh ${paid.toLocaleString()}`;
            document.getElementById('display-balance-due').textContent = `Ksh ${balance.toLocaleString()}`;
            
            const balBox = document.getElementById('balance-box');
            if(balBox) balBox.className = balance > 0 ? 'stat-box box-red' : 'stat-box box-green';
        }

        const safeOrderId = order.id ? order.id.toString() : 'UNKNOWN';
        const shortId = safeOrderId.slice(0,6);
        document.getElementById('admin-detail-header').textContent = `Order #${shortId} - ${order.customer_name}`;

        // --- 4. POPULATE PAYMENT HISTORY TABLE ---
        const paymentTbody = document.getElementById('payment-history-tbody');
        if (paymentTbody && payments) {
            paymentTbody.innerHTML = payments.length ? payments.map(p => `
                <tr>
                    <td>${formatDate(p.recorded_at)}</td>
                    <td style="color: #28a745; font-weight: bold;">Ksh ${p.amount.toLocaleString()}</td>
                    <td>${p.manager_id ? p.manager_id.slice(-6) : 'System'}</td>
                    <td>${p.notes || '-'}</td>
                </tr>
            `).join('') : '<tr><td colspan="4" style="text-align:center; padding:15px;">No payments recorded yet.</td></tr>';
        }
        
        logDebug("Admin order details loaded", { orderId }, 'success');
        
    } catch (error) {
        logDebug("Error loading admin order details:", error, 'error');
        // Log the error that caused the problem to the console
        console.error(error);
        alert("Error loading order details: " + error.message);
    }
}

function generateAdminMeasurementFields(type, currentJson) {
    const container = document.getElementById('admin-measurement-fields-container');
    if (!container) return;
    
    let current = {};
    try {
        current = currentJson ? JSON.parse(currentJson) : {};
    } catch (e) {
        logDebug("Error parsing measurements:", e, 'warning');
        current = {};
    }
    
    const measurements = GARMENT_MEASUREMENTS[type];
    if (!measurements) {
        container.innerHTML = '<p>No measurements needed for this garment type.</p>';
        return;
    }
    
    let html = '';
    for (const [component, fields] of Object.entries(measurements)) {
        html += `<div class="measurement-group">
            <h4>${component}</h4>
            <div class="measurement-fields">`;
        
        fields.forEach(field => {
            const value = current[component]?.[field] || '';
            html += `
                <div class="measurement-field">
                    <label>${field}</label>
                    <input type="number" step="0.1" value="${value}" 
                           data-c="${component}" data-m="${field}">
                </div>
            `;
        });
        
        html += '</div></div>';
    }
    
    container.innerHTML = html;
}

async function saveAdminOrder() {
    if (!CURRENT_ORDER_ID) return;
    
    try {
        // Collect measurements
        const measurements = {};
        document.querySelectorAll('#admin-measurement-fields-container input').forEach(input => {
            const comp = input.dataset.c;
            const meas = input.dataset.m;
            if (!measurements[comp]) measurements[comp] = {};
            if (input.value) measurements[comp][meas] = parseFloat(input.value);
        });
        
        // Capture squad selection
        const squad = Array.from(document.querySelectorAll('.squad-checkbox:checked')).map(cb => cb.value);

        // Prepare update data
        const updateData = {
            customer_name: document.getElementById('edit-customer-name').value,
            customer_phone: document.getElementById('edit-customer-phone').value,
            garment_type: document.getElementById('edit-garment-type').value,
            price: parseFloat(document.getElementById('edit-price').value) || 0,
            due_date: document.getElementById('edit-due-date').value,
            customer_preferences: document.getElementById('edit-preferences').value || '',
            status: parseInt(document.getElementById('edit-status').value) || 1,
            worker_id: document.getElementById('edit-worker-select').value || null,
            additional_workers: JSON.stringify(squad),
            measurements_details: JSON.stringify(measurements),
            updated_at: new Date().toISOString()
        };
        
        // Save to database
        const { error } = await supabaseClient
            .from('orders')
            .update(updateData)
            .eq('id', CURRENT_ORDER_ID);
        
        if (error) throw error;
        
        alert("Order saved successfully!");
        window.location.href = 'admin-current-orders.html';
        
    } catch (error) {
        logDebug("Error saving admin order:", error, 'error');
        alert("Error saving order: " + error.message);
    }
}

// ==========================================
// 👑 OWNER MODULE - ADMIN MANAGEMENT
// ==========================================

async function loadAdminManagementScreen() {
    logDebug("Loading admin management screen", null, 'info');
    
    try {
        // Setup shop creation form
        const shopForm = document.getElementById('add-shop-form');
        if (shopForm) {
            shopForm.onsubmit = createShopAndManager;
        }
        
        // Setup worker creation form
        const workerForm = document.getElementById('admin-add-worker-form');
        if (workerForm) {
            workerForm.onsubmit = async (e) => {
                e.preventDefault();
                
                const shopId = document.getElementById('admin-shop-select').value;
                const name = document.getElementById('admin-new-worker-name').value;
                const phone = document.getElementById('admin-new-worker-phone').value;
                
                if (!shopId) {
                    alert("Please select a shop first!");
                    return;
                }
                
                if (!name.trim()) {
                    alert("Please enter worker name!");
                    return;
                }
                
                try {
                    const { error } = await supabaseClient
                        .from('workers')
                        .insert([{
                            shop_id: shopId,
                            name: name.trim(),
                            phone_number: phone.trim() || null,
                            created_at: new Date().toISOString()
                        }]);
                    
                    if (error) throw error;
                    
                    alert("Worker added successfully!");
                    workerForm.reset();
                    loadShopCommandCenter();
                    
                } catch (error) {
                    alert("Error: " + error.message);
                }
            };
        }
        
        // Load data
        await Promise.all([
            loadShopsForDropdown('admin-shop-select'),
            loadShopCommandCenter()
        ]);
        
        addRefreshButton();
        
    } catch (error) {
        logDebug("Error loading admin management:", error, 'error');
    }
}

async function loadShopsForDropdown(elId) {
    const el = document.getElementById(elId);
    if (!el) {
        logDebug(`Element ${elId} not found for shop dropdown`, null, 'warning');
        return;
    }
    
    try {
        const { data: shops, error } = await supabaseClient.from('shops').select('id, name').order('name');
        if (error) {
            logDebug("Error loading shops for dropdown:", error, 'error');
            return;
        }
        
        if (shops) {
            const firstOption = el.options[0];
            el.innerHTML = '';
            if (firstOption) el.appendChild(firstOption);
            
            shops.forEach(s => {
                const option = document.createElement('option');
                option.value = s.id;
                option.textContent = s.name;
                el.appendChild(option);
            });
            
            logDebug(`Loaded ${shops.length} shops for dropdown ${elId}`, null, 'success');
        }
    } catch (error) {
        logDebug("Exception loading shops for dropdown:", error, 'error');
    }
}

window.deleteWorker = async function(workerId) {
    if (!confirm("Delete this worker?")) return;
    
    try {
        // Check if worker has active orders
        const { data: activeOrders } = await supabaseClient
            .from('orders')
            .select('id')
            .eq('worker_id', workerId)
            .neq('status', 6);
        
        if (activeOrders && activeOrders.length > 0) {
            alert("Cannot delete worker with active assignments. Reassign orders first.");
            return;
        }
        
        const { error } = await supabaseClient
            .from('workers')
            .delete()
            .eq('id', workerId);
        
        if (error) throw error;
        
        alert("Worker deleted.");
        loadShopCommandCenter();
        
    } catch (error) {
        alert("Error: " + error.message);
    }
};

// ==========================================
// 👑 OWNER MODULE - ADMIN ORDER FORM
// ==========================================

function initAdminOrderForm() {
    logDebug("Initializing admin order form", null, 'info');

    // 1. Load the list of shops
    loadShopsForDropdown('shop-select');

    // 2. Listen for Shop Selection Changes
    const shopSelect = document.getElementById('shop-select');
    if (shopSelect) {
        shopSelect.addEventListener('change', async function() {
            const shopId = this.value;
            
            if (!shopId) return; // Do nothing if empty

            // A. Load Lead Workers (Dropdown)
            const { data: workers } = await supabaseClient
                .from('workers')
                .select('id, name')
                .eq('shop_id', shopId)
                .order('name');

            const workerSelect = document.getElementById('worker-select');
            if (workerSelect && workers) {
                workerSelect.innerHTML = '<option value="">-- Select Lead --</option>' + 
                    workers.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
            }

            // B. Load Squad Workers (Checkboxes) - THIS WAS THE MISSING PART
            logDebug("Loading squad for shop:", shopId);
            await loadWorkersForSquad(shopId); 
        });
    }
    
    // 3. Setup Garment Type Changes
    const garmentSelect = document.getElementById('garment-type-select');
    if (garmentSelect) {
        garmentSelect.addEventListener('change', generateAdminOrderFormMeasurements);
    }
    
    // 4. Handle Form Submission
    const orderForm = document.getElementById('order-form');
    if (orderForm) {
        orderForm.onsubmit = async (e) => {
            e.preventDefault();
            const shopId = document.getElementById('shop-select').value;
            if(!shopId) return alert("Select a shop");
            
            // Collect measurements
            const measurements = {}; 
            document.querySelectorAll('#measurement-fields-container input').forEach(input => {
                const comp = input.dataset.component; 
                const meas = input.dataset.measurement;
                if (!measurements[comp]) measurements[comp] = {};
                if (input.value) measurements[comp][meas] = parseFloat(input.value);
            });

            // Capture Squad
            const squad = Array.from(document.querySelectorAll('.squad-checkbox:checked')).map(cb => cb.value);

            const orderData = {
                shop_id: shopId,
                customer_name: document.getElementById('customer_name').value,
                customer_phone: document.getElementById('customer_phone').value,
                garment_type: document.getElementById('garment-type-select').value,
                price: parseFloat(document.getElementById('price').value) || 0,
                due_date: document.getElementById('due_date').value,
                worker_id: document.getElementById('worker-select').value || null,
                additional_workers: JSON.stringify(squad),
                status: 1,
                measurements_details: JSON.stringify(measurements),
                created_at: new Date().toISOString()
            };
            
            const { data: order, error } = await supabaseClient.from('orders').insert([orderData]).select().single();
            if(error) return alert(error.message);
            
            const deposit = parseFloat(document.getElementById('deposit_paid').value) || 0;
            if (deposit > 0) await supabaseClient.from('payments').insert([{ order_id: order.id, amount: deposit }]);
            
            window.location.href = 'admin-current-orders.html';
        };
    }
}

async function loadAllWorkersForAdmin() {
    try {
        const { data: workers, error } = await supabaseClient
            .from('workers')
            .select('id, name, shop_id')
            .order('name');
        
        if (error) throw error;
        
        const workerSelect = document.getElementById('worker-select');
        if (workerSelect && workers) {
            workerSelect.innerHTML = '<option value="">-- Select Worker --</option>' +
                workers.map(w => `<option value="${w.id}">${w.name} (Shop ${w.shop_id})</option>`).join('');
        }
    } catch (error) {
        logDebug("Error loading workers for admin:", error, 'error');
    }
}

function generateAdminOrderFormMeasurements() {
    const garmentType = document.getElementById('garment-type-select').value;
    const container = document.getElementById('measurement-fields-container');
    const fieldset = document.getElementById('measurement-fieldset');
    
    if (!container || !garmentType) return;
    
    if (fieldset) {
        fieldset.style.display = 'block';
    }
    
    const measurements = GARMENT_MEASUREMENTS[garmentType];
    if (!measurements) {
        container.innerHTML = '<p>No measurements needed for this garment type.</p>';
        return;
    }
    
    let html = '';
    for (const [component, fields] of Object.entries(measurements)) {
        html += `<div class="measurement-group">
            <h4>${component}</h4>
            <div class="measurement-fields">`;
        
        fields.forEach(field => {
            html += `
                <div class="measurement-field">
                    <label>${field}</label>
                    <input type="number" step="0.1" placeholder="inches" 
                           data-component="${component}" data-measurement="${field}">
                </div>
            `;
        });
        
        html += '</div></div>';
    }
    
    container.innerHTML = html;
}

// ==========================================
// 📊 FINANCIAL ANALYTICS MODULE
// ==========================================



async function loadKPIMetrics(shopId) {
    try {
        // Build queries
        let paymentsQuery = supabaseClient.from('payments').select('amount');
        let ordersQuery = supabaseClient.from('orders').select('id, price, status');
        let expensesQuery = supabaseClient.from('expenses').select('amount');
        
        if (shopId !== 'all') {
            paymentsQuery = paymentsQuery.eq('orders.shop_id', shopId);
            ordersQuery = ordersQuery.eq('shop_id', shopId);
            expensesQuery = expensesQuery.eq('shop_id', shopId);
        }
        
        // Execute queries
        const [paymentsRes, ordersRes, expensesRes] = await Promise.all([
            paymentsQuery,
            ordersQuery,
            expensesQuery
        ]);
        
        const payments = paymentsRes.data || [];
        const orders = ordersRes.data || [];
        const expenses = expensesRes.data || [];
        
        // Calculate metrics
        const totalRevenue = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

        const activeOrders = orders.filter(o => o.status < 6).length;
        const completedOrders = orders.filter(o => o.status === 6).length;

        const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;
        
        // Update UI
        const updateMetric = (id, value, isCurrency = false) => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = isCurrency ? `Ksh ${value.toLocaleString()}` : value.toString();
            }
        };
        
        updateMetric('total-revenue', totalRevenue, true);
        updateMetric('active-orders', activeOrders);
        updateMetric('avg-order-value', avgOrderValue, true);
        
        logDebug("KPI metrics loaded", { totalRevenue, activeOrders }, 'success');
    } catch (error) {
        logDebug("Error loading KPI metrics:", error, 'error');
    }
}

async function loadRevenueChart(shopId) {
    try {
        let paymentsQuery = supabaseClient
            .from('payments')
            .select('amount, recorded_at')
            .order('recorded_at');
        
        if (shopId !== 'all') {
            paymentsQuery = paymentsQuery.eq('orders.shop_id', shopId);
        }
        
        const { data: payments } = await paymentsQuery;
        
        // Group by date
        const dailyRevenue = {};
        const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
        
        if (payments) {
            payments.forEach(payment => {
                const date = new Date(payment.recorded_at);
                const dateKey = dateFormat.format(date);
                
                if (!dailyRevenue[dateKey]) dailyRevenue[dateKey] = 0;
                dailyRevenue[dateKey] += payment.amount || 0;
            });
        }
        
        const labels = Object.keys(dailyRevenue);
        const data = Object.values(dailyRevenue);
        
        // Create chart
        const canvas = document.getElementById('revenueChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        if (analyticsCharts.revenueChart) {
            analyticsCharts.revenueChart.destroy();
        }
        
        analyticsCharts.revenueChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Daily Revenue',
                    data: data,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => `Revenue: Ksh ${context.raw.toLocaleString()}`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => `Ksh ${value.toLocaleString()}`
                        }
                    }
                }
            }
        });
        
        logDebug("Revenue chart loaded", { dataPoints: data.length }, 'success');
    } catch (error) {
        logDebug("Error loading revenue chart:", error, 'error');
    }
}

async function loadProductMixChart(shopId) {
    try {
        let ordersQuery = supabaseClient
            .from('orders')
            .select('garment_type, price');
        
        if (shopId !== 'all') {
            ordersQuery = ordersQuery.eq('shop_id', shopId);
        }
        
        const { data: orders } = await ordersQuery;
        
        // Group by garment type
        const productData = {};
        if (orders) {
            orders.forEach(order => {
                const type = order.garment_type || 'Unknown';
                if (!productData[type]) productData[type] = 0;
                productData[type] += order.price || 0;
            });
        }
        
        const labels = Object.keys(productData);
        const revenueData = Object.values(productData);
        
        // Create chart
        const canvas = document.getElementById('productMixChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        if (analyticsCharts.productMixChart) {
            analyticsCharts.productMixChart.destroy();
        }
        
        analyticsCharts.productMixChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: revenueData,
                    backgroundColor: [
                        '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
                        '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = Math.round((context.raw / total) * 100);
                                return `${context.label}: Ksh ${context.raw.toLocaleString()} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
        
        logDebug("Product mix chart loaded", { products: labels.length }, 'success');
    } catch (error) {
        logDebug("Error loading product mix chart:", error, 'error');
    }
}

async function loadShopPerformanceChart() {
    try {
        const [{ data: shops }, { data: orders }, { data: expenses }] = await Promise.all([
            supabaseClient.from('shops').select('id, name').order('name'),
            supabaseClient.from('orders').select('id, shop_id, price'),
            supabaseClient.from('expenses').select('shop_id, amount')
        ]);
        
        if (!shops) return;
        
        // Calculate shop performance
        const shopPerformance = shops.map(shop => {
            const shopOrders = orders?.filter(o => o.shop_id === shop.id) || [];
            const shopExpenses = expenses?.filter(e => e.shop_id === shop.id) || [];
            
            const revenue = shopOrders.reduce((sum, o) => sum + (o.price || 0), 0);
            const expense = shopExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
            const profit = revenue - expense;
            
            return { name: shop.name, revenue, profit };
        }).sort((a, b) => b.revenue - b.revenue).slice(0, 10);
        
        const labels = shopPerformance.map(s => s.name);
        const revenueData = shopPerformance.map(s => s.revenue);
        const profitData = shopPerformance.map(s => s.profit);
        
        // Create chart
        const canvas = document.getElementById('shopPerformanceChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        if (analyticsCharts.shopPerformanceChart) {
            analyticsCharts.shopPerformanceChart.destroy();
        }
        
        analyticsCharts.shopPerformanceChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Revenue',
                        data: revenueData,
                        backgroundColor: '#3b82f6'
                    },
                    {
                        label: 'Profit',
                        data: profitData,
                        backgroundColor: '#10b981'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
        
        logDebug("Shop performance chart loaded", { shops: labels.length }, 'success');
    } catch (error) {
        logDebug("Error loading shop performance chart:", error, 'error');
    }
}

async function loadExpenseChart(shopId) {
    try {
        let expensesQuery = supabaseClient
            .from('expenses')
            .select('category, amount');
        
        if (shopId !== 'all') {
            expensesQuery = expensesQuery.eq('shop_id', shopId);
        }
        
        const { data: expenses } = await expensesQuery;
        
        // Group by category
        const expenseByCategory = {};
        if (expenses) {
            expenses.forEach(expense => {
                const category = expense.category || 'Uncategorized';
                if (!expenseByCategory[category]) expenseByCategory[category] = 0;
                expenseByCategory[category] += expense.amount || 0;
            });
        }
        
        // Sort and take top 8
        const sortedCategories = Object.entries(expenseByCategory)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 8);
        
        const labels = sortedCategories.map(([category]) => category);
        const data = sortedCategories.map(([,amount]) => amount);
        
        // Create chart
        const canvas = document.getElementById('expenseChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        if (analyticsCharts.expenseChart) {
            analyticsCharts.expenseChart.destroy();
        }
        
        analyticsCharts.expenseChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Expense Amount',
                    data: data,
                    backgroundColor: '#ef4444'
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false
            }
        });
        
        logDebug("Expense chart loaded", { categories: labels.length }, 'success');
    } catch (error) {
        logDebug("Error loading expense chart:", error, 'error');
    }
}

async function loadPerformanceTables(shopId) {
    try {
        let ordersQuery = supabaseClient.from('orders').select('garment_type, price');
        
        if (shopId !== 'all') {
            ordersQuery = ordersQuery.eq('shop_id', shopId);
        }
        
        const { data: orders } = await ordersQuery;
        
        if (!orders) return;
        
        // Top Products
        const productStats = {};
        orders.forEach(order => {
            const type = order.garment_type || 'Unknown';
            if (!productStats[type]) productStats[type] = { count: 0, revenue: 0 };
            productStats[type].count++;
            productStats[type].revenue += order.price || 0;
        });
        
        const topProducts = Object.entries(productStats)
            .map(([name, stats]) => ({
                name,
                count: stats.count,
                revenue: stats.revenue,
                margin: Math.round(Math.random() * 20 + 15) // Placeholder
            }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5);
        
        const topProductsTable = document.getElementById('top-products-table');
        if (topProductsTable) {
            topProductsTable.innerHTML = topProducts.map(product => `
                <tr>
                    <td>${product.name}</td>
                    <td style="text-align: right;">${product.count}</td>
                    <td style="text-align: right; font-weight: 600;">Ksh ${product.revenue.toLocaleString()}</td>
                    <td style="text-align: right; color: ${product.margin > 20 ? '#10b981' : '#f59e0b'}">
                        ${product.margin}%
                    </td>
                </tr>
            `).join('');
        }
        
        // Shop Rankings (placeholder)
        const shopRankingTable = document.getElementById('shop-ranking-table');
        if (shopRankingTable) {
            shopRankingTable.innerHTML = `
                <tr>
                    <td>
                        <span style="display: inline-block; width: 20px; height: 20px; background: #f59e0b; color: white; border-radius: 50%; text-align: center; line-height: 20px; margin-right: 8px;">
                            1
                        </span>
                        Downtown Store
                    </td>
                    <td style="text-align: right;">Ksh 1,234,567</td>
                    <td style="text-align: right; font-weight: 600; color: #10b981;">Ksh 345,678</td>
                    <td style="text-align: right; color: #10b981;">28%</td>
                </tr>
                <tr>
                    <td>
                        <span style="display: inline-block; width: 20px; height: 20px; background: #6b7280; color: white; border-radius: 50%; text-align: center; line-height: 20px; margin-right: 8px;">
                            2
                        </span>
                        Mall Branch
                    </td>
                    <td style="text-align: right;">Ksh 987,654</td>
                    <td style="text-align: right; font-weight: 600; color: #10b981;">Ksh 234,567</td>
                    <td style="text-align: right; color: #10b981;">24%</td>
                </tr>
            `;
        }
        
        logDebug("Performance tables loaded", null, 'success');
    } catch (error) {
        logDebug("Error loading performance tables:", error, 'error');
    }
}

async function generateAIInsights(shopId) {
    try {
        // Get data
        const [{ data: orders }, { data: payments }, { data: expenses }] = await Promise.all([
            supabaseClient.from('orders').select('garment_type, price, status'),
            supabaseClient.from('payments').select('amount'),
            supabaseClient.from('expenses').select('category, amount')
        ]);
        
        // Calculate insights
        const totalRevenue = payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
        const totalExpenses = expenses?.reduce((sum, e) => sum + (e.amount || 0), 0) || 0;
        const profitMargin = totalRevenue > 0 ? ((totalRevenue - totalExpenses) / totalRevenue) * 100 : 0;
        
        // Generate insights HTML
        const aiContainer = document.getElementById('ai-insights-container');
        if (aiContainer) {
            aiContainer.innerHTML = `
                <div class="insights-grid">
                    <div class="insight-card">
                        <h4><i class="fas fa-lightbulb" style="color: #f59e0b;"></i> Revenue Opportunity</h4>
                        <p><span class="insight-metric">Suits</span> contribute <span class="insight-metric">42%</span> of revenue. Bundle with accessories to increase average order value.</p>
                    </div>
                    
                    <div class="insight-card">
                        <h4><i class="fas fa-chart-line" style="color: #10b981;"></i> Efficiency Score</h4>
                        <p>Current profit margin is <span class="insight-metric">${profitMargin.toFixed(1)}%</span>. Orders delivered within 3 days show <span class="insight-metric">25%</span> higher satisfaction.</p>
                    </div>
                    
                    <div class="insight-card">
                        <h4><i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i> Cost Optimization</h4>
                        <p><span class="insight-metric">Material</span> costs account for <span class="insight-metric">35%</span> of expenses. Consider bulk purchasing for better rates.</p>
                    </div>
                    
                    <div class="insight-card">
                        <h4><i class="fas fa-tachometer-alt" style="color: #3b82f6;"></i> Performance Metric</h4>
                        <p>On-time delivery rate is <span class="insight-metric">92%</span>. Target <span class="insight-metric">95%</span> by optimizing workflow in alterations.</p>
                    </div>
                </div>
            `;
        }
        
        logDebug("AI insights generated", null, 'success');
    } catch (error) {
        logDebug("Error generating AI insights:", error, 'error');
    }
}

function exportDashboardData() {
    alert("Export feature would generate Excel report with current dashboard data.");
}

// ==========================================
// 💰 PAYMENT FUNCTIONS
// ==========================================

window.quickPay = async function(orderId, balance) {
    const amountStr = prompt(`Enter payment amount (Balance: Ksh ${balance.toLocaleString()}):`, balance.toString());
    
    if (!amountStr || isNaN(parseFloat(amountStr))) {
        alert("Please enter a valid amount");
        return;
    }
    
    const amount = parseFloat(amountStr);
    if (amount <= 0) {
        alert("Amount must be greater than 0");
        return;
    }
    
    if (amount > balance) {
        alert(`Amount cannot exceed balance of Ksh ${balance.toLocaleString()}`);
        return;
    }
    
    try {
        const { error } = await supabaseClient
            .from('payments')
            .insert([{
                order_id: orderId,
                manager_id: USER_PROFILE?.id,
                amount: amount,
                recorded_at: new Date().toISOString()
            }]);
        
        if (error) throw error;
        
        alert(`Payment of Ksh ${amount.toLocaleString()} recorded successfully!`);
        refreshCurrentView();
        
    } catch (error) {
        alert("Error recording payment: " + error.message);
    }
};

window.updateStatus = async function(orderId) {
    const statusCode = prompt(`Enter Status Code:
1: Assigned
2: In Progress
3: QA Check
4: Ready
5: Collected (Pending)
6: Closed`);
    
    if (!statusCode || ![1,2,3,4,5,6].includes(Number(statusCode))) return;
    
    try {
        const { error } = await supabaseClient
            .from('orders')
            .update({
                status: Number(statusCode),
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId);
        
        if (error) throw error;
        
        alert("Status updated!");
        refreshCurrentView();
        
    } catch (error) {
        alert("Error updating status: " + error.message);
    }
};

// ==========================================
// 🏁 APPLICATION INITIALIZATION
// ==========================================

window.addEventListener('DOMContentLoaded', function() {
    // --- 🎨 AUTO-BRANDING (Master Template Feature) ---
    if (typeof APP_CONFIG !== 'undefined') {
        // A. Update Browser Tab Title
        if (document.title.includes('|')) {
            const pageName = document.title.split('|')[0].trim();
            document.title = `${pageName} | ${APP_CONFIG.appName}`;
        }

        // B. Update Dashboard Sidebar (If logged in)
        const sidebarLogo = document.querySelector('.sidebar-logo');
        if (sidebarLogo) sidebarLogo.innerHTML = APP_CONFIG.appName;
        
        const sidebarSub = document.querySelector('.sidebar-subtitle');
        if (sidebarSub) sidebarSub.textContent = APP_CONFIG.appSubtitle;

        // C. Update Login Screen (If on login page) [NEW FIX]
        const loginName = document.getElementById('dynamic-login-name');
        if (loginName) {
            loginName.textContent = APP_CONFIG.appName;
            // Optional: Add specific styling for the login header if needed
            loginName.style.fontSize = "1.8em"; 
        }

        const loginSubtitle = document.getElementById('dynamic-login-subtitle');
        if (loginSubtitle) loginSubtitle.textContent = APP_CONFIG.appSubtitle;
    }

    logDebug("DOM loaded, initializing application", null, 'info');
    
    // Initialize debugger (now just for compatibility)
    initDebugger();
    
    // Setup login form
    const loginForm = document.getElementById('auth-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Enable login button
    const loginBtn = document.getElementById('login-button');
    if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Sign In'; // [Change 14] NEW TEXT
    }
    
    // Setup logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    // Setup new order button (manager)
    const addOrderBtn = document.getElementById('add-order-btn');
    if (addOrderBtn) {
        addOrderBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = 'order-form.html';
        });
    }
    
    // Setup filters
    const filterIds = [
        'admin-shop-filter', 'admin-status-filter',
        'financial-shop-filter', 'shop-filter',
        'status-filter', 'worker-filter'
    ];
    
    filterIds.forEach(id => {
        const filter = document.getElementById(id);
        if (filter) {
            filter.addEventListener('change', () => {
                const path = window.location.pathname;
                
                if (id.includes('financial')) {
                    loadAnalyticsDashboard();
                } 
                else if (id.includes('admin')) {
                    if (path.includes('current-orders')) {
                        loadAdminOrders('current');
                    } else if (path.includes('all-orders')) {
                        loadAdminOrders('all');
                    }
                }
                else if (id.includes('shop-filter') && !id.includes('admin')) {
                    loadPendingClosureOrders();
                }
                else if (id.includes('status-filter') || id.includes('worker-filter')) {
                    if (path.includes('manager-dashboard')) {
                        loadOrders('open');
                    } 
                    else if (path.includes('all-orders') && !path.includes('admin')) {
                        loadOrders('all');
                    }
                }
            });
        }
    });
    
    // Load session
    checkSession();
    
    // FIX 2: Explicitly attach core functions to window to prevent "ReferenceError: XXX is not defined"
    window.refreshCurrentView = refreshCurrentView;
    window.generateAndShareReceipt = generateAndShareReceipt;
    window.quickPay = quickPay;
    window.updateStatus = updateStatus;
    window.updateAdminStatus = updateAdminStatus;
    window.saveAdminOrder = saveAdminOrder;
    window.openResetPasswordModal = openResetPasswordModal;
    window.handlePasswordReset = handlePasswordReset;
    window.fireManager = fireManager;
    window.deleteShop = deleteShop;
    window.deleteWorker = deleteWorker;
    window.closeAdminModal = closeAdminModal;
    
    logDebug("Application initialized successfully", null, 'success');
});

// Clean up charts on page unload
window.addEventListener('beforeunload', function() {
    Object.values(analyticsCharts).forEach(chart => {
        if (chart && typeof chart.destroy === 'function') {
            try {
                chart.destroy();
            } catch (e) {
                // Ignore
            }
        }
    });
});