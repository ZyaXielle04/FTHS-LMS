document.addEventListener('DOMContentLoaded', function() {
    // Check authentication status
    function checkAuth() {
        // Try to get user from localStorage (remember me) or sessionStorage
        const authUser = JSON.parse(localStorage.getItem('authUser')) || 
                         JSON.parse(sessionStorage.getItem('authUser'));
        
        // If no user or not admin, redirect to login
        if (!authUser || authUser.role !== 'admin') {
            // Clear any existing auth data
            localStorage.removeItem('authUser');
            sessionStorage.removeItem('authUser');
            
            // Redirect to login page
            window.location.href = '../../index.html';
            
            // Prevent back button navigation
            window.history.replaceState(null, null, window.location.href);
            return false;
        }
        
        return true;
    }

    // Check auth on page load
    if (!checkAuth()) {
        return;
    }

    // Optional: Add a logout button functionality
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            localStorage.removeItem('authUser');
            sessionStorage.removeItem('authUser');
            window.location.href = '../../index.html';
        });
    }

    // Optional: Periodically check auth status (every 5 minutes)
    setInterval(checkAuth, 300000);
});