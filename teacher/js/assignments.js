// Initialize Firebase
const db = firebase.database();

// DOM Elements
const assignmentsList = document.getElementById('assignmentsList');
const addHomeworkBtn = document.getElementById('addHomeworkBtn');
const addQuizBtn = document.getElementById('addQuizBtn');
const addExamBtn = document.getElementById('addExamBtn');
const assignmentModal = document.getElementById('assignmentModal');
const quizItemModal = document.getElementById('quizItemModal');
const assignmentForm = document.getElementById('assignmentForm');
const quizItemForm = document.getElementById('quizItemForm');
const closeModalBtns = document.querySelectorAll('.close-modal');
const cancelAssignmentBtn = document.getElementById('cancelAssignment');
const cancelQuizItemBtn = document.getElementById('cancelQuizItem');
const addQuizItemBtn = document.getElementById('addQuizItem');
const quizItemsList = document.getElementById('quizItemsList');
const itemTypeSelect = document.getElementById('itemType');
const mcqOptionsContainer = document.getElementById('mcqOptionsContainer');
const trueFalseContainer = document.getElementById('trueFalseContainer');
const addMcqOptionBtn = document.getElementById('addMcqOption');
const mcqOptionsList = document.getElementById('mcqOptionsList');
const correctAnswerOptions = document.getElementById('correctAnswerOptions');

// Global variables
let currentTeacherId = '';
let currentAssignmentType = '';
let quizItems = [];
let editingQuizItemIndex = null;
let editingAssignmentId = null;
let classKey = '';

// Initialize the page
document.addEventListener('DOMContentLoaded', initializePage);

function initializePage() {
    try {
        // 1. AUTHENTICATION CHECK
        const authUser = JSON.parse(localStorage.getItem('authUser')) || 
                         JSON.parse(sessionStorage.getItem('authUser'));
        
        if (!authUser || authUser.role !== 'teacher') {
            window.location.href = '../../index.html';
            return;
        }

        currentTeacherId = authUser.id;
        
        // 2. GET URL PARAMETERS
        const urlParams = new URLSearchParams(window.location.search);
        classKey = urlParams.get('class');
        
        if (!classKey) {
            window.location.href = 'classes.html';
            return;
        }

        // 3. INITIALIZE PAGE COMPONENTS
        setupEventListeners();
        loadAssignments();

    } catch (error) {
        console.error('Initialization error:', error);
        Swal.fire({
            title: 'Initialization Error',
            text: 'Failed to initialize the page. Please try again.',
            icon: 'error'
        }).then(() => window.location.reload());
    }
}

function setupEventListeners() {
    try {
        // Assignment type buttons
        addHomeworkBtn?.addEventListener('click', () => openAssignmentModal('homework'));
        addQuizBtn?.addEventListener('click', () => openAssignmentModal('quiz'));
        addExamBtn?.addEventListener('click', () => openAssignmentModal('exam'));

        // Modal close buttons
        closeModalBtns.forEach(btn => {
            btn.addEventListener('click', closeAllModals);
        });

        cancelAssignmentBtn?.addEventListener('click', closeAllModals);
        cancelQuizItemBtn?.addEventListener('click', () => {
            quizItemModal.style.display = 'none';
        });

        // Form submissions
        assignmentForm?.addEventListener('submit', handleAssignmentSubmit);
        quizItemForm?.addEventListener('submit', handleQuizItemSubmit);

        // Add quiz item button
        addQuizItemBtn?.addEventListener('click', () => {
            editingQuizItemIndex = null;
            quizItemModal.style.display = 'block';
            quizItemForm.reset();
            handleItemTypeChange();
        });

        // Question type handling
        itemTypeSelect?.addEventListener('change', handleItemTypeChange);
        addMcqOptionBtn?.addEventListener('click', () => addMcqOption());

        // Click outside modal to close
        window.addEventListener('click', (e) => {
            if (e.target === assignmentModal) closeAllModals();
            if (e.target === quizItemModal) quizItemModal.style.display = 'none';
        });

    } catch (error) {
        console.error('Error setting up event listeners:', error);
        Swal.fire('Error', 'Failed to initialize page functionality', 'error');
    }
}

async function createAssignmentWithStudentAnswers(assignmentData) {
    try {
        // 1. Get the list of students in the class
        const studentsSnapshot = await db.ref(`classes/${classKey}/students`).once('value');
        const students = studentsSnapshot.val() || {};
        const studentIds = Object.keys(students);

        // 2. Create the base assignment data
        const assignmentRef = db.ref(`classes/${classKey}/assignments`).push();
        const assignmentId = assignmentRef.key;

        // 3. Initialize studentAnswers with all students as pending
        const studentAnswers = {};
        studentIds.forEach(studentId => {
            studentAnswers[studentId] = {
                status: 'pending',
                createdAt: firebase.database.ServerValue.TIMESTAMP
            };
        });

        // 4. Prepare the complete assignment data with proper linkedResource handling
        const completeAssignmentData = {
            ...assignmentData,
            studentAnswers,
            assignmentId,
            createdAt: firebase.database.ServerValue.TIMESTAMP
        };

        // Ensure linkedResource properties are properly set (not undefined)
        if (completeAssignmentData.linkedResource) {
            completeAssignmentData.linkedResource = {
                id: completeAssignmentData.linkedResource.id || null,
                title: completeAssignmentData.linkedResource.title || null,
                type: completeAssignmentData.linkedResource.type || null,
                downloadUrl: completeAssignmentData.linkedResource.downloadUrl || null,
                filePath: completeAssignmentData.linkedResource.filePath || null
            };
        }

        // 5. Save to both paths (class-specific and global)
        await Promise.all([
            assignmentRef.set(completeAssignmentData),
            db.ref(`assignments/${assignmentId}`).set({
                ...assignmentData,
                classId: classKey,
                assignmentId,
                createdAt: firebase.database.ServerValue.TIMESTAMP
            })
        ]);

        return assignmentId;
    } catch (error) {
        console.error('Error creating assignment:', error);
        throw error;
    }
}

async function saveAssignmentData(assignmentData) {
    try {
        if (editingAssignmentId) {
            return saveExistingAssignment(assignmentData);
        }
        
        const assignmentId = await createAssignmentWithStudentAnswers(assignmentData);
        
        Swal.fire(
            'Success!',
            `Assignment created successfully with ${Object.keys(assignmentData.studentAnswers || {}).length} students initialized.`,
            'success'
        );
        
        closeAllModals();
        return assignmentId;
    } catch (error) {
        console.error('Error saving assignment:', error);
        Swal.fire('Error', 'Failed to save assignment', 'error');
        throw error;
    }
}

async function saveExistingAssignment(assignmentData) {
    const assignmentRef = db.ref(`classes/${classKey}/assignments/${editingAssignmentId}`);
    
    const existingAssignment = await assignmentRef.once('value');
    const existingData = existingAssignment.val();
    
    if (existingData?.studentAnswers) {
        assignmentData.studentAnswers = existingData.studentAnswers;
    }
    
    // Preserve the complete linkedResource object if it exists and we're not changing it
    if (existingData?.linkedResource && !assignmentData.linkedResource) {
        assignmentData.linkedResource = existingData.linkedResource;
    }
    
    // Ensure linkedResource has all required properties if it exists
    if (assignmentData.linkedResource) {
        assignmentData.linkedResource = {
            id: assignmentData.linkedResource.id || existingData?.linkedResource?.id || null,
            title: assignmentData.linkedResource.title || existingData?.linkedResource?.title || null,
            type: assignmentData.linkedResource.type || existingData?.linkedResource?.type || null,
            downloadUrl: assignmentData.linkedResource.downloadUrl || existingData?.linkedResource?.downloadUrl || null,
            filePath: assignmentData.linkedResource.filePath || existingData?.linkedResource?.filePath || null
        };
    }
    
    // Clean the object to remove any undefined values before saving to Firebase
    const cleanedData = cleanObjectForFirebase(assignmentData);
    
    await assignmentRef.update(cleanedData);
    await db.ref(`assignments/${editingAssignmentId}`).update(cleanedData);
    
    Swal.fire('Success', 'Assignment updated successfully', 'success');
    closeAllModals();
}

function loadAssignments() {
    try {
        showLoadingState();
        
        const assignmentsRef = db.ref(`classes/${classKey}/assignments`);
        
        assignmentsRef.on('value', snapshot => {
            const assignments = snapshot.val();
            
            if (!assignments || Object.keys(assignments).length === 0) {
                showEmptyState();
                return;
            }
            
            renderAssignments(assignments);
        }, error => {
            console.error('Error loading assignments:', error);
            showErrorState('Failed to load assignments');
        });

    } catch (error) {
        console.error('Error in loadAssignments:', error);
        showErrorState('Error loading assignments');
    }
}

function showLoadingState() {
    assignmentsList.innerHTML = `
        <div class="loading-state">
            <i class="fas fa-spinner fa-spin"></i> Loading assignments...
        </div>
    `;
}

function showEmptyState() {
    assignmentsList.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-tasks"></i>
            <h3>No Assignments Yet</h3>
            <p>Create your first assignment by clicking the buttons above</p>
        </div>
    `;
}

function showErrorState(message = 'An error occurred') {
    assignmentsList.innerHTML = `
        <div class="error-state">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>${message}</h3>
            <button class="btn btn-primary" onclick="loadAssignments()">
                <i class="fas fa-sync-alt"></i> Try Again
            </button>
        </div>
    `;
}

function renderAssignments(assignments) {
    assignmentsList.innerHTML = '';
    
    Object.entries(assignments).forEach(([id, assignment]) => {
        try {
            createAssignmentCard(id, assignment);
        } catch (error) {
            console.error(`Error rendering assignment ${id}:`, error);
        }
    });
}

function createAssignmentCard(id, assignment) {
    const dueDate = new Date(assignment.dueDate);
    const formattedDate = dueDate.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    const card = document.createElement('div');
    card.className = 'assignment-card';
    card.dataset.id = id;

    // Check if there's a linked resource
    const linkedResourceHTML = assignment.linkedResourceId ? `
        <div class="linked-resource">
            <i class="fas fa-link"></i>
            <span>Linked to: ${assignment.linkedResource?.title || 'Resource'}</span>
        </div>
    ` : '';

    card.innerHTML = `
        <div class="assignment-card-header">
            <h3 class="assignment-title">${assignment.title}</h3>
            ${getTypeBadge(assignment.type)}
        </div>
        <div class="assignment-due-date">
            <i class="fas fa-calendar-alt"></i>
            Due: ${formattedDate}
        </div>
        ${linkedResourceHTML}
        <div class="assignment-description">${assignment.description || 'No description provided'}</div>
        <div class="assignment-meta">
            <div class="assignment-points">${assignment.points} Points</div>
            <div class="assignment-actions">
                <button class="btn btn-sm btn-view-assignment" data-id="${id}" title="View Assignment">
                    <i class="fas fa-eye"></i> View
                </button>
                <button class="btn btn-sm btn-edit-assignment" data-id="${id}" title="Edit Assignment">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button class="btn btn-sm btn-grade-assignment" data-id="${id}" title="Grade Submissions">
                    <i class="fas fa-check-circle"></i> Grade
                </button>
                <button class="btn btn-sm btn-share-assignment" data-id="${id}" title="Share Assignment">
                    <i class="fas fa-share-alt"></i> Share
                </button>
                <button class="btn btn-sm btn-delete-assignment" data-id="${id}" title="Delete Assignment">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
        </div>
    `;

    assignmentsList.appendChild(card);

    // Add event listeners
    card.querySelector('.btn-view-assignment')?.addEventListener('click', () => viewAssignment(id, assignment));
    card.querySelector('.btn-edit-assignment')?.addEventListener('click', () => editAssignment(id, assignment));
    card.querySelector('.btn-grade-assignment')?.addEventListener('click', () => gradeAssignment(id, assignment));
    card.querySelector('.btn-share-assignment')?.addEventListener('click', () => shareAssignment(id, assignment));
    card.querySelector('.btn-delete-assignment')?.addEventListener('click', () => deleteAssignment(id));
}

async function gradeAssignment(assignmentId, assignment) {
    try {
        showLoadingState('Loading submissions...');
        
        // Get all student submissions
        const submissionsRef = db.ref(`classes/${classKey}/assignments/${assignmentId}/studentAnswers`);
        const snapshot = await submissionsRef.once('value');
        const submissions = snapshot.val() || {};
        
        if (Object.keys(submissions).length === 0) {
            showEmptyState('No submissions yet');
            return;
        }
        
        // Get student details
        const students = await getClassStudents();
        
        // Prepare submissions data with student names
        const submissionsData = Object.entries(submissions).map(([studentId, submission]) => {
            const student = students[studentId] || {};
            return {
                studentId,
                studentName: student.name || 'Unknown Student',
                status: submission.status || 'pending',
                submission: submission.answers || null,
                grade: submission.grade || null,
                feedback: submission.feedback || null,
                submittedAt: submission.submittedAt || null
            };
        });
        
        // Show grading modal
        showGradingModal(assignment, submissionsData);
        
    } catch (error) {
        console.error('Error loading submissions:', error);
        showErrorState('Failed to load submissions');
    }
}

async function getClassStudents() {
    const studentsRef = db.ref(`classes/${classKey}/students`);
    const snapshot = await studentsRef.once('value');
    return snapshot.val() || {};
}

function showGradingModal(assignment, submissions) {
    const modalContent = `
        <div class="grading-container">
            <h3>Grade Submissions: ${assignment.title}</h3>
            <div class="submission-filters">
                <button class="filter-btn active" data-filter="all">All</button>
                <button class="filter-btn" data-filter="pending">Pending</button>
                <button class="filter-btn" data-filter="submitted">Submitted</button>
                <button class="filter-btn" data-filter="graded">Graded</button>
            </div>
            <div class="submissions-list">
                ${submissions.map(sub => `
                    <div class="submission-item ${sub.status}" data-student-id="${sub.studentId}">
                        <div class="student-info">
                            <span class="student-name">${sub.studentName}</span>
                            <span class="status-badge ${sub.status}">${sub.status}</span>
                            ${sub.submittedAt ? `
                                <span class="submission-date">
                                    Submitted: ${new Date(sub.submittedAt).toLocaleString()}
                                </span>
                            ` : ''}
                        </div>
                        <div class="submission-actions">
                            ${sub.status === 'submitted' ? `
                                <button class="btn btn-grade" data-student-id="${sub.studentId}">
                                    <i class="fas fa-check"></i> Grade
                                </button>
                            ` : ''}
                            ${sub.status === 'graded' ? `
                                <span class="grade">Grade: ${sub.grade}/${assignment.points}</span>
                                <button class="btn btn-edit-grade" data-student-id="${sub.studentId}">
                                    <i class="fas fa-edit"></i> Edit
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    Swal.fire({
        title: 'Grade Submissions',
        html: modalContent,
        width: '800px',
        showConfirmButton: false,
        showCloseButton: true,
        didOpen: () => {
            // Setup filter buttons
            document.querySelectorAll('.filter-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const filter = e.target.dataset.filter;
                    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                    e.target.classList.add('active');
                    
                    document.querySelectorAll('.submission-item').forEach(item => {
                        const shouldShow = filter === 'all' || item.classList.contains(filter);
                        item.style.display = shouldShow ? 'flex' : 'none';
                    });
                });
            });
            
            // Add event listeners for grade buttons
            document.querySelectorAll('.btn-grade').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const studentId = e.target.closest('.btn-grade').dataset.studentId;
                    const submission = submissions.find(s => s.studentId === studentId);
                    showGradeForm(assignment, submission);
                });
            });
            
            // Add event listeners for edit grade buttons
            document.querySelectorAll('.btn-edit-grade').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const studentId = e.target.closest('.btn-edit-grade').dataset.studentId;
                    const submission = submissions.find(s => s.studentId === studentId);
                    showGradeForm(assignment, submission);
                });
            });
        }
    });
}

function showGradeForm(assignment, submission) {
    const isGraded = submission.status === 'graded';
    const needsTeacherGrading = submission.needsTeacherGrading !== false; // Default to true if undefined
    
    let formContent = `
        <div class="grade-form">
            <h4>Student: ${submission.studentName}</h4>
            <div class="form-group">
                <label>Grade (max ${assignment.points} points)</label>
                <input type="number" id="gradeScore" class="form-control" 
                       min="0" max="${assignment.points}" step="0.5"
                       value="${isGraded ? submission.grade : ''}"
                       ${needsTeacherGrading ? '' : 'disabled'}>
            </div>
            <div class="form-group">
                <label>Feedback</label>
                <textarea id="gradeFeedback" class="form-control" rows="4" 
                          ${needsTeacherGrading ? '' : 'disabled'}>${isGraded ? submission.feedback : ''}</textarea>
            </div>
    `;

    // Add question-by-question grading if this is a quiz/exam with questions
    if (assignment.questions && submission.submission) {
        formContent += `
            <div class="question-by-question">
                <h5>Question-by-Question Grading</h5>
                ${assignment.questions.map((q, i) => {
                    const studentAnswer = submission.submission[i];
                    const pointsEarned = studentAnswer?.points || 0;
                    const isAutoGraded = studentAnswer?.needsTeacherGrading === false;
                    
                    return `
                        <div class="question-grade">
                            <div class="question-text">
                                <strong>Q${i+1}:</strong> ${q.question}
                                ${studentAnswer?.answer ? `
                                    <div class="student-answer">
                                        <strong>Answer:</strong> ${formatStudentAnswer(q, studentAnswer)}
                                        ${isAutoGraded ? '<span class="auto-grade-badge">Auto-graded</span>' : ''}
                                    </div>
                                ` : ''}
                            </div>
                            <div class="question-points">
                                <span>Max: ${q.points} pts</span>
                                <input type="number" class="question-grade" 
                                       data-question-index="${i}"
                                       min="0" max="${q.points}" step="0.5"
                                       value="${pointsEarned}"
                                       ${isAutoGraded ? 'disabled' : ''}>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    formContent += `</div>`;
    
    Swal.fire({
        title: 'Grade Submission',
        html: formContent,
        width: '700px',
        showCancelButton: true,
        confirmButtonText: needsTeacherGrading ? 'Save Grade' : 'Close',
        showLoaderOnConfirm: true,
        didOpen: () => {
            // Add real-time grade calculation
            if (assignment.questions && submission.submission) {
                const gradeScoreInput = document.getElementById('gradeScore');
                const questionGradeInputs = document.querySelectorAll('.question-grade');
                
                // Function to calculate and update total grade
                const updateTotalGrade = () => {
                    let total = 0;
                    questionGradeInputs.forEach(input => {
                        if (input) {
                            const value = parseFloat(input.value) || 0;
                            total += value;
                        }
                    });
                    gradeScoreInput.value = total.toFixed(1);
                };
                
                // Add event listeners to all question-grade inputs
                questionGradeInputs.forEach(input => {
                    input.addEventListener('input', updateTotalGrade);
                });
                
                // Initial calculation
                updateTotalGrade();
            }
        },
        preConfirm: () => {
            return needsTeacherGrading ? saveGrade(assignment, submission) : Promise.resolve();
        }
    });
}

function formatStudentAnswer(question, studentAnswer) {
    switch(question.type) {
        case 'mcq_single':
            return question.options?.[studentAnswer.answer] || studentAnswer.answer;
        case 'mcq_multiple':
            if (Array.isArray(studentAnswer.answer)) {
                return studentAnswer.answer.map(a => question.options?.[a] || a).join(', ');
            }
            return studentAnswer.answer;
        case 'true_false':
            return studentAnswer.answer === 'true' ? 'True' : 'False';
        case 'enumeration':
            return studentAnswer.answer;
        default:
            return studentAnswer.answer;
    }
}

async function saveGrade(assignment, submission) {
    try {
        const grade = parseFloat(document.getElementById('gradeScore').value);
        const feedback = document.getElementById('gradeFeedback').value;
        
        if (isNaN(grade)) {
            Swal.showValidationMessage('Please enter a valid grade');
            return false;
        }
        
        if (grade > assignment.points) {
            Swal.showValidationMessage(`Grade cannot exceed ${assignment.points} points`);
            return false;
        }
        
        // Prepare updates object
        const updates = {
            status: 'graded',
            grade: grade,
            feedback: feedback,
            gradedAt: firebase.database.ServerValue.TIMESTAMP
        };
        
        // Handle question-by-question grades if applicable
        if (assignment.questions) {
            // Create a new answers object with updated points
            const updatedAnswers = [...submission.submission];
            
            assignment.questions.forEach((q, i) => {
                const gradeInput = document.querySelector(`.question-grade[data-question-index="${i}"]`);
                if (gradeInput && !gradeInput.disabled) {
                    const points = parseFloat(gradeInput.value) || 0;
                    if (updatedAnswers[i]) {
                        updatedAnswers[i] = {
                            ...updatedAnswers[i],
                            points: points
                        };
                    } else {
                        updatedAnswers[i] = { points: points };
                    }
                }
            });
            
            // Add the complete answers array to updates
            updates.answers = updatedAnswers;
        }
        
        // Update the database
        await db.ref(`classes/${classKey}/assignments/${assignment.assignmentId}/studentAnswers/${submission.studentId}`)
            .update(updates);
        
        return true;
        
    } catch (error) {
        console.error('Error saving grade:', error);
        Swal.showValidationMessage('Failed to save grade');
        return false;
    }
}

function getTypeBadge(type) {
    const types = {
        'homework': '<span class="assignment-type homework">Homework</span>',
        'quiz': '<span class="assignment-type quiz">Quiz</span>',
        'exam': '<span class="assignment-type exam">Exam</span>'
    };
    return types[type] || '';
}

// Modify the openAssignmentModal function to include resource loading
function openAssignmentModal(type) {
    try {
        currentAssignmentType = type;
        editingAssignmentId = null;
        quizItems = [];
        quizItemsList.innerHTML = '';
        assignmentForm.reset();

        // Set modal title based on type
        const modalTitle = document.getElementById('modalAssignmentTitle');
        const modalSubtitle = document.getElementById('modalAssignmentSubtitle');
        document.getElementById('assignmentType').value = type;

        const titles = {
            'homework': 'Create New Homework',
            'quiz': 'Create New Quiz',
            'exam': 'Create New Exam'
        };

        const subtitles = {
            'homework': 'Fill in the details for your new homework assignment',
            'quiz': 'Fill in the details and add questions for your new quiz',
            'exam': 'Fill in the details and add questions for your new exam'
        };

        modalTitle.textContent = titles[type] || 'Create New Assignment';
        modalSubtitle.textContent = subtitles[type] || 'Fill in the assignment details';

        // Show/hide appropriate fields
        const quizFields = document.getElementById('quizFields');
        const pointsField = document.getElementById('pointsField');
        const resourceLinkField = document.getElementById('resourceLinkField');
        
        if (quizFields) {
            quizFields.style.display = (type === 'quiz' || type === 'exam') ? 'block' : 'none';
        }
        
        if (pointsField) {
            pointsField.style.display = 'block';
            document.getElementById('assignmentPoints').disabled = (type === 'quiz' || type === 'exam');
        }

        // Show resource linking for homework only (you can change this if needed)
        if (resourceLinkField) {
            resourceLinkField.style.display = (type === 'homework') ? 'block' : 'none';
        }

        // Load resources for the dropdown
        if (type === 'homework') {
            populateResourceDropdown();
        }

        updateTotalPoints();
        assignmentModal.style.display = 'block';

    } catch (error) {
        console.error('Error opening assignment modal:', error);
        Swal.fire('Error', 'Failed to open assignment form', 'error');
    }
}

function closeAllModals() {
    assignmentModal.style.display = 'none';
    quizItemModal.style.display = 'none';
}

// Modify the handleAssignmentSubmit function to include linked resource
async function handleAssignmentSubmit(e) {
    e.preventDefault();

    try {
        const title = document.getElementById('assignmentTitle').value;
        const dueDate = document.getElementById('assignmentDueDate').value;
        const description = document.getElementById('assignmentDescription').value;
        const linkedResourceId = document.getElementById('linkedResource').value;
        const type = currentAssignmentType;

        if (!title || !dueDate) {
            Swal.fire('Error', 'Please fill in all required fields', 'error');
            return;
        }

        if ((type === 'quiz' || type === 'exam') && quizItems.length === 0) {
            Swal.fire('Error', 'Please add at least one question', 'error');
            return;
        }

        // Calculate points
        let points;
        if (type === 'homework') {
            points = parseInt(document.getElementById('assignmentPoints').value) || 0;
        } else {
            points = quizItems.reduce((total, item) => total + (item.points || 0), 0);
            if (points <= 0) {
                Swal.fire('Error', 'Total points must be greater than 0', 'error');
                return;
            }
        }

        // Fetch subject name from classKey
        const [sectionId, subjectId] = classKey.split('_');
        let subjectName = 'Unknown Subject';
        if (subjectId) {
            const subjectSnapshot = await db.ref(`subjects/${subjectId}`).once('value');
            subjectName = subjectSnapshot.val()?.subjectName || 'Unknown Subject';
        }

        // Prepare assignment data
        const assignmentData = {
            title,
            dueDate,
            points,
            description,
            type,
            teacher: currentTeacherId,
            classId: classKey,
            subjectName // Include subject name
        };

        // Add linked resource if selected
        if (linkedResourceId) {
            assignmentData.linkedResourceId = linkedResourceId;

            const resource = await getResourceDetails(linkedResourceId);
            if (resource) {
                assignmentData.linkedResource = {
                    id: linkedResourceId,
                    title: resource.title,
                    type: resource.type,
                    downloadUrl: resource.downloadUrl || null,
                    filePath: resource.filePath || null
                };
            }
        } else {
            assignmentData.linkedResourceId = null;
            assignmentData.linkedResource = null;
        }

        // Add questions if quiz or exam
        if (type === 'quiz' || type === 'exam') {
            assignmentData.questions = quizItems;
            assignmentData.totalQuestions = quizItems.length;
        }

        // ✅ Save assignment and get the new assignment key
        const newAssignmentRef = db.ref(`classes/${classKey}/assignments`).push();
        await newAssignmentRef.set(assignmentData);
        const assignmentId = newAssignmentRef.key;

        // Send notifications to students
        await sendAssignmentNotification(assignmentData, assignmentId, subjectName);

        Swal.fire('Success', 'Assignment saved and notifications sent!', 'success');

        // Reset form
        assignmentForm.reset();
        quizItems = [];
        quizItemsList.innerHTML = '';
        updateTotalPoints();
        closeAllModals();

    } catch (error) {
        console.error('Error submitting assignment:', error);
        Swal.fire('Error', 'Failed to save assignment', 'error');
    }
}

function viewAssignment(id, assignment) {
    try {
        const dueDate = new Date(assignment.dueDate);
        const formattedDate = dueDate.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        // Get student submission counts
        const pendingCount = assignment.studentAnswers ? 
            Object.values(assignment.studentAnswers).filter(s => s.status === 'pending').length : 0;
        const submittedCount = assignment.studentAnswers ? 
            Object.values(assignment.studentAnswers).filter(s => s.status === 'submitted').length : 0;
        const gradedCount = assignment.studentAnswers ? 
            Object.values(assignment.studentAnswers).filter(s => s.status === 'graded').length : 0;

        // Determine badge color based on assignment type
        const typeBadgeColor = {
            homework: 'badge-blue',
            quiz: 'badge-purple',
            exam: 'badge-red'
        }[assignment.type] || 'badge-gray';

        // Linked resource section
        const linkedResourceHTML = assignment.linkedResourceId ? `
            <div class="linked-resource-section">
                <h3 class="section-title">Linked Resource</h3>
                <div class="resource-link-card">
                    <div class="resource-link-info">
                        <i class="fas fa-link"></i>
                        <div>
                            <strong>${assignment.linkedResource?.title || 'Linked Resource'}</strong>
                            <span class="resource-type">${assignment.linkedResource?.type || 'Resource'}</span>
                        </div>
                    </div>
                    <button class="btn btn-sm btn-view-resource" onclick="openLinkedResource('${assignment.linkedResourceId}')">
                        <i class="fas fa-external-link-alt"></i> Open Resource
                    </button>
                </div>
            </div>
        ` : '';

        let detailsHTML = `
            <div class="assignment-view-container">
                <div class="assignment-view-header">
                    <div class="assignment-meta">
                        <span class="assignment-badge ${typeBadgeColor}">
                            ${assignment.type.charAt(0).toUpperCase() + assignment.type.slice(1)}
                        </span>
                        <span class="assignment-points">
                            <i class="fas fa-star"></i> ${assignment.points} Points
                        </span>
                        <span class="assignment-due-date ${new Date() > dueDate ? 'text-danger' : 'text-success'}">
                            <i class="fas fa-calendar-alt"></i> Due: ${formattedDate}
                        </span>
                    </div>
                    <div class="submission-status">
                        <div class="status-item pending">
                            <span class="status-count">${pendingCount}</span>
                            <span class="status-label">Pending</span>
                        </div>
                        <div class="status-item submitted">
                            <span class="status-count">${submittedCount}</span>
                            <span class="status-label">Submitted</span>
                        </div>
                        <div class="status-item graded">
                            <span class="status-count">${gradedCount}</span>
                            <span class="status-label">Graded</span>
                        </div>
                    </div>
                </div>
                
                <div class="assignment-view-content">
                    <div class="assignment-description">
                        <h3 class="section-title">Description</h3>
                        <div class="description-text">
                            ${assignment.description || '<p class="text-muted">No description provided</p>'}
                        </div>
                    </div>
                    
                    ${linkedResourceHTML}
        `;

        if (assignment.questions?.length > 0) {
            detailsHTML += `
                <div class="questions-section">
                    <div class="section-header">
                        <h3 class="section-title">Questions</h3>
                        <span class="questions-count">${assignment.questions.length} items</span>
                    </div>
                    <div class="questions-list">
                        ${assignment.questions.map((q, i) => generateQuestionHTML(q, i + 1)).join('')}
                    </div>
                </div>
            `;
        }

        detailsHTML += `</div></div>`;

        // Add custom CSS for the modal
        const customCSS = `
            <style>
                .linked-resource-section {
                    margin: 20px 0;
                    padding: 15px;
                    border: 1px solid #e0e0e0;
                    border-radius: 8px;
                    background: #f8f9fa;
                }
                .resource-link-card {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-top: 10px;
                }
                .resource-link-info {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .resource-link-info i {
                    color: #007bff;
                    font-size: 1.2em;
                }
                .resource-type {
                    display: block;
                    font-size: 0.9em;
                    color: #6c757d;
                    margin-top: 2px;
                }
            </style>
        `;

        Swal.fire({
            title: assignment.title,
            html: customCSS + detailsHTML,
            showCloseButton: true,
            showConfirmButton: false,
            width: '800px',
            customClass: {
                container: 'assignment-view-modal',
                popup: 'assignment-view-popup'
            }
        });

    } catch (error) {
        console.error('Error viewing assignment:', error);
        Swal.fire('Error', 'Failed to view assignment details', 'error');
    }
}

// Add this function to open linked resources
function openLinkedResource(resourceId) {
    // Close the current modal
    Swal.close();
    
    // Open the resources page or show resource preview
    // You can modify this based on how you want to handle resource viewing
    window.open(`resources.html?class=${classKey}&view=${resourceId}`, '_blank');
}

function generateQuestionHTML(question, number) {
    let questionHTML = `
        <div class="question-item">
            <p><strong>${number}. ${question.question}</strong> (${question.points} point${question.points !== 1 ? 's' : ''})</p>
            <p><em>Type: ${formatQuestionType(question.type)}</em></p>
    `;

    if (question.type === 'mcq_multiple') {
        questionHTML += `<p>Points calculation: ${question.pointsPerItem} per item × ${question.correctAnswer.length} correct answers</p>`;
    } else if (question.type === 'true_false') {
        questionHTML += `<p>Correct answer: <strong>${question.correctAnswer ? 'True' : 'False'}</strong></p>`;
    } else if (question.type === 'enumeration') {
        questionHTML += `<p>Expected answer: <strong>${question.correctAnswer}</strong></p>`;
    }

    questionHTML += `</div>`;
    return questionHTML;
}

function formatQuestionType(type) {
    const types = {
        'mcq_single': 'Multiple Choice (Single Answer)',
        'mcq_multiple': 'Multiple Choice (Multiple Answers)',
        'true_false': 'True or False',
        'enumeration': 'Enumeration'
    };
    return types[type] || type;
}

// Modify the editAssignment function to handle linked resources
function editAssignment(id, assignment) {
    try {
        editingAssignmentId = id;
        currentAssignmentType = assignment.type;
        quizItems = assignment.questions || [];
        
        // Set modal title
        const modalTitle = document.getElementById('modalAssignmentTitle');
        const modalSubtitle = document.getElementById('modalAssignmentSubtitle');
        document.getElementById('assignmentType').value = assignment.type;

        const titles = {
            'homework': 'Edit Homework',
            'quiz': 'Edit Quiz',
            'exam': 'Edit Exam'
        };

        const subtitles = {
            'homework': 'Update the details for your homework assignment',
            'quiz': 'Update the details and questions for your quiz',
            'exam': 'Update the details and questions for your exam'
        };

        modalTitle.textContent = titles[assignment.type] || 'Edit Assignment';
        modalSubtitle.textContent = subtitles[assignment.type] || 'Update the assignment details';

        // Show/hide appropriate fields
        const quizFields = document.getElementById('quizFields');
        const resourceLinkField = document.getElementById('resourceLinkField');
        
        if (quizFields) {
            quizFields.style.display = (assignment.type === 'quiz' || assignment.type === 'exam') ? 'block' : 'none';
        }

        if (resourceLinkField) {
            resourceLinkField.style.display = (assignment.type === 'homework') ? 'block' : 'none';
        }

        // Fill in the form fields
        document.getElementById('assignmentTitle').value = assignment.title;
        document.getElementById('assignmentDueDate').value = formatDateForInput(assignment.dueDate);
        document.getElementById('assignmentPoints').value = assignment.points;
        document.getElementById('assignmentDescription').value = assignment.description || '';

        // Load resources and set the linked resource if it exists
        if (assignment.type === 'homework') {
            populateResourceDropdown().then(() => {
                if (assignment.linkedResourceId) {
                    document.getElementById('linkedResource').value = assignment.linkedResourceId;
                } else {
                    document.getElementById('linkedResource').value = '';
                }
            });
        }

        // Display quiz items if applicable
        if (assignment.questions) {
            quizItemsList.innerHTML = '';
            assignment.questions.forEach((question, index) => {
                addQuizItemToDOM(question, index);
            });
        }

        assignmentModal.style.display = 'block';

    } catch (error) {
        console.error('Error editing assignment:', error);
        Swal.fire('Error', 'Failed to edit assignment', 'error');
    }
}

function cleanObjectForFirebase(obj) {
    const cleaned = {};
    for (const key in obj) {
        if (obj[key] !== undefined) {
            if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                cleaned[key] = cleanObjectForFirebase(obj[key]);
            } else {
                cleaned[key] = obj[key];
            }
        }
    }
    return cleaned;
}

function formatDateForInput(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function deleteAssignment(id) {
    Swal.fire({
        title: 'Are you sure?',
        text: 'This will permanently delete the assignment and all associated data.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
        if (result.isConfirmed) {
            Promise.all([
                db.ref(`classes/${classKey}/assignments/${id}`).remove(),
                db.ref(`assignments/${id}`).remove()
            ])
            .then(() => {
                Swal.fire('Deleted!', 'The assignment has been deleted.', 'success');
            })
            .catch(error => {
                console.error('Error deleting assignment:', error);
                Swal.fire('Error', 'Failed to delete assignment', 'error');
            });
        }
    });
}

function shareAssignment(id, assignment) {
    const assignmentLink = `${window.location.origin}/student/assignment.html?class=${classKey}&assignment=${id}`;
    
    Swal.fire({
        title: 'Share Assignment',
        html: `
            <p>Share this link with your students:</p>
            <div class="input-group" style="margin: 15px 0;">
                <input type="text" id="assignmentLink" class="form-control" value="${assignmentLink}" readonly>
                <button class="btn btn-primary" onclick="copyToClipboard('assignmentLink')">
                    <i class="fas fa-copy"></i>
                </button>
            </div>
        `,
        showConfirmButton: false
    });
}

function copyToClipboard(elementId) {
    const copyText = document.getElementById(elementId);
    copyText.select();
    document.execCommand('copy');
    Swal.fire({
        title: 'Copied!',
        text: 'Link copied to clipboard',
        icon: 'success',
        timer: 2000,
        showConfirmButton: false
    });
}

function handleQuizItemSubmit(e) {
    e.preventDefault();

    try {
        // Get form values
        const type = document.getElementById('itemType').value;
        const question = document.getElementById('itemQuestion').value.trim();
        const points = parseInt(document.getElementById('itemPoints').value);

        // Basic validation
        if (!question || isNaN(points)) {
            Swal.fire('Error', 'Please fill in all required fields with valid values', 'error');
            return;
        }

        // Create base quiz item object
        const quizItem = {
            type,
            question,
            pointsPerItem: points,
            points: points
        };

        // Handle type-specific fields
        switch (type) {
            case 'mcq_single':
            case 'mcq_multiple':
                const options = Array.from(document.querySelectorAll('.mcq-option-text'))
                    .map(input => input.value.trim())
                    .filter(opt => opt !== '');

                if (options.length < 2) {
                    Swal.fire('Error', 'Please provide at least 2 options', 'error');
                    return;
                }

                const mcqCorrectAnswer = getCorrectAnswer(type);
                if (mcqCorrectAnswer === null) {
                    Swal.fire('Error', 'Please select a correct answer', 'error');
                    return;
                }

                quizItem.options = options;
                quizItem.correctAnswer = mcqCorrectAnswer;
                
                if (type === 'mcq_multiple' && Array.isArray(mcqCorrectAnswer)) {
                    quizItem.points = points * mcqCorrectAnswer.length;
                }
                break;

            case 'true_false':
                const tfCorrectAnswer = getCorrectAnswer(type);
                if (tfCorrectAnswer === null) {
                    Swal.fire('Error', 'Please select a correct answer', 'error');
                    return;
                }
                quizItem.correctAnswer = tfCorrectAnswer;
                break;

            case 'enumeration':
                break;
        }

        // Update or add the item
        if (editingQuizItemIndex !== null) {
            quizItems[editingQuizItemIndex] = quizItem;
        } else {
            quizItems.push(quizItem);
        }

        // Refresh display
        refreshQuizItemsDisplay();

        // Close modal and reset
        quizItemModal.style.display = 'none';
        quizItemForm.reset();
        editingQuizItemIndex = null;

    } catch (error) {
        console.error('Error saving quiz item:', error);
        Swal.fire('Error', 'Failed to save question', 'error');
    }
}

function refreshQuizItemsDisplay() {
    quizItemsList.innerHTML = '';
    quizItems.forEach((item, index) => {
        addQuizItemToDOM(item, index);
    });
    updateTotalPoints();
}

function getCorrectAnswer(type) {
    if (type === 'mcq_single') {
        const selectedOption = document.querySelector('input[name="mcqCorrectAnswer"]:checked');
        if (!selectedOption) return null;
        return parseInt(selectedOption.value);
    } 
    
    if (type === 'mcq_multiple') {
        const selectedOptions = document.querySelectorAll('input[name="mcqCorrectAnswer"]:checked');
        if (selectedOptions.length === 0) return null;
        return Array.from(selectedOptions).map(option => parseInt(option.value));
    }
    
    if (type === 'true_false') {
        return document.querySelector('input[name="trueFalseAnswer"]:checked').value === 'true';
    } 
    
    return "";
}

function addQuizItemToDOM(item, index) {
    const itemElement = document.createElement('div');
    itemElement.className = 'quiz-item';
    itemElement.dataset.index = index;

    const typeBadge = getQuestionTypeBadge(item.type);
    const questionPreview = item.question.length > 50 
        ? `${item.question.substring(0, 47)}...` 
        : item.question;

    itemElement.innerHTML = `
        <div class="quiz-item-header">
            <div class="quiz-item-type">${typeBadge}</div>
            <div class="quiz-item-points">${item.points} pts</div>
        </div>
        <div class="quiz-item-question" title="${item.question}">${questionPreview}</div>
        <div class="quiz-item-actions">
            <button class="btn-icon btn-edit-quiz-item" data-index="${index}">
                <i class="fas fa-edit"></i>
            </button>
            <button class="btn-icon btn-remove-quiz-item" data-index="${index}">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;

    // Clone buttons to remove existing event listeners
    const editBtn = itemElement.querySelector('.btn-edit-quiz-item');
    const cloneEditBtn = editBtn.cloneNode(true);
    editBtn.parentNode.replaceChild(cloneEditBtn, editBtn);

    const removeBtn = itemElement.querySelector('.btn-remove-quiz-item');
    const cloneRemoveBtn = removeBtn.cloneNode(true);
    removeBtn.parentNode.replaceChild(cloneRemoveBtn, removeBtn);

    // Add fresh event listeners
    cloneEditBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        editQuizItem(index);
    });

    cloneRemoveBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeQuizItem(index);
    });

    quizItemsList.appendChild(itemElement);
}

function getQuestionTypeBadge(type) {
    const types = {
        'mcq_single': 'MCQ (Single)',
        'mcq_multiple': 'MCQ (Multiple)',
        'true_false': 'True/False',
        'enumeration': 'Enumeration'
    };
    return types[type] || type;
}

function editQuizItem(index) {
    if (index === null || index === undefined || index < 0 || index >= quizItems.length) {
        console.error('Invalid quiz item index:', index);
        return;
    }

    editingQuizItemIndex = index;
    const item = quizItems[index];

    // Reset form
    quizItemForm.reset();
    
    // Set basic fields
    document.getElementById('itemType').value = item.type;
    document.getElementById('itemQuestion').value = item.question;
    document.getElementById('itemPoints').value = item.pointsPerItem || item.points;

    // Handle question type specific fields
    handleItemTypeChange({ target: document.getElementById('itemType') });

    // For MCQ questions
    if (item.type === 'mcq_single' || item.type === 'mcq_multiple') {
        // Clear existing options
        mcqOptionsList.innerHTML = '';
        correctAnswerOptions.innerHTML = '';

        // Add options
        if (item.options && item.options.length > 0) {
            item.options.forEach((option, i) => {
                addMcqOption(option);
                
                // Set correct answer after a small delay to ensure DOM is ready
                setTimeout(() => {
                    if (item.type === 'mcq_single') {
                        const correctInput = document.querySelector(`input[name="mcqCorrectAnswer"][value="${item.correctAnswer}"]`);
                        if (correctInput) correctInput.checked = true;
                    } else if (item.type === 'mcq_multiple' && Array.isArray(item.correctAnswer)) {
                        item.correctAnswer.forEach(ans => {
                            const correctInput = document.querySelector(`input[name="mcqCorrectAnswer"][value="${ans}"]`);
                            if (correctInput) correctInput.checked = true;
                        });
                    }
                }, 50);
            });
        }
    } 
    // For True/False questions
    else if (item.type === 'true_false') {
        const correctValue = item.correctAnswer ? 'true' : 'false';
        const correctInput = document.querySelector(`input[name="trueFalseAnswer"][value="${correctValue}"]`);
        if (correctInput) correctInput.checked = true;
    }

    // Show modal
    quizItemModal.style.display = 'block';
}

function removeQuizItem(index) {
    Swal.fire({
        title: 'Are you sure?',
        text: 'This will remove the question from your quiz/exam.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Yes, remove it!'
    }).then((result) => {
        if (result.isConfirmed) {
            quizItems.splice(index, 1);
            
            // Update the DOM
            quizItemsList.innerHTML = '';
            quizItems.forEach((item, i) => {
                addQuizItemToDOM(item, i);
            });
            
            // Update total points
            updateTotalPoints();
        }
    });
}

function handleItemTypeChange(e) {
    const type = e?.target?.value || document.getElementById('itemType').value;
    
    // Hide all containers first
    mcqOptionsContainer.style.display = 'none';
    trueFalseContainer.style.display = 'none';
    document.getElementById('correctAnswerContainer').style.display = 'none';
    
    // Show the appropriate container
    if (type === 'mcq_single' || type === 'mcq_multiple') {
        mcqOptionsContainer.style.display = 'block';
        document.getElementById('correctAnswerContainer').style.display = 'block';
        setupMcqOptions();
    } else if (type === 'true_false') {
        trueFalseContainer.style.display = 'block';
        document.getElementById('correctAnswerContainer').style.display = 'block';
    }
}

function setupMcqOptions() {
    mcqOptionsList.innerHTML = '';
    correctAnswerOptions.innerHTML = '';
    
    // Add initial 2 options
    addMcqOption();
    addMcqOption();
}

function addMcqOption(initialValue = '') {
    const optionIndex = document.querySelectorAll('.mcq-option').length;
    
    const optionElement = document.createElement('div');
    optionElement.className = 'mcq-option';
    
    optionElement.innerHTML = `
        <input type="text" class="mcq-option-text" placeholder="Option text" value="${initialValue}">
        <div class="mcq-option-actions">
            <button type="button" class="btn-icon btn-remove-option">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    mcqOptionsList.appendChild(optionElement);
    
    // Create corresponding answer option
    const answerOption = document.createElement('div');
    const itemType = document.getElementById('itemType').value;
    
    if (itemType === 'mcq_single') {
        answerOption.innerHTML = `
            <label>
                <input type="radio" name="mcqCorrectAnswer" value="${optionIndex}">
                Option ${optionIndex + 1}
            </label>
        `;
    } else {
        answerOption.innerHTML = `
            <label>
                <input type="checkbox" name="mcqCorrectAnswer" value="${optionIndex}">
                Option ${optionIndex + 1}
            </label>
        `;
    }
    
    correctAnswerOptions.appendChild(answerOption);
    
    // Add remove option handler
    optionElement.querySelector('.btn-remove-option').addEventListener('click', (e) => {
        e.preventDefault();
        optionElement.remove();
        answerOption.remove();
        updateMcqOptionIndexes();
    });
}

function updateMcqOptionIndexes() {
    const options = document.querySelectorAll('.mcq-option');
    const answerInputs = document.querySelectorAll('#correctAnswerOptions input');
    
    options.forEach((option, index) => {
        const inputs = option.querySelectorAll('input[type="radio"], input[type="checkbox"]');
        inputs.forEach(input => {
            input.value = index;
            const label = input.closest('label');
            if (label) {
                label.textContent = `Option ${index + 1}`;
                label.prepend(input);
            }
        });
    });
    
    answerInputs.forEach((input, index) => {
        input.value = index;
        const label = input.closest('label');
        if (label) {
            label.textContent = `Option ${index + 1}`;
            label.prepend(input);
        }
    });
}

function updateTotalPoints() {
    let totalPoints = 0;
    
    if (currentAssignmentType === 'homework') {
        totalPoints = parseInt(document.getElementById('assignmentPoints').value) || 0;
    } else {
        totalPoints = quizItems.reduce((total, item) => total + (item.points || 0), 0);
    }
    
    document.getElementById('assignmentPoints').value = totalPoints;
}

// Cleanup on window unload
window.addEventListener('beforeunload', () => {
    // Clean up any Firebase listeners if needed
});

// Add this function to load resources for the current class
async function loadClassResources() {
    try {
        const resourcesRef = db.ref(`classes/${classKey}/resources`);
        const snapshot = await resourcesRef.once('value');
        const resources = snapshot.val() || {};
        
        return Object.entries(resources).map(([id, resource]) => ({
            id,
            ...resource
        }));
    } catch (error) {
        console.error('Error loading resources:', error);
        return [];
    }
}

// Add this function to populate the resource dropdown
async function populateResourceDropdown() {
    const resourceSelect = document.getElementById('linkedResource');
    resourceSelect.innerHTML = '<option value="">-- No resource linked --</option>';
    
    const resources = await loadClassResources();
    
    resources.forEach(resource => {
        const option = document.createElement('option');
        option.value = resource.id;
        option.textContent = `${resource.title} (${resource.type})`;
        resourceSelect.appendChild(option);
    });
}

// Add this function to get resource details
async function getResourceDetails(resourceId) {
    try {
        const resourceRef = db.ref(`classes/${classKey}/resources/${resourceId}`);
        const snapshot = await resourceRef.once('value');
        return snapshot.val();
    } catch (error) {
        console.error('Error getting resource details:', error);
        return null;
    }
}

// Function to send notifications to students in the class
async function sendAssignmentNotification(assignmentData, assignmentId, subjectName) {
    try {
        const studentsRef = db.ref(`classes/${classKey}/students`);
        const snapshot = await studentsRef.once('value');
        const students = snapshot.val();

        if (!students) return;

        const notificationPromises = Object.keys(students).map(studentId => {
            const notificationRef = db.ref(`notifications/${studentId}`).push();
            return notificationRef.set({
                title: `${assignmentData.type.charAt(0).toUpperCase() + assignmentData.type.slice(1)} Assigned`,
                message: `A new ${assignmentData.type} for <strong>${subjectName}</strong> titled "${assignmentData.title}" has been assigned. <br>Due: ${new Date(assignmentData.dueDate).toLocaleString()}`,
                type: assignmentData.type,
                link: `/student/assignment.html?class=${classKey}&assignment=${assignmentId}`,
                timestamp: firebase.database.ServerValue.TIMESTAMP,
                read: false
            });
        });

        await Promise.all(notificationPromises);

    } catch (error) {
        console.error('Error sending notifications:', error);
    }
}