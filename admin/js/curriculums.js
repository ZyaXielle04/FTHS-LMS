document.addEventListener('DOMContentLoaded', function() {
    // Firebase initialization
    const database = firebase.database();
    
    // DOM Elements
    const addNewCurriculumBtn = document.getElementById('addNewCurriculumBtn');
    const curriculumModal = document.getElementById('curriculumModal');
    const cancelCurriculumBtn = document.getElementById('cancelCurriculumBtn');
    const curriculumForm = document.getElementById('curriculumForm');
    const curriculumIdInput = document.getElementById('curriculumId');
    const gradeLevelSelect = document.getElementById('gradeLevel');
    const strandSelect = document.getElementById('strand');
    const statusSelect = document.getElementById('status');
    const subjectsContainer = document.getElementById('subjectsContainer');
    const addSubjectBtn = document.getElementById('addSubjectBtn');
    const curriculumsTableBody = document.getElementById('curriculumsTableBody');
    
    // Variables
    let subjectsList = [];
    let currentCurriculumId = null;
    let isEditMode = false;
    
    // Initialize the page
    init();
    
    function init() {
        loadSubjects();
        loadCurriculums();
        setupEventListeners();
        setupSectionChangeListener();
        setupCurriculumChangeListener();
    }
    
    function setupEventListeners() {
        addNewCurriculumBtn.addEventListener('click', openAddCurriculumModal);
        cancelCurriculumBtn.addEventListener('click', closeCurriculumModal);
        curriculumForm.addEventListener('submit', handleCurriculumSubmit);
        addSubjectBtn.addEventListener('click', addSubjectField);
    }
    
    function openAddCurriculumModal() {
        isEditMode = false;
        document.getElementById('modalTitle').textContent = 'Add New Curriculum';
        curriculumForm.reset();
        curriculumIdInput.value = generateCurriculumId();
        subjectsContainer.innerHTML = '';
        currentCurriculumId = null;
        curriculumModal.style.display = 'flex';
    }
    
    function openEditCurriculumModal(curriculumId, curriculumData) {
        isEditMode = true;
        document.getElementById('modalTitle').textContent = 'Edit Curriculum';
        curriculumForm.reset();
        curriculumIdInput.value = curriculumId;
        currentCurriculumId = curriculumId;
        
        gradeLevelSelect.value = curriculumData.gradeLevel;
        strandSelect.value = curriculumData.strand;
        statusSelect.value = curriculumData.status;
        
        subjectsContainer.innerHTML = '';
        if (curriculumData.subjects && curriculumData.subjects.length > 0) {
            curriculumData.subjects.forEach(subjectId => {
                addSubjectField(subjectId);
            });
        }
        
        curriculumModal.style.display = 'flex';
    }
    
    function closeCurriculumModal() {
        curriculumModal.style.display = 'none';
    }
    
    function generateCurriculumId() {
        const timestamp = new Date().getTime().toString().slice(-4);
        const randomChars = Math.random().toString(36).substr(2, 4).toUpperCase();
        return `CURR-${timestamp}-${randomChars}`;
    }
    
    function loadSubjects() {
        database.ref('subjects').orderByChild('status').equalTo('active').once('value')
            .then(snapshot => {
                subjectsList = [];
                snapshot.forEach(childSnapshot => {
                    const subject = childSnapshot.val();
                    subject.id = childSnapshot.key;
                    subjectsList.push(subject);
                });
            })
            .catch(error => {
                console.error("Error loading subjects:", error);
                Swal.fire('Error', 'Failed to load subjects.', 'error');
            });
    }
    
    function loadCurriculums() {
        database.ref('curriculums').once('value')
            .then(snapshot => {
                curriculumsTableBody.innerHTML = '';
                snapshot.forEach(childSnapshot => {
                    const curriculum = childSnapshot.val();
                    curriculum.id = childSnapshot.key;
                    addCurriculumToTable(curriculum);
                });
            })
            .catch(error => {
                console.error("Error loading curriculums:", error);
                Swal.fire('Error', 'Failed to load curriculums.', 'error');
            });
    }
    
    function addCurriculumToTable(curriculum) {
        const row = document.createElement('tr');
        
        const subjectCount = curriculum.subjects ? curriculum.subjects.length : 0;
        
        const statusBadge = document.createElement('span');
        statusBadge.className = `status-badge status-${curriculum.status}`;
        statusBadge.textContent = curriculum.status === 'active' ? 'Active' : 'Inactive';
        
        row.innerHTML = `
            <td>${curriculum.id}</td>
            <td>Grade ${curriculum.gradeLevel}</td>
            <td>${curriculum.strand}</td>
            <td>${subjectCount}</td>
            <td>${statusBadge.outerHTML}</td>
            <td>
                <button class="btn-action edit-btn" data-id="${curriculum.id}">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-action delete-btn" data-id="${curriculum.id}">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        `;
        
        row.querySelector('.edit-btn').addEventListener('click', () => {
            openEditCurriculumModal(curriculum.id, curriculum);
        });
        
        row.querySelector('.delete-btn').addEventListener('click', () => {
            deleteCurriculum(curriculum.id);
        });
        
        curriculumsTableBody.appendChild(row);
    }
    
    function addSubjectField(selectedSubjectId = '') {
        if (subjectsList.length === 0) {
            Swal.fire('Info', 'No active subjects available.', 'info');
            return;
        }
        
        const subjectItem = document.createElement('div');
        subjectItem.className = 'subject-item';
        
        const subjectSelect = document.createElement('select');
        subjectSelect.required = true;
        
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select Subject';
        subjectSelect.appendChild(defaultOption);
        
        subjectsList.forEach(subject => {
            const option = document.createElement('option');
            option.value = subject.id;
            option.textContent = subject.subjectName;
            option.selected = subject.id === selectedSubjectId;
            subjectSelect.appendChild(option);
        });
        
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.innerHTML = '<i class="fas fa-times"></i>';
        removeBtn.addEventListener('click', () => {
            subjectItem.remove();
        });
        
        subjectItem.appendChild(subjectSelect);
        subjectItem.appendChild(removeBtn);
        subjectsContainer.appendChild(subjectItem);
    }
    
    function handleCurriculumSubmit(e) {
        e.preventDefault();
        
        const subjectSelects = subjectsContainer.querySelectorAll('select');
        const selectedSubjects = Array.from(subjectSelects)
            .map(select => select.value)
            .filter(value => value !== '');
        
        if (selectedSubjects.length === 0) {
            Swal.fire('Warning', 'Please add at least one subject.', 'warning');
            return;
        }
        
        const curriculumData = {
            gradeLevel: gradeLevelSelect.value,
            strand: strandSelect.value,
            subjects: selectedSubjects,
            status: statusSelect.value,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        };
        
        if (!isEditMode) {
            curriculumData.createdAt = firebase.database.ServerValue.TIMESTAMP;
        }
        
        const curriculumId = curriculumIdInput.value;
        const curriculumRef = database.ref(`curriculums/${curriculumId}`);
        
        curriculumRef.set(curriculumData)
            .then(() => {
                updateSectionsWithCurriculum(
                    curriculumId, 
                    curriculumData.gradeLevel, 
                    curriculumData.strand
                );
                
                Swal.fire('Success', `Curriculum ${isEditMode ? 'updated' : 'added'} successfully!`, 'success');
                closeCurriculumModal();
                loadCurriculums();
            })
            .catch(error => {
                console.error("Error saving curriculum:", error);
                Swal.fire('Error', `Failed to ${isEditMode ? 'update' : 'add'} curriculum.`, 'error');
            });
    }

    function updateSectionsWithCurriculum(curriculumId, gradeLevel, strand) {
        database.ref('sections')
            .orderByChild('gradeLevel')
            .equalTo(gradeLevel)
            .once('value')
            .then(snapshot => {
                const updates = {};
                
                snapshot.forEach(sectionSnapshot => {
                    const sectionData = sectionSnapshot.val();
                    const sectionId = sectionSnapshot.key;
                    
                    // Only process active sections
                    if (sectionData.status !== 'active') {
                        return;
                    }
                    
                    // Check if strand matches
                    if (sectionData.strand === strand) {
                        // Only assign if section doesn't already have a curriculum
                        if (!sectionData.curriculum) {
                            updates[`sections/${sectionId}/curriculum`] = curriculumId;
                        }
                    } else if (sectionData.curriculum === curriculumId) {
                        // Only remove if section is active
                        if (sectionData.status === 'active') {
                            updates[`sections/${sectionId}/curriculum`] = null;
                        }
                    }
                });
                
                if (Object.keys(updates).length > 0) {
                    return database.ref().update(updates);
                }
                return Promise.resolve();
            })
            .then(() => {
                console.log(`Updated sections for curriculum ${curriculumId}`);
            })
            .catch(error => {
                console.error("Error updating sections:", error);
            });
    }
    
    function setupSectionChangeListener() {
        database.ref('sections').on('child_changed', (snapshot) => {
            const sectionId = snapshot.key;
            const sectionData = snapshot.val();
            const { gradeLevel, strand, curriculum: currentCurriculumId, status } = sectionData;

            // Only process active sections
            if (status !== 'active') {
                return;
            }

            if (currentCurriculumId) {
                // Verify if curriculum still matches
                database.ref(`curriculums/${currentCurriculumId}`).once('value')
                    .then((curriculumSnapshot) => {
                        const curriculumData = curriculumSnapshot.val();
                        if (!curriculumData || curriculumData.gradeLevel !== gradeLevel || curriculumData.strand !== strand) {
                            // Curriculum no longer matches - remove it
                            database.ref(`sections/${sectionId}/curriculum`).remove();
                        }
                    });
            } else {
                // Find matching curriculum
                database.ref('curriculums')
                    .orderByChild('gradeLevel')
                    .equalTo(gradeLevel)
                    .once('value')
                    .then((snapshot) => {
                        snapshot.forEach((curriculumSnapshot) => {
                            const curriculumData = curriculumSnapshot.val();
                            if (curriculumData.strand === strand) {
                                // Assign matching curriculum
                                database.ref(`sections/${sectionId}/curriculum`).set(curriculumSnapshot.key);
                            }
                        });
                    });
            }
        });
    }
    
    function setupCurriculumChangeListener() {
        database.ref('curriculums').on('child_changed', (snapshot) => {
            const curriculumId = snapshot.key;
            const { gradeLevel, strand } = snapshot.val();
            updateSectionsWithCurriculum(curriculumId, gradeLevel, strand);
        });
    }
    
    function deleteCurriculum(curriculumId) {
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
                database.ref('sections').orderByChild('curriculum').equalTo(curriculumId).once('value')
                    .then((snapshot) => {
                        const updates = {};
                        snapshot.forEach((sectionSnapshot) => {
                            updates[`sections/${sectionSnapshot.key}/curriculum`] = null;
                        });
                        
                        if (Object.keys(updates).length > 0) {
                            return database.ref().update(updates);
                        }
                        return Promise.resolve();
                    })
                    .then(() => {
                        return database.ref(`curriculums/${curriculumId}`).remove();
                    })
                    .then(() => {
                        Swal.fire('Deleted!', 'The curriculum has been deleted.', 'success');
                        loadCurriculums();
                    })
                    .catch(error => {
                        console.error("Error deleting curriculum:", error);
                        Swal.fire('Error', 'Failed to delete curriculum.', 'error');
                    });
            }
        });
    }
});