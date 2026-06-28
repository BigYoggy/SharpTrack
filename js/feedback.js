/* ============================================
   SHARPTRACK — FEEDBACK SYSTEM
   ============================================ */

let selectedFeedbackType = 'suggestion';

function showFeedbackModal() {
    if (document.getElementById('st-feedback-modal')) {
        document.getElementById('st-feedback-modal').classList.remove('hidden');
        resetFeedbackForm();
        return;
    }

    const html = `
        <div id="st-feedback-modal" class="shortcut-modal-overlay" onclick="handleFeedbackOverlayClick(event)">
            <div class="shortcut-modal animate-slideUp" style="max-width: 400px;">
                <div class="shortcut-modal-header">
                    <h3>Send Feedback</h3>
                    <button class="shortcut-close" onclick="closeFeedbackModal()">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
                <div class="shortcut-modal-body" style="gap: 16px;">
                    <div class="feedback-options">
                        <div class="feedback-option selected" id="fb-opt-suggestion" onclick="setFeedbackType('suggestion')">Idea</div>
                        <div class="feedback-option" id="fb-opt-bug" onclick="setFeedbackType('bug')">Bug</div>
                        <div class="feedback-option" id="fb-opt-other" onclick="setFeedbackType('other')">Other</div>
                    </div>
                    
                    <div class="input-group" style="margin-bottom: 0;">
                        <label for="feedback-message">Message</label>
                        <textarea id="feedback-message" class="feedback-textarea" placeholder="Describe your idea or the bug you found..."></textarea>
                    </div>
                    
                    <button class="btn btn-primary btn-block" onclick="submitFeedback()">Send Feedback</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
}

function closeFeedbackModal() {
    const modal = document.getElementById('st-feedback-modal');
    if (modal) modal.classList.add('hidden');
}

function handleFeedbackOverlayClick(e) {
    if (e.target.id === 'st-feedback-modal') {
        closeFeedbackModal();
    }
}

function setFeedbackType(type) {
    selectedFeedbackType = type;
    document.querySelectorAll('.feedback-option').forEach(el => el.classList.remove('selected'));
    const selectedEl = document.getElementById(`fb-opt-${type}`);
    if (selectedEl) selectedEl.classList.add('selected');
}

function resetFeedbackForm() {
    setFeedbackType('suggestion');
    const txt = document.getElementById('feedback-message');
    if (txt) txt.value = '';
}

async function submitFeedback() {
    const message = document.getElementById('feedback-message').value.trim();
    if (!message) {
        showToast('warning', 'Empty Message', 'Please enter a message before submitting.');
        return;
    }

    const btn = document.querySelector('.shortcut-modal-body .btn-primary');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-sm" style="display:inline-block; border-color:transparent; border-top-color:white; width:14px; height:14px; border-width:2px;"></span> Sending...';

    try {
        const user = getUser();
        const feedbackItem = {
            type: selectedFeedbackType,
            message,
            userId: user ? user.id : 'anonymous',
            userName: user ? user.name : 'Anonymous',
            timestamp: new Date().toISOString()
        };

        // Send to backend
        await apiRequest('/api/feedback', {
            method: 'POST',
            body: JSON.stringify(feedbackItem)
        });

        // Close and notify
        closeFeedbackModal();
        showToast('success', 'Feedback Sent! 💖', 'Thank you for helping us improve SharpTrack.');
    } catch (err) {
        console.error(err);
        showToast('error', 'Error', 'Failed to send feedback. Please try again.');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}
