// Global variables
let attendanceChartInstance = null;
let assignmentListeners = {};

// Main function to load overview content
async function loadOverviewContent(classId) {
    try {
        // Fetch all necessary data in parallel
        const [attendanceData, pendingAssignments, resourcesData, announcementsData] = await Promise.all([
            fetchAttendanceData(classId),
            fetchPendingAssignments(classId),
            fetchResourcesData(classId),
            fetchAnnouncementsData(classId)
        ]);

        // Calculate attendance percentages (including excused)
        const totalAttendance = attendanceData.present + attendanceData.absent + 
                             attendanceData.late + attendanceData.excused;
        const presentPercent = totalAttendance > 0 ? Math.round((attendanceData.present / totalAttendance) * 100) : 0;
        const absentPercent = totalAttendance > 0 ? Math.round((attendanceData.absent / totalAttendance) * 100) : 0;
        const latePercent = totalAttendance > 0 ? Math.round((attendanceData.late / totalAttendance) * 100) : 0;
        const excusedPercent = totalAttendance > 0 ? Math.round((attendanceData.excused / totalAttendance) * 100) : 0;

        // Get latest announcements (most recent first)
        const latestAnnouncements = announcementsData
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 3);

        // Generate HTML content
        return `
            <div class="overview-grid-container">
                <!-- Attendance Card -->
                <div class="overview-card attendance-card grid-div1">
                    <h3><i class="fas fa-calendar-check"></i> Attendance</h3>
                    <div class="attendance-content">
                        <canvas id="attendanceChart" width="200" height="200"></canvas>
                        <div class="attendance-stats">
                            <div class="attendance-stat present">
                                <span class="stat-value">${presentPercent}%</span>
                                <span class="stat-label">Present</span>
                            </div>
                            <div class="attendance-stat absent">
                                <span class="stat-value">${absentPercent}%</span>
                                <span class="stat-label">Absent</span>
                            </div>
                            <div class="attendance-stat late">
                                <span class="stat-value">${latePercent}%</span>
                                <span class="stat-label">Late</span>
                            </div>
                            <div class="attendance-stat excused">
                                <span class="stat-value">${excusedPercent}%</span>
                                <span class="stat-label">Excused</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Pending Assignments Card -->
                <div class="overview-card assignments-card grid-div2">
                    <h3><i class="fas fa-tasks"></i> Pending Assignments</h3>
                    ${pendingAssignments.length > 0 ? 
                        `<div class="assignments-cards-container">
                            ${pendingAssignments.map(assignment => `
                                <div class="assignment-card">
                                    <div class="assignment-card-header">
                                        <i class="fas fa-clipboard-list"></i>
                                        <h4 class="assignment-card-title">${assignment.title}</h4>
                                    </div>
                                    <div class="assignment-card-body">
                                        <p class="assignment-card-description">${assignment.description || 'No description provided'}</p>
                                        <div class="assignment-card-footer">
                                            <span class="due-date ${isAssignmentUrgent(assignment.dueDate) ? 'urgent' : ''}">
                                                <i class="far fa-clock"></i> Due: ${formatDate(assignment.dueDate)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>` :
                        `<p class="no-pending">No pending assignments</p>`
                    }
                    ${pendingAssignments.length > 0 ? 
                        `<a href="class-dashboard.html?classId=${classId}&section=assignments" class="view-all-link">
                            View all assignments <i class="fas fa-arrow-right"></i>
                        </a>` : ''
                    }
                </div>

                <!-- Resources Card -->
                <div class="overview-card resources-card grid-div3">
                    <h3><i class="fas fa-book"></i> Class Resources</h3>
                    <div class="resources-count">
                        <span class="count-number">${resourcesData.length}</span>
                        <span class="count-label">${resourcesData.length === 1 ? 'resource' : 'resources'} available</span>
                    </div>
                    <div class="resources-cards-container">
                        ${resourcesData.slice(0, 4).map(resource => `
                            <div class="resource-card">
                                <div class="resource-card-header">
                                    <i class="fas ${getResourceIcon(resource.type)}"></i>
                                    <h4 class="resource-card-title">${resource.title}</h4>
                                </div>
                                <div class="resource-card-body">
                                    <p class="resource-card-description">${resource.description}</p>
                                    <div class="resource-card-footer">
                                        <span class="resource-card-date">${resource.timestamp}</span>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                        ${resourcesData.length === 0 ? 
                            `<p class="no-resources">No resources available yet</p>` : ''
                        }
                    </div>
                    ${resourcesData.length > 0 ? 
                        `<a href="class-dashboard.html?classId=${classId}&section=resources" class="view-all-link">
                            View all resources <i class="fas fa-arrow-right"></i>
                        </a>` : ''
                    }
                </div>

                <!-- Announcements Card -->
                <div class="overview-card announcements-card grid-div4">
                    <h3><i class="fas fa-bullhorn"></i> Latest Announcements</h3>
                    ${latestAnnouncements.length > 0 ? 
                        `<div class="announcements-list">
                            ${latestAnnouncements.map(announcement => `
                                <div class="announcement-item">
                                    <div class="announcement-header">
                                        <span class="announcement-date">${formatDate(announcement.date)}</span>
                                        <h4 class="announcement-title">${announcement.title}</h4>
                                    </div>
                                    <div class="announcement-content">${announcement.content}</div>
                                    ${announcement.attachment ? 
                                        `<a href="${announcement.attachment.url}" class="announcement-attachment" target="_blank">
                                            <i class="fas fa-paperclip"></i> ${announcement.attachment.name}
                                        </a>` : ''
                                    }
                                </div>
                            `).join('')}
                        </div>` :
                        `<p class="no-announcements">No recent announcements</p>`
                    }
                    ${latestAnnouncements.length > 0 ? 
                        `<a href="class-dashboard.html?classId=${classId}&section=announcements" class="view-all-link">
                            View all announcements <i class="fas fa-arrow-right"></i>
                        </a>` : ''
                    }
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading overview content:', error);
        return `<div class="error-message">Error loading overview data. Please try again later.</div>`;
    }
}

// Data fetching functions
async function fetchAttendanceData(classId) {
    try {
        const authUser = JSON.parse(sessionStorage.getItem('authUser') || localStorage.getItem('authUser'));
        if (!authUser?.id) {
            console.warn('User not authenticated');
            return { present: 0, absent: 0, late: 0, excused: 0 };
        }

        const userId = authUser.id;
        const attendanceRef = firebase.database().ref(`classes/${classId}/attendance`);
        const snapshot = await attendanceRef.once('value');
        
        let present = 0, absent = 0, late = 0, excused = 0;
        
        if (snapshot.exists()) {
            snapshot.forEach(dateSnapshot => {
                const status = dateSnapshot.child(userId).val()?.status?.toLowerCase();
                switch (status) {
                    case 'present': present++; break;
                    case 'absent': absent++; break;
                    case 'late': late++; break;
                    case 'excused': excused++; break;
                }
            });
        }
        
        return { present, absent, late, excused };
    } catch (error) {
        console.error('Error fetching attendance data:', error);
        return { present: 0, absent: 0, late: 0, excused: 0 };
    }
}

// Realtime pending assignments with listener
function fetchPendingAssignments(classId) {
    return new Promise((resolve) => {
        const authUser = JSON.parse(sessionStorage.getItem('authUser') || localStorage.getItem('authUser'));
        if (!authUser?.id) {
            console.warn('User not authenticated');
            resolve([]);
            return;
        }

        const userId = authUser.id;
        const assignmentsRef = firebase.database().ref(`classes/${classId}/assignments`);
        
        // Clean up existing listener
        if (assignmentListeners[classId]) {
            assignmentListeners[classId].ref.off('value', assignmentListeners[classId].listener);
            delete assignmentListeners[classId];
        }

        const processAssignments = async (assignmentsSnapshot) => {
            const now = new Date();
            const pendingAssignments = [];
            
            if (!assignmentsSnapshot.exists()) {
                return pendingAssignments;
            }

            const assignmentsPromises = [];
            
            assignmentsSnapshot.forEach((assignmentSnapshot) => {
                const assignmentData = assignmentSnapshot.val();
                const dueDate = new Date(assignmentData.dueDate);
                
                if (dueDate > now) {
                    assignmentsPromises.push(
                        firebase.database().ref(
                            `classes/${classId}/assignments/${assignmentSnapshot.key}/studentAnswers/${userId}`
                        ).once('value').then((answerSnapshot) => {
                            const answerData = answerSnapshot.val();
                            if (!answerData || answerData.status === 'pending') {
                                pendingAssignments.push({
                                    id: assignmentSnapshot.key,
                                    title: assignmentData.title,
                                    description: assignmentData.description,
                                    dueDate: assignmentData.dueDate,
                                    timestamp: assignmentData.createdAt
                                });
                            }
                        })
                    );
                }
            });
            
            await Promise.all(assignmentsPromises);
            pendingAssignments.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
            return pendingAssignments.slice(0, 3);
        };

        // Initial fetch
        assignmentsRef.once('value').then(async (snapshot) => {
            const pending = await processAssignments(snapshot);
            resolve(pending);
        });

        // Realtime listener
        const listener = assignmentsRef.on('value', async (snapshot) => {
            const pending = await processAssignments(snapshot);
            updatePendingAssignmentsUI(classId, pending);
        });
        
        assignmentListeners[classId] = {
            ref: assignmentsRef,
            listener: listener,
            userId: userId
        };
    });
}

function updatePendingAssignmentsUI(classId, pendingAssignments) {
    const assignmentsContainer = document.querySelector('.assignments-cards-container');
    if (!assignmentsContainer) return;

    const newHTML = pendingAssignments.length > 0 ? 
        pendingAssignments.map(assignment => `
            <div class="assignment-card">
                <div class="assignment-card-header">
                    <i class="fas fa-clipboard-list"></i>
                    <h4 class="assignment-card-title">${assignment.title}</h4>
                </div>
                <div class="assignment-card-body">
                    <p class="assignment-card-description">${assignment.description || 'No description provided'}</p>
                    <div class="assignment-card-footer">
                        <span class="due-date ${isAssignmentUrgent(assignment.dueDate) ? 'urgent' : ''}">
                            <i class="far fa-clock"></i> Due: ${formatDate(assignment.dueDate)}
                        </span>
                    </div>
                </div>
            </div>
        `).join('') :
        `<p class="no-pending">No pending assignments</p>`;

    assignmentsContainer.innerHTML = newHTML;

    const viewAllLink = document.querySelector('.assignments-card .view-all-link');
    if (viewAllLink) {
        viewAllLink.style.display = pendingAssignments.length > 0 ? 'block' : 'none';
        if (pendingAssignments.length > 0) {
            viewAllLink.href = `class-dashboard.html?classId=${classId}&section=assignments`;
        }
    }
}

async function fetchResourcesData(classId) {
    try {
        const snapshot = await firebase.database().ref(`classes/${classId}/resources`).once('value');
        
        if (!snapshot.exists()) return [];

        const resources = [];
        
        snapshot.forEach(resourceSnapshot => {
            const resourceData = resourceSnapshot.val();
            
            if (resourceData && resourceData.title) {
                const timestamp = resourceData.timestamp;
                
                resources.push({
                    id: resourceSnapshot.key,
                    title: resourceData.title,
                    description: resourceData.description || 'No description',
                    timestamp: timestamp ? formatDateTime(timestamp) : 'No date',
                    type: resourceData.type || 'file'
                });
            }
        });

        return resources;
    } catch (error) {
        console.error('Error fetching resources:', error);
        return [];
    }
}

function formatDateTime(timestamp) {
    try {
        if (timestamp && typeof timestamp === 'object' && timestamp.toDate) {
            return timestamp.toDate().toLocaleString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
        else if (timestamp && typeof timestamp === 'object' && timestamp.hasOwnProperty('seconds')) {
            const date = new Date(timestamp.seconds * 1000);
            return date.toLocaleString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
        else if (typeof timestamp === 'string') {
            const date = new Date(timestamp);
            if (!isNaN(date.getTime())) {
                return date.toLocaleString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }
        }
        else if (typeof timestamp === 'number') {
            const date = new Date(timestamp);
            return date.toLocaleString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
        
        return 'No date';
    } catch (error) {
        console.error('Error formatting timestamp:', error, 'Timestamp:', timestamp);
        return 'Invalid date';
    }
}

async function fetchAnnouncementsData(classId) {
    try {
        const snapshot = await firebase.database().ref(`classes/${classId}/announcements`).once('value');
        const announcements = snapshot.val() || [];
        const announcementsArray = Array.isArray(announcements) ? announcements : Object.values(announcements);
        return announcementsArray.map(a => ({ 
            ...a, 
            date: a.date || new Date().toISOString() 
        }));
    } catch (error) {
        console.error('Error fetching announcements:', error);
        return [];
    }
}

// Helper functions
function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'No date';
        return date.toLocaleDateString(undefined, { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
    } catch (error) {
        console.error('Error formatting date:', error);
        return 'Invalid date';
    }
}

function getResourceIcon(type) {
    const icons = {
        'pdf': 'fa-file-pdf',
        'doc': 'fa-file-word',
        'ppt': 'fa-file-powerpoint',
        'video': 'fa-file-video',
        'link': 'fa-link'
    };
    return icons[type] || 'fa-file-alt';
}

function isAssignmentUrgent(dueDate) {
    const now = new Date();
    const due = new Date(dueDate);
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    return (due - now) <= threeDaysMs;
}

// Chart functions
function initializeAttendanceChart() {
    const canvas = document.getElementById('attendanceChart');
    if (!canvas) return;

    if (canvas.chart) canvas.chart.destroy();

    try {
        const stats = ['present', 'absent', 'late', 'excused'].map(status => {
            const el = document.querySelector(`.attendance-stat.${status} .stat-value`);
            return parseInt(el?.textContent) || 0;
        });

        canvas.width = 200;
        canvas.height = 200;
        canvas.style.width = '200px';
        canvas.style.height = '200px';

        const ctx = canvas.getContext('2d');
        attendanceChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Present', 'Absent', 'Late', 'Excused'],
                datasets: [{
                    data: stats,
                    backgroundColor: [
                        '#4CAF50', '#F44336', '#FFC107', '#9E9E9E'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: false,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => `${ctx.label}: ${ctx.raw}%`
                        }
                    }
                }
            }
        });

        canvas.chart = attendanceChartInstance;
    } catch (error) {
        console.error('Error initializing chart:', error);
    }
}

function cleanupCharts() {
    if (attendanceChartInstance) {
        attendanceChartInstance.destroy();
        attendanceChartInstance = null;
    }
}

function cleanupAssignmentListeners() {
    Object.keys(assignmentListeners).forEach(classId => {
        const { ref, listener } = assignmentListeners[classId];
        ref.off('value', listener);
        delete assignmentListeners[classId];
    });
}

// Section loader
async function loadSectionContent(section, classId) {
    const sectionElement = document.getElementById(`${section}-section`);
    if (!sectionElement) return;

    sectionElement.innerHTML = `
        <div class="loading-spinner">
            <i class="fas fa-spinner fa-spin"></i> Loading ${section}...
        </div>
    `;

    try {
        let content = '';
        switch (section) {
            case 'overview':
                content = await loadOverviewContent(classId);
                break;
            default:
                content = `<div class="error-message">Section not implemented</div>`;
        }

        sectionElement.innerHTML = content;
        
        if (section === 'overview') {
            initializeAttendanceChart();
            setupAssignmentLinks(classId);
        }
    } catch (error) {
        console.error(`Error loading ${section}:`, error);
        sectionElement.innerHTML = `
            <div class="error-message">
                Error loading ${section} data. Please try again.
            </div>
        `;
    }
}

function setupAssignmentLinks(classId) {
    document.querySelectorAll('.btn-start-assignment').forEach(button => {
        button.addEventListener('click', e => {
            e.preventDefault();
            const assignmentId = button.dataset.id;
            console.log(`Starting assignment ${assignmentId} in class ${classId}`);
        });
    });
}

// Initialize cleanup on page unload
window.addEventListener('beforeunload', () => {
    cleanupCharts();
    cleanupAssignmentListeners();
});