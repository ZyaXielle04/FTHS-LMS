document.addEventListener('DOMContentLoaded', function() {
    // Check authentication
    const authUser = JSON.parse(localStorage.getItem('authUser')) || 
                     JSON.parse(sessionStorage.getItem('authUser'));

    if (!authUser || authUser.role !== 'student') {
        window.location.href = '../../index.html';
        return;
    }

    // Get the class ID from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const classId = urlParams.get('classId');
    const section = urlParams.get('section') || 'overview';

    if (!classId) {
        // Redirect back to classes if no class ID is provided
        window.location.href = 'classes.html';
        return;
    }

    // Load class information
    loadClassInfo(classId, authUser.id);

    // Update navigation links with the current class ID
    updateNavigationLinks(classId);

    // Initialize the active section
    initializeActiveSection(section, classId);

    // Set up navigation event listeners
    setupNavigationListeners(classId);
});

async function loadClassInfo(classId, studentId) {
    try {
        // Fetch class details from Firebase
        const classRef = firebase.database().ref(`classes/${classId}`);
        const classSnapshot = await classRef.once('value');
        
        if (!classSnapshot.exists()) {
            Swal.fire('Error', 'Class not found', 'error').then(() => {
                window.location.href = 'classes.html';
            });
            return;
        }

        const classData = classSnapshot.val();

        // Update the header with class information
        document.getElementById('class-title').textContent = classData.subjectName || 'Class Dashboard';
        document.getElementById('class-subtitle').textContent = 
            `${classData.subjectId || ''} • ${classData.roomNumber || 'Room TBD'}`;

        // Check if student is enrolled in this class
        const enrollmentRef = firebase.database().ref(`classes/${classId}/students/${studentId}`);
        const enrollmentSnapshot = await enrollmentRef.once('value');
        
        if (!enrollmentSnapshot.exists()) {
            Swal.fire('Access Denied', 'You are not enrolled in this class', 'error').then(() => {
                window.location.href = 'classes.html';
            });
            return;
        }

        // Load teacher information
        if (classData.teacher) {
            const teacherRef = firebase.database().ref(`users/${classData.teacher}`);
            const teacherSnapshot = await teacherRef.once('value');
            if (teacherSnapshot.exists()) {
                const teacherName = teacherSnapshot.val().name || 'Teacher';
                document.getElementById('class-subtitle').textContent += ` • ${teacherName}`;
            }
        }

    } catch (error) {
        console.error('Error loading class info:', error);
        Swal.fire('Error', 'Failed to load class information', 'error');
    }
}

function updateNavigationLinks(classId) {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        const hrefTemplate = link.getAttribute('data-href-template');
        if (hrefTemplate && classId) {
            link.href = hrefTemplate.replace('CLASS_ID', classId);
        }
    });
}

function initializeActiveSection(section, classId) {
    // Set active nav item
    document.querySelectorAll('.sidebar-nav li').forEach(li => {
        li.classList.remove('active');
    });
    
    const activeNavItem = document.querySelector(`.nav-link[data-section="${section}"]`);
    if (activeNavItem) {
        activeNavItem.parentElement.classList.add('active');
    }

    // Show the corresponding section
    document.querySelectorAll('.dashboard-section').forEach(sectionEl => {
        sectionEl.classList.remove('active-section');
    });
    
    const activeSection = document.getElementById(`${section}-section`);
    if (activeSection) {
        activeSection.classList.add('active-section');
        loadSectionContent(section, classId);
    }
}

function setupNavigationListeners(classId) {
    document.querySelector('.sidebar-nav').addEventListener('click', function(e) {
        const link = e.target.closest('.nav-link');
        if (link) {
            e.preventDefault();
            
            const section = link.getAttribute('data-section');
            
            // Update URL without reloading the page
            const newUrl = `${window.location.pathname}?classId=${classId}&section=${section}`;
            window.history.pushState({ classId, section }, '', newUrl);
            
            // Update the active section
            initializeActiveSection(section, classId);
        }
    });

    // Handle browser back/forward buttons
    window.addEventListener('popstate', function(event) {
        if (event.state) {
            initializeActiveSection(event.state.section, event.state.classId);
        }
    });
}

async function loadSectionContent(section, classId) {
    const sectionElement = document.getElementById(`${section}-section`);
    if (!sectionElement) return;

    // Show loading state
    sectionElement.innerHTML = `
        <div class="loading-spinner">
            <i class="fas fa-spinner fa-spin"></i> Loading ${section}...
        </div>
    `;

    try {
        let content = '';
        const authUser = JSON.parse(sessionStorage.getItem('authUser') || localStorage.getItem('authUser'));

        switch (section) {
            case 'overview':
                content = await loadOverviewContent(classId);
                break;
            case 'assignments':
                content = await loadAssignmentsContent(classId);
                break;
            case 'attendance':
                content = await loadAttendanceContent(classId);
                break;
            case 'resources':
                if (!authUser?.id) throw new Error("No authenticated user found.");
                content = await loadResourcesContent(classId, authUser.id);
                break;
            case 'announcements':
                content = await loadAnnouncementsContent(classId);
                break;
            default:
                content = await loadAnnouncementsContent(classId);
        }

        sectionElement.innerHTML = content;

        // Initialize section-specific functionality
        if (section === 'overview') {
            initializeAttendanceChart();
            setupAssignmentLinks(classId);
        }
        else if (section === 'assignments') {
            if (authUser?.id) setupAssignments(classId, authUser.id);
        }
        // resources section no longer needs setupResourcesInteractions()
    } catch (error) {
        console.error(`Error loading ${section}:`, error);
        sectionElement.innerHTML = `
            <div class="error-message">
                Error loading ${section} data. Please try again.
            </div>
        `;
    }
}