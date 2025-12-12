// teachers.js - Matching students.js functionality

document.addEventListener('DOMContentLoaded', function() {
    // Firebase Database Reference
    const db = firebase.database();
    const teachersRef = db.ref('teachers');
    const usersRef = db.ref('users');
    
    // DOM Elements
    const teachersTableBody = document.getElementById('teachersTableBody');
    const teacherForm = document.getElementById('teacherForm');
    const teacherModal = document.getElementById('teacherModal');
    const addNewTeacherBtn = document.getElementById('addNewTeacherBtn');
    const cancelTeacherBtn = document.getElementById('cancelTeacherBtn');
    const teacherSearch = document.getElementById('teacherSearch');
    const searchBtn = document.getElementById('searchBtn');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const pageInfo = document.getElementById('pageInfo');
    const teacherIdField = document.getElementById('teacherId');
    
    // State variables
    let currentPage = 1;
    const recordsPerPage = 10;
    let allTeachers = [];
    let filteredTeachers = [];
    let currentTeacherId = null;
    let isEditMode = false;
    let searchTimeout = null;

    // Initialize the page
    function init() {
        loadTeachers();
        setupEventListeners();
    }

    // Load teachers from Firebase
    async function loadTeachers() {
        teachersRef.on('value', async (snapshot) => {
            allTeachers = [];

            // Use Promise.all to fetch all /users data for locked status
            const teacherPromises = [];

            snapshot.forEach((childSnapshot) => {
                const teacher = childSnapshot.val();
                teacher.id = childSnapshot.key;

                // Push a promise that fetches /users/{uid}/locked
                teacherPromises.push(
                    usersRef.child(teacher.id).child('locked').once('value').then(userSnap => {
                        teacher.locked = userSnap.val() === true;
                        return teacher;
                    })
                );
            });

            allTeachers = await Promise.all(teacherPromises);
            filteredTeachers = [...allTeachers];
            renderTable();
        });
    }

    // Render teachers table with action buttons
    function renderTable() {
        teachersTableBody.innerHTML = '';
        
        const startIndex = (currentPage - 1) * recordsPerPage;
        const endIndex = Math.min(startIndex + recordsPerPage, filteredTeachers.length);
        
        for (let i = startIndex; i < endIndex; i++) {
            const teacher = filteredTeachers[i];
            const row = document.createElement('tr');
            
            row.innerHTML = `
                <td>${teacher.id || ''}</td>
                <td>${teacher.name || ''}</td>
                <td>${teacher.email || ''}</td>
                <td class="action-buttons">
                    <button class="action-btn edit" data-id="${teacher.id}" title="Edit">
                        <i class="fas fa-pencil-alt"></i>
                    </button>
                    <button class="action-btn view" data-id="${teacher.id}" title="View">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-btn reset" data-id="${teacher.id}" title="Reset Password">
                        <i class="fas fa-key"></i>
                    </button>
                    <button class="action-btn delete" data-id="${teacher.id}" title="Delete">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                    ${teacher.locked ? `
                    <button class="action-btn unlock" data-id="${teacher.id}" title="Unlock Teacher">
                        <i class="fas fa-unlock"></i>
                    </button>` : ''}
                </td>
            `;
            
            teachersTableBody.appendChild(row);
        }
        
        updatePagination();
        attachRowEventListeners();
    }

    // Format status for display
    function formatStatus(status) {
        const statusMap = {
            'active': 'Active',
            'inactive': 'Inactive',
            'pending': 'Pending'
        };
        return statusMap[status] || status;
    }

    // Update pagination controls
    function updatePagination() {
        const totalPages = Math.ceil(filteredTeachers.length / recordsPerPage);
        
        pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
        prevPageBtn.disabled = currentPage === 1;
        nextPageBtn.disabled = currentPage === totalPages || totalPages === 0;
    }

    // Setup event listeners
    function setupEventListeners() {
        if (addNewTeacherBtn) {
            addNewTeacherBtn.addEventListener('click', async () => {
                isEditMode = false;
                currentTeacherId = null;
                document.getElementById('modalTitle').textContent = 'Add New Teacher';
                teacherForm.reset();
                
                const nextId = await generateNewTeacherId();
                if (teacherIdField) {
                    teacherIdField.value = nextId;
                    teacherIdField.readOnly = true;
                    teacherIdField.classList.add('read-only-field');
                }
                
                if (teacherModal) teacherModal.style.display = 'flex';
            });
        }

        if (cancelTeacherBtn) {
            cancelTeacherBtn.addEventListener('click', () => {
                if (teacherModal) teacherModal.style.display = 'none';
                if (teacherIdField) {
                    teacherIdField.readOnly = false;
                    teacherIdField.classList.remove('read-only-field');
                }
            });
        }

        if (teacherForm) {
            teacherForm.addEventListener('submit', (e) => {
                e.preventDefault();
                saveTeacher();
            });
        }

        if (teacherSearch) {
            teacherSearch.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    searchTeachers();
                }, 300);
            });
        }

        if (searchBtn) {
            searchBtn.addEventListener('click', searchTeachers);
        }

        if (prevPageBtn) {
            prevPageBtn.addEventListener('click', () => {
                if (currentPage > 1) {
                    currentPage--;
                    renderTable();
                }
            });
        }

        if (nextPageBtn) {
            nextPageBtn.addEventListener('click', () => {
                const totalPages = Math.ceil(filteredTeachers.length / recordsPerPage);
                if (currentPage < totalPages) {
                    currentPage++;
                    renderTable();
                }
            });
        }
    }

    // Attach event listeners to table rows
    function attachRowEventListeners() {
        // Use event delegation for better performance
        teachersTableBody.addEventListener('click', (e) => {
            const btn = e.target.closest('.action-btn');
            if (!btn) return;
            
            const teacherId = btn.getAttribute('data-id');
            const action = btn.classList[1]; // Get the second class (edit, view, reset, delete)
            
            if (action === 'edit') {
                editTeacher(teacherId);
            } else if (action === 'view') {
                viewTeacher(teacherId);
            } else if (action === 'reset') {
                showResetPasswordConfirmation(teacherId);
            } else if (action === 'delete') {
                showDeleteConfirmation(teacherId);
            } else if (action === 'unlock') {
                showUnlockConfirmation(teacherId);
            }
        });
    }

    // Show unlock confirmation
    function showUnlockConfirmation(teacherId) {
        const teacher = allTeachers.find(t => t.id === teacherId);
        
        Swal.fire({
            title: 'Unlock Teacher',
            html: `Are you sure you want to unlock <strong>${teacher.name}</strong> (ID: ${teacherId})?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Yes, unlock!',
            cancelButtonText: 'Cancel'
        }).then((result) => {
            if (result.isConfirmed) {
                unlockTeacher(teacherId);
            }
        });
    }

    // Unlock teacher
    async function unlockTeacher(teacherId) {
        Swal.fire({
            title: 'Unlocking...',
            html: 'Please wait while we unlock the teacher',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading(),
            backdrop: true
        });

        try {
            await usersRef.child(teacherId).child('locked').remove();

            Swal.fire({
                icon: 'success',
                title: 'Unlocked!',
                text: 'Teacher account has been unlocked',
                confirmButtonColor: '#3085d6',
                timer: 2000,
                showConfirmButton: false
            });

            // Update local copy and re-render
            const teacher = allTeachers.find(t => t.id === teacherId);
            if (teacher) teacher.locked = false;
            renderTable();
        } catch (error) {
            console.error('Error unlocking teacher:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Failed to unlock teacher: ' + error.message,
                confirmButtonColor: '#3085d6',
            });
        }
    }

    // Edit teacher
    function editTeacher(teacherId) {
        const teacher = allTeachers.find(t => t.id === teacherId);
        if (!teacher) {
            Swal.fire('Error', 'Teacher not found!', 'error');
            return;
        }

        isEditMode = true;
        currentTeacherId = teacherId;
        document.getElementById('modalTitle').textContent = 'Edit Teacher';
        
        // Split full name into first and last names
        const nameParts = teacher.name ? teacher.name.split(' ') : ['', ''];
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        
        // Populate form fields with correct IDs
        teacherIdField.value = teacherId;
        teacherIdField.readOnly = true;
        teacherIdField.classList.add('read-only-field');
        document.getElementById('firstName').value = firstName;
        document.getElementById('lastName').value = lastName;
        document.getElementById('email').value = teacher.email || '';
        document.getElementById('subject').value = teacher.subjects ? teacher.subjects.join(', ') : '';
        document.getElementById('status').value = teacher.status || 'active';
        
        teacherModal.style.display = 'flex';
    }

    // View teacher details
    function viewTeacher(teacherId) {
        const teacher = allTeachers.find(t => t.id === teacherId);
        if (!teacher) {
            Swal.fire('Error', 'Teacher not found!', 'error');
            return;
        }

        Swal.fire({
            title: 'Teacher Details',
            html: `
                <div class="teacher-details" style="text-align: left;">
                    <p><strong>Teacher ID:</strong> ${teacher.id}</p>
                    <p><strong>Name:</strong> ${teacher.name}</p>
                    <p><strong>Email:</strong> ${teacher.email}</p>
                    <p><strong>Subjects:</strong> ${teacher.subjects ? teacher.subjects.join(', ') : 'Not specified'}</p>
                    <p><strong>Status:</strong> <span class="status-badge ${teacher.status || 'inactive'}">${formatStatus(teacher.status)}</span></p>
                </div>
            `,
            confirmButtonColor: '#3085d6',
            showCloseButton: true
        });
    }

    // Save teacher (add or update)
    async function saveTeacher() {
        // Get form values
        const firstName = document.getElementById('firstName').value.trim();
        const lastName = document.getElementById('lastName').value.trim();
        const email = document.getElementById('email').value.trim();
        const subject = document.getElementById('subject').value.trim();
        const status = document.getElementById('status').value;
        
        // Combine first and last name
        const fullName = `${firstName} ${lastName}`;

        const teacherData = {
            name: fullName,
            email: email,
            subjects: subject.split(',').map(s => s.trim()).filter(s => s !== ''),
            status: status,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        };

        // Validation
        if (!firstName || !lastName || !email || !subject) {
            Swal.fire({
                icon: 'error',
                title: 'Validation Error',
                text: 'Please fill in all required fields',
                confirmButtonColor: '#3085d6',
            });
            return;
        }

        const saveBtn = document.getElementById('saveTeacherBtn');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
            const teacherId = isEditMode ? currentTeacherId : teacherIdField.value.trim();
            
            // Create user data object
            const userData = {
                email: teacherData.email,
                password: teacherId, // Use teacher ID as password
                role: 'teacher',
                name: fullName,
                updatedAt: firebase.database.ServerValue.TIMESTAMP
            };

            // Show loading indicator
            Swal.fire({
                title: 'Saving...',
                html: 'Please wait while we save teacher data',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading(),
                backdrop: true
            });

            if (!isEditMode) {
                userData.createdAt = firebase.database.ServerValue.TIMESTAMP;
                teacherData.createdAt = firebase.database.ServerValue.TIMESTAMP;
            }

            // Prepare updates for both teachers and users
            const updates = {
                [`/teachers/${teacherId}`]: teacherData,
                [`/users/${teacherId}`]: userData
            };

            // Perform the update
            await db.ref().update(updates);

            // Show success message
            Swal.fire({
                icon: 'success',
                title: 'Success!',
                html: isEditMode 
                    ? 'Teacher updated successfully' 
                    : `Teacher added successfully with ID: <strong>${teacherId}</strong>`,
                confirmButtonColor: '#3085d6',
                timer: 2000,
                showConfirmButton: false
            });

            // Close modal and reset form
            teacherModal.style.display = 'none';
            teacherForm.reset();
        } catch (error) {
            console.error('Error:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: isEditMode 
                    ? 'Error updating teacher. Please try again.' 
                    : 'Error adding teacher. Please try again.',
                confirmButtonColor: '#3085d6',
            });
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Teacher';
        }
    }

    // Generate new teacher ID (TCXXXX format)
    async function generateNewTeacherId() {
        const snapshot = await teachersRef.orderByKey().once('value');
        let maxNumber = 0;

        snapshot.forEach((childSnapshot) => {
            const teacherId = childSnapshot.key;
            if (teacherId.startsWith('TC')) {
                const numberPart = parseInt(teacherId.slice(2), 10) || 0;
                if (numberPart > maxNumber) {
                    maxNumber = numberPart;
                }
            }
        });
        
        const nextNumber = maxNumber + 1;
        return `TC${nextNumber.toString().padStart(4, '0')}`;
    }

    // Show delete confirmation
    function showDeleteConfirmation(teacherId) {
        currentTeacherId = teacherId;
        const teacher = allTeachers.find(t => t.id === teacherId);
        
        Swal.fire({
            title: 'Delete Teacher',
            html: `Are you sure you want to delete <strong>${teacher.name}</strong> (ID: ${teacherId})?<br><br>This action cannot be undone.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Yes, delete it!',
            cancelButtonText: 'Cancel',
            reverseButtons: true
        }).then((result) => {
            if (result.isConfirmed) {
                deleteTeacher();
            }
        });
    }

    // Delete teacher
    async function deleteTeacher() {
        // Show loading immediately
        Swal.fire({
            title: 'Deleting...',
            html: 'Please wait while we delete the teacher record',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading(),
            backdrop: true
        });

        try {
            // Delete from both teachers and users
            const updates = {};
            updates[`/teachers/${currentTeacherId}`] = null;
            updates[`/users/${currentTeacherId}`] = null;
            
            await db.ref().update(updates);

            // Close current Swal and show success
            Swal.fire({
                icon: 'success',
                title: 'Deleted!',
                text: 'Teacher has been deleted successfully',
                confirmButtonColor: '#3085d6',
                timer: 2000,
                showConfirmButton: false
            });
        } catch (error) {
            console.error('Error deleting teacher:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Error deleting teacher. Please try again.',
                confirmButtonColor: '#3085d6',
            });
        }
    }

    // Show reset password confirmation
    function showResetPasswordConfirmation(teacherId) {
        currentTeacherId = teacherId;
        const teacher = allTeachers.find(t => t.id === teacherId);
        
        Swal.fire({
            title: 'Reset Password',
            html: `Are you sure you want to reset password for <strong>${teacher.name}</strong> (ID: ${teacherId})?<br><br>The new password will be the teacher ID.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Yes, reset it!',
            cancelButtonText: 'Cancel'
        }).then((result) => {
            if (result.isConfirmed) {
                resetPassword(teacherId);
            }
        });
    }

    // Reset password
    async function resetPassword(teacherId) {
        // Show loading immediately
        Swal.fire({
            title: 'Resetting Password...',
            html: 'Please wait while we reset the password',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading(),
            backdrop: true
        });

        try {
            // Update password in users collection
            await usersRef.child(teacherId).update({
                password: teacherId,
                updatedAt: firebase.database.ServerValue.TIMESTAMP
            });

            // Close current Swal and show success
            Swal.fire({
                icon: 'success',
                title: 'Success!',
                text: 'Password has been reset to teacher ID',
                confirmButtonColor: '#3085d6',
                timer: 2000,
                showConfirmButton: false
            });
        } catch (error) {
            console.error('Error resetting password:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Failed to reset password: ' + error.message,
                confirmButtonColor: '#3085d6',
            });
        }
    }

    // Search teachers with real-time filtering
    function searchTeachers() {
        const searchTerm = teacherSearch.value.trim().toLowerCase();
        
        if (searchTerm === '') {
            filteredTeachers = [...allTeachers];
        } else {
            filteredTeachers = allTeachers.filter(teacher => {
                return (
                    (teacher.id && teacher.id.toLowerCase().includes(searchTerm)) ||
                    (teacher.name && teacher.name.toLowerCase().includes(searchTerm)) ||
                    (teacher.email && teacher.email.toLowerCase().includes(searchTerm)) ||
                    (teacher.subjects && teacher.subjects.join(', ').toLowerCase().includes(searchTerm)) ||
                    (teacher.status && formatStatus(teacher.status).toLowerCase().includes(searchTerm))
                );
            });
        }
        
        currentPage = 1;
        renderTable();
    }

    // Initialize the page
    init();
});