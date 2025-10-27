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
    const currentDate = document.getElementById('currentDate');
    const presentCount = document.getElementById('presentCount');
    const absentCount = document.getElementById('absentCount');
    const lateCount = document.getElementById('lateCount');
    const excusedCount = document.getElementById('excusedCount');
    const attendanceTable = document.getElementById('attendanceTable');
    const takeAttendanceBtn = document.getElementById('takeAttendanceBtn');
    const exportAttendanceBtn = document.getElementById('exportAttendanceBtn');
    const prevDateBtn = document.getElementById('prevDateBtn');
    const nextDateBtn = document.getElementById('nextDateBtn');
    const attendanceDate = document.getElementById('attendanceDate');
    const studentAttendanceList = document.getElementById('studentAttendanceList');
    const submitAttendanceBtn = document.getElementById('submitAttendanceBtn');

    // 4. GLOBAL VARIABLES
    let currentViewDate = new Date();
    let selectedStatuses = {};
    let studentsRef; // Reference for students listener
    let currentStudents = {}; // Cache of current students
    let isModalOpen = false;

    // 5. DATE HANDLING (unchanged)
    function formatDate(date) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    }
    
    function formatFirebaseDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function updateDateDisplay() {
        currentDate.textContent = formatDate(currentViewDate);
        if (attendanceDate) {
            attendanceDate.textContent = `For ${formatDate(currentViewDate)}`;
        }
    }

    // 6. SET UP REAL-TIME LISTENERS
    function setupRealtimeListeners() {
        // Set up listener for students in this class
        studentsRef = db.ref(`classes/${classKey}/students`);
        
        studentsRef.on('value', (snapshot) => {
            currentStudents = snapshot.val() || {};
            
            // Update the attendance table if it's visible
            if (!isModalOpen) {
                loadAttendanceForDate();
            }
            
            // If modal is open, update it as well
            if (isModalOpen) {
                updateAttendanceModal();
            }
        });
    }

    // 7. LOAD CLASS AND ATTENDANCE DATA (modified)
    function loadClassAndAttendance() {
        // Show loading state
        attendanceTable.querySelector('tbody').innerHTML = `
            <tr class="loading-row">
                <td colspan="5">
                    <i class="fas fa-spinner fa-spin"></i> Loading attendance data...
                </td>
            </tr>
        `;

        // Get class details once
        db.ref(`classes/${classKey}`).once('value').then(classSnap => {
            const classData = classSnap.val();
            if (!classData) {
                window.location.href = 'classes.html';
                return;
            }

            // Update class info in header
            const classDisplayName = `Grade ${classData.gradeLevel} ${classData.strand} - ${classData.sectionNumber}`;
            classTitle.textContent = `${classData.subjectName} Attendance`;
            className.textContent = classDisplayName;

            // Set up real-time listeners
            setupRealtimeListeners();
            
            // Load initial attendance data
            loadAttendanceForDate();
        });
    }

    // 8. LOAD ATTENDANCE FOR SPECIFIC DATE (modified to use currentStudents)
    function loadAttendanceForDate() {
        const dateKey = formatFirebaseDate(currentViewDate);
        const studentIds = Object.keys(currentStudents);
        
        if (studentIds.length === 0) {
            // No students in this class
            const tbody = attendanceTable.querySelector('tbody');
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="no-students">No students in this class</td>
                </tr>
            `;
            return;
        }

        // Get attendance for this date
        db.ref(`classes/${classKey}/attendance/${dateKey}`).once('value').then(attendanceSnap => {
            const attendanceData = attendanceSnap.val() || {};
            
            // Populate table
            const tbody = attendanceTable.querySelector('tbody');
            tbody.innerHTML = '';
            
            let present = 0, absent = 0, late = 0, excused = 0;
            
            studentIds.forEach(studentId => {
                const student = currentStudents[studentId];
                const studentAttendance = attendanceData[studentId] || {
                    status: '',
                    notes: '',
                    timestamp: null
                };
                
                // Count statuses
                switch(studentAttendance.status) {
                    case 'present': present++; break;
                    case 'absent': absent++; break;
                    case 'late': late++; break;
                    case 'excused': excused++; break;
                }
                
                // Create table row
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${studentId}</td>
                    <td>${student.name}</td>
                    <td class="status-cell ${studentAttendance.status}">
                        ${studentAttendance.status || 'Not recorded'}
                    </td>
                    <td>${studentAttendance.notes || ''}</td>
                    <td class="actions">
                        <button class="btn-icon edit-attendance" 
                                data-student="${studentId}" 
                                data-date="${dateKey}">
                            <i class="fas fa-edit"></i>
                        </button>
                    </td>
                `;
                tbody.appendChild(row);
            });
            
            // Update stats
            presentCount.textContent = present;
            absentCount.textContent = absent;
            lateCount.textContent = late;
            excusedCount.textContent = excused;
            
            // Add event listeners to edit buttons
            document.querySelectorAll('.edit-attendance').forEach(btn => {
                btn.addEventListener('click', () => {
                    openTakeAttendanceModal();
                });
            });
        });
    }

    // 9. NEW FUNCTION: UPDATE ATTENDANCE MODAL (when student list changes)
    function updateAttendanceModal() {
        if (!isModalOpen) return;
        
        const dateKey = formatFirebaseDate(currentViewDate);
        
        // Clear previous list
        studentAttendanceList.innerHTML = '';
        
        // Get existing attendance for this date
        db.ref(`classes/${classKey}/attendance/${dateKey}`).once('value').then(attendanceSnap => {
            const attendanceData = attendanceSnap.val() || {};
            
            // Create attendance card for each student
            Object.entries(currentStudents).forEach(([studentId, student]) => {
                const studentAttendance = attendanceData[studentId] || {
                    status: '',
                    notes: ''
                };
                
                // Store initial status (or keep existing if already set)
                if (!selectedStatuses[studentId]) {
                    selectedStatuses[studentId] = {
                        status: studentAttendance.status,
                        notes: studentAttendance.notes || ''
                    };
                }
                
                const attendanceCard = document.createElement('div');
                attendanceCard.className = 'student-attendance-card';
                attendanceCard.innerHTML = `
                    <div class="student-info-header">
                        <div class="student-name-id">
                            <div class="student-name">${student.name}</div>
                            <div class="student-id">${studentId}</div>
                        </div>
                        <div class="current-status ${selectedStatuses[studentId].status}">
                            ${selectedStatuses[studentId].status || 'Not marked'}
                        </div>
                    </div>
                    <div class="status-buttons-container">
                        <div class="status-buttons">
                            <button class="status-btn present ${selectedStatuses[studentId].status === 'present' ? 'active' : ''}" 
                                    data-student="${studentId}" 
                                    data-status="present">
                                <i class="fas fa-check-circle"></i> Present
                            </button>
                            <button class="status-btn absent ${selectedStatuses[studentId].status === 'absent' ? 'active' : ''}" 
                                    data-student="${studentId}" 
                                    data-status="absent">
                                <i class="fas fa-times-circle"></i> Absent
                            </button>
                            <button class="status-btn late ${selectedStatuses[studentId].status === 'late' ? 'active' : ''}" 
                                    data-student="${studentId}" 
                                    data-status="late">
                                <i class="fas fa-clock"></i> Late
                            </button>
                            <button class="status-btn excused ${selectedStatuses[studentId].status === 'excused' ? 'active' : ''}" 
                                    data-student="${studentId}" 
                                    data-status="excused">
                                <i class="fas fa-envelope"></i> Excused
                            </button>
                        </div>
                        <input type="text" class="notes-input" data-student="${studentId}" 
                            placeholder="Add notes (optional)" value="${selectedStatuses[studentId].notes || ''}">
                    </div>
                `;
                studentAttendanceList.appendChild(attendanceCard);
            });
            
            // Add event listeners to status buttons
            document.querySelectorAll('.status-btn').forEach(btn => {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    const studentId = this.dataset.student;
                    const status = this.dataset.status;
                    const card = this.closest('.student-attendance-card');
                    
                    // Update selected status
                    selectedStatuses[studentId].status = status;
                    
                    // Update UI
                    // Remove active class from all buttons in this card
                    card.querySelectorAll('.status-btn').forEach(btn => {
                        btn.classList.remove('active');
                    });
                    // Add active class to clicked button
                    this.classList.add('active');
                    
                    // Update current status display
                    const statusDisplay = card.querySelector('.current-status');
                    statusDisplay.textContent = status;
                    statusDisplay.className = 'current-status ' + status;
                });
            });
            
            // Update notes in selectedStatuses when they change
            document.querySelectorAll('.notes-input').forEach(input => {
                input.addEventListener('input', function() {
                    const studentId = this.dataset.student;
                    selectedStatuses[studentId].notes = this.value;
                });
            });
        });
    }

    // 10. TAKE ATTENDANCE MODAL FUNCTIONS (modified)
    function openTakeAttendanceModal() {
        isModalOpen = true;
        const dateKey = formatFirebaseDate(currentViewDate);
        selectedStatuses = {}; // Reset selected statuses
        
        // Clear previous list
        studentAttendanceList.innerHTML = '';
        
        // Get existing attendance for this date
        db.ref(`classes/${classKey}/attendance/${dateKey}`).once('value').then(attendanceSnap => {
            const attendanceData = attendanceSnap.val() || {};
            
            // Create attendance card for each student
            Object.entries(currentStudents).forEach(([studentId, student]) => {
                const studentAttendance = attendanceData[studentId] || {
                    status: '',
                    notes: ''
                };
                
                // Store initial status
                selectedStatuses[studentId] = {
                    status: studentAttendance.status,
                    notes: studentAttendance.notes || ''
                };
                
                const attendanceCard = document.createElement('div');
                attendanceCard.className = 'student-attendance-card';
                attendanceCard.innerHTML = `
                    <div class="student-info-header">
                        <div class="student-name-id">
                            <div class="student-name">${student.name}</div>
                            <div class="student-id">${studentId}</div>
                        </div>
                        <div class="current-status ${studentAttendance.status}">
                            ${studentAttendance.status || 'Not marked'}
                        </div>
                    </div>
                    <div class="status-buttons-container">
                        <div class="status-buttons">
                            <button class="status-btn present ${studentAttendance.status === 'present' ? 'active' : ''}" 
                                    data-student="${studentId}" 
                                    data-status="present">
                                <i class="fas fa-check-circle"></i> Present
                            </button>
                            <button class="status-btn absent ${studentAttendance.status === 'absent' ? 'active' : ''}" 
                                    data-student="${studentId}" 
                                    data-status="absent">
                                <i class="fas fa-times-circle"></i> Absent
                            </button>
                            <button class="status-btn late ${studentAttendance.status === 'late' ? 'active' : ''}" 
                                    data-student="${studentId}" 
                                    data-status="late">
                                <i class="fas fa-clock"></i> Late
                            </button>
                            <button class="status-btn excused ${studentAttendance.status === 'excused' ? 'active' : ''}" 
                                    data-student="${studentId}" 
                                    data-status="excused">
                                <i class="fas fa-envelope"></i> Excused
                            </button>
                        </div>
                        <input type="text" class="notes-input" data-student="${studentId}" 
                            placeholder="Add notes (optional)" value="${studentAttendance.notes || ''}">
                    </div>
                `;
                studentAttendanceList.appendChild(attendanceCard);
            });
            
            // Add event listeners to status buttons
            document.querySelectorAll('.status-btn').forEach(btn => {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    const studentId = this.dataset.student;
                    const status = this.dataset.status;
                    const card = this.closest('.student-attendance-card');
                    
                    // Update selected status
                    selectedStatuses[studentId].status = status;
                    
                    // Update UI
                    // Remove active class from all buttons in this card
                    card.querySelectorAll('.status-btn').forEach(btn => {
                        btn.classList.remove('active');
                    });
                    // Add active class to clicked button
                    this.classList.add('active');
                    
                    // Update current status display
                    const statusDisplay = card.querySelector('.current-status');
                    statusDisplay.textContent = status;
                    statusDisplay.className = 'current-status ' + status;
                });
            });
            
            // Update notes in selectedStatuses when they change
            document.querySelectorAll('.notes-input').forEach(input => {
                input.addEventListener('input', function() {
                    const studentId = this.dataset.student;
                    selectedStatuses[studentId].notes = this.value;
                });
            });
            
            // Show modal
            document.getElementById('takeAttendanceModal').style.display = 'block';
            document.body.classList.add('modal-open');
        });
    }

    // 11. SAVE ATTENDANCE (unchanged)
    function saveAttendance() {
        const dateKey = formatFirebaseDate(currentViewDate);
        const updates = {};
        const timestamp = firebase.database.ServerValue.TIMESTAMP;
        
        // Get all student attendance data from the modal
        const notesInputs = studentAttendanceList.querySelectorAll('.notes-input');
        
        // Prepare updates based on selectedStatuses
        Object.keys(selectedStatuses).forEach(studentId => {
            const statusData = selectedStatuses[studentId];
            const notes = Array.from(notesInputs).find(input => input.dataset.student === studentId)?.value || '';
            
            if (statusData.status) {
                // Structure the update according to your requirements
                updates[`classes/${classKey}/attendance/${dateKey}/${studentId}/status`] = statusData.status;
                updates[`classes/${classKey}/attendance/${dateKey}/${studentId}/notes`] = notes;
                updates[`classes/${classKey}/attendance/${dateKey}/${studentId}/timestamp`] = timestamp;
            }
        });
        
        // Update database
        db.ref().update(updates)
            .then(() => {
                Swal.fire('Success', 'Attendance saved successfully', 'success');
                closeModal();
                loadAttendanceForDate();
            })
            .catch(error => {
                console.error("Error saving attendance:", error);
                Swal.fire('Error', 'Failed to save attendance', 'error');
            });
    }

    // 12. CLOSE MODAL (modified)
    function closeModal() {
        isModalOpen = false;
        document.getElementById('takeAttendanceModal').style.display = 'none';
        document.body.classList.remove('modal-open');
    }

    // 13. CLEAN UP LISTENERS (new function)
    function cleanupListeners() {
        if (studentsRef) {
            studentsRef.off('value');
        }
    }

    // 14. EVENT LISTENERS (unchanged)
    if (takeAttendanceBtn) {
        takeAttendanceBtn.addEventListener('click', openTakeAttendanceModal);
    }

    if (submitAttendanceBtn) {
        submitAttendanceBtn.addEventListener('click', saveAttendance);
    }

    if (prevDateBtn) {
        prevDateBtn.addEventListener('click', function() {
            currentViewDate.setDate(currentViewDate.getDate() - 1);
            updateDateDisplay();
            loadAttendanceForDate();
        });
    }

    if (nextDateBtn) {
        nextDateBtn.addEventListener('click', function() {
            currentViewDate.setDate(currentViewDate.getDate() + 1);
            updateDateDisplay();
            loadAttendanceForDate();
        });
    }

    if (exportAttendanceBtn) {
        exportAttendanceBtn.addEventListener('click', function() {
            Swal.fire('Info', 'Export functionality will be implemented here', 'info');
        });
    }

    // 15. MODAL CLOSE HANDLERS (unchanged)
    const closeModalButtons = document.querySelectorAll('.close-modal');
    if (closeModalButtons.length > 0) {
        closeModalButtons.forEach(btn => {
            btn.addEventListener('click', function() {
                closeModal();
            });
        });
    }

    // 16. WINDOW UNLOAD HANDLER (new)
    window.addEventListener('beforeunload', cleanupListeners);

    // 17. INITIAL LOAD
    updateDateDisplay();
    loadClassAndAttendance();
});