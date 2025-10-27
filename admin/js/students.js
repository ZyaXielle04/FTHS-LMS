document.addEventListener('DOMContentLoaded', function() {
    // Firebase Database Reference
    const db = firebase.database();
    const studentsRef = db.ref('students');
    const usersRef = db.ref('users');
    const sectionsRef = db.ref('sections');
    
    // DOM Elements
    const studentsTableBody = document.getElementById('studentsTableBody');
    const studentForm = document.getElementById('studentForm');
    const studentModal = document.getElementById('studentModal');
    const addNewStudentBtn = document.getElementById('addNewStudentBtn');
    const cancelStudentBtn = document.getElementById('cancelStudentBtn');
    const studentSearch = document.getElementById('studentSearch');
    const searchBtn = document.getElementById('searchBtn');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const pageInfo = document.getElementById('pageInfo');
    const studentIdField = document.getElementById('studentId');
    const bulkActionsBtn = document.getElementById('bulkActionsBtn');
    const bulkActionsDropdown = document.getElementById('bulkActionsDropdown');
    const selectAllBtn = document.getElementById('selectAllBtn');
    const clearSelectionBtn = document.getElementById('clearSelectionBtn');
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const sectionDropdown = document.getElementById('section');
    
    // State variables
    let currentPage = 1;
    const recordsPerPage = 10;
    let allStudents = [];
    let filteredStudents = [];
    let allSections = [];
    let currentStudentId = null;
    let isEditMode = false;
    let searchTimeout = null;
    let selectedStudents = new Set();

    // Constants
    const STATUS_MAP = {
        'active': 'Enrolled',
        'inactive': 'Not Enrolled',
        'transferred': 'Transferred',
        'graduated': 'Graduated'
    };

    // Initialize the page
    function init() {
        loadSections();
        loadStudents();
        setupEventListeners();
    }

    // Load sections from Firebase
    function loadSections() {
        sectionsRef.on('value', (snapshot) => {
            allSections = [];
            snapshot.forEach((childSnapshot) => {
                const section = childSnapshot.val();
                section.id = childSnapshot.key;
                allSections.push(section);
            });
            
            // Update section dropdown if modal is open
            if (studentModal.style.display === 'flex') {
                populateSectionDropdown();
            }
        }, (error) => {
            console.error('Error loading sections:', error);
        });
    }

    // Populate section dropdown
    function populateSectionDropdown() {
        sectionDropdown.innerHTML = '<option value="">Select Section</option>';
        
        allSections.forEach(section => {
            const option = document.createElement('option');
            option.value = section.id;
            option.textContent = `${section.sectionName} (${section.batchYear || 'No year'})`;
            sectionDropdown.appendChild(option);
        });
    }

    // Load students from Firebase with error handling
    function loadStudents() {
        showLoadingIndicator('Loading students...');
        
        studentsRef.on('value', (snapshot) => {
            allStudents = [];
            snapshot.forEach((childSnapshot) => {
                const student = childSnapshot.val();
                student.id = childSnapshot.key;
                allStudents.push(student);
            });
            
            filteredStudents = [...allStudents];
            renderTable();
            Swal.close();
        }, (error) => {
            console.error('Error loading students:', error);
            showError('Failed to load students. Please try again.');
        });
    }

    // Render students table with action buttons and checkboxes
    function renderTable() {
        studentsTableBody.innerHTML = '';
        
        if (filteredStudents.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="6" class="no-data">No students found</td>`;
            studentsTableBody.appendChild(row);
            updatePagination();
            updateBulkActionsState();
            return;
        }
        
        const startIndex = (currentPage - 1) * recordsPerPage;
        const endIndex = Math.min(startIndex + recordsPerPage, filteredStudents.length);
        
        for (let i = startIndex; i < endIndex; i++) {
            const student = filteredStudents[i];
            const row = document.createElement('tr');
            const isSelected = selectedStudents.has(student.id);
            
            // Get section name
            let sectionName = 'N/A';
            if (student.sectionId) {
                const section = allSections.find(s => s.id === student.sectionId);
                if (section) {
                    sectionName = `${section.sectionName} (${section.batchYear || ''})`;
                }
            }
            
            row.innerHTML = `
                <td class="checkbox-cell">
                    <input type="checkbox" class="student-checkbox" 
                           data-id="${student.id}" 
                           ${isSelected ? 'checked' : ''}>
                </td>
                <td>${student.id || 'N/A'}</td>
                <td>${formatName(student.lastName, student.firstName)}</td>
                <td>${student.email || 'N/A'}</td>
                <td>${sectionName}</td>
                <td class="actions">
                    <button class="btn-action btn-edit" data-id="${student.id}" title="Edit">
                        <i class="fas fa-pencil-alt"></i>
                    </button>
                    <button class="btn-action btn-view" data-id="${student.id}" title="View">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-action btn-reset" data-id="${student.id}" title="Reset Password">
                        <i class="fas fa-key"></i>
                    </button>
                    <button class="btn-action btn-delete" data-id="${student.id}" title="Delete">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            `;
            
            studentsTableBody.appendChild(row);
        }
        
        updatePagination();
        updateBulkActionsState();
        attachCheckboxEventListeners();
        
        // Update "Select All" checkbox state
        const currentPageStudents = filteredStudents.slice(
            (currentPage - 1) * recordsPerPage,
            currentPage * recordsPerPage
        );
        const allSelected = currentPageStudents.length > 0 && 
                           currentPageStudents.every(s => selectedStudents.has(s.id));
        selectAllCheckbox.checked = allSelected;
    }

    // Helper function to format name
    function formatName(lastName, firstName) {
        if (!lastName && !firstName) return 'N/A';
        return `${lastName || ''}, ${firstName || ''}`.trim();
    }

    // Update pagination controls
    function updatePagination() {
        const totalPages = Math.max(1, Math.ceil(filteredStudents.length / recordsPerPage));
        
        pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
        prevPageBtn.disabled = currentPage === 1;
        nextPageBtn.disabled = currentPage === totalPages;
    }

    // Setup event listeners
    function setupEventListeners() {
        // Add new student button
        addNewStudentBtn.addEventListener('click', showAddStudentModal);

        // Cancel button in modal
        cancelStudentBtn.addEventListener('click', closeStudentModal);

        // Form submission
        studentForm.addEventListener('submit', handleFormSubmit);

        // Search functionality
        studentSearch.addEventListener('input', debounceSearch);
        searchBtn.addEventListener('click', searchStudents);

        // Pagination
        prevPageBtn.addEventListener('click', goToPreviousPage);
        nextPageBtn.addEventListener('click', goToNextPage);

        // Table actions (event delegation)
        studentsTableBody.addEventListener('click', handleTableActions);

        // Bulk actions
        bulkActionsBtn.addEventListener('click', toggleBulkActionsDropdown);
        selectAllBtn.addEventListener('click', selectAllStudents);
        clearSelectionBtn.addEventListener('click', clearSelection);
        selectAllCheckbox.addEventListener('change', handleSelectAllCheckbox);
        
        // Bulk status updates
        document.querySelectorAll('.dropdown-item[data-status]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const status = e.currentTarget.getAttribute('data-status');
                updateBulkStatus(status);
            });
        });

        // Close modal when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target === studentModal) {
                closeStudentModal();
            }
            if (!e.target.closest('.bulk-actions') && bulkActionsDropdown.style.display === 'block') {
                bulkActionsDropdown.style.display = 'none';
            }
        });
    }

    // Toggle bulk actions dropdown
    function toggleBulkActionsDropdown() {
        if (bulkActionsDropdown.style.display === 'block') {
            bulkActionsDropdown.style.display = 'none';
        } else {
            bulkActionsDropdown.style.display = 'block';
        }
    }

    // Handle select all checkbox
    function handleSelectAllCheckbox(e) {
        const currentPageStudents = filteredStudents.slice(
            (currentPage - 1) * recordsPerPage,
            currentPage * recordsPerPage
        );
        
        if (e.target.checked) {
            currentPageStudents.forEach(student => {
                selectedStudents.add(student.id);
            });
        } else {
            currentPageStudents.forEach(student => {
                selectedStudents.delete(student.id);
            });
        }
        
        renderTable();
    }

    // Attach checkbox event listeners
    function attachCheckboxEventListeners() {
        document.querySelectorAll('.student-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const studentId = e.target.getAttribute('data-id');
                if (e.target.checked) {
                    selectedStudents.add(studentId);
                } else {
                    selectedStudents.delete(studentId);
                }
                updateBulkActionsState();
            });
        });
    }

    // Select all students on current page
    function selectAllStudents() {
        const currentPageStudents = filteredStudents.slice(
            (currentPage - 1) * recordsPerPage,
            currentPage * recordsPerPage
        );
        
        currentPageStudents.forEach(student => {
            selectedStudents.add(student.id);
        });
        
        renderTable();
    }

    // Clear selection
    function clearSelection() {
        selectedStudents.clear();
        renderTable();
    }

    // Update bulk actions button state
    function updateBulkActionsState() {
        if (selectedStudents.size > 0) {
            bulkActionsBtn.innerHTML = `<i class="fas fa-tasks"></i> Bulk Actions (${selectedStudents.size})`;
            bulkActionsBtn.classList.add('has-selection');
        } else {
            bulkActionsBtn.innerHTML = `<i class="fas fa-tasks"></i> Bulk Actions`;
            bulkActionsBtn.classList.remove('has-selection');
        }
    }

    // Update status for selected students
    async function updateBulkStatus(status) {
        if (selectedStudents.size === 0) {
            showError('Please select at least one student');
            return;
        }

        const statusText = formatStatus(status);
        const { isConfirmed } = await Swal.fire({
            title: 'Confirm Bulk Update',
            html: `Are you sure you want to update <strong>${selectedStudents.size}</strong> student(s) to status <strong>${statusText}</strong>?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Yes, update them!'
        });

        if (!isConfirmed) return;

        showLoadingIndicator(`Updating ${selectedStudents.size} student(s)...`);

        try {
            const updates = {};
            const now = firebase.database.ServerValue.TIMESTAMP;
            
            selectedStudents.forEach(studentId => {
                updates[`/students/${studentId}/status`] = status;
                updates[`/students/${studentId}/updatedAt`] = now;
            });

            await db.ref().update(updates);
            
            showSuccess(`Updated ${selectedStudents.size} student(s) to ${statusText}`);
            selectedStudents.clear();
            renderTable();
        } catch (error) {
            console.error('Bulk update error:', error);
            showError('Failed to update students. Please try again.');
        }
    }

    // Show add student modal
    async function showAddStudentModal() {
        isEditMode = false;
        currentStudentId = null;
        document.getElementById('modalTitle').textContent = 'Add New Student';
        studentForm.reset();
        populateSectionDropdown();
        
        try {
            const nextId = await generateNewStudentId();
            studentIdField.value = nextId;
            studentIdField.readOnly = true;
            studentIdField.classList.add('read-only-field');
            
            studentModal.style.display = 'flex';
            document.getElementById('firstName').focus();
        } catch (error) {
            console.error('Error generating student ID:', error);
            showError('Failed to generate student ID. Please try again.');
        }
    }

    // Close student modal
    function closeStudentModal() {
        studentModal.style.display = 'none';
        studentIdField.readOnly = false;
        studentIdField.classList.remove('read-only-field');
    }

    // Handle form submission
    async function handleFormSubmit(e) {
        e.preventDefault();
        await saveStudent();
    }

    // Debounce search input
    function debounceSearch() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(searchStudents, 300);
    }

    // Pagination navigation
    function goToPreviousPage() {
        if (currentPage > 1) {
            currentPage--;
            renderTable();
        }
    }

    function goToNextPage() {
        const totalPages = Math.ceil(filteredStudents.length / recordsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderTable();
        }
    }

    // Handle table actions
    function handleTableActions(e) {
        const btn = e.target.closest('.btn-action');
        if (!btn) return;
        
        const studentId = btn.getAttribute('data-id');
        const student = allStudents.find(s => s.id === studentId);
        
        if (!student) {
            showError('Student not found!');
            return;
        }
        
        if (btn.classList.contains('btn-edit')) {
            editStudent(student);
        } else if (btn.classList.contains('btn-view')) {
            viewStudent(student);
        } else if (btn.classList.contains('btn-reset')) {
            showResetPasswordConfirmation(student);
        } else if (btn.classList.contains('btn-delete')) {
            showDeleteConfirmation(student);
        }
    }

    // Edit student
    function editStudent(student) {
        isEditMode = true;
        currentStudentId = student.id;
        document.getElementById('modalTitle').textContent = 'Edit Student';
        populateSectionDropdown();
        
        // Populate form fields
        studentIdField.value = student.id;
        studentIdField.readOnly = true;
        studentIdField.classList.add('read-only-field');
        document.getElementById('firstName').value = student.firstName || '';
        document.getElementById('lastName').value = student.lastName || '';
        document.getElementById('email').value = student.email || '';
        document.getElementById('section').value = student.sectionId || '';
        document.getElementById('status').value = student.status || 'active';
        
        studentModal.style.display = 'flex';
    }

    // View student details
    function viewStudent(student) {
        // Get section details
        let sectionDetails = 'N/A';
        if (student.sectionId) {
            const section = allSections.find(s => s.id === student.sectionId);
            if (section) {
                sectionDetails = `${section.sectionName} (${section.batchYear || 'No year'})`;
            }
        }

        Swal.fire({
            title: 'Student Details',
            html: `
                <div class="student-details" style="text-align: left;">
                    <p><strong>Student ID:</strong> ${student.id}</p>
                    <p><strong>Name:</strong> ${formatName(student.lastName, student.firstName)}</p>
                    <p><strong>Email:</strong> ${student.email || 'N/A'}</p>
                    <p><strong>Section:</strong> ${sectionDetails}</p>
                    <p><strong>Status:</strong> <span class="status-badge ${student.status || 'active'}">${formatStatus(student.status)}</span></p>
                </div>
            `,
            confirmButtonColor: '#3085d6',
            showCloseButton: true
        });
    }

    // Format status for display
    function formatStatus(status) {
        return STATUS_MAP[status] || status;
    }

    // Save student (add or update)
    async function saveStudent() {
        const saveBtn = document.getElementById('saveStudentBtn');
        const originalBtnText = saveBtn.textContent;
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
            const studentData = getFormData();
            
            if (!validateStudentData(studentData)) {
                saveBtn.disabled = false;
                saveBtn.textContent = originalBtnText;
                return;
            }

            showLoadingIndicator('Saving student data...');
            
            const studentId = isEditMode ? currentStudentId : studentIdField.value.trim();
            const userData = createUserData(studentData, studentId);

            // Get the previous student data if in edit mode
            let previousSectionId = null;
            if (isEditMode) {
                const studentSnapshot = await studentsRef.child(studentId).once('value');
                const previousStudentData = studentSnapshot.val();
                previousSectionId = previousStudentData?.sectionId || null;
            }

            // Prepare updates for both students and users
            const updates = {
                [`/students/${studentId}`]: studentData,
                [`/users/${studentId}`]: userData
            };

            // Handle section changes
            const newSectionId = studentData.sectionId;
            
            // If section is selected, add student to new section
            if (newSectionId) {
                updates[`/sections/${newSectionId}/students/${studentId}`] = {
                    name: `${studentData.firstName} ${studentData.lastName}`,
                    email: studentData.email
                };
            }

            // If student was previously in a different section, remove them from old section
            if (isEditMode && previousSectionId && previousSectionId !== newSectionId) {
                updates[`/sections/${previousSectionId}/students/${studentId}`] = null;
            }

            // Perform the update
            await db.ref().update(updates);

            showSuccess(
                isEditMode 
                    ? 'Student updated successfully' 
                    : `Student added successfully with ID: <strong>${studentId}</strong>`
            );
            
            closeStudentModal();
        } catch (error) {
            console.error('Error saving student:', error);
            showError(
                isEditMode 
                    ? 'Error updating student. Please try again.' 
                    : 'Error adding student. Please try again.'
            );
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = originalBtnText;
        }
    }

    // Get form data
    function getFormData() {
        return {
            firstName: document.getElementById('firstName').value.trim(),
            lastName: document.getElementById('lastName').value.trim(),
            email: document.getElementById('email').value.trim(),
            sectionId: document.getElementById('section').value,
            status: document.getElementById('status').value,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        };
    }

    // Validate student data
    function validateStudentData(data) {
        if (!data.firstName || !data.lastName || !data.email || !data.sectionId) {
            showError('Please fill in all required fields');
            return false;
        }

        // Simple email validation
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
            showError('Please enter a valid email address');
            return false;
        }

        return true;
    }

    // Create user data object
    function createUserData(studentData, studentId) {
        return {
            email: studentData.email,
            password: studentId, // Use student ID as default password
            role: 'student',
            updatedAt: firebase.database.ServerValue.TIMESTAMP,
            ...(!isEditMode && { createdAt: firebase.database.ServerValue.TIMESTAMP })
        };
    }

    // Generate new student ID (XXXXYYYYY format)
    async function generateNewStudentId() {
        const currentYear = new Date().getFullYear().toString();
        const yearStudentsRef = studentsRef.orderByKey().startAt(currentYear).endAt(currentYear + '\uf8ff');
        
        const snapshot = await yearStudentsRef.once('value');
        let maxNumber = 0;

        snapshot.forEach((childSnapshot) => {
            const studentId = childSnapshot.key;
            if (studentId.startsWith(currentYear)) {
                const numberPart = parseInt(studentId.slice(4), 10) || 0;
                maxNumber = Math.max(maxNumber, numberPart);
            }
        });
        
        const nextNumber = maxNumber + 1;
        return `${currentYear}${nextNumber.toString().padStart(5, '0')}`;
    }

    // Show delete confirmation
    function showDeleteConfirmation(student) {
        Swal.fire({
            title: 'Delete Student',
            html: `Are you sure you want to delete <strong>${student.firstName} ${student.lastName}</strong> (ID: ${student.id})?<br><br>This action cannot be undone.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Yes, delete it!',
            cancelButtonText: 'Cancel',
            reverseButtons: true
        }).then((result) => {
            if (result.isConfirmed) {
                deleteStudent(student.id);
            }
        });
    }

    // Delete student
    async function deleteStudent(studentId) {
        showLoadingIndicator('Deleting student record...');
        
        try {
            // Get student data to check if they're in a section
            const studentSnapshot = await studentsRef.child(studentId).once('value');
            const student = studentSnapshot.val();
            
            // Prepare updates
            const updates = {
                [`/students/${studentId}`]: null,
                [`/users/${studentId}`]: null
            };
            
            // If student was in a section, remove them
            if (student && student.sectionId) {
                updates[`/sections/${student.sectionId}/students/${studentId}`] = null;
            }
            
            await db.ref().update(updates);
            showSuccess('Student has been deleted successfully');
        } catch (error) {
            console.error('Error deleting student:', error);
            showError('Error deleting student. Please try again.');
        }
    }

    // Show reset password confirmation
    function showResetPasswordConfirmation(student) {
        Swal.fire({
            title: 'Reset Password',
            html: `Are you sure you want to reset password for <strong>${student.firstName} ${student.lastName}</strong> (ID: ${student.id})?<br><br>The new password will be the student ID.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Yes, reset it!',
            cancelButtonText: 'Cancel'
        }).then((result) => {
            if (result.isConfirmed) {
                resetPassword(student.id);
            }
        });
    }

    // Reset password
    async function resetPassword(studentId) {
        showLoadingIndicator('Resetting password...');
        
        try {
            await usersRef.child(studentId).update({
                password: studentId,
                updatedAt: firebase.database.ServerValue.TIMESTAMP
            });

            showSuccess('Password has been reset to student ID');
        } catch (error) {
            console.error('Error resetting password:', error);
            showError('Failed to reset password: ' + error.message);
        }
    }

    // Search students
    function searchStudents() {
        const searchTerm = studentSearch.value.trim().toLowerCase();
        
        if (searchTerm === '') {
            filteredStudents = [...allStudents];
        } else {
            filteredStudents = allStudents.filter(student => {
                // Get section name for search
                let sectionName = '';
                if (student.sectionId) {
                    const section = allSections.find(s => s.id === student.sectionId);
                    if (section) {
                        sectionName = `${section.sectionName} ${section.batchYear || ''}`.toLowerCase();
                    }
                }

                return (
                    (student.id && student.id.toLowerCase().includes(searchTerm)) ||
                    (student.firstName && student.firstName.toLowerCase().includes(searchTerm)) ||
                    (student.lastName && student.lastName.toLowerCase().includes(searchTerm)) ||
                    (student.email && student.email.toLowerCase().includes(searchTerm)) ||
                    sectionName.includes(searchTerm) ||
                    (student.status && formatStatus(student.status).toLowerCase().includes(searchTerm))
                );
            });
        }
        
        currentPage = 1;
        renderTable();
    }

    // Helper functions for notifications
    function showLoadingIndicator(message) {
        Swal.fire({
            title: 'Please wait...',
            html: message,
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading(),
            backdrop: true
        });
    }

    function showSuccess(message) {
        Swal.fire({
            icon: 'success',
            title: 'Success!',
            html: message,
            confirmButtonColor: '#3085d6',
            timer: 2000,
            showConfirmButton: false
        });
    }

    function showError(message) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: message,
            confirmButtonColor: '#3085d6'
        });
    }

    // Initialize the page
    init();
});