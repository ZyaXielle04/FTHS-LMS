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
    
    // 2. DOM ELEMENTS
    const classesList = document.getElementById('classesList');
    const classSearch = document.getElementById('classSearch');
    const classFilter = document.getElementById('classFilter');
    const teacherNameElement = document.getElementById('teacherName');

    // 3. REAL-TIME LISTENERS
    let listeners = [];

    function setupRealTimeListeners() {
        // Clear any existing listeners
        removeAllListeners();

        // Teacher name listener
        const teacherNameListener = db.ref(`teachers/${teacherId}/name`).on('value', (snapshot) => {
            teacherNameElement.textContent = snapshot.val() || 'Teacher';
        });
        listeners.push(teacherNameListener);

        // Sections listener
        const sectionsListener = db.ref('sections').on('value', () => {
            syncClassesNode().then(() => loadTeacherClasses());
        });
        listeners.push(sectionsListener);

        // Subjects listener
        const subjectsListener = db.ref('subjects').on('value', () => {
            syncClassesNode().then(() => loadTeacherClasses());
        });
        listeners.push(subjectsListener);

        // Curriculums listener
        const curriculumsListener = db.ref('curriculums').on('value', () => {
            syncClassesNode().then(() => loadTeacherClasses());
        });
        listeners.push(curriculumsListener);

        // Classes listener (for status changes)
        const classesListener = db.ref('classes').on('value', () => {
            loadTeacherClasses();
        });
        listeners.push(classesListener);
    }

    function removeAllListeners() {
        listeners.forEach(ref => db.ref().off('value', ref));
        listeners = [];
    }

    // 4. CLASS NODE MANAGEMENT SYSTEM
    async function syncClassesNode() {
        console.groupCollapsed("🔄 Syncing /classes node");
        try {
            // Get all necessary data
            const [sectionsSnap, subjectsSnap, curriculumsSnap, existingClassesSnap] = await Promise.all([
                db.ref('sections').once('value'),
                db.ref('subjects').once('value'),
                db.ref('curriculums').once('value'),
                db.ref('classes').once('value')
            ]);

            const sections = sectionsSnap.val() || {};
            const subjects = subjectsSnap.val() || {};
            const curriculums = curriculumsSnap.val() || {};
            const existingClasses = existingClassesSnap.val() || {};
            const classUpdates = {};
            let newEntries = 0;
            let updatedEntries = 0;

            // Process each section
            for (const [sectionId, section] of Object.entries(sections)) {
                if (!section.curriculum || !curriculums[section.curriculum]) continue;
                
                const curriculum = curriculums[section.curriculum];
                const curriculumSubjects = curriculum.subjects || {};

                // Get students for this section
                const studentsSnap = await db.ref(`sections/${sectionId}/students`).once('value');
                const students = studentsSnap.val() || {};

                // Process each subject in curriculum
                for (const [key, subjectId] of Object.entries(curriculumSubjects)) {
                    if (!subjects[subjectId]) continue;

                    const compositeKey = `${sectionId}_${subjectId}`;
                    const existingClass = existingClasses[compositeKey];
                    
                    // Set up real-time listener for student count changes
                    const studentsRef = db.ref(`sections/${sectionId}/students`);
                    studentsRef.on('value', async (snap) => {
                        const currentStudents = snap.val() || {};
                        const count = Object.keys(currentStudents).length;
                        
                        // Get current class data
                        const classRef = db.ref(`classes/${compositeKey}`);
                        const classSnap = await classRef.once('value');
                        const classData = classSnap.val() || {};
                        
                        // Prepare updates
                        const updates = {
                            [`classes/${compositeKey}/studentCount`]: count,
                            [`classes/${compositeKey}/lastUpdated`]: Date.now()
                        };
                        
                        // Update students data carefully without overwriting attendance
                        const existingStudents = classData.students || {};
                        const updatedStudents = {...existingStudents};
                        
                        // Remove students that no longer exist
                        Object.keys(existingStudents).forEach(studentId => {
                            if (!currentStudents[studentId]) {
                                delete updatedStudents[studentId];
                            }
                        });
                        
                        // Add/update students that exist now
                        Object.entries(currentStudents).forEach(([studentId, studentData]) => {
                            if (!updatedStudents[studentId] || 
                                updatedStudents[studentId].name !== studentData.name ||
                                updatedStudents[studentId].lrn !== studentData.lrn) {
                                updatedStudents[studentId] = {
                                    ...(updatedStudents[studentId] || {}),
                                    name: studentData.name,
                                    lrn: studentData.lrn,
                                    id: studentId
                                };
                            }
                        });
                        
                        // Only update if students actually changed
                        if (JSON.stringify(updatedStudents) !== JSON.stringify(existingStudents)) {
                            updates[`classes/${compositeKey}/students`] = updatedStudents;
                        }
                        
                        await db.ref().update(updates);
                    });
                    listeners.push(studentsRef);

                    // Check if we need to update this class
                    const currentTeacher = subjects[subjectId].subjectTeacher;

                    const needsUpdate = !existingClass || 
                                    existingClass.status !== (section.status || 'active') ||
                                    existingClass.studentCount !== Object.keys(students).length ||
                                    existingClass.teacher !== currentTeacher;

                    if (needsUpdate) {
                        // Use path-based updates instead of replacing entire object
                        classUpdates[`classes/${compositeKey}/sectionId`] = sectionId;
                        classUpdates[`classes/${compositeKey}/subjectId`] = subjectId;
                        classUpdates[`classes/${compositeKey}/gradeLevel`] = section.gradeLevel;
                        classUpdates[`classes/${compositeKey}/strand`] = section.strand;
                        classUpdates[`classes/${compositeKey}/sectionNumber`] = section.sectionNumber;
                        classUpdates[`classes/${compositeKey}/status`] = section.status || 'active';
                        classUpdates[`classes/${compositeKey}/subjectName`] = subjects[subjectId].subjectName;
                        classUpdates[`classes/${compositeKey}/teacher`] = currentTeacher;
                        classUpdates[`classes/${compositeKey}/studentCount`] = Object.keys(students).length;
                        
                        // Initialize archived flag if it doesn't exist
                        if (!existingClass || existingClass.archived === undefined) {
                            classUpdates[`classes/${compositeKey}/archived`] = false;
                        }
                        
                        // Only update students if they don't exist or are completely different
                        if (!existingClass || JSON.stringify(existingClass.students) !== JSON.stringify(students)) {
                            classUpdates[`classes/${compositeKey}/students`] = students;
                        }
                        
                        classUpdates[`classes/${compositeKey}/lastUpdated`] = Date.now();
                        
                        existingClass ? updatedEntries++ : newEntries++;
                    } else if (!existingClass.students) {
                        // If class exists but doesn't have students data
                        classUpdates[`classes/${compositeKey}/students`] = students;
                        updatedEntries++;
                    }
                }
            }

            // Apply updates if needed
            if (Object.keys(classUpdates).length > 0) {
                console.log(`📝 Applying updates: ${newEntries} new, ${updatedEntries} updated`);
                await db.ref().update(classUpdates);
            } else {
                console.log("✅ Classes are up-to-date");
            }

            return true;
        } catch (error) {
            console.error("💥 Sync failed:", error);
            return false;
        } finally {
            console.groupEnd();
        }
    }

    // 5. LOAD TEACHER CLASSES WITH REAL-TIME UPDATES
    async function loadTeacherClasses() {
        console.log("👨‍🏫 Loading classes for teacher:", teacherId);
        classesList.innerHTML = '<div class="class-loading"><i class="fas fa-spinner fa-spin"></i> Loading classes...</div>';
        
        try {
            // Set up real-time query for teacher's classes
            const classesQuery = db.ref('classes').orderByChild('teacher').equalTo(teacherId);
            
            // Initial load
            const initialSnap = await classesQuery.once('value');
            const teacherClasses = [];
            initialSnap.forEach(snapshot => {
                teacherClasses.push(snapshot.val());
            });
            displayClasses(teacherClasses);

            // Real-time updates listener
            classesQuery.on('value', (snapshot) => {
                const updatedClasses = [];
                snapshot.forEach(classSnap => {
                    updatedClasses.push(classSnap.val());
                });
                displayClasses(updatedClasses);
            });
            
        } catch (error) {
            console.error("Failed to load classes:", error);
            classesList.innerHTML = '<div class="error-loading">Error loading classes. Please try again.</div>';
        }
    }

    // 6. DISPLAY CLASSES IN CARDS (UPDATED WITH ROOM NUMBER)
    function displayClasses(classes) {
        if (classes.length === 0) {
            classesList.innerHTML = '<div class="no-classes">No classes assigned yet.</div>';
            return;
        }

        classesList.innerHTML = '';
        classes.forEach(cls => {
            const className = `Grade ${cls.gradeLevel} ${cls.strand} - ${cls.sectionNumber}`;
            const isArchived = cls.archived === true;
            const classKey = `${cls.sectionId}_${cls.subjectId}`;
            
            // Format the schedule information
            let scheduleHTML = '<div class="no-schedule">Not scheduled</div>';
            if (cls.schedule) {
                const days = Array.isArray(cls.schedule.days) ? cls.schedule.days : [cls.schedule.days];
                const hasValidTimes = cls.schedule.start_time && cls.schedule.end_time;
                
                scheduleHTML = `
                    <div class="class-schedule">
                        <div class="schedule-days">
                            <i class="fas fa-calendar-day"></i>
                            ${days.join(', ')}
                        </div>
                        ${hasValidTimes ? `
                        <div class="schedule-time">
                            <i class="fas fa-clock"></i>
                            ${cls.schedule.start_time} - ${cls.schedule.end_time}
                        </div>
                        ` : ''}
                    </div>
                `;
            }

            // Add room number display if available
            const roomNumberHTML = cls.roomNumber 
                ? `<p><i class="fas fa-door-open"></i> <strong>Room:</strong> ${cls.roomNumber}</p>`
                : '';

            const card = document.createElement('div');
            card.className = `class-card ${isArchived ? 'archived' : ''}`;
            card.dataset.status = cls.status.toLowerCase();
            card.dataset.archived = isArchived;
            card.innerHTML = `
                <div class="class-header">
                    <h3>${className}</h3>
                    <div>
                        <span class="class-status ${cls.status.toLowerCase()}">${cls.status}</span>
                        ${isArchived ? '<span class="archived-badge">Archived</span>' : ''}
                    </div>
                </div>
                <div class="class-details">
                    <p><i class="fas fa-book"></i> <strong>Subject:</strong> ${cls.subjectName}</p>
                    ${roomNumberHTML}
                    <p><i class="fas fa-user-graduate"></i> <strong>Students:</strong> ${cls.studentCount}</p>
                    <div class="schedule-container">
                        ${scheduleHTML}
                    </div>
                </div>
                <div class="class-actions">
                    <button class="action-btn view-students" data-section="${cls.sectionId}" data-subject="${cls.subjectId}">
                        <i class="fas fa-users"></i> Students
                    </button>
                    <button class="action-btn view-attendance" data-section="${cls.sectionId}" data-subject="${cls.subjectId}">
                        <i class="fas fa-clipboard-check"></i> Attendance
                    </button>
                    <button class="action-btn view-gradebook" data-section="${cls.sectionId}" data-subject="${cls.subjectId}">
                        <i class="fas fa-graduation-cap"></i> Gradebook
                    </button>
                    <button class="action-btn manage-resources" data-section="${cls.sectionId}" data-subject="${cls.subjectId}">
                        <i class="fas fa-book-open"></i> Resources
                    </button>
                    <button class="action-btn manage-assignments" data-section="${cls.sectionId}" data-subject="${cls.subjectId}">
                        <i class="fas fa-tasks"></i> Assignments
                    </button>
                    ${isArchived ? 
                        `<button class="action-btn unarchive-btn" data-class="${classKey}">
                            <i class="fas fa-trash-restore"></i> Unarchive
                        </button>` :
                        `<button class="action-btn archive-btn" data-class="${classKey}">
                            <i class="fas fa-archive"></i> Archive
                        </button>`}
                </div>
            `;
            classesList.appendChild(card);
        });
    }

    // 7. EVENT HANDLERS
    function setupEventListeners() {
        // Filter/Search
        classSearch.addEventListener('input', filterClasses);
        classFilter.addEventListener('change', filterClasses);

        // Class Actions
        classesList.addEventListener('click', async (e) => {
            const btn = e.target.closest('.action-btn');
            if (!btn) return;

            const sectionId = btn.dataset.section;
            const subjectId = btn.dataset.subject;
            const classKey = btn.dataset.class || `${sectionId}_${subjectId}`;

            if (btn.classList.contains('view-students')) {
                // Check if students data exists in the class node
                const classSnap = await db.ref(`classes/${classKey}`).once('value');
                const classData = classSnap.val();
                
                if (classData && classData.students) {
                    // Students data is already in the class node
                    window.location.href = `students.html?class=${classKey}`;
                } else {
                    // Fallback to sections data (for backward compatibility)
                    window.location.href = `students.html?section=${sectionId}&subject=${subjectId}`;
                }
            }
            else if (btn.classList.contains('view-attendance')) {
                window.location.href = `attendance.html?class=${classKey}`;
            }
            else if (btn.classList.contains('view-gradebook')) {
                window.location.href = `grades.html?class=${classKey}`;
            }
            else if (btn.classList.contains('manage-resources')) {
                window.location.href = `resources.html?class=${classKey}&action=manage`;
            }
            else if (btn.classList.contains('manage-assignments')) {
                window.location.href = `assignments.html?class=${classKey}`;
            }
            else if (btn.classList.contains('archive-btn')) {
                await toggleArchiveStatus(classKey, true);
            }
            else if (btn.classList.contains('unarchive-btn')) {
                await toggleArchiveStatus(classKey, false);
            }
        });
    }

    // 8. HELPER FUNCTIONS
    async function toggleArchiveStatus(classKey, archive) {
        try {
            await db.ref(`classes/${classKey}/archived`).set(archive);
            Swal.fire(
                archive ? 'Archived!' : 'Unarchived!', 
                `Class has been ${archive ? 'archived' : 'unarchived'}.`, 
                'success'
            );
        } catch (error) {
            Swal.fire('Error', `Failed to update archive status: ${error.message}`, 'error');
        }
    }

    function filterClasses() {
        const searchTerm = classSearch.value.toLowerCase();
        const filterValue = classFilter.value;
        
        document.querySelectorAll('.class-card').forEach(card => {
            const matchesSearch = card.querySelector('h3').textContent.toLowerCase().includes(searchTerm);
            let matchesFilter = true;
            
            if (filterValue === 'active') {
                matchesFilter = card.dataset.status === 'active' && card.dataset.archived === 'false';
            } 
            else if (filterValue === 'inactive') {
                matchesFilter = card.dataset.status === 'inactive' && card.dataset.archived === 'false';
            } 
            else if (filterValue === 'graduated') {
                matchesFilter = card.dataset.status === 'graduated' && card.dataset.archived === 'false';
            } 
            else if (filterValue === 'archived') {
                matchesFilter = card.dataset.archived === 'true';
            } 
            else if (filterValue === 'unarchived') {
                matchesFilter = card.dataset.archived === 'false';
            }
            
            card.style.display = (matchesSearch && matchesFilter) ? 'block' : 'none';
        });
    }

    // 9. INITIALIZATION
    async function initApp() {
        // Load teacher name
        try {
            const nameSnap = await db.ref(`teachers/${teacherId}/name`).once('value');
            teacherNameElement.textContent = nameSnap.val() || 'Teacher';
        } catch {
            teacherNameElement.textContent = 'Teacher';
        }

        // Setup real-time listeners
        setupRealTimeListeners();

        // Initial load
        await syncClassesNode();
        await loadTeacherClasses();
        setupEventListeners();
    }

    // START THE APP
    initApp();

    // Clean up listeners when leaving the page
    window.addEventListener('beforeunload', () => {
        removeAllListeners();
    });
});