// Landing Page Logic
const getStartedBtn = document.getElementById('get-started-btn');
const legalCheckbox = document.getElementById('legal-checkbox');

// Enable/disable the button based on the checkbox state
if (legalCheckbox) {
    legalCheckbox.addEventListener('change', () => {
        getStartedBtn.disabled = !legalCheckbox.checked;
    });
}

// Transition from landing to login page (authentication required)
if (getStartedBtn) {
    getStartedBtn.addEventListener('click', () => {
        // Check if user agreed to terms
        if (legalCheckbox && !legalCheckbox.checked) return;

        // Store legal acceptance in localStorage
        localStorage.setItem('legal_accepted', 'true');
        localStorage.setItem('legal_accepted_timestamp', new Date().toISOString());

        // Redirect to appropriate page based on auth state
        if (localStorage.getItem('token')) {
            window.location.href = 'chat.html';
        } else {
            window.location.href = 'login.html';
        }
    });
}
