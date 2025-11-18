document.addEventListener('DOMContentLoaded', function() {
    
    // 1. AUTHENTICATION CHECK
    const authUser = JSON.parse(localStorage.getItem('authUser')) || 
                     JSON.parse(sessionStorage.getItem('authUser'));

    const teacherId = authUser.id;
    
    if (!authUser || authUser.role !== 'teacher') {
        window.location.href = '../../index.html';
        return;
    }
    
    // Initialize Firebase (database only)
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    const database = firebase.database();

    // Get URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const classKey = urlParams.get('class');
    
    if (!classKey) {
        window.location.href = 'classes.html';
        return;
    }
    
    // DOM Elements
    const studentCardsContainer = document.getElementById('studentCards');
    const studentSearch = document.getElementById('studentSearch');
    const gradeDetailModal = document.getElementById('gradeDetailModal');
    const closeGradeModal = document.getElementById('closeGradeModal');
    const printGradeReport = document.getElementById('printGradeReport');
    const studentGradeTitle = document.getElementById('studentGradeTitle');
    const studentName = document.getElementById('studentName');
    const studentClass = document.getElementById('studentClass');
    const studentAverage = document.getElementById('studentAverage');
    const gradesTableBody = document.getElementById('gradesTableBody');
    const attendancePercentage = document.getElementById('attendancePercentage');
    const classNameDisplay = document.getElementById('classNameDisplay');
    
    // Current user and data
    let currentUserId = null;
    let studentsData = [];
    let classData = {};
    let assignmentsData = [];
    let attendanceData = {};
    
    // Initialize the page
    initPage();
    
    function initPage() {
        // Verify critical DOM elements exist
        const requiredElements = {
            studentCardsContainer,
            classNameDisplay,
            gradeDetailModal,
            studentSearch
        };
        
        for (const [name, element] of Object.entries(requiredElements)) {
            if (!element) {
                console.error(`Missing required element: ${name}`);
                document.body.innerHTML = `
                    <div class="error-container">
                        <h2>Page Error</h2>
                        <p>Critical element missing: ${name}</p>
                        <p>Please contact support</p>
                    </div>
                `;
                return;
            }
        }

        const authUser = JSON.parse(localStorage.getItem('authUser')) || 
                    JSON.parse(sessionStorage.getItem('authUser'));

        if (!authUser || authUser.role !== 'teacher') {
            window.location.href = '../../index.html';
            return;
        }

        currentUserId = authUser.uid;
        
        // Show loading state
        studentCardsContainer.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading class data...</div>';
        
        // Load class information
        loadClassInfo()
            .then(() => {
                loadStudents();
                setupRealtimeListeners();
            })
            .catch(error => {
                console.error('Initialization error:', error);
                studentCardsContainer.innerHTML = `
                    <div class="error-message">
                        <i class="fas fa-exclamation-triangle"></i>
                        Failed to initialize gradebook. ${error.message || error}
                    </div>
                `;
            });
        
        // Set up event listeners
        studentSearch.addEventListener('input', filterStudents);
        closeGradeModal.addEventListener('click', () => gradeDetailModal.style.display = 'none');
        printGradeReport.addEventListener('click', printStudentReport);
        
        // Close modal when clicking outside
        window.addEventListener('click', (event) => {
            if (event.target === gradeDetailModal) {
                gradeDetailModal.style.display = 'none';
            }
        });
    }
    
    function setupRealtimeListeners() {
        // Realtime listener for assignments
        database.ref(`classes/${classKey}/assignments`).on('value', (snapshot) => {
            assignmentsData = [];
            if (snapshot.exists()) {
                snapshot.forEach(assignmentSnapshot => {
                    assignmentsData.push({
                        id: assignmentSnapshot.key,
                        ...assignmentSnapshot.val()
                    });
                });
            }
            renderStudentCards(studentsData);
        });

        // Realtime listener for attendance
        database.ref(`classes/${classKey}/attendance`).on('value', (snapshot) => {
            attendanceData = snapshot.exists() ? snapshot.val() : {};
            renderStudentCards(studentsData);
        });

        // Realtime listener for gradebook updates
        database.ref(`gradebook/${classKey}`).on('value', (snapshot) => {
            // Update last posted time if needed
            const gradebookData = snapshot.val();
            if (gradebookData) {
                document.querySelectorAll('.student-card').forEach(card => {
                    const studentId = card.getAttribute('data-student-id');
                    const lastUpdatedElement = card.querySelector('.last-updated');
                    if (lastUpdatedElement && gradebookData[studentId]) {
                        lastUpdatedElement.textContent = `Last posted: ${formatDate(gradebookData[studentId].lastUpdated)}`;
                    }
                });
            }
        });
    }
    
    function loadClassInfo() {
        if (!classNameDisplay) {
            console.error('classNameDisplay element not found');
            return Promise.reject('DOM element not found');
        }

        return database.ref(`classes/${classKey}`).once('value').then(snapshot => {
            if (!snapshot.exists()) {
                const errorMsg = `Class ${classKey} not found`;
                console.error(errorMsg);
                classNameDisplay.textContent = 'Class not found';
                showError(errorMsg);
                return Promise.reject(errorMsg);
            }

            classData = snapshot.val();
            
            if (classNameDisplay) {
                classNameDisplay.textContent = `Grade ${classData.gradeLevel || 'Class'} ${classData.strand || "Strand"} - ${classData.sectionNumber || "Section"}`;
                console.log(`Loaded class info: ${classNameDisplay.textContent}`);
            }
            
            document.title = `${classData.name || 'Class'} Gradebook`;
            
            return classData;
        }).catch(error => {
            console.error('Error loading class info:', error);
            if (classNameDisplay) {
                classNameDisplay.textContent = 'Error loading class';
            }
            showError('Failed to load class information');
            return Promise.reject(error);
        });
    }
    
    function loadStudents() {
        return database.ref(`classes/${classKey}/students`).once('value').then(snapshot => {
            studentsData = [];
            studentCardsContainer.innerHTML = '';
            
            if (snapshot.exists()) {
                const studentIds = Object.keys(snapshot.val());
                const studentPromises = studentIds.map(studentId => {
                    return database.ref(`students/${studentId}`).once('value').then(studentSnapshot => {
                        if (studentSnapshot.exists()) {
                            studentsData.push({
                                id: studentId,
                                ...studentSnapshot.val()
                            });
                        }
                    });
                });
                
                return Promise.all(studentPromises).then(() => {
                    return database.ref(`classes/${classKey}/assignments`).once('value').then(assignmentsSnapshot => {
                        assignmentsData = [];
                        if (assignmentsSnapshot.exists()) {
                            assignmentsSnapshot.forEach(assignmentSnapshot => {
                                assignmentsData.push({
                                    id: assignmentSnapshot.key,
                                    ...assignmentSnapshot.val()
                                });
                            });
                        }
                        renderStudentCards(studentsData);
                    });
                });
            } else {
                studentCardsContainer.innerHTML = '<div class="no-students">No students found in this class</div>';
            }
        }).catch(error => {
            console.error('Error loading students:', error);
            studentCardsContainer.innerHTML = '<div class="error-message">Error loading students</div>';
        });
    }
    
    function renderStudentCards(students) {
        studentCardsContainer.innerHTML = '';
        
        if (students.length === 0) {
            studentCardsContainer.innerHTML = '<div class="no-students">No students match your search</div>';
            return;
        }
        
        // Get gradebook data to show last posted time
        database.ref(`gradebook/${classKey}`).once('value').then(gradebookSnapshot => {
            const gradebookData = gradebookSnapshot.exists() ? gradebookSnapshot.val() : {};
            
            students.forEach(student => {
                const { overallGrade, gradedCount, totalCount } = calculateOverallGrade(
                    student.id, 
                    attendanceData
                );
                
                let circleColor = '#4CAF50'; // Green
                if (overallGrade < 70) circleColor = '#F44336'; // Red
                else if (overallGrade < 85) circleColor = '#FFC107'; // Yellow
                
                const lastPosted = gradebookData[student.id] ? 
                    `Last posted: ${formatDate(gradebookData[student.id].lastUpdated)}` : 
                    'Not posted yet';
                
                const studentCard = document.createElement('div');
                studentCard.className = 'student-card';
                studentCard.setAttribute('data-student-id', student.id);
                studentCard.innerHTML = `
                    <div class="student-info">
                        <h3>${student.firstName} ${student.lastName}</h3>
                        <div class="last-updated">${lastPosted}</div>
                    </div>
                    <div class="grade-average">
                        <div class="average-circle" style="background-color: ${circleColor};">
                            <span>${Math.round(overallGrade)}%</span>
                        </div>
                        <p>${gradedCount}/${totalCount} assignments</p>
                    </div>
                    <div class="card-actions">
                        <button class="btn-view" data-student-id="${student.id}">
                            <i class="fas fa-eye"></i> View Grades
                        </button>
                        <button class="btn-post" data-student-id="${student.id}">
                            <i class="fas fa-upload"></i> Post Grades
                        </button>
                    </div>
                `;
                
                studentCardsContainer.appendChild(studentCard);
                
                studentCard.querySelector('.btn-view').addEventListener('click', (e) => {
                    try {
                        openGradeDetailModal(student, attendanceData);
                    } catch (error) {
                        console.error('Error handling view button click:', error);
                        showError('Could not open grade details');
                    }
                });
                
                studentCard.querySelector('.btn-post').addEventListener('click', (e) => {
                    try {
                        postStudentGrades(student.id);
                    } catch (error) {
                        console.error('Error posting grades:', error);
                        showError('Could not post grades');
                    }
                });
            });
        }).catch(error => {
            console.error('Error loading gradebook data:', error);
            showError('Could not load grade history');
        });
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-message">${message}</div>
            <div class="toast-progress"></div>
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
        
        return toast;
    }

    function postStudentGrades(studentId) {
        if (!teacherId) {
            console.error('Current user ID not available');
            showToast('Cannot post grades - user not authenticated', 'error');
            return;
        }

        const loadingToast = showToast('Posting grades...', 'info');
        
        const { overallGrade } = calculateOverallGrade(studentId, attendanceData);
        const student = studentsData.find(s => s.id === studentId);
        
        if (!student) {
            loadingToast.remove();
            showToast('Student data not found', 'error');
            return;
        }

        const studentName = `${student.firstName} ${student.lastName}`;

        const gradebookEntry = {
            studentId: studentId,
            studentName: studentName,
            overallGrade: overallGrade,
            lastUpdated: Date.now(),
            updatedBy: teacherId,
            className: `Grade ${classData.gradeLevel || ''} ${classData.strand || ''} - ${classData.sectionNumber || ''}`.trim()
        };

        // Extract subjectId from classKey
        const parts = classKey.split('_'); 
        const subjectId = parts[1]; 

        // Fetch subjectName
        database.ref(`subjects/${subjectId}/subjectName`).once('value').then(subjectSnap => {
            const subjectName = subjectSnap.exists() ? subjectSnap.val() : 'Unknown Subject';

            // Push notification with subjectName
            database.ref(`notifications/${studentId}`).push({
                title: "Grades Released",
                message: `Your updated grades for ${subjectName} have been posted.`,
                classKey: classKey,
                subjectName: subjectName,
                timestamp: Date.now(),
                seen: false
            });

            // Update gradebook
            return database.ref(`gradebook/${classKey}/${studentId}`).set(gradebookEntry);
        }).then(() => {
            loadingToast.remove();
            showToast('Grades posted successfully!', 'success');

            // Update last posted time in UI
            document.querySelectorAll(`.student-card[data-student-id="${studentId}"] .last-updated`).forEach(el => {
                el.textContent = `Last posted: ${formatDate(Date.now())}`;
            });
        }).catch(error => {
            console.error('Error posting grades or fetching subject:', error);
            loadingToast.remove();
            showToast('Failed to post grades', 'error');
        });
    }
    
    function calculateOverallGrade(studentId, attendanceData) {
        let homeworkTotal = 0;
        let quizTotal = 0;
        let examTotal = 0;
        let homeworkCount = 0;
        let quizCount = 0;
        let examCount = 0;
        let gradedCount = 0;
        let totalCount = 0;
        let overdueCount = 0;

        assignmentsData.forEach(assignment => {
            totalCount++;
            const gradeInfo = assignment.studentAnswers?.[studentId];
            const isOverdue = gradeInfo?.status === 'overdue';
            const hasGrade = gradeInfo?.status === 'graded' && typeof gradeInfo.grade === 'number';
            
            if (isOverdue || !hasGrade) {
                const adjustedGrade = 65;
                
                switch (assignment.type) {
                    case 'homework':
                        homeworkTotal += adjustedGrade;
                        homeworkCount++;
                        break;
                    case 'quiz':
                        quizTotal += adjustedGrade;
                        quizCount++;
                        break;
                    case 'exam':
                        examTotal += adjustedGrade;
                        examCount++;
                        break;
                }

                if (isOverdue) overdueCount++;
            }
            else if (hasGrade && assignment.points) {
                gradedCount++;
                const adjustedGrade = (gradeInfo.grade / assignment.points) * 35 + 65;
                
                switch (assignment.type) {
                    case 'homework':
                        homeworkTotal += adjustedGrade;
                        homeworkCount++;
                        break;
                    case 'quiz':
                        quizTotal += adjustedGrade;
                        quizCount++;
                        break;
                    case 'exam':
                        examTotal += adjustedGrade;
                        examCount++;
                        break;
                }
            }
        });

        const homeworkAvg = homeworkCount > 0 ? homeworkTotal / homeworkCount : 0;
        const quizAvg = quizCount > 0 ? quizTotal / quizCount : 0;
        const examAvg = examCount > 0 ? examTotal / examCount : 0;

        const weightedHomework = homeworkAvg * 0.2;
        const weightedQuiz = quizAvg * 0.3;
        const weightedExam = examAvg * 0.4;

        let attendanceScore = 0;
        let presentDays = 0;
        let totalDays = 0;

        Object.values(attendanceData).forEach(dateAttendance => {
            const studentAttendance = dateAttendance[studentId];
            if (studentAttendance) {
                totalDays++;
                if (studentAttendance.status === 'present' || studentAttendance.status === 'late') {
                    presentDays++;
                }
            }
        });

        if (totalDays > 0) {
            const attendancePercentage = (presentDays / totalDays) * 100;
            attendanceScore = attendancePercentage * 0.1;
        }

        const overallGrade = weightedHomework + weightedQuiz + weightedExam + attendanceScore;

        return {
            overallGrade: Math.min(100, Math.round(overallGrade)),
            gradedCount,
            totalCount,
            overdueCount,
            attendanceScore: Math.round(attendanceScore / 0.1),
            homeworkAvg,
            quizAvg,
            examAvg
        };
    }
    
    function filterStudents() {
        const searchTerm = studentSearch.value.toLowerCase();
        
        if (searchTerm) {
            const filteredStudents = studentsData.filter(student => 
                student.firstName.toLowerCase().includes(searchTerm) ||
                student.lastName.toLowerCase().includes(searchTerm)
            );
            renderStudentCards(filteredStudents);
        } else {
            renderStudentCards(studentsData);
        }
    }
    
    function openGradeDetailModal(student, attendanceData) {
        const modalElements = {
            studentName: document.getElementById('studentName'),
            studentClass: document.getElementById('studentClass'),
            studentGradeTitle: document.getElementById('studentGradeTitle'),
            studentAverage: document.getElementById('studentAverage'),
            attendancePercentage: document.getElementById('attendancePercentage'),
            gradesTableBody: document.getElementById('gradesTableBody'),
            gradeDetailModal: document.getElementById('gradeDetailModal')
        };

        for (const [name, element] of Object.entries(modalElements)) {
            if (!element) {
                console.error(`Modal element missing: ${name}`);
                showError(`Cannot display grades - missing page element (${name})`);
                return;
            }
        }

        try {
            modalElements.studentName.textContent = `${student.firstName} ${student.lastName}`;
            modalElements.studentClass.textContent = `Grade ${classData.gradeLevel || 'Class'} ${classData.strand || "Strand"} - ${classData.sectionNumber || "Section"}`;
            modalElements.studentGradeTitle.textContent = `${student.firstName}'s Grades`;

            const { overallGrade, homeworkAvg, quizAvg, examAvg, attendanceScore } = 
                calculateOverallGrade(student.id, attendanceData);

            modalElements.studentAverage.innerHTML = `
                <div class="overall-grade">Overall Average: <span>${Math.round(overallGrade)}%</span></div>
                <div class="grade-components">
                    <div>Homework: ${Math.round(homeworkAvg)}%</div>
                    <div>Quizzes: ${Math.round(quizAvg)}%</div>
                    <div>Exams: ${Math.round(examAvg)}%</div>
                    <div>Attendance: ${Math.round(attendanceScore)}%</div>
                </div>
            `;

            modalElements.attendancePercentage.innerHTML = `
                <strong>Attendance:</strong> ${Math.round(attendanceScore)}%
            `;

            loadStudentGrades(student.id);
            modalElements.gradeDetailModal.style.display = 'block';
        } catch (error) {
            console.error('Error opening grade modal:', error);
            showError('Failed to display grade details. Please try again.');
            modalElements.gradeDetailModal.style.display = 'none';
        }
    }
    
    function loadStudentGrades(studentId) {
        gradesTableBody.innerHTML = '';
        let hasGrades = false;

        assignmentsData.forEach(assignment => {
            const gradeInfo = assignment.studentAnswers?.[studentId];
            const isOverdue = gradeInfo?.status === 'overdue';
            const hasGrade = gradeInfo?.status === 'graded' && typeof gradeInfo.grade === 'number';
            
            const row = document.createElement('tr');
            
            if (isOverdue || hasGrade) {
                hasGrades = true;
                
                let displayGrade = '-';
                let displayScore = '-';
                let statusClass = '';
                
                if (isOverdue) {
                    displayGrade = '0%';
                    displayScore = '0/' + (assignment.points || '?');
                    statusClass = 'overdue';
                } 
                else if (hasGrade && assignment.points) {
                    const adjustedGrade = Math.round(((gradeInfo.grade / assignment.points) * 35 + 65));
                    displayGrade = adjustedGrade + '%';
                    displayScore = gradeInfo.grade + '/' + assignment.points;
                }

                row.innerHTML = `
                    <td>${assignment.title || 'Untitled Assignment'}</td>
                    <td><span class="grade-type ${assignment.type}">${
                        assignment.type ? assignment.type.charAt(0).toUpperCase() + assignment.type.slice(1) : 'Assignment'
                    }</span></td>
                    <td class="${statusClass}">${
                        isOverdue ? 'Overdue' : 
                        (gradeInfo.submittedAt ? formatDate(gradeInfo.submittedAt) : 'Not submitted')
                    }</td>
                    <td>${displayScore}</td>
                    <td>${displayGrade}</td>
                    <td>${getWeightMultiplier(assignment.type)}</td>
                `;
            } else {
                row.innerHTML = `
                    <td>${assignment.title || 'Untitled Assignment'}</td>
                    <td><span class="grade-type ${assignment.type}">${
                        assignment.type ? assignment.type.charAt(0).toUpperCase() + assignment.type.slice(1) : 'Assignment'
                    }</span></td>
                    <td>Not submitted</td>
                    <td>-</td>
                    <td>-</td>
                    <td>${getWeightMultiplier(assignment.type)}</td>
                `;
            }
            
            gradesTableBody.appendChild(row);
        });

        if (!hasGrades) {
            gradesTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="no-data">No grades recorded for this student</td>
                </tr>
            `;
        }
    }
    
    function getWeightMultiplier(type) {
        switch (type) {
            case 'homework': return '20%';
            case 'quiz': return '30%';
            case 'exam': return '40%';
            default: return '0%';
        }
    }
    
    function printStudentReport() {
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
                <head>
                    <title>Grade Report: ${studentName.textContent}</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 20px; }
                        h1 { color: #333; }
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                        th { background-color: #f2f2f2; }
                        .header { margin-bottom: 20px; }
                        .date { float: right; }
                        .grade-breakdown { margin-top: 10px; }
                        .grade-breakdown span { display: inline-block; margin-right: 15px; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>Grade Report: ${studentName.textContent}</h1>
                        <p>Class: ${studentClass.textContent}</p>
                        <p>Attendance: ${attendancePercentage.textContent}</p>
                        <p class="date">Generated: ${new Date().toLocaleDateString()}</p>
                    </div>
                    ${studentAverage.outerHTML}
                    ${gradesTableBody.parentElement.outerHTML}
                </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    }
    
    function formatDate(timestamp) {
        if (!timestamp) return 'N/A';
        const date = new Date(timestamp);
        return isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleDateString();
    }
    
    function showError(message) {
        alert(message);
    }
});