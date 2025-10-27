document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const burgerMenu = document.querySelector('.burger-menu');
    const sidebar = document.querySelector('.teacher-sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    const mainContent = document.querySelector('.teacher-main');
    
    // Toggle sidebar function
    function toggleSidebar() {
        burgerMenu.classList.toggle('active');
        sidebar.classList.toggle('expanded');
        overlay.classList.toggle('active');
        
        // For very small screens (optional)
        if (window.innerWidth <= 480) {
            mainContent.classList.toggle('no-scroll');
        }
    }
    
    // Close sidebar function
    function closeSidebar() {
        burgerMenu.classList.remove('active');
        sidebar.classList.remove('expanded');
        overlay.classList.remove('active');
        mainContent.classList.remove('no-scroll');
    }
    
    // Event Listeners
    burgerMenu.addEventListener('click', toggleSidebar);
    overlay.addEventListener('click', closeSidebar);
    
    // Close sidebar when clicking on nav links (mobile only)
    const navLinks = document.querySelectorAll('.sidebar-nav a');
    navLinks.forEach(link => {
        link.addEventListener('click', function() {
            if (window.innerWidth < 1024) {
                closeSidebar();
            }
        });
    });
    
    // Handle window resize
    window.addEventListener('resize', function() {
        // Auto-close sidebar when resizing to desktop
        if (window.innerWidth >= 1024) {
            closeSidebar();
        }
    });
    
    // Initialize sidebar state
    function initSidebar() {
        if (window.innerWidth >= 1024) {
            sidebar.classList.add('expanded');
        } else {
            sidebar.classList.remove('expanded');
        }
    }
    
    initSidebar();

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