/* ============================================
   SHARPTRACK — ONBOARDING WALKTHROUGH JS
   ============================================ */

const ONBOARDING_STEPS = [
    {
        title: "Welcome to SharpTrack! 👋",
        description: "Let's take a quick 1-minute tour to show you how to manage your store inventory, track daily sales transactions, and monitor low stock items instantly.",
        target: null, // Fullscreen/centered welcome
        type: "welcome"
    },
    {
        title: "Dashboard Overview 📊",
        description: "Your dashboard shows your daily sales metrics, total asset value, and active alerts. Keep an eye on the low stock card to see what needs restocking.",
        target: "#stat-cards",
        type: "spotlight"
    },
    {
        title: "Add Stock 📦",
        description: "Whenever you buy new goods for your store, tap this floating action button to log them. Set name, selling price, and reorder alerts here.",
        target: "#bottom-fab",
        type: "spotlight"
    },
    {
        title: "Record Sales 💰",
        description: "Ready to log a sale? Tap the Sales page button. Search for the items in your catalog, adjust quantities, and click 'Record Sale' in 2 seconds.",
        target: "#nav-item-sales",
        type: "spotlight"
    },
    {
        title: "Smart Notifications 🔔",
        description: "Check this bell icon for real-time notifications about low stock, out-of-stock items, and important updates regarding your shop.",
        target: ".bell-btn:last-child", // Targets the notification bell button
        type: "spotlight"
    }
];

let onboardingCurrentStep = 0;
let onboardingOverlayContainer = null;
let onboardingTooltip = null;
let onboardingArrow = null;

// Initialize Onboarding Tour on page load
function startOnboardingTour() {
    // Check if already complete
    if (localStorage.getItem('onboardingComplete') === 'true') return;

    onboardingCurrentStep = 0;
    createOnboardingElements();
    renderStep(onboardingCurrentStep);
    
    // Bind window resize event
    window.addEventListener('resize', handleOnboardingResize);
}

// Create elements and inject them to DOM
function createOnboardingElements() {
    // Remove if already existing
    const existingContainer = document.getElementById('onboarding-overlay-container');
    if (existingContainer) existingContainer.remove();

    onboardingOverlayContainer = document.createElement('div');
    onboardingOverlayContainer.id = 'onboarding-overlay-container';
    onboardingOverlayContainer.className = 'onboarding-overlay-container';
    
    // Inject SVG and Spotlight mask
    onboardingOverlayContainer.innerHTML = `
        <svg class="onboarding-svg-overlay" id="onboarding-svg">
            <defs>
                <mask id="spotlight-mask">
                    <rect width="100%" height="100%" fill="white"/>
                    <rect id="spotlight-cutout" x="0" y="0" width="0" height="0" rx="12" ry="12" fill="black"/>
                </mask>
            </defs>
            <rect width="100%" height="100%" fill="rgba(0, 0, 0, 0.75)" mask="url(#spotlight-mask)"/>
        </svg>
        <div class="onboarding-arrow" id="onboarding-arrow"></div>
        <div class="onboarding-tooltip" id="onboarding-tooltip" style="display:none;"></div>
    `;

    document.body.appendChild(onboardingOverlayContainer);
    
    onboardingTooltip = document.getElementById('onboarding-tooltip');
    onboardingArrow = document.getElementById('onboarding-arrow');
}

// Render the current step details
function renderStep(stepIndex) {
    if (stepIndex < 0 || stepIndex >= ONBOARDING_STEPS.length) {
        showCompletionScreen();
        return;
    }

    const step = ONBOARDING_STEPS[stepIndex];
    onboardingCurrentStep = stepIndex;

    // Build Tooltip HTML
    onboardingTooltip.innerHTML = `
        <div class="onboarding-tooltip-header">
            <h3>${step.title}</h3>
            <span class="step-badge">${stepIndex + 1}/${ONBOARDING_STEPS.length}</span>
        </div>
        <p>${step.description}</p>
        <div class="onboarding-tooltip-actions">
            <div class="dots-indicator">
                ${ONBOARDING_STEPS.map((_, i) => `<div class="dot ${i === stepIndex ? 'active' : ''}"></div>`).join('')}
            </div>
            <div class="btn-group">
                <button class="btn btn-ghost btn-sm onboarding-btn onboarding-btn-skip" onclick="skipOnboarding()">Skip</button>
                ${stepIndex > 0 ? `<button class="btn btn-outline btn-sm onboarding-btn onboarding-btn-back" onclick="prevOnboardingStep()">Back</button>` : ''}
                <button class="btn btn-primary btn-sm onboarding-btn onboarding-btn-next" onclick="nextOnboardingStep()">${stepIndex === ONBOARDING_STEPS.length - 1 ? 'Done' : 'Next'}</button>
            </div>
        </div>
    `;

    // Position spotlight and tooltip
    updateSpotlight(step);
}

// Update SVG Cutout and Tooltip Position
function updateSpotlight(step) {
    const cutout = document.getElementById('spotlight-cutout');
    if (!cutout) return;

    onboardingTooltip.style.display = 'block';

    if (!step.target || step.type === 'welcome') {
        // Fullscreen Overlay (no cutout target)
        cutout.setAttribute('x', '0');
        cutout.setAttribute('y', '0');
        cutout.setAttribute('width', '0');
        cutout.setAttribute('height', '0');

        // Center the tooltip
        onboardingTooltip.style.top = '50%';
        onboardingTooltip.style.left = '50%';
        onboardingTooltip.style.transform = 'translate(-50%, -50%)';
        onboardingArrow.style.display = 'none';
        
        onboardingTooltip.classList.add('welcome-step');
        return;
    } else {
        onboardingTooltip.classList.remove('welcome-step');
    }

    // Target element exists
    const element = document.querySelector(step.target);
    if (!element) {
        // Fallback to center if element is missing on screen
        console.warn(`Target element ${step.target} not found.`);
        cutout.setAttribute('x', '0');
        cutout.setAttribute('y', '0');
        cutout.setAttribute('width', '0');
        cutout.setAttribute('height', '0');
        
        onboardingTooltip.style.top = '50%';
        onboardingTooltip.style.left = '50%';
        onboardingTooltip.style.transform = 'translate(-50%, -50%)';
        onboardingArrow.style.display = 'none';
        return;
    }

    // Get element bounds
    const bounds = element.getBoundingClientRect();
    const padding = 6;
    
    const x = bounds.left - padding;
    const y = bounds.top - padding;
    const width = bounds.width + (padding * 2);
    const height = bounds.height + (padding * 2);
    const rx = step.target === '#bottom-fab' ? width / 2 : 12; // Circle for FAB

    cutout.setAttribute('x', x);
    cutout.setAttribute('y', y);
    cutout.setAttribute('width', width);
    cutout.setAttribute('height', height);
    cutout.setAttribute('rx', rx);
    cutout.setAttribute('ry', rx);

    // Position Tooltip and Arrow relative to cutout
    const tooltipWidth = Math.min(onboardingTooltip.offsetWidth || 300, window.innerWidth - 20);
    const tooltipHeight = onboardingTooltip.offsetHeight || 140;
    const screenHeight = window.innerHeight;
    const screenWidth = window.innerWidth;
    
    let tooltipTop = 0;
    let tooltipLeft = 0;
    let arrowTop = 0;
    let arrowLeft = 0;
    let arrowClass = '';

    // Choose position: top or bottom
    if (y + height + tooltipHeight + 20 < screenHeight) {
        // Position BELOW highlighted element
        tooltipTop = y + height + 12;
        tooltipLeft = Math.max(10, Math.min(x + (width / 2) - (tooltipWidth / 2), screenWidth - tooltipWidth - 10));
        
        arrowClass = 'onboarding-arrow top';
        arrowTop = tooltipTop - 8;
        arrowLeft = x + (width / 2) - 8;
    } else {
        // Position ABOVE highlighted element
        tooltipTop = y - tooltipHeight - 12;
        tooltipLeft = Math.max(10, Math.min(x + (width / 2) - (tooltipWidth / 2), screenWidth - tooltipWidth - 10));
        
        arrowClass = 'onboarding-arrow bottom';
        arrowTop = y - 12;
        arrowLeft = x + (width / 2) - 8;
    }

    onboardingTooltip.style.top = tooltipTop + 'px';
    onboardingTooltip.style.left = tooltipLeft + 'px';
    onboardingTooltip.style.transform = 'none';
    
    // Set arrow styling
    onboardingArrow.className = arrowClass;
    onboardingArrow.style.top = arrowTop + 'px';
    onboardingArrow.style.left = arrowLeft + 'px';
    onboardingArrow.style.display = 'block';
}

// Step actions
function nextOnboardingStep() {
    renderStep(onboardingCurrentStep + 1);
}

function prevOnboardingStep() {
    renderStep(onboardingCurrentStep - 1);
}

function skipOnboarding() {
    showCompletionScreen();
}

// Handle window resize event
function handleOnboardingResize() {
    if (onboardingOverlayContainer && onboardingCurrentStep < ONBOARDING_STEPS.length) {
        updateSpotlight(ONBOARDING_STEPS[onboardingCurrentStep]);
    }
}

// Show Completion screen modal
function showCompletionScreen() {
    // Remove tutorial walkthrough elements
    if (onboardingOverlayContainer) onboardingOverlayContainer.remove();
    window.removeEventListener('resize', handleOnboardingResize);

    // Inject Completion Screen Modal
    let completionOverlay = document.getElementById('onboarding-completion-overlay');
    if (!completionOverlay) {
        completionOverlay = document.createElement('div');
        completionOverlay.id = 'onboarding-completion-overlay';
        completionOverlay.className = 'onboarding-completion-overlay';
        completionOverlay.innerHTML = `
            <div class="onboarding-completion-modal">
                <span class="onboarding-completion-icon">🚀</span>
                <h2>You're all set!</h2>
                <p>You are ready to start managing your inventory and tracking sales like a pro. Let's grow your retail store business together!</p>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    <button class="btn btn-primary btn-block onboarding-btn-start" onclick="finishOnboardingTour(true)">Get Started</button>
                    <button class="btn btn-outline btn-block btn-sm onboarding-btn-restart" onclick="finishOnboardingTour(false)">Restart Tutorial</button>
                </div>
            </div>
        `;
        document.body.appendChild(completionOverlay);
    }

    // Trigger open animation
    setTimeout(() => {
        completionOverlay.classList.add('open');
    }, 50);
}

// Complete and set local storage flag
async function finishOnboardingTour(completeAndClose) {
    const completionOverlay = document.getElementById('onboarding-completion-overlay');
    if (completionOverlay) completionOverlay.classList.remove('open');
    
    setTimeout(() => {
        if (completionOverlay) completionOverlay.remove();
    }, 300);

    if (completeAndClose) {
        localStorage.setItem('onboardingComplete', 'true');
        showToast('success', 'Setup Completed! 🎉', 'Welcome to SharpTrack inventory.');
        
        // Trigger welcome/news modal after a short delay so they don't clash
        if (typeof checkWhatsNew === 'function') {
            setTimeout(checkWhatsNew, 1500);
        }
        
        // Sync with backend database
        try {
            await apiRequest('/api/auth/profile', {
                method: 'PUT',
                body: JSON.stringify({ onboardingCompleted: true })
            });
            const user = getUser();
            if (user) {
                user.onboardingCompleted = true;
                localStorage.setItem('st_user', JSON.stringify(user));
            }
        } catch (err) {
            console.error('Failed to sync onboarding completed state', err);
        }
    } else {
        // Restart tour
        localStorage.removeItem('onboardingComplete');
        startOnboardingTour();
    }
}
