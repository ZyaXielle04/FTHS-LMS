// Global variables for cleanup functions
let cleanupPendingAssignments = null;
let cleanupClassesCount = null;
let cleanupAttendanceRate = null;

document.addEventListener('DOMContentLoaded', function() {
    // Get authenticated student
    const authUser = JSON.parse(localStorage.getItem('authUser')) || 
                     JSON.parse(sessionStorage.getItem('authUser'));

    if (!authUser || authUser.role !== 'student') {
        window.location.href = '../../index.html';
        return;
    }

    // Load student name
    loadStudentName(authUser.id);
    loadTodaysSchedule(authUser.id);
    loadUpcomingAssignments(authUser.id);

    // Load dashboard data
    loadCurrentClassesCount(authUser.id);
    loadPendingAssignmentsCount(authUser.id);
    loadAttendanceRate(authUser.id);

    // Setup logout cleanup
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', cleanupAllListeners);
    }
});

function cleanupAllListeners() {
    if (cleanupClassesCount) {
        cleanupClassesCount();
    }
    if (cleanupPendingAssignments) {
        cleanupPendingAssignments();
    }
    if (cleanupAttendanceRate) {
        cleanupAttendanceRate();
    }
}

function loadStudentName(studentId) {
    const studentNameElement = document.getElementById('studentName');
    const studentRef = firebase.database().ref(`students/${studentId}`);

    studentRef.once('value')
        .then((snapshot) => {
            if (snapshot.exists()) {
                const studentData = snapshot.val();
                const fullName = `${studentData.firstName} ${studentData.lastName}`;
                studentNameElement.textContent = fullName;
            } else {
                studentNameElement.textContent = 'Student';
                console.warn('Student data not found in /students path');
            }
        })
        .catch((error) => {
            console.error('Error loading student name:', error);
            studentNameElement.textContent = 'Student';
        });
}

function loadCurrentClassesCount(studentId) {
    const currentClassesCountElement = document.getElementById('currentClassesCount');
    const classesRef = firebase.database().ref('classes');

    // Set initial loading state
    currentClassesCountElement.textContent = '...';

    // Create cleanup function
    const classesListener = classesRef.on('value', (snapshot) => {
        let classCount = 0;
        
        snapshot.forEach((classSnapshot) => {
            const students = classSnapshot.child('students').val();
            if (students && students[studentId]) {
                classCount++;
            }
        });

        // Update the UI with the count
        currentClassesCountElement.textContent = classCount;
    }, (error) => {
        console.error("Error loading classes:", error);
        currentClassesCountElement.textContent = 'Error';
    });

    // Set cleanup function
    cleanupClassesCount = () => {
        classesRef.off('value', classesListener);
    };
}

function loadPendingAssignmentsCount(studentId) {
    const pendingCountElement = document.getElementById('pendingAssignmentsCount');
    pendingCountElement.textContent = '...'; // Loading state

    let totalPending = 0;
    const classesRef = firebase.database().ref('classes');
    
    // Object to track all active listeners
    const activeListeners = {
        classes: null,
        assignments: {},
        status: {}
    };

    // Main classes listener
    activeListeners.classes = classesRef.on('value', (classesSnapshot) => {
        // Reset counter
        totalPending = 0;
        pendingCountElement.textContent = '0';
        
        // Clean up previous assignment listeners
        Object.keys(activeListeners.assignments).forEach(classId => {
            classesRef.child(`${classId}/assignments`).off('value', activeListeners.assignments[classId]);
            delete activeListeners.assignments[classId];
            
            // Clean up status listeners for this class
            if (activeListeners.status[classId]) {
                Object.keys(activeListeners.status[classId]).forEach(assignmentId => {
                    classesRef.child(`${classId}/assignments/${assignmentId}/studentAnswers/${studentId}/status`)
                        .off('value', activeListeners.status[classId][assignmentId]);
                });
                delete activeListeners.status[classId];
            }
        });

        if (!classesSnapshot.exists()) {
            pendingCountElement.textContent = '0';
            return;
        }

        classesSnapshot.forEach((classSnapshot) => {
            const classId = classSnapshot.key;
            
            // Only proceed if student is enrolled in this class
            if (!classSnapshot.child('students').child(studentId).exists()) {
                return;
            }

            const assignmentsRef = classesRef.child(`${classId}/assignments`);
            
            // Set up assignments listener for this class
            activeListeners.assignments[classId] = assignmentsRef.on('value', (assignmentsSnapshot) => {
                // Clean up previous status listeners for this class
                if (activeListeners.status[classId]) {
                    Object.keys(activeListeners.status[classId]).forEach(assignmentId => {
                        assignmentsRef.child(`${assignmentId}/studentAnswers/${studentId}/status`)
                            .off('value', activeListeners.status[classId][assignmentId]);
                    });
                }
                activeListeners.status[classId] = {};

                if (!assignmentsSnapshot.exists()) {
                    return;
                }

                assignmentsSnapshot.forEach((assignmentSnapshot) => {
                    const assignmentId = assignmentSnapshot.key;
                    const statusRef = assignmentsRef.child(`${assignmentId}/studentAnswers/${studentId}/status`);
                    
                    // Set up status listener for this assignment
                    activeListeners.status[classId][assignmentId] = statusRef.on('value', (statusSnapshot) => {
                        const previousCount = totalPending;
                        
                        if (statusSnapshot.exists()) {
                            if (statusSnapshot.val() === 'pending') {
                                if (!statusSnapshot.previous || statusSnapshot.previous.val() !== 'pending') {
                                    totalPending++;
                                }
                            } else {
                                if (statusSnapshot.previous && statusSnapshot.previous.val() === 'pending') {
                                    totalPending = Math.max(0, totalPending - 1);
                                }
                            }
                        } else {
                            if (statusSnapshot.previous && statusSnapshot.previous.val() === 'pending') {
                                totalPending = Math.max(0, totalPending - 1);
                            }
                        }
                        
                        // Only update DOM if count changed
                        if (previousCount !== totalPending) {
                            pendingCountElement.textContent = totalPending;
                        }
                    });
                });
            });
        });
    }, (error) => {
        console.error("Error loading pending assignments:", error);
        pendingCountElement.textContent = 'Error';
    });

    // Create cleanup function
    cleanupPendingAssignments = () => {
        // Remove all listeners
        if (activeListeners.classes) {
            classesRef.off('value', activeListeners.classes);
        }
        
        Object.keys(activeListeners.assignments).forEach(classId => {
            classesRef.child(`${classId}/assignments`).off('value', activeListeners.assignments[classId]);
        });
        
        Object.keys(activeListeners.status).forEach(classId => {
            if (activeListeners.status[classId]) {
                Object.keys(activeListeners.status[classId]).forEach(assignmentId => {
                    classesRef.child(`${classId}/assignments/${assignmentId}/studentAnswers/${studentId}/status`)
                        .off('value', activeListeners.status[classId][assignmentId]);
                });
            }
        });
    };
}

function loadTodaysSchedule(studentId) {
    const todaysScheduleElement = document.getElementById('todaysSchedule');
    todaysScheduleElement.innerHTML = '<div class="loading">Loading today\'s schedule...</div>';
    
    const classesRef = firebase.database().ref('classes');
    const teachersRef = firebase.database().ref('teachers');
    const today = new Date();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayName = dayNames[today.getDay()];
    
    // Get current time in HH:MM format (24-hour)
    const currentTime = today.toTimeString().substring(0, 5);
    
    classesRef.once('value')
        .then(async (classesSnapshot) => {
            let scheduleItems = [];
            
            // First, get all teacher data to minimize database calls
            const teachersSnapshot = await teachersRef.once('value');
            const teachersData = teachersSnapshot.val() || {};
            
            classesSnapshot.forEach((classSnapshot) => {
                const classData = classSnapshot.val();
                const classId = classSnapshot.key;
                
                // Check if student is enrolled in this class
                if (classData.students && classData.students[studentId]) {
                    // Check if class has schedule for today
                    if (classData.schedule && classData.schedule.days) {
                        const days = classData.schedule.days;
                        
                        // Check if today is one of the scheduled days
                        if (Object.values(days).includes(todayName)) {
                            const startTime = classData.schedule.start_time;
                            const endTime = classData.schedule.end_time;
                            
                            // Only show classes that haven't ended yet
                            if (endTime > currentTime) {
                                // Get teacher name
                                let teacherName = 'Teacher';
                                if (classData.teacher && teachersData[classData.teacher]) {
                                    teacherName = "Prof. " + teachersData[classData.teacher].name || 'Teacher';
                                }
                                
                                // Format time for display (convert from 24h to 12h)
                                const startTimeFormatted = formatTimeTo12Hour(startTime);
                                const endTimeFormatted = formatTimeTo12Hour(endTime);
                                
                                scheduleItems.push({
                                    classId,
                                    className: classData.subjectName || classData.className || 'Unnamed Class',
                                    teacher: teacherName,
                                    room: classData.roomNumber || classData.room || 'Room not specified',
                                    startTime,
                                    endTime,
                                    displayTime: `${startTimeFormatted} - ${endTimeFormatted}`,
                                    isUpcoming: startTime > currentTime
                                });
                            }
                        }
                    }
                }
            });
            
            // Sort classes by start time
            scheduleItems.sort((a, b) => a.startTime.localeCompare(b.startTime));
            
            // Clear loading message
            todaysScheduleElement.innerHTML = '';
            
            if (scheduleItems.length === 0) {
                todaysScheduleElement.innerHTML = '<div class="no-classes">No classes scheduled for today</div>';
                return;
            }
            
            // Create HTML for each class
            scheduleItems.forEach((classItem) => {
                const classElement = document.createElement('div');
                classElement.className = 'schedule-item';
                
                // Add a class if the class is currently ongoing
                if (classItem.startTime <= currentTime && classItem.endTime > currentTime) {
                    classElement.classList.add('ongoing');
                }
                
                classElement.innerHTML = `
                    <div class="class-time">${classItem.displayTime}</div>
                    <div class="class-info">
                        <h3>${classItem.className}</h3>
                        <p>${classItem.teacher} | ${classItem.room}</p>
                    </div>
                    <button class="join-class-btn" data-class-id="${classItem.classId}">
                        ${classItem.startTime > currentTime ? 'Join Class' : 'In Progress'}
                    </button>
                `;
                
                todaysScheduleElement.appendChild(classElement);
            });
            
            // Add event listeners to join buttons
            document.querySelectorAll('.join-class-btn').forEach(button => {
                button.addEventListener('click', function() {
                    const classId = this.getAttribute('data-class-id');
                    joinClass(classId);
                });
            });
        })
        .catch((error) => {
            console.error('Error loading today\'s schedule:', error);
            todaysScheduleElement.innerHTML = '<div class="error">Error loading schedule</div>';
        });
}

// Helper function to format time from 24h to 12h format
function formatTimeTo12Hour(time24) {
    const [hours, minutes] = time24.split(':');
    const h = parseInt(hours);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12; // Convert 0 or 13-23 to 12-hour format
    
    return `${h12}:${minutes} ${period}`;
}

function joinClass(classId) {
    console.log('Joining class:', classId);
    window.location.href = `class-dashboard.html?classId=${encodeURIComponent(classId)}&section=overview`;
}

// Add these functions to your dashboard.js
function loadUpcomingAssignments(studentId) {
    const assignmentsListElement = document.querySelector('.assignments-list');
    assignmentsListElement.innerHTML = '<div class="loading">Loading assignments...</div>';
    
    const classesRef = firebase.database().ref('classes');
    const today = new Date();
    
    classesRef.once('value')
        .then((classesSnapshot) => {
            let upcomingAssignments = [];
            
            classesSnapshot.forEach((classSnapshot) => {
                const classData = classSnapshot.val();
                const classId = classSnapshot.key;
                
                // Check if student is enrolled in this class
                if (classData.students && classData.students[studentId]) {
                    // Check if class has assignments
                    if (classData.assignments) {
                        Object.entries(classData.assignments).forEach(([assignmentId, assignmentData]) => {
                            // Check if this assignment has a due date and student status
                            if (assignmentData.dueDate && assignmentData.studentAnswers && 
                                assignmentData.studentAnswers[studentId]) {
                                
                                const studentStatus = assignmentData.studentAnswers[studentId].status;
                                
                                // Only show pending assignments that are not yet due
                                if (studentStatus === 'pending') {
                                    const dueDate = new Date(assignmentData.dueDate);
                                    
                                    // Only show assignments that are not yet due
                                    if (dueDate > today) {
                                        // Calculate days until due
                                        const timeDiff = dueDate - today;
                                        const daysUntilDue = Math.ceil(timeDiff / (1000 * 3600 * 24));
                                        
                                        let dueText = '';
                                        if (daysUntilDue === 0) {
                                            dueText = 'Due Today';
                                        } else if (daysUntilDue === 1) {
                                            dueText = 'Due Tomorrow';
                                        } else {
                                            dueText = `Due in ${daysUntilDue} days`;
                                        }
                                        
                                        upcomingAssignments.push({
                                            classId,
                                            assignmentId,
                                            title: assignmentData.title || 'Untitled Assignment',
                                            description: assignmentData.description || 'No description provided',
                                            dueDate: assignmentData.dueDate,
                                            daysUntilDue,
                                            dueText,
                                            subject: classData.subjectName || classData.className || 'General'
                                        });
                                    }
                                }
                            }
                        });
                    }
                }
            });
            
            // Sort assignments by due date (soonest first)
            upcomingAssignments.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
            
            // Clear loading message
            assignmentsListElement.innerHTML = '';
            
            if (upcomingAssignments.length === 0) {
                assignmentsListElement.innerHTML = '<div class="no-assignments">No upcoming assignments</div>';
                return;
            }
            
            // Only show the next 5 assignments to avoid clutter
            const assignmentsToShow = upcomingAssignments.slice(0, 5);
            
            // Create HTML for each assignment
            assignmentsToShow.forEach((assignment) => {
                const assignmentElement = document.createElement('div');
                assignmentElement.className = 'assignment-item';
                assignmentElement.setAttribute('data-assignment-id', assignment.assignmentId);
                assignmentElement.setAttribute('data-class-id', assignment.classId);
                
                // Determine subject tag class
                const subjectTagClass = getSubjectTagClass(assignment.subject);
                
                assignmentElement.innerHTML = `
                    <div class="assignment-due">
                        <span class="due-date">${assignment.dueText}</span>
                        <span class="subject-tag ${subjectTagClass}">${assignment.subject}</span>
                    </div>
                    <div class="assignment-info">
                        <h3>${assignment.title}</h3>
                        <p>${assignment.description}</p>
                    </div>
                    <button class="view-assignment-btn" data-class-id="${assignment.classId}" data-assignment-id="${assignment.assignmentId}">
                        View Details
                    </button>
                `;
                
                assignmentsListElement.appendChild(assignmentElement);
            });
            
            // Add event listeners to view buttons
            document.querySelectorAll('.view-assignment-btn').forEach(button => {
                button.addEventListener('click', function() {
                    const classId = this.getAttribute('data-class-id');
                    const assignmentId = this.getAttribute('data-assignment-id');
                    viewAssignment(classId, assignmentId);
                });
            });
        })
        .catch((error) => {
            console.error('Error loading upcoming assignments:', error);
            assignmentsListElement.innerHTML = '<div class="error">Error loading assignments</div>';
        });
}

// Helper function to determine CSS class based on subject
function getSubjectTagClass(subject) {
    const subjectLower = subject.toLowerCase();
    
    if (subjectLower.includes('math') || subjectLower.includes('algebra') || subjectLower.includes('calculus')) {
        return 'math-tag';
    } else if (subjectLower.includes('science') || subjectLower.includes('physics') || subjectLower.includes('chemistry') || subjectLower.includes('biology')) {
        return 'science-tag';
    } else if (subjectLower.includes('english') || subjectLower.includes('literature') || subjectLower.includes('writing')) {
        return 'english-tag';
    } else if (subjectLower.includes('history') || subjectLower.includes('social')) {
        return 'history-tag';
    } else if (subjectLower.includes('art') || subjectLower.includes('music')) {
        return 'arts-tag';
    } else {
        return 'general-tag';
    }
}

// Function to handle viewing an assignment
function viewAssignment(classId, assignmentId) {
    console.log('Viewing assignment:', assignmentId, 'in class:', classId);
    window.location.href = `class-dashboard.html?classId=${encodeURIComponent(classId)}&section=assignments`;
}

function loadAttendanceRate(studentId) {
    const attendanceRateElement = document.getElementById('attendanceRate');
    attendanceRateElement.textContent = '...'; // Loading state

    let totalDays = 0;
    let presentDays = 0;
    const classesRef = firebase.database().ref('classes');

    // This will track all our attendance listeners
    const attendanceListeners = {};

    // Main listener for classes
    const classesListener = classesRef.on('value', (classesSnapshot) => {
        // Reset counters
        totalDays = 0;
        presentDays = 0;
        attendanceRateElement.textContent = '...';

        // First, detach any existing attendance listeners
        Object.keys(attendanceListeners).forEach(classId => {
            classesRef.child(`${classId}/attendance`).off('value', attendanceListeners[classId]);
            delete attendanceListeners[classId];
        });

        classesSnapshot.forEach((classSnapshot) => {
            const classId = classSnapshot.key;
            
            // Only proceed if student is enrolled in this class
            if (!classSnapshot.child('students').child(studentId).exists()) {
                return;
            }

            const attendanceRef = classesRef.child(`${classId}/attendance`);
            
            // Set up attendance listener for this class
            attendanceListeners[classId] = attendanceRef.on('value', (attendanceSnapshot) => {
                let classTotalDays = 0;
                let classPresentDays = 0;

                attendanceSnapshot.forEach((dateSnapshot) => {
                    const studentStatus = dateSnapshot.child(studentId).child('status').val();
                    
                    if (studentStatus) {
                        classTotalDays++;
                        if (studentStatus === 'present' || studentStatus === 'late') {
                            classPresentDays++;
                        }
                    }
                });

                // Update global counts
                totalDays += classTotalDays;
                presentDays += classPresentDays;

                // Calculate and update attendance rate
                if (totalDays > 0) {
                    const attendanceRate = Math.round((presentDays / totalDays) * 100);
                    attendanceRateElement.textContent = `${attendanceRate}%`;
                } else {
                    attendanceRateElement.textContent = 'N/A';
                }
            });
        });
    }, (error) => {
        console.error("Error loading attendance data:", error);
        attendanceRateElement.textContent = 'Error';
    });

    // Create cleanup function
    cleanupAttendanceRate = () => {
        classesRef.off('value', classesListener);
        Object.keys(attendanceListeners).forEach(classId => {
            classesRef.child(`${classId}/attendance`).off('value', attendanceListeners[classId]);
        });
    };
}

// Make sure to call cleanupAllListeners() when needed (e.g., on logout)
window.logout = function() {
    cleanupAllListeners();
};