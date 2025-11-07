document.addEventListener('DOMContentLoaded', function() {
    // Get the authenticated student
    const authUser = JSON.parse(localStorage.getItem('authUser')) || 
                     JSON.parse(sessionStorage.getItem('authUser'));

    if (!authUser || authUser.role !== 'student') {
        window.location.href = '../../index.html';
        return;
    }

    // Load the student's classes
    loadStudentClasses(authUser.id);
});

// Global object to store grade listeners
let gradeListeners = {};

async function loadStudentClasses(studentId) {
    try {
        const classCardsContainer = document.querySelector('.class-cards');
        if (!classCardsContainer) return;

        // Clear existing cards and remove previous grade listeners
        classCardsContainer.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading classes...</div>';
        removeAllGradeListeners();

        // Get all classes where this student is enrolled
        const classesRef = firebase.database().ref('classes');
        const classesSnapshot = await classesRef.once('value');
        
        if (!classesSnapshot.exists()) {
            classCardsContainer.innerHTML = '<div class="no-classes">No classes found. You are not enrolled in any classes yet.</div>';
            return;
        }

        const classPromises = [];
        const enrolledClasses = [];

        classesSnapshot.forEach((classSnapshot) => {
            const classId = classSnapshot.key;
            const studentsRef = firebase.database().ref(`classes/${classId}/students/${studentId}`);
            
            // Check if student is enrolled in this class
            const promise = studentsRef.once('value').then((studentSnapshot) => {
                if (studentSnapshot.exists()) {
                    return {
                        id: classId,
                        ...classSnapshot.val()
                    };
                }
                return null;
            });

            classPromises.push(promise);
        });

        // Wait for all checks to complete
        const classes = await Promise.all(classPromises);
        const validClasses = classes.filter(cls => cls !== null);

        if (validClasses.length === 0) {
            classCardsContainer.innerHTML = '<div class="no-classes">No classes found. You are not enrolled in any classes yet.</div>';
            return;
        }

        // Now get teacher details and pending assignments for each class
        const classCards = [];
        
        for (const classData of validClasses) {
            // Get teacher information
            let teacherName = "Teacher Not Found";
            if (classData.teacher) {
                const teacherRef = firebase.database().ref(`users/${classData.teacher}`);
                const teacherSnapshot = await teacherRef.once('value');
                if (teacherSnapshot.exists()) {
                    teacherName = teacherSnapshot.val().name || "Teacher Not Found";
                }
            }

            // Count pending assignments
            let pendingAssignments = 0;
            const assignmentsRef = firebase.database().ref(`classes/${classData.id}/assignments`);
            const assignmentsSnapshot = await assignmentsRef.once('value');
            
            if (assignmentsSnapshot.exists()) {
                const assignmentPromises = [];
                
                assignmentsSnapshot.forEach((assignmentSnapshot) => {
                    const assignmentId = assignmentSnapshot.key;
                    const studentAnswerRef = firebase.database().ref(`classes/${classData.id}/assignments/${assignmentId}/studentAnswers/${studentId}`);
                    
                    const promise = studentAnswerRef.once('value').then((answerSnapshot) => {
                        if (answerSnapshot.exists() && answerSnapshot.val().status === 'pending') {
                            return 1;
                        }
                        return 0;
                    });
                    
                    assignmentPromises.push(promise);
                });
                
                const results = await Promise.all(assignmentPromises);
                pendingAssignments = results.reduce((sum, count) => sum + count, 0);
            }

            // Get initial average grade from /gradebook
            let averageGrade = "N/A";
            const gradeRef = firebase.database().ref(`gradebook/${classData.id}/${studentId}/overallGrade`);
            console.log(`Loading grade for class ${classData.id}, student ${studentId}`);
            const gradeSnapshot = await gradeRef.once('value');
            console.log('Grade snapshot:', gradeSnapshot.val());
            
            if (gradeSnapshot.exists()) {
                const gradeValue = gradeSnapshot.val();
                if (typeof gradeValue === 'number') {
                    averageGrade = `${Math.round(gradeValue)}%`; // No decimals
                } else if (typeof gradeValue === 'string') {
                    averageGrade = gradeValue;
                }
            }

            // Format schedule information
            let scheduleText = "Schedule Not Set";
            if (classData.schedule && classData.schedule.days) {
                const days = classData.schedule.days.join(', ');
                const startTime = classData.schedule.start_time || "TBD";
                const endTime = classData.schedule.end_time || "TBD";
                scheduleText = `${days}, ${startTime} - ${endTime}`;
            }

            // Create class card HTML
            const classCard = createClassCard({
                id: classData.id,
                subjectName: classData.subjectName || "Unnamed Class",
                subjectCode: classData.subjectId || "CODE-000",
                teacher: teacherName,
                schedule: scheduleText,
                room: classData.roomNumber || "Room TBD",
                pendingAssignments: pendingAssignments,
                averageGrade: averageGrade
            });

            classCards.push(classCard);
        }

        // Add all cards to the container
        classCardsContainer.innerHTML = classCards.join('');

        // Setup realtime grade listeners for each class
        validClasses.forEach(classData => {
            setupGradeListener(classData.id, studentId);
        });

        // Add event listeners to the buttons
        document.querySelectorAll('.btn-view').forEach(button => {
            button.addEventListener('click', function() {
                const classId = this.getAttribute('data-class-id');
                viewClassDetails(classId);
            });
        });

        document.querySelectorAll('.btn-resources').forEach(button => {
            button.addEventListener('click', function() {
                const classId = this.getAttribute('data-class-id');
                viewClassResources(classId);
            });
        });

        // Update the schedule table with the dynamic classes
        updateScheduleTable(validClasses);

    } catch (error) {
        console.error("Error loading classes:", error);
        const classCardsContainer = document.querySelector('.class-cards');
        if (classCardsContainer) {
            classCardsContainer.innerHTML = '<div class="error-message">Error loading classes. Please try again later.</div>';
        }
    }
}

function setupGradeListener(classId, studentId) {
    // Remove previous listener if it exists
    if (gradeListeners[classId]) {
        gradeListeners[classId]();
        delete gradeListeners[classId];
    }

    const gradeRef = firebase.database().ref(`gradebook/${classId}/${studentId}/overallGrade`);
    
    // Create new listener
    gradeListeners[classId] = gradeRef.on('value', (snapshot) => {
        let gradeValue = "N/A";
        if (snapshot.exists()) {
            const rawValue = snapshot.val();
            
            // Handle integer grades (no decimals)
            if (typeof rawValue === 'number') {
                // Remove .toFixed() since we don't want decimals
                gradeValue = `${Math.round(rawValue)}%`; // Math.round ensures it's an integer
            } else if (typeof rawValue === 'string') {
                // If it's already a string, use as-is
                gradeValue = rawValue;
            } else if (rawValue === null || rawValue === undefined) {
                gradeValue = "N/A";
            } else {
                // Convert any other type to string
                gradeValue = String(rawValue);
            }
        }
        updateGradeDisplay(classId, gradeValue);
    });
}

function updateGradeDisplay(classId, gradeValue) {
    console.log(`Attempting to update grade display for class ${classId}`);
    
    // Find all grade elements for this class and update them
    const gradeElements = document.querySelectorAll(`.class-card[data-class-id="${classId}"] .stat-value:last-child`);
    
    if (gradeElements.length === 0) {
        console.warn(`No grade elements found for class ${classId}`);
        return;
    }
    
    gradeElements.forEach(element => {
        console.log(`Updating grade element for class ${classId}:`, element);
        element.textContent = gradeValue;
        
        // Optional: Add visual feedback for grade changes
        element.classList.add('grade-updated');
        setTimeout(() => {
            element.classList.remove('grade-updated');
        }, 1000);
    });
}

function removeAllGradeListeners() {
    // Remove all active grade listeners
    Object.keys(gradeListeners).forEach(classId => {
        if (gradeListeners[classId]) {
            gradeListeners[classId]();
        }
    });
    gradeListeners = {};
}

function createClassCard(classInfo) {
    // Determine card color based on subject
    const colorClass = getSubjectColorClass(classInfo.subjectName);

    return `
        <div class="class-card ${colorClass}" data-class-id="${classInfo.id}">
            <div class="class-header">
                <h3>${classInfo.subjectName}</h3>
                <span class="class-code">${classInfo.subjectCode}</span>
            </div>
            <div class="class-info">
                <p><i class="fas fa-user-tie"></i> ${classInfo.teacher}</p>
                <p><i class="fas fa-calendar"></i> ${classInfo.schedule}</p>
                <p><i class="fas fa-map-marker-alt"></i> ${classInfo.room}</p>
            </div>
            <div class="class-stats">
                <div class="stat">
                    <span class="stat-value">${classInfo.pendingAssignments}</span>
                    <span class="stat-label">Pending Assignments</span>
                </div>
                <div class="stat">
                    <span class="stat-value">${classInfo.averageGrade}</span>
                    <span class="stat-label">Average Grade</span>
                </div>
            </div>
            <div class="class-actions">
                <button class="btn-view" data-class-id="${classInfo.id}"><i class="fas fa-eye"></i> View Class</button>
                <button class="btn-resources" data-class-id="${classInfo.id}"><i class="fas fa-book"></i> Resources</button>
            </div>
        </div>
    `;
}

function getSubjectColorClass(subjectName) {
    const lowerSubject = subjectName.toLowerCase();
    
    if (lowerSubject.includes('math')) return 'math-card';
    if (lowerSubject.includes('physical')) return 'physical-card';
    if (lowerSubject.includes('english') || lowerSubject.includes('literature')) return 'english-card';
    if (lowerSubject.includes('history')) return 'history-card';
    if (lowerSubject.includes('chemistry')) return 'chemistry-card';
    if (lowerSubject.includes('computer') || lowerSubject.includes('programming')) return 'cs-card';
    if (lowerSubject.includes('biology')) return 'biology-card';
    if (lowerSubject.includes('art')) return 'art-card';
    if (lowerSubject.includes('music')) return 'music-card';
    
    return 'default-card';
}

function updateScheduleTable(classes) {
    const scheduleBody = document.getElementById('schedule-body');
    if (!scheduleBody) return;

    // Clear existing content
    scheduleBody.innerHTML = '';

    // Create a single row for the schedule
    const row = document.createElement('tr');
    row.innerHTML = `
        <td data-day="monday"></td>
        <td data-day="tuesday"></td>
        <td data-day="wednesday"></td>
        <td data-day="thursday"></td>
        <td data-day="friday"></td>
    `;
    scheduleBody.appendChild(row);

    let hasClasses = false;

    classes.forEach(classData => {
        if (!classData.schedule || !classData.schedule.days) return;

        const colorClass = getSubjectColorClass(classData.subjectName);
        hasClasses = true;
        const startTime = classData.schedule.start_time || "TBD";
        const endTime = classData.schedule.end_time || "TBD";

        classData.schedule.days.forEach(day => {
            const dayCell = row.querySelector(`td[data-day="${day.toLowerCase()}"]`);
            
            if (dayCell) {
                const classBlock = document.createElement('div');
                classBlock.className = `schedule-block ${colorClass}`;
                classBlock.innerHTML = `
                    <div class="subject-name">${classData.subjectName}</div>
                    <div class="class-time">${startTime} - ${endTime}</div>
                    <div class="class-room">${classData.roomNumber || 'TBD'}</div>
                `;
                dayCell.appendChild(classBlock);
            }
        });
    });

    // If no classes with schedules found
    if (!hasClasses) {
        scheduleBody.innerHTML = '<tr><td colspan="5" class="no-schedule">No scheduled classes found</td></tr>';
    }
}

function viewClassDetails(classId) {
    // Redirect to dashboard.html with the class ID as a parameter
    window.location.href = `class-dashboard.html?classId=${encodeURIComponent(classId)}&section=overview`;
}

function viewClassResources(classId) {
    // Redirect to dashboard.html with the class ID as a parameter
    window.location.href = `class-dashboard.html?classId=${encodeURIComponent(classId)}&section=resources`;
}

// Clean up listeners when leaving the page
window.addEventListener('beforeunload', removeAllGradeListeners);