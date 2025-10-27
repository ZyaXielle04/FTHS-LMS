document.addEventListener('DOMContentLoaded', function() {
    // 1. AUTHENTICATION CHECK
    const authUser = JSON.parse(localStorage.getItem('authUser')) || 
                     JSON.parse(sessionStorage.getItem('authUser'));
    
    if (!authUser || authUser.role !== 'teacher') {
        window.location.href = '../../index.html';
        return;
    }

    const teacherId = authUser.id;
    const db = firebase.database();
    
    // 2. GET URL PARAMETERS
    const urlParams = new URLSearchParams(window.location.search);
    const classKey = urlParams.get('class');
    
    if (!classKey) {
        window.location.href = 'classes.html';
        return;
    }

    // 3. DOM ELEMENTS
    const classTitle = document.getElementById('classTitle');
    const className = document.getElementById('className');
    const totalStudents = document.getElementById('totalStudents');
    const studentsTable = document.getElementById('studentsTable');
    const studentSearch = document.getElementById('studentSearch');
    const exportStudentsBtn = document.getElementById('exportStudentsBtn');

    // 4. LOAD CLASS AND STUDENTS DATA
    function loadClassAndStudents() {
        // Show loading state
        studentsTable.querySelector('tbody').innerHTML = `
            <tr class="loading-row">
                <td colspan="4">
                    <i class="fas fa-spinner fa-spin"></i> Loading students...
                </td>
            </tr>
        `;

        // Get class details
        db.ref(`classes/${classKey}`).once('value').then(classSnap => {
            const classData = classSnap.val();
            if (!classData) {
                window.location.href = 'classes.html';
                return;
            }

            // Update class info in header
            const classDisplayName = `Grade ${classData.gradeLevel} ${classData.strand} - ${classData.sectionNumber}`;
            classTitle.textContent = `${classData.subjectName} Students`;
            className.textContent = classDisplayName;

            // Load students from the class node
            loadStudents(classData.students || {});
        });
    }

    // 5. LOAD AND DISPLAY STUDENTS
    function loadStudents(students) {
        const studentsArray = Object.entries(students).map(([id, student]) => ({
            id,
            ...student
        }));

        // Update stats
        totalStudents.textContent = studentsArray.length;

        // Populate table
        const tbody = studentsTable.querySelector('tbody');
        tbody.innerHTML = '';

        if (studentsArray.length === 0) {
            tbody.innerHTML = `
                <tr class="no-students">
                    <td colspan="4">No students found in this class</td>
                </tr>
            `;
            return;
        }

        studentsArray.forEach(student => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${student.id}</td>
                <td>${student.name}</td>
                <td>${student.email || 'N/A'}</td>
                <td class="actions">
                    <button class="btn-icon view-student" data-id="${student.id}">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-icon message-student" data-id="${student.id}">
                        <i class="fas fa-envelope"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });

        // Add event listeners to action buttons
        document.querySelectorAll('.view-student').forEach(btn => {
            btn.addEventListener('click', () => showStudentDetails(btn.dataset.id));
        });
    }

    // 6. STUDENT DETAILS MODAL with attendance counts and grades
        function showStudentDetails(studentId) {
        // Show loading state in the modal
        document.getElementById('gradeBar').style.width = '0%';
        document.getElementById('gradeValue').textContent = 'Loading...';
        
        // Clear existing grade breakdown if it exists
        const existingBreakdown = document.querySelector('.grade-breakdown');
        if (existingBreakdown) {
            existingBreakdown.remove();
        }

        // Get student data from /students/{studentId}
        db.ref(`students/${studentId}`).once('value').then(studentSnap => {
            const student = studentSnap.val();
            if (!student) {
                throw new Error('Student not found');
            }

            // Update student info in modal
            document.getElementById('detailsStudentName').textContent = 
                `${student.firstName} ${student.lastName}`;
            document.getElementById('detailsStudentId').textContent = `ID: ${studentId}`;

            // Get all attendance records for this class
            return db.ref(`classes/${classKey}/attendance`).once('value');
        }).then(attendanceSnap => {
            const attendanceData = attendanceSnap.val() || {};
            
            // Get assignments for this class
            return db.ref(`classes/${classKey}/assignments`).once('value').then(assignmentsSnap => {
                const assignmentsData = [];
                assignmentsSnap.forEach(assignmentSnap => {
                    assignmentsData.push({
                        id: assignmentSnap.key,
                        ...assignmentSnap.val()
                    });
                });

                // Calculate the overall grade
                const { overallGrade, homeworkAvg, quizAvg, examAvg, attendanceScore } = 
                    calculateOverallGrade(studentId, attendanceData, assignmentsData);

                // Update the grade bar and value
                const gradeBar = document.getElementById('gradeBar');
                const gradeValue = document.getElementById('gradeValue');
                if (gradeBar && gradeValue) {
                    gradeBar.style.width = `${overallGrade}%`;
                    gradeValue.textContent = `${overallGrade}%`;
                    
                    // Set color based on grade
                    if (overallGrade < 70) {
                        gradeBar.style.backgroundColor = '#F44336';
                    } else if (overallGrade < 85) {
                        gradeBar.style.backgroundColor = '#FFC107';
                    } else {
                        gradeBar.style.backgroundColor = '#4CAF50';
                    }
                }

                // Create grade breakdown
                const gradeBreakdown = document.createElement('div');
                gradeBreakdown.className = 'grade-breakdown';
                gradeBreakdown.innerHTML = `
                    <div><strong>Grade Breakdown:</strong></div>
                    <div>Homework: ${Math.round(homeworkAvg)}%</div>
                    <div>Quizzes: ${Math.round(quizAvg)}%</div>
                    <div>Exams: ${Math.round(examAvg)}%</div>
                    <div>Attendance: ${Math.round(attendanceScore)}%</div>
                `;
                gradeValue.parentNode.appendChild(gradeBreakdown);

                // Calculate and display attendance
                let presentDays = 0, absentDays = 0, lateDays = 0, excusedDays = 0;
                const allDates = Object.keys(attendanceData);
                const totalDays = allDates.length;

                allDates.forEach(date => {
                    const studentRecord = attendanceData[date]?.[studentId];
                    if (!studentRecord) {
                        absentDays++;
                        return;
                    }

                    switch(studentRecord.status) {
                        case 'present': presentDays++; break;
                        case 'absent': absentDays++; break;
                        case 'late': lateDays++; break;
                        case 'excused': excusedDays++; break;
                        default: absentDays++;
                    }
                });

                // Update attendance bar
                const attendanceBar = document.getElementById('attendanceBar');
                if (attendanceBar) {
                    attendanceBar.innerHTML = '';
                    
                    const addSegment = (percent, className, title) => {
                        if (percent > 0) {
                            const segment = document.createElement('div');
                            segment.className = `attendance-segment ${className}`;
                            segment.style.width = `${percent}%`;
                            segment.title = title;
                            attendanceBar.appendChild(segment);
                        }
                    };

                    addSegment((presentDays/totalDays)*100, 'present', `Present: ${presentDays} days`);
                    addSegment((lateDays/totalDays)*100, 'late', `Late: ${lateDays} days`);
                    addSegment((excusedDays/totalDays)*100, 'excused', `Excused: ${excusedDays} days`);
                    addSegment((absentDays/totalDays)*100, 'absent', `Absent: ${absentDays} days`);
                }

                // Update attendance text
                const attendanceValue = document.getElementById('attendanceValue');
                if (attendanceValue) {
                    attendanceValue.innerHTML = `
                        <span class="present">${presentDays} Present</span> |
                        <span class="late">${lateDays} Late</span> |
                        <span class="excused">${excusedDays} Excused</span> |
                        <span class="absent">${absentDays} Absent</span>
                        <br><span class="total-days">Total: ${totalDays} days</span>
                    `;
                }

                // Show modal
                document.getElementById('studentDetailsModal').style.display = 'block';
            });
        }).catch(error => {
            console.error("Error loading student details:", error);
            Swal.fire('Error', 'Failed to load student details', 'error');
        });
    }

    // Add this function to students.js (copied from grades.js with slight modification)
    function calculateOverallGrade(studentId, attendanceData, assignmentsData) {
        let homeworkTotal = 0;
        let quizTotal = 0;
        let examTotal = 0;
        let homeworkCount = 0;
        let quizCount = 0;
        let examCount = 0;
        let gradedCount = 0;
        let totalCount = 0;
        let overdueCount = 0;

        // Process assignments
        assignmentsData.forEach(assignment => {
            totalCount++;
            const gradeInfo = assignment.studentAnswers?.[studentId];
            const isOverdue = gradeInfo?.status === 'overdue';
            const hasGrade = gradeInfo?.status === 'graded' && typeof gradeInfo.grade === 'number';
            
            if (isOverdue || !hasGrade) {
                // Treat overdue or ungraded assignments as 0
                const adjustedGrade = 65; // Minimum grade (0 points would be 65% after adjustment)
                
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

        // Calculate attendance component
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

        // Calculate overall grade
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

    // 7. SEARCH FUNCTIONALITY
    studentSearch.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase();
        const rows = studentsTable.querySelectorAll('tbody tr');

        rows.forEach(row => {
            if (row.classList.contains('loading-row') || row.classList.contains('no-students')) return;
            
            const name = row.querySelector('td:nth-child(2)').textContent.toLowerCase();
            const id = row.querySelector('td:nth-child(1)').textContent.toLowerCase();
            const email = row.querySelector('td:nth-child(3)').textContent.toLowerCase();
            const matches = name.includes(searchTerm) || id.includes(searchTerm) || email.includes(searchTerm);
            row.style.display = matches ? '' : 'none';
        });
    });

    // 8. EXPORT FUNCTIONALITY
    exportStudentsBtn.addEventListener('click', function() {
        // Get all visible students
        const visibleStudents = [];
        document.querySelectorAll('#studentsTable tbody tr:not([style*="display: none"])').forEach(row => {
            if (!row.classList.contains('loading-row') && !row.classList.contains('no-students')) {
                visibleStudents.push({
                    id: row.cells[0].textContent,
                    name: row.cells[1].textContent,
                    email: row.cells[2].textContent
                });
            }
        });

        if (visibleStudents.length === 0) {
            Swal.fire('No Students', 'There are no students to export', 'info');
            return;
        }

        // Convert to CSV
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Student ID,Name,Email\n"; // Header row
        
        visibleStudents.forEach(student => {
            csvContent += `${student.id},"${student.name}",${student.email}\n`;
        });

        // Download CSV
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `students_${classKey}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    // 9. MODAL CLOSE HANDLERS
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', function() {
            this.closest('.modal').style.display = 'none';
        });
    });

    // 10. INITIAL LOAD
    loadClassAndStudents();

    // Close modal when clicking outside
    window.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });
});