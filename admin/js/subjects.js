// Reference to Firebase Database (already initialized in firebase-config.js)
const db = firebase.database();

// DOM Elements
const coursesTableBody = document.getElementById('coursesTableBody');
const addNewCourseBtn = document.getElementById('addNewCourseBtn');
const courseModal = document.getElementById('courseModal');
const cancelCourseBtn = document.getElementById('cancelCourseBtn');
const saveCourseBtn = document.getElementById('saveCourseBtn');
const courseForm = document.getElementById('courseForm');
const courseSearch = document.getElementById('courseSearch');
const searchBtn = document.getElementById('searchBtn');
const bulkActionsBtn = document.getElementById('bulkActionsBtn');
const bulkActionsDropdown = document.getElementById('bulkActionsDropdown');
const selectAllBtn = document.getElementById('selectAllBtn');
const clearSelectionBtn = document.getElementById('clearSelectionBtn');
const selectAllCheckbox = document.getElementById('selectAllCheckbox');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const pageInfo = document.getElementById('pageInfo');

// Variables
let currentPage = 1;
const itemsPerPage = 10;
let allCourses = [];
let allTeachers = [];
let filteredCourses = [];
let editMode = false;
let currentCourseId = null;

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    loadCourses();
    loadTeachers();
    
    // Modal Controls
    addNewCourseBtn.addEventListener('click', () => openCourseModal());
    cancelCourseBtn.addEventListener('click', closeCourseModal);
    
    // Bulk Actions
    bulkActionsBtn.addEventListener('click', toggleBulkActions);
    selectAllBtn.addEventListener('click', selectAllCourses);
    clearSelectionBtn.addEventListener('click', clearSelection);
    selectAllCheckbox.addEventListener('change', toggleSelectAll);
    
    // Pagination
    prevPageBtn.addEventListener('click', goToPrevPage);
    nextPageBtn.addEventListener('click', goToNextPage);
    
    // Search
    searchBtn.addEventListener('click', searchCourses);
    courseSearch.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') searchCourses();
    });
    
    // Close bulk actions when clicking outside
    document.addEventListener('click', (e) => {
        if (!bulkActionsBtn.contains(e.target) && !bulkActionsDropdown.contains(e.target)) {
            bulkActionsDropdown.style.display = 'none';
        }
    });
});

// Form Submission
courseForm.addEventListener('submit', (e) => {
    e.preventDefault();
    saveCourse();
});

// Load Teachers from Firebase
function loadTeachers() {
    const teachersRef = db.ref('teachers');
    
    teachersRef.on('value', (snapshot) => {
        allTeachers = [];
        snapshot.forEach((childSnapshot) => {
            const teacherId = childSnapshot.key;
            const teacherData = childSnapshot.val();
            
            // Only include active teachers
            if (teacherData.status === 'active') {
                const teacher = {
                    id: teacherId,
                    name: teacherData.name || 'Unnamed Teacher',
                    subjects: teacherData.subjects || {}
                };
                allTeachers.push(teacher);
            }
        });
        console.log('Teachers loaded:', allTeachers);
    }, (error) => {
        console.error('Error loading teachers:', error);
    });
}

// Load Courses from Firebase with /subjects/subjectCode structure
function loadCourses() {
    const subjectsRef = db.ref('subjects');
    
    subjectsRef.on('value', (snapshot) => {
        allCourses = [];
        snapshot.forEach((childSnapshot) => {
            const subjectCode = childSnapshot.key;
            const courseData = childSnapshot.val();
            const course = {
                id: subjectCode,
                subjectCode: subjectCode,
                subjectName: courseData.subjectName,
                subjectType: courseData.subjectType,
                subjectTeacher: courseData.subjectTeacher || null,
                roomNumber: courseData.roomNumber || null,
                status: courseData.status || 'active'
            };
            allCourses.push(course);
        });
        
        // Sort courses by subject code
        allCourses.sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));
        
        filteredCourses = [...allCourses];
        renderCourses();
        updatePaginationControls();
    });
}

// Render Courses to Table
function renderCourses() {
    coursesTableBody.innerHTML = '';
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, filteredCourses.length);
    const coursesToDisplay = filteredCourses.slice(startIndex, endIndex);
    
    if (coursesToDisplay.length === 0) {
        coursesTableBody.innerHTML = `
            <tr>
                <td colspan="8" class="no-results">No courses found</td>
            </tr>
        `;
        return;
    }
    
    coursesToDisplay.forEach(course => {
        const row = document.createElement('tr');
        row.dataset.id = course.subjectCode;
        
        // Find teacher name if assigned
        let teacherName = 'Not assigned';
        if (course.subjectTeacher) {
            const teacher = allTeachers.find(t => t.id === course.subjectTeacher);
            if (teacher) {
                teacherName = teacher.name;
            } else {
                db.ref(`teachers/${course.subjectTeacher}/name`).once('value')
                    .then((snapshot) => {
                        if (snapshot.exists()) {
                            teacherName = snapshot.val();
                            const teacherCell = row.querySelector('.teacher-name-cell');
                            if (teacherCell) {
                                teacherCell.textContent = teacherName;
                            }
                        }
                    });
            }
        }
        
        row.innerHTML = `
            <td class="checkbox-cell">
                <input type="checkbox" class="course-checkbox" data-id="${course.subjectCode}">
            </td>
            <td><span class="subject-code">${course.subjectCode}</span></td>
            <td>${course.subjectName}</td>
            <td>
                <span class="type-badge ${course.subjectType === 'GenEd' ? 'type-gened' : 'type-core'}">
                    <span class="subject-type-indicator subject-type-${course.subjectType.toLowerCase()}"></span>
                    ${course.subjectType === 'GenEd' ? 'General Education' : 'Core Subject'}
                </span>
            </td>
            <td class="teacher-name-cell">${teacherName}</td>
            <td>${course.roomNumber || 'Not assigned'}</td>
            <td>
                <span class="status-badge ${course.status === 'active' ? 'status-active' : 'status-inactive'}">
                    ${course.status === 'active' ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn edit" data-id="${course.subjectCode}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete" data-id="${course.subjectCode}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        
        coursesTableBody.appendChild(row);
    });
    
    // Add event listeners to action buttons
    document.querySelectorAll('.action-btn.edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const subjectCode = e.currentTarget.dataset.id;
            editCourse(subjectCode);
        });
    });
    
    document.querySelectorAll('.action-btn.delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const subjectCode = e.currentTarget.dataset.id;
            deleteCourse(subjectCode);
        });
    });
}

// Open Course Modal
function openCourseModal(course = null) {
    editMode = course !== null;
    currentCourseId = course ? course.subjectCode : null;
    
    document.getElementById('modalTitle').textContent = editMode ? 'Edit Subject' : 'Add New Subject';
    
    // Reset form
    courseForm.reset();
    
    // Set values if editing
    if (editMode) {
        document.getElementById('subjectType').value = course.subjectType;
        document.getElementById('subjectCode').value = course.subjectCode;
        document.getElementById('subjectName').value = course.subjectName;
        document.getElementById('roomNumber').value = course.roomNumber || '';
        document.getElementById('status').value = course.status;
        document.getElementById('subjectCode').readOnly = true;
    } else {
        document.getElementById('subjectType').addEventListener('change', generateSubjectCode);
        document.getElementById('subjectCode').readOnly = false;
    }
    
    // Populate teacher dropdown
    const teacherSelect = document.getElementById('subjectTeacher');
    teacherSelect.innerHTML = '<option value="">Select Teacher</option>';
    
    allTeachers.forEach(teacher => {
        const teachesSubject = editMode && teacher.subjects && teacher.subjects[currentCourseId];
        
        const option = document.createElement('option');
        option.value = teacher.id;
        option.textContent = `${teacher.name}${teachesSubject ? ` - ${teacher.subjects[currentCourseId]}` : ''}`;
        
        if (editMode && course.subjectTeacher === teacher.id) {
            option.selected = true;
        }
        
        teacherSelect.appendChild(option);
    });
    
    courseModal.style.display = 'flex';
}

// Close Course Modal
function closeCourseModal() {
    courseModal.style.display = 'none';
    document.getElementById('subjectType').removeEventListener('change', generateSubjectCode);
}

// Generate Subject Code
function generateSubjectCode() {
    const subjectType = document.getElementById('subjectType').value;
    if (!subjectType) return;
    
    const prefix = subjectType === 'GenEd' ? 'GenEd' : 'CS';
    const existingCodes = allCourses
        .filter(c => c.subjectType === subjectType)
        .map(c => parseInt(c.subjectCode.replace(prefix, '')))
        .filter(num => !isNaN(num));
    
    const nextNum = existingCodes.length > 0 ? Math.max(...existingCodes) + 1 : 1;
    const nextCode = prefix + nextNum.toString().padStart(3, '0');
    
    document.getElementById('subjectCode').value = nextCode;
}

// Save Course (Create or Update)
function saveCourse() {
    const subjectType = document.getElementById('subjectType').value;
    const subjectCode = document.getElementById('subjectCode').value;
    const subjectName = document.getElementById('subjectName').value;
    const status = document.getElementById('status').value;
    const subjectTeacher = document.getElementById('subjectTeacher').value || null;
    const roomNumber = document.getElementById('roomNumber').value || null;
    
    if (!subjectType || !subjectCode || !subjectName) {
        Swal.fire('Error', 'Please fill in all required fields', 'error');
        return;
    }
    
    const courseData = {
        subjectType,
        subjectName,
        status,
        subjectTeacher,
        roomNumber
    };
    
    if (editMode) {
        db.ref(`subjects/${subjectCode}`).update(courseData)
            .then(() => {
                Swal.fire('Success', 'Course updated successfully', 'success');
                closeCourseModal();
            })
            .catch(error => {
                Swal.fire('Error', error.message, 'error');
            });
    } else {
        if (allCourses.some(c => c.subjectCode === subjectCode)) {
            Swal.fire('Error', 'Subject code already exists', 'error');
            return;
        }
        
        db.ref(`subjects/${subjectCode}`).set(courseData)
            .then(() => {
                Swal.fire('Success', 'Course added successfully', 'success');
                closeCourseModal();
            })
            .catch(error => {
                Swal.fire('Error', error.message, 'error');
            });
    }
}

// Edit Course
function editCourse(subjectCode) {
    const course = allCourses.find(c => c.subjectCode === subjectCode);
    if (course) {
        openCourseModal(course);
    }
}

// Delete Course
function deleteCourse(subjectCode) {
    Swal.fire({
        title: 'Are you sure?',
        text: "You won't be able to revert this!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
        if (result.isConfirmed) {
            db.ref(`subjects/${subjectCode}`).remove()
                .then(() => {
                    Swal.fire('Deleted!', 'The course has been deleted.', 'success');
                })
                .catch(error => {
                    Swal.fire('Error', error.message, 'error');
                });
        }
    });
}

// Search Courses
function searchCourses() {
    const searchTerm = courseSearch.value.toLowerCase();
    
    if (!searchTerm) {
        filteredCourses = [...allCourses];
    } else {
        filteredCourses = allCourses.filter(course => 
            course.subjectCode.toLowerCase().includes(searchTerm) ||
            course.subjectName.toLowerCase().includes(searchTerm) ||
            (course.subjectType === 'GenEd' ? 'general education' : 'core subject').includes(searchTerm) ||
            course.status.includes(searchTerm) ||
            (course.roomNumber && course.roomNumber.toLowerCase().includes(searchTerm))
        );
    }
    
    currentPage = 1;
    renderCourses();
    updatePaginationControls();
}

// Bulk Actions
function toggleBulkActions() {
    bulkActionsDropdown.style.display = bulkActionsDropdown.style.display === 'block' ? 'none' : 'block';
}

function selectAllCourses() {
    document.querySelectorAll('.course-checkbox').forEach(checkbox => {
        checkbox.checked = true;
    });
    selectAllCheckbox.checked = true;
}

function clearSelection() {
    document.querySelectorAll('.course-checkbox').forEach(checkbox => {
        checkbox.checked = false;
    });
    selectAllCheckbox.checked = false;
}

function toggleSelectAll() {
    const isChecked = selectAllCheckbox.checked;
    document.querySelectorAll('.course-checkbox').forEach(checkbox => {
        checkbox.checked = isChecked;
    });
}

// Pagination
function updatePaginationControls() {
    const totalPages = Math.ceil(filteredCourses.length / itemsPerPage);
    
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage === totalPages || totalPages === 0;
}

function goToPrevPage() {
    if (currentPage > 1) {
        currentPage--;
        renderCourses();
        updatePaginationControls();
    }
}

function goToNextPage() {
    const totalPages = Math.ceil(filteredCourses.length / itemsPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        renderCourses();
        updatePaginationControls();
    }
}

// Status Update for Bulk Actions
document.querySelectorAll('.bulk-actions-dropdown .dropdown-item[data-status]').forEach(item => {
    item.addEventListener('click', () => {
        const status = item.dataset.status;
        updateSelectedCoursesStatus(status);
    });
});

function updateSelectedCoursesStatus(status) {
    const selectedIds = [];
    document.querySelectorAll('.course-checkbox:checked').forEach(checkbox => {
        selectedIds.push(checkbox.dataset.id);
    });

    if (selectedIds.length === 0) {
        Swal.fire('Info', 'Please select at least one course', 'info');
        return;
    }

    const updates = {};
    selectedIds.forEach(subjectCode => {
        updates[`subjects/${subjectCode}/status`] = status;
    });

    db.ref().update(updates)
        .then(() => {
            Swal.fire('Success', `Updated status for ${selectedIds.length} course(s)`, 'success');
            bulkActionsDropdown.style.display = 'none';
            clearSelection();
        })
        .catch(error => {
            Swal.fire('Error', error.message, 'error');
        });
}