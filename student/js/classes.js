document.addEventListener('DOMContentLoaded', function() {
    const authUser = JSON.parse(localStorage.getItem('authUser')) || 
                     JSON.parse(sessionStorage.getItem('authUser'));

    if (!authUser || authUser.role !== 'student') {
        window.location.href = '../../index.html';
        return;
    }

    // Initialize modal immediately
    createStudentGradeModal();

    // Load student classes first
    loadStudentClasses(authUser.id).then(() => {
        // Attach button delegation once the cards exist
        const classCardsContainer = document.querySelector('.class-cards');
        if (!classCardsContainer) return;

        classCardsContainer.addEventListener('click', function(e) {
            const btn = e.target.closest('button');
            if (!btn) return;

            const classId = btn.dataset.classId;
            if (!classId) return;

            if (btn.classList.contains('btn-view')) viewClassDetails(classId);
            else if (btn.classList.contains('btn-resources')) viewClassResources(classId);
            else if (btn.classList.contains('btn-grades')) showStudentGrades(classId);
        });
    });
});

// Global object to store grade listeners
let gradeListeners = {};
let studentGradeModal = null;

// ------------------ CLASS LOADING ------------------
async function loadStudentClasses(studentId) {
    try {
        const classCardsContainer = document.querySelector('.class-cards');
        if (!classCardsContainer) return;

        classCardsContainer.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading classes...</div>';
        removeAllGradeListeners();

        const classesRef = firebase.database().ref('classes');
        const classesSnapshot = await classesRef.once('value');

        if (!classesSnapshot.exists()) {
            classCardsContainer.innerHTML = '<div class="no-classes">No classes found. You are not enrolled in any classes yet.</div>';
            return;
        }

        const classPromises = [];
        classesSnapshot.forEach((classSnapshot) => {
            const classId = classSnapshot.key;
            const studentsRef = firebase.database().ref(`classes/${classId}/students/${studentId}`);
            const promise = studentsRef.once('value').then(studentSnapshot => {
                if (studentSnapshot.exists()) return { id: classId, ...classSnapshot.val() };
                return null;
            });
            classPromises.push(promise);
        });

        const classes = await Promise.all(classPromises);
        const validClasses = classes.filter(cls => cls !== null);

        if (validClasses.length === 0) {
            classCardsContainer.innerHTML = '<div class="no-classes">No classes found. You are not enrolled in any classes yet.</div>';
            return;
        }

        const classCards = [];
        for (const classData of validClasses) {
            // Teacher info
            let teacherName = "Teacher Not Found";
            if (classData.teacher) {
                const teacherRef = firebase.database().ref(`users/${classData.teacher}`);
                const teacherSnapshot = await teacherRef.once('value');
                if (teacherSnapshot.exists()) teacherName = teacherSnapshot.val().name || "Teacher Not Found";
            }

            // Pending assignments
            let pendingAssignments = 0;
            const assignmentsRef = firebase.database().ref(`classes/${classData.id}/assignments`);
            const assignmentsSnapshot = await assignmentsRef.once('value');
            if (assignmentsSnapshot.exists()) {
                const assignmentPromises = [];
                assignmentsSnapshot.forEach(snapshot => {
                    const assignmentId = snapshot.key;
                    const studentAnswerRef = firebase.database().ref(`classes/${classData.id}/assignments/${assignmentId}/studentAnswers/${studentId}`);
                    assignmentPromises.push(studentAnswerRef.once('value').then(answerSnapshot => {
                        if (answerSnapshot.exists() && answerSnapshot.val().status === 'pending') return 1;
                        return 0;
                    }));
                });
                const results = await Promise.all(assignmentPromises);
                pendingAssignments = results.reduce((sum, n) => sum + n, 0);
            }

            // Average grade
            let averageGrade = "N/A";
            const gradeRef = firebase.database().ref(`gradebook/${classData.id}/${studentId}/overallGrade`);
            const gradeSnapshot = await gradeRef.once('value');
            if (gradeSnapshot.exists()) {
                const gradeValue = gradeSnapshot.val();
                averageGrade = typeof gradeValue === 'number' ? `${Math.round(gradeValue)}%` : gradeValue || "N/A";
            }

            // Schedule text
            let scheduleText = "Schedule Not Set";
            if (classData.schedule?.days) {
                const days = classData.schedule.days.join(', ');
                const startTime = classData.schedule.start_time || "TBD";
                const endTime = classData.schedule.end_time || "TBD";
                scheduleText = `${days}, ${startTime} - ${endTime}`;
            }

            const classCard = createClassCard({
                id: classData.id,
                subjectName: classData.subjectName || "Unnamed Class",
                subjectCode: classData.subjectId || "CODE-000",
                teacher: teacherName,
                schedule: scheduleText,
                room: classData.roomNumber || "Room TBD",
                pendingAssignments,
                averageGrade
            });
            classCards.push(classCard);
        }

        classCardsContainer.innerHTML = classCards.join('');

        // Setup realtime grade listeners
        validClasses.forEach(classData => setupGradeListener(classData.id, studentId));

        // Button listeners
        document.querySelector('.class-cards').addEventListener('click', function(e) {
            const btn = e.target.closest('button');
            if (!btn) return;

            if (btn.classList.contains('btn-view')) viewClassDetails(btn.dataset.classId);
            else if (btn.classList.contains('btn-resources')) viewClassResources(btn.dataset.classId);
            else if (btn.classList.contains('btn-grades')) showStudentGrades(btn.dataset.classId);
        });

        // Schedule
        updateScheduleTable(validClasses);

    } catch (error) {
        console.error("Error loading classes:", error);
        const classCardsContainer = document.querySelector('.class-cards');
        if (classCardsContainer) classCardsContainer.innerHTML = '<div class="error-message">Error loading classes. Please try again later.</div>';
    }
}

// ------------------ GRADES MODAL ------------------
function createStudentGradeModal() {
    if (studentGradeModal) return studentGradeModal;

    studentGradeModal = document.createElement('div');
    studentGradeModal.id = 'studentGradeModal';
    studentGradeModal.className = 'modal';
    studentGradeModal.innerHTML = `
        <div class="modal-content">
            <button class="close" id="closeStudentGradeModal">&times;</button>
            <h2 id="studentGradeTitle">Grades</h2>
            <div class="student-info">
                <p><strong>Name:</strong> <span id="studentName">N/A</span></p>
                <p><strong>Class:</strong> <span id="studentClass">N/A</span></p>
            </div>
            <div class="grade-average">
                <div class="overall-grade">Overall: <span id="studentOverallGrade">N/A</span></div>
                <div class="grade-components">
                    <div>Homework: <span id="studentHomeworkGrade">N/A</span></div>
                    <div>Quiz: <span id="studentQuizGrade">N/A</span></div>
                    <div>Exam: <span id="studentExamGrade">N/A</span></div>
                    <div>Attendance: <span id="studentAttendanceGrade">N/A</span></div>
                </div>
            </div>
            <table class="grades-table">
                <thead>
                    <tr>
                        <th>Assignment</th>
                        <th>Type</th>
                        <th>Score</th>
                        <th>Grade</th>
                    </tr>
                </thead>
                <tbody id="gradesTableBody">
                    <tr><td colspan="4" style="text-align:center;">Loading...</td></tr>
                </tbody>
            </table>
        </div>
    `;
    document.body.appendChild(studentGradeModal);

    // Close modal events
    document.getElementById('closeStudentGradeModal').addEventListener('click', () => studentGradeModal.style.display = 'none');
    studentGradeModal.addEventListener('click', e => { if (e.target === studentGradeModal) studentGradeModal.style.display = 'none'; });

    return studentGradeModal;
}

async function showStudentGrades(classId) {
    try {
        console.log("showStudentGrades called for class:", classId);
        const studentId = JSON.parse(sessionStorage.getItem('authUser'))?.id;
        if (!studentId) return;

        const modal = createStudentGradeModal();

        // Fetch class & student info
        const classRef = await firebase.database().ref(`classes/${classId}`).once('value');
        const classData = classRef.val() || {};
        document.getElementById('studentClass').textContent = classData.subjectName || 'N/A';

        const studentRef = await firebase.database().ref(`users/${studentId}`).once('value');
        const studentData = studentRef.val() || {};
        document.getElementById('studentName').textContent = studentData.name || 'N/A';

        // Assignments & attendance
        const assignmentsSnapshot = await firebase.database().ref(`classes/${classId}/assignments`).once('value');
        const assignments = [];
        assignmentsSnapshot.forEach(snapshot => assignments.push({ id: snapshot.key, ...snapshot.val() }));

        const attendanceSnapshot = await firebase.database().ref(`classes/${classId}/attendance`).once('value');
        const attendanceData = attendanceSnapshot.exists() ? attendanceSnapshot.val() : {};

        const { overallGrade, homeworkAvg, quizAvg, examAvg, attendanceScore } = calculateOverallGradeForStudent(assignments, studentId, attendanceData);

        // Update modal
        document.getElementById('studentOverallGrade').textContent = `${overallGrade}%`;
        document.getElementById('studentHomeworkGrade').textContent = `${homeworkAvg}%`;
        document.getElementById('studentQuizGrade').textContent = `${quizAvg}%`;
        document.getElementById('studentExamGrade').textContent = `${examAvg}%`;
        document.getElementById('studentAttendanceGrade').textContent = `${attendanceScore}%`;

        // Fill assignment table
        const tableBody = document.getElementById('gradesTableBody');
        tableBody.innerHTML = assignments.map(a => {
            const ans = a.studentAnswers?.[studentId];
            let score = '-', grade = '-';
            if (ans?.status === 'graded') { score = `${ans.grade}/${a.points || '?'}`; grade = `${Math.round((ans.grade / a.points) * 100)}%`; }
            else if (ans?.status === 'pending') grade = 'Pending';
            else if (ans?.status === 'overdue') { score = `0/${a.points || '?'}`; grade = '0%'; }
            return `<tr>
                        <td>${a.title || 'Untitled'}</td>
                        <td>${a.type || 'Assignment'}</td>
                        <td>${score}</td>
                        <td>${grade}</td>
                    </tr>`;
        }).join('');

        modal.style.display = 'block';

        console.log('Modal element:', modal);

    } catch (err) {
        console.error(err);
        alert('Failed to load grades.');
    }
}

// ------------------ GRADE CALCULATION ------------------
function calculateOverallGradeForStudent(assignmentsData, studentId, attendanceData) {
    let homeworkTotal = 0, quizTotal = 0, examTotal = 0;
    let homeworkCount = 0, quizCount = 0, examCount = 0;

    assignmentsData.forEach(a => {
        const gradeInfo = a.studentAnswers?.[studentId];
        const isOverdue = gradeInfo?.status === 'overdue';
        const hasGrade = gradeInfo?.status === 'graded' && typeof gradeInfo.grade === 'number';
        const adjustedGrade = hasGrade ? (gradeInfo.grade / a.points) * 100 : (isOverdue ? 0 : 0);

        switch (a.type) {
            case 'homework': homeworkTotal += adjustedGrade; homeworkCount++; break;
            case 'quiz': quizTotal += adjustedGrade; quizCount++; break;
            case 'exam': examTotal += adjustedGrade; examCount++; break;
        }
    });

    const homeworkAvg = homeworkCount ? homeworkTotal / homeworkCount : 0;
    const quizAvg = quizCount ? quizTotal / quizCount : 0;
    const examAvg = examCount ? examTotal / examCount : 0;

    let presentDays = 0, totalDays = 0;
    Object.values(attendanceData).forEach(dateAttendance => {
        const studentAttendance = dateAttendance[studentId];
        if (studentAttendance) { totalDays++; if (['present','late'].includes(studentAttendance.status)) presentDays++; }
    });
    const attendanceScore = totalDays ? (presentDays / totalDays) * 100 : 0;

    const overallGrade = homeworkAvg * 0.2 + quizAvg * 0.3 + examAvg * 0.4 + attendanceScore * 0.1;

    return {
        overallGrade: Math.round(overallGrade),
        homeworkAvg: Math.round(homeworkAvg),
        quizAvg: Math.round(quizAvg),
        examAvg: Math.round(examAvg),
        attendanceScore: Math.round(attendanceScore)
    };
}

// ------------------ REAL-TIME GRADE LISTENERS ------------------
function setupGradeListener(classId, studentId) {
    if (gradeListeners[classId]) { gradeListeners[classId](); delete gradeListeners[classId]; }

    const gradeRef = firebase.database().ref(`gradebook/${classId}/${studentId}/overallGrade`);
    gradeListeners[classId] = gradeRef.on('value', snapshot => {
        let gradeValue = "N/A";
        if (snapshot.exists()) {
            const rawValue = snapshot.val();
            gradeValue = typeof rawValue === 'number' ? `${Math.round(rawValue)}%` : (rawValue || 'N/A');
        }
        updateGradeDisplay(classId, gradeValue);
    });
}

function updateGradeDisplay(classId, gradeValue) {
    const gradeElements = document.querySelectorAll(`.class-card[data-class-id="${classId}"] .stat-value:last-child`);
    gradeElements.forEach(el => { el.textContent = gradeValue; el.classList.add('grade-updated'); setTimeout(() => el.classList.remove('grade-updated'), 1000); });
}

function removeAllGradeListeners() {
    Object.keys(gradeListeners).forEach(classId => { if (gradeListeners[classId]) gradeListeners[classId](); });
    gradeListeners = {};
}

// ------------------ CLASS CARD ------------------
function createClassCard(classInfo) {
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
                <button class="btn-grades" data-class-id="${classInfo.id}"><i class="fas fa-chart-bar"></i> View Grades</button>
            </div>
        </div>
    `;
}

function getSubjectColorClass(subjectName) {
    const s = subjectName.toLowerCase();
    if (s.includes('math')) return 'math-card';
    if (s.includes('physical')) return 'physical-card';
    if (s.includes('english') || s.includes('literature')) return 'english-card';
    if (s.includes('history')) return 'history-card';
    if (s.includes('chemistry')) return 'chemistry-card';
    if (s.includes('computer') || s.includes('programming')) return 'cs-card';
    if (s.includes('biology')) return 'biology-card';
    if (s.includes('art')) return 'art-card';
    if (s.includes('music')) return 'music-card';
    return 'default-card';
}

// ------------------ SCHEDULE ------------------
function updateScheduleTable(classes) {
    const scheduleBody = document.getElementById('schedule-body');
    if (!scheduleBody) return;
    scheduleBody.innerHTML = '';

    const row = document.createElement('tr');
    row.innerHTML = `<td data-day="monday"></td><td data-day="tuesday"></td><td data-day="wednesday"></td><td data-day="thursday"></td><td data-day="friday"></td>`;
    scheduleBody.appendChild(row);

    let hasClasses = false;
    classes.forEach(c => {
        if (!c.schedule || !c.schedule.days) return;
        hasClasses = true;
        const colorClass = getSubjectColorClass(c.subjectName);
        const startTime = c.schedule.start_time || 'TBD';
        const endTime = c.schedule.end_time || 'TBD';
        c.schedule.days.forEach(day => {
            const dayCell = row.querySelector(`td[data-day="${day.toLowerCase()}"]`);
            if (dayCell) {
                const classBlock = document.createElement('div');
                classBlock.className = `schedule-block ${colorClass}`;
                classBlock.innerHTML = `<div class="subject-name">${c.subjectName}</div><div class="class-time">${startTime} - ${endTime}</div><div class="class-room">${c.roomNumber || 'TBD'}</div>`;
                dayCell.appendChild(classBlock);
            }
        });
    });

    if (!hasClasses) scheduleBody.innerHTML = '<tr><td colspan="5" class="no-schedule">No scheduled classes found</td></tr>';
}

// ------------------ NAVIGATION ------------------
function viewClassDetails(classId) { window.location.href = `class-dashboard.html?classId=${encodeURIComponent(classId)}&section=overview`; }
function viewClassResources(classId) { window.location.href = `class-dashboard.html?classId=${encodeURIComponent(classId)}&section=resources`; }

// Clean up listeners when leaving page
window.addEventListener('beforeunload', removeAllGradeListeners);
