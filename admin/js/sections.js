document.addEventListener('DOMContentLoaded', function() {
    // Initialize Firebase
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    
    const db = firebase.database();
    const sectionsRef = db.ref('sections');
    const teachersRef = db.ref('teachers');
    const curriculumsRef = db.ref('curriculums');
    const subjectsRef = db.ref('subjects');
    const classesRef = db.ref('classes');
    
    // DOM Elements
    const sectionsTableBody = document.getElementById('sectionsTableBody');
    const addNewSectionBtn = document.getElementById('addNewSectionBtn');
    const sectionModal = document.getElementById('sectionModal');
    const cancelSectionBtn = document.getElementById('cancelSectionBtn');
    const sectionForm = document.getElementById('sectionForm');
    const gradeLevelFilter = document.getElementById('gradeLevelFilter');
    const strandFilter = document.getElementById('strandFilter');
    const sectionSearch = document.getElementById('sectionSearch');
    const searchBtn = document.getElementById('searchBtn');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const pageInfo = document.getElementById('pageInfo');
    const timetableModal = document.getElementById('timetableModal');
    const closeTimetableBtn = document.getElementById('closeTimetableBtn');
    
    // Modal form elements
    const gradeLevelInput = document.getElementById('gradeLevel');
    const strandInput = document.getElementById('strand');
    const sectionNumberInput = document.getElementById('sectionNumber');
    const homeroomAdviserInput = document.getElementById('homeroomAdviser');
    const batchYearInput = document.getElementById('batchYear');
    const statusInput = document.getElementById('status');
    
    // Current editing section ID
    let currentEditingSectionId = null;
    let allSections = [];
    let filteredSections = [];
    let currentPage = 1;
    const itemsPerPage = 10;
    
    // Initialize the page
    initPage();
    
    function initPage() {
        // Load sections
        loadSections();
        
        // Load teachers for homeroom adviser dropdown
        loadTeachers();
        
        // Setup batch year dropdown
        setupBatchYearDropdown();
        
        // Setup real-time listeners
        setupCurriculumChangeListener();
        setupSectionChangeListener();
        
        // Event listeners
        addNewSectionBtn.addEventListener('click', showAddSectionModal);
        cancelSectionBtn.addEventListener('click', hideSectionModal);
        sectionForm.addEventListener('submit', handleSectionSubmit);
        gradeLevelFilter.addEventListener('change', filterSections);
        strandFilter.addEventListener('change', filterSections);
        searchBtn.addEventListener('click', searchSections);
        sectionSearch.addEventListener('keyup', function(e) {
            if (e.key === 'Enter') searchSections();
        });
        prevPageBtn.addEventListener('click', goToPreviousPage);
        nextPageBtn.addEventListener('click', goToNextPage);
        closeTimetableBtn.addEventListener('click', () => timetableModal.style.display = 'none');
        
        // Close modals when clicking outside
        sectionModal.addEventListener('click', function(e) {
            if (e.target === sectionModal) hideSectionModal();
        });
        
        timetableModal.addEventListener('click', function(e) {
            if (e.target === timetableModal) timetableModal.style.display = 'none';
        });
    }
    
    function loadSections() {
        showLoading();
        sectionsRef.on('value', snapshot => {
            const sections = snapshot.val() || {};
            
            const sectionPromises = Object.entries(sections).map(async ([id, section]) => {
                // Get student count
                const studentsSnapshot = await sectionsRef.child(`${id}/students`).once('value');
                const students = studentsSnapshot.val() || {};
                const studentCount = Object.keys(students).length;
                
                // Get curriculum name if exists
                let curriculumName = '';
                if (section.curriculum) {
                    const curriculumSnapshot = await curriculumsRef.child(section.curriculum).once('value');
                    if (curriculumSnapshot.exists()) {
                        const curriculum = curriculumSnapshot.val();
                        curriculumName = curriculum.strand || '';
                    }
                }
                
                return {
                    id,
                    ...section,
                    studentCount,
                    curriculumName
                };
            });
            
            Promise.all(sectionPromises)
                .then(sectionsWithData => {
                    allSections = sectionsWithData;
                    filteredSections = [...allSections];
                    currentPage = 1;
                    renderSections();
                    updatePagination();
                    hideLoading();
                })
                .catch(error => {
                    showError('Failed to load section data: ' + error.message);
                });
        }, error => {
            showError('Failed to load sections: ' + error.message);
        });
    }
    
    function renderSections() {
        sectionsTableBody.innerHTML = '';
        
        if (filteredSections.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="6" class="text-center py-4">No sections found</td>`;
            sectionsTableBody.appendChild(row);
            return;
        }
        
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, filteredSections.length);
        const paginatedSections = filteredSections.slice(startIndex, endIndex);
        
        paginatedSections.forEach(section => {
            renderSectionRow(section);
        });
    }
    
    function renderSectionRow(section) {
        const row = document.createElement('tr');
        
        let statusClass = '';
        if (section.status === 'active') statusClass = 'status-active';
        else if (section.status === 'inactive') statusClass = 'status-inactive';
        else if (section.status === 'graduated') statusClass = 'status-graduated';
        
        const sectionName = section.sectionName || 
                          `Grade ${section.gradeLevel} ${section.strand} - ${section.sectionNumber}`;
        
        row.innerHTML = `
            <td>${sectionName}</td>
            <td>${section.studentCount || 0}</td>
            <td>${section.homeroomAdviserName || 'Not assigned'}</td>
            <td>${section.batchYear}</td>
            <td><span class="status-badge ${statusClass}">${section.status}</span></td>
            <td>
                <button class="btn-action btn-timetable" data-id="${section.id}">
                    <i class="fas fa-calendar-alt"></i> Timetable
                </button>
                <button class="btn-action btn-edit" data-id="${section.id}">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-action btn-delete" data-id="${section.id}">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        
        sectionsTableBody.appendChild(row);
        
        row.querySelector('.btn-edit').addEventListener('click', () => editSection(section));
        row.querySelector('.btn-delete').addEventListener('click', () => deleteSection(section.id, sectionName));
        row.querySelector('.btn-timetable').addEventListener('click', () => showTimetableModal(section));
    }
    
    function showTimetableModal(section) {
        document.getElementById('timetableModalTitle').textContent = `Timetable for ${section.sectionName}`;
        document.getElementById('timetableTableBody').innerHTML = '';
        
        showLoading();
        
        if (!section.curriculum) {
            hideLoading();
            showInfo('This section has no curriculum assigned');
            return;
        }
        
        // Get curriculum subjects
        curriculumsRef.child(`${section.curriculum}/subjects`).once('value')
            .then(snapshot => {
                const subjectIds = snapshot.val() || [];
                
                if (subjectIds.length === 0) {
                    hideLoading();
                    showInfo('No subjects found in this curriculum');
                    return;
                }
                
                // Get all subjects data with teacher names
                const subjectsPromises = subjectIds.map(subjectId => {
                    return subjectsRef.child(subjectId).once('value')
                        .then(subjectSnapshot => {
                            const subject = subjectSnapshot.val();
                            if (!subject) return null;
                            
                            subject.id = subjectId;
                            
                            if (subject.subjectTeacher) {
                                return teachersRef.child(subject.subjectTeacher).once('value')
                                    .then(teacherSnapshot => {
                                        const teacher = teacherSnapshot.val();
                                        subject.teacherName = teacher ? teacher.name : 'Not assigned';
                                        return subject;
                                    });
                            } else {
                                subject.teacherName = 'Not assigned';
                                return subject;
                            }
                        });
                });
                
                Promise.all(subjectsPromises)
                    .then(subjects => {
                        const validSubjects = subjects.filter(s => s !== null);
                        
                        // Get existing timetable data for each subject
                        const classPromises = validSubjects.map(subject => {
                            const classId = `${section.id}_${subject.id}`;
                            return classesRef.child(classId).once('value')
                                .then(classSnapshot => ({
                                    subject,
                                    schedule: classSnapshot.val() || {}
                                }));
                        });
                        
                        Promise.all(classPromises)
                            .then(classes => {
                                renderTimetable(classes, section);
                                hideLoading();
                                timetableModal.style.display = 'flex';
                            });
                    });
            })
            .catch(error => {
                hideLoading();
                showError('Failed to load timetable: ' + error.message);
            });
    }
    
    function renderTimetable(classes, section) {
        const timetableBody = document.getElementById('timetableTableBody');
        timetableBody.innerHTML = '';
        
        // Initialize tempSchedules if it doesn't exist
        if (!window.tempSchedules) window.tempSchedules = {};

        if (classes.length === 0) {
            timetableBody.innerHTML = `
                <tr><td colspan="7" class="text-center py-4">No subjects found in this section</td></tr>
            `;
            return;
        }

        const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        
        classes.forEach(({subject, schedule}) => {
            const classId = `${section.id}_${subject.id}`;
            const row = document.createElement('tr');
            
            // Initialize temp schedule for this class if it doesn't exist
            if (!window.tempSchedules[classId]) {
                window.tempSchedules[classId] = {
                    schedule: {
                        days: schedule?.schedule?.days ? 
                            (Array.isArray(schedule.schedule.days) ? 
                                [...schedule.schedule.days] : 
                                [schedule.schedule.days]) : 
                            [],
                        start_time: schedule?.schedule?.start_time || '',
                        end_time: schedule?.schedule?.end_time || ''
                    }
                };
            }

            // Create day checkboxes
            const dayCheckboxes = daysOfWeek.map(day => {
                const isChecked = window.tempSchedules[classId].schedule.days.includes(day);
                return `
                    <label class="day-checkbox">
                        <input type="checkbox" name="day_${classId}" value="${day}" 
                            ${isChecked ? 'checked' : ''}>
                        ${day}
                    </label>
                `;
            }).join(' ');

            row.innerHTML = `
                <td>${subject.subjectName}</td>
                <td>${subject.id}</td>
                <td>${subject.teacherName}</td>
                <td>
                    <div class="day-selection">
                        ${dayCheckboxes}
                    </div>
                </td>
                <td>
                    <input type="time" class="time-input" 
                        value="${window.tempSchedules[classId].schedule.start_time}">
                </td>
                <td>
                    <input type="time" class="time-input" 
                        value="${window.tempSchedules[classId].schedule.end_time}">
                </td>
                <td>
                    <button class="btn-action btn-save">
                        <i class="fas fa-save"></i> Save
                    </button>
                </td>
            `;

            // Add event listeners
            const checkboxes = row.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(checkbox => {
                checkbox.addEventListener('change', () => {
                    const day = checkbox.value;
                    const isChecked = checkbox.checked;
                    
                    if (isChecked) {
                        if (!window.tempSchedules[classId].schedule.days.includes(day)) {
                            window.tempSchedules[classId].schedule.days.push(day);
                        }
                    } else {
                        window.tempSchedules[classId].schedule.days = 
                            window.tempSchedules[classId].schedule.days.filter(d => d !== day);
                    }
                });
            });

            const timeInputs = row.querySelectorAll('.time-input');
            timeInputs[0].addEventListener('change', (e) => {
                window.tempSchedules[classId].schedule.start_time = e.target.value;
            });
            timeInputs[1].addEventListener('change', (e) => {
                window.tempSchedules[classId].schedule.end_time = e.target.value;
            });

            row.querySelector('.btn-save').addEventListener('click', (e) => {
                e.preventDefault();
                saveClassSchedule.call(e.target, classId);
            });

            timetableBody.appendChild(row);
        });
    }
    
    function updateClassDays(classId, checkbox) {
        if (!window.tempSchedules[classId]) {
            window.tempSchedules[classId] = { days: [] };
        }
        
        const day = checkbox.value;
        const isChecked = checkbox.checked;
        
        if (isChecked) {
            if (!window.tempSchedules[classId].days.includes(day)) {
                window.tempSchedules[classId].days.push(day);
            }
        } else {
            window.tempSchedules[classId].days = window.tempSchedules[classId].days.filter(d => d !== day);
        }
    }
    
    function updateClassSchedule(classId, field, value) {
        if (!window.tempSchedules) window.tempSchedules = {};
        if (!window.tempSchedules[classId]) window.tempSchedules[classId] = {};
        
        window.tempSchedules[classId][field] = value;
    }
    
    function saveClassSchedule(classId) {
        // Find the save button that was clicked
        const saveBtn = event.target.closest('.btn-save');
        
        if (!saveBtn) {
            console.error('Save button not found');
            return;
        }

        const originalBtnHTML = saveBtn.innerHTML;
        
        // Show loading state on the button
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        saveBtn.disabled = true;

        if (!window.tempSchedules || !window.tempSchedules[classId]) {
            Swal.fire({
                title: 'Info',
                text: 'No changes to save',
                icon: 'info'
            }).finally(() => {
                saveBtn.innerHTML = originalBtnHTML;
                saveBtn.disabled = false;
            });
            return;
        }

        const scheduleData = window.tempSchedules[classId].schedule;

        // Validation checks
        if ((!scheduleData.days || scheduleData.days.length === 0) || 
            !scheduleData.start_time || !scheduleData.end_time) {
            Swal.fire({
                title: 'Error',
                text: 'Please select at least one day and both start/end times',
                icon: 'error'
            }).finally(() => {
                saveBtn.innerHTML = originalBtnHTML;
                saveBtn.disabled = false;
            });
            return;
        }

        if (scheduleData.start_time >= scheduleData.end_time) {
            Swal.fire({
                title: 'Error',
                text: 'End time must be after start time',
                icon: 'error'
            }).finally(() => {
                saveBtn.innerHTML = originalBtnHTML;
                saveBtn.disabled = false;
            });
            return;
        }

        const updates = {
            schedule: {
                days: scheduleData.days,
                start_time: scheduleData.start_time,
                end_time: scheduleData.end_time
            }
        };

        classesRef.child(classId).update(updates)
            .then(() => {
                Swal.fire({
                    title: 'Success!',
                    text: 'Schedule updated successfully',
                    icon: 'success'
                });
            })
            .catch(error => {
                Swal.fire({
                    title: 'Error!',
                    text: 'Failed to update schedule: ' + error.message,
                    icon: 'error'
                });
            })
            .finally(() => {
                saveBtn.innerHTML = originalBtnHTML;
                saveBtn.disabled = false;
            });
    }
    
    function loadTeachers() {
        teachersRef.on('value', snapshot => {
            homeroomAdviserInput.innerHTML = '<option value="">Select Teacher</option>';
            const teachers = snapshot.val() || {};
            
            Object.entries(teachers).forEach(([id, teacher]) => {
                if (teacher.name) {
                    const option = document.createElement('option');
                    option.value = id;
                    option.textContent = teacher.name;
                    homeroomAdviserInput.appendChild(option);
                }
            });
        }, error => {
            console.error('Error loading teachers:', error);
        });
    }
    
    function setupBatchYearDropdown() {
        batchYearInput.innerHTML = '<option value="">Select Batch</option>';
        const currentYear = new Date().getFullYear();
        
        for (let i = -1; i < 5; i++) {
            const year = currentYear + i;
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            batchYearInput.appendChild(option);
        }
    }
    
    function showAddSectionModal() {
        currentEditingSectionId = null;
        document.getElementById('modalTitle').textContent = 'Add New Section';
        sectionForm.reset();
        gradeLevelInput.value = '';
        strandInput.value = '';
        sectionNumberInput.value = '';
        homeroomAdviserInput.value = '';
        batchYearInput.value = '';
        statusInput.value = 'active';
        sectionModal.style.display = 'flex';
    }
    
    function hideSectionModal() {
        sectionModal.style.display = 'none';
    }
    
    function editSection(section) {
        currentEditingSectionId = section.id;
        document.getElementById('modalTitle').textContent = 'Edit Section';
        
        gradeLevelInput.value = section.gradeLevel || '';
        strandInput.value = section.strand || '';
        sectionNumberInput.value = section.sectionNumber || '';
        homeroomAdviserInput.value = section.homeroomAdviser || '';
        batchYearInput.value = section.batchYear || '';
        statusInput.value = section.status || 'active';
        
        sectionModal.style.display = 'flex';
    }
    
    function handleSectionSubmit(e) {
        e.preventDefault();
        
        const gradeLevel = gradeLevelInput.value;
        const strand = strandInput.value;
        const sectionNumber = sectionNumberInput.value;
        
        if (!gradeLevel || !strand || !sectionNumber) {
            showError('Please fill all required fields');
            return;
        }
        
        const sectionData = {
            sectionName: `Grade ${gradeLevel} ${strand} - ${sectionNumber}`,
            gradeLevel,
            strand,
            sectionNumber,
            homeroomAdviser: homeroomAdviserInput.value,
            batchYear: batchYearInput.value,
            status: statusInput.value,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        };
        
        const teacherId = homeroomAdviserInput.value;
        if (teacherId) {
            teachersRef.child(teacherId).once('value', teacherSnapshot => {
                const teacher = teacherSnapshot.val();
                if (teacher) {
                    sectionData.homeroomAdviserName = teacher.name;
                    saveSection(sectionData);
                }
            });
        } else {
            sectionData.homeroomAdviserName = '';
            saveSection(sectionData);
        }
    }
    
    function saveSection(sectionData) {
        showLoading();
        
        checkMatchingCurriculum(sectionData.gradeLevel, sectionData.strand)
            .then(curriculumId => {
                sectionData.curriculum = curriculumId || null;
                
                if (currentEditingSectionId) {
                    sectionsRef.child(currentEditingSectionId).update(sectionData)
                        .then(() => {
                            showSuccess('Section updated successfully');
                            hideSectionModal();
                        })
                        .catch(error => {
                            showError(error.message);
                        });
                } else {
                    sectionData.createdAt = firebase.database.ServerValue.TIMESTAMP;
                    sectionData.studentCount = 0;
                    
                    sectionsRef.push(sectionData)
                        .then(() => {
                            showSuccess('Section added successfully');
                            hideSectionModal();
                        })
                        .catch(error => {
                            showError(error.message);
                        });
                }
            });
    }
    
    function checkMatchingCurriculum(gradeLevel, strand) {
        return curriculumsRef.orderByChild('gradeLevel').equalTo(gradeLevel).once('value')
            .then(snapshot => {
                let matchingCurriculumId = null;
                snapshot.forEach(childSnapshot => {
                    const curriculum = childSnapshot.val();
                    if (curriculum.strand === strand) {
                        matchingCurriculumId = childSnapshot.key;
                    }
                });
                return matchingCurriculumId;
            });
    }
    
    function deleteSection(id, sectionName) {
        Swal.fire({
            title: 'Are you sure?',
            html: `You are about to delete the section <strong>${sectionName}</strong>.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Yes, delete it!'
        }).then((result) => {
            if (result.isConfirmed) {
                showLoading();
                sectionsRef.child(id).remove()
                    .then(() => showSuccess('The section has been deleted'))
                    .catch(error => showError(error.message));
            }
        });
    }
    
    function setupCurriculumChangeListener() {
        curriculumsRef.on('child_changed', snapshot => {
            const curriculum = snapshot.val();
            const curriculumId = snapshot.key;
            
            sectionsRef.orderByChild('gradeLevel').equalTo(curriculum.gradeLevel).once('value')
                .then(sectionsSnapshot => {
                    const updates = {};
                    
                    sectionsSnapshot.forEach(sectionSnapshot => {
                        const section = sectionSnapshot.val();
                        if (section.strand === curriculum.strand) {
                            updates[`sections/${sectionSnapshot.key}/curriculum`] = curriculumId;
                        } else if (section.curriculum === curriculumId) {
                            updates[`sections/${sectionSnapshot.key}/curriculum`] = null;
                        }
                    });
                    
                    if (Object.keys(updates).length > 0) {
                        db.ref().update(updates);
                    }
                });
        });
    }
    
    function setupSectionChangeListener() {
        sectionsRef.on('child_changed', snapshot => {
            const section = snapshot.val();
            const sectionId = snapshot.key;
            
            if (section.curriculum) {
                curriculumsRef.child(section.curriculum).once('value')
                    .then(curriculumSnapshot => {
                        const curriculum = curriculumSnapshot.val();
                        if (!curriculum || curriculum.gradeLevel !== section.gradeLevel || curriculum.strand !== section.strand) {
                            sectionsRef.child(`${sectionId}/curriculum`).remove();
                        }
                    });
            } else {
                checkMatchingCurriculum(section.gradeLevel, section.strand)
                    .then(curriculumId => {
                        if (curriculumId) {
                            sectionsRef.child(`${sectionId}/curriculum`).set(curriculumId);
                        }
                    });
            }
        });
    }
    
    function filterSections() {
        const gradeLevel = gradeLevelFilter.value;
        const strand = strandFilter.value;
        const searchTerm = sectionSearch.value.toLowerCase();
        
        filteredSections = allSections.filter(section => {
            if (gradeLevel && section.gradeLevel !== gradeLevel) return false;
            if (strand && section.strand !== strand) return false;
            if (searchTerm && !section.sectionName.toLowerCase().includes(searchTerm)) return false;
            return true;
        });
        
        currentPage = 1;
        renderSections();
        updatePagination();
    }
    
    function searchSections() {
        filterSections();
    }
    
    function goToPreviousPage() {
        if (currentPage > 1) {
            currentPage--;
            renderSections();
            updatePagination();
        }
    }
    
    function goToNextPage() {
        const totalPages = Math.ceil(filteredSections.length / itemsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderSections();
            updatePagination();
        }
    }
    
    function updatePagination() {
        const totalPages = Math.ceil(filteredSections.length / itemsPerPage);
        pageInfo.textContent = `Page ${currentPage} of ${totalPages || 1}`;
        prevPageBtn.disabled = currentPage <= 1;
        nextPageBtn.disabled = currentPage >= totalPages || totalPages === 0;
    }
    
    // Helper functions for notifications
    function showLoading() {
        Swal.showLoading();
    }
    
    function hideLoading() {
        Swal.close();
    }
    
    function showSuccess(message) {
        Swal.fire('Success!', message, 'success');
        hideLoading();
    }
    
    function showError(message) {
        Swal.fire('Error!', message, 'error');
        hideLoading();
    }
    
    function showInfo(message) {
        Swal.fire('Info', message, 'info');
    }
    
    // Logout functionality
    document.getElementById('logoutBtn').addEventListener('click', () => {
        firebase.auth().signOut().then(() => {
            window.location.href = '../index.html';
        });
    });
});