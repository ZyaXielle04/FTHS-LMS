document.addEventListener('DOMContentLoaded', function() {
    // Initialize sidebar navigation functionality
    function initSidebar() {
        const navItems = document.querySelectorAll('.sidebar-nav li');
        const currentPage = window.location.pathname.split('/').pop();
        
        // Remove active class from all items first
        navItems.forEach(item => {
            item.classList.remove('active');
            
            // Find the link that matches current page
            const link = item.querySelector('a');
            if (link && link.getAttribute('href') === currentPage) {
                item.classList.add('active');
            }
        });

        // Add click handlers for navigation items
        navItems.forEach(item => {
            item.addEventListener('click', function() {
                navItems.forEach(i => i.classList.remove('active'));
                this.classList.add('active');
            });
        });
    }

    // Initialize logout functionality
    function initLogout() {
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', function(e) {
                e.preventDefault();
                
                // Clear authentication data
                localStorage.removeItem('authUser');
                sessionStorage.removeItem('authUser');
                
                // Redirect to login page
                window.location.href = '../../index.html';
            });
        }
    }

    // Update admin profile information
    function updateProfileInfo() {
        const authUser = JSON.parse(localStorage.getItem('authUser')) || 
                         JSON.parse(sessionStorage.getItem('authUser'));
        
        if (authUser) {
            const profileElement = document.querySelector('.admin-profile span');
            if (profileElement) {
                profileElement.textContent = authUser.email || 'Admin User';
            }
        }
    }

    // Initialize all common functionality
    function initAdminCommon() {
        initSidebar();
        initLogout();
        updateProfileInfo();
    }

    // Run initialization
    initAdminCommon();

    function updateDateTime() {
        const now = new Date();

        // Convert to Philippine Time (GMT+8)
        const options = {
            timeZone: 'Asia/Manila',
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        };

        const formattedDateTime = now.toLocaleString('en-PH', options);
        document.getElementById('currentDateTime').textContent = formattedDateTime;
    }

    // Initial call and interval update
    updateDateTime();
    setInterval(updateDateTime, 1000);
});