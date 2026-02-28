// Authentication helper functions for Exmora AI Assistant

/**
 * Get the JWT token from localStorage
 * @returns {string|null} The token or null if not found
 */
function getToken() {
    return localStorage.getItem('token');
}

/**
 * Get the user email from localStorage
 * @returns {string|null} The email or null if not found
 */
function getUserEmail() {
    return localStorage.getItem('userEmail');
}

/**
 * Check if user is authenticated
 * @returns {boolean} True if token exists, false otherwise
 */
function isAuthenticated() {
    return !!getToken();
}

/**
 * Logout user by clearing token and redirecting to login
 */
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('userEmail');
    window.location.href = 'login.html';
}

/**
 * Redirect to login if not authenticated
 * Call this at the start of protected pages
 */
function requireAuth() {
    if (!isAuthenticated()) {
        window.location.href = 'login.html';
    }
}

/**
 * Make an authenticated API request
 * @param {string} url - The API endpoint URL
 * @param {object} options - Fetch options (method, headers, body, etc.)
 * @returns {Promise<Response>} The fetch response
 */
async function authenticatedFetch(url, options = {}) {
    const token = getToken();
    
    if (!token) {
        logout();
        throw new Error('No authentication token found');
    }

    // Merge headers with Authorization
    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`
    };

    const response = await fetch(url, {
        ...options,
        headers
    });

    // If unauthorized, logout and redirect
    if (response.status === 401) {
        logout();
        throw new Error('Session expired. Please login again.');
    }

    return response;
}

/**
 * Decode JWT token to get payload (client-side only, not for security)
 * @param {string} token - The JWT token
 * @returns {object|null} The decoded payload or null if invalid
 */
function decodeToken(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        return JSON.parse(jsonPayload);
    } catch (e) {
        return null;
    }
}

/**
 * Get user ID from token
 * @returns {string|null} The user ID or null if not found
 */
function getUserId() {
    const token = getToken();
    if (!token) return null;
    
    const payload = decodeToken(token);
    return payload ? payload.userId : null;
}
