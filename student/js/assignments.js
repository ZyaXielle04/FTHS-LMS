// assignments.js - Complete implementation for assignment management
let assignmentsCleanup = null;
let currentModal = null;

async function loadAssignmentsContent(classId) {
    if (assignmentsCleanup) {
        assignmentsCleanup();
    }

    return `
        <div class="assignments-container">
            <div class="assignments-header">
                <h2>Assignments</h2>
                <div class="assignment-filters">
                    <button class="filter-btn active" data-filter="all">All</button>
                    <button class="filter-btn" data-filter="pending">Pending</button>
                    <button class="filter-btn" data-filter="overdue">Overdue</button>
                    <button class="filter-btn" data-filter="submitted">Submitted</button>
                    <button class="filter-btn" data-filter="graded">Graded</button>
                </div>
            </div>
            <div class="assignments-list" id="assignments-list">
                <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading assignments...</div>
            </div>
        </div>
        
        <!-- Modal Structure -->
        <div id="assignment-modal" class="modal" style="display:none;">
            <div class="modal-content">
                <span class="close-modal">&times;</span>
                <div id="modal-body"></div>
            </div>
        </div>
        
        <!-- Toast Notification -->
        <div id="toast" class="toast"></div>
    `;
}

function setupAssignments(classId, studentId) {
    const assignmentsList = document.getElementById('assignments-list');
    if (!assignmentsList) return;

    const listeners = {
        assignments: null,
        studentAnswers: {}
    };

    const db = firebase.database();
    const assignmentsRef = db.ref(`classes/${classId}/assignments`);

    listeners.assignments = assignmentsRef.on('value', async (snapshot) => {
        if (!snapshot.exists()) {
            assignmentsList.innerHTML = '<div class="no-assignments">No assignments found for this class</div>';
            return;
        }

        const assignmentPromises = [];
        snapshot.forEach((assignmentSnapshot) => {
            const assignmentId = assignmentSnapshot.key;
            const assignmentData = assignmentSnapshot.val();
            
            const studentAnswerRef = db.ref(
                `classes/${classId}/assignments/${assignmentId}/studentAnswers/${studentId}`
            );

            const promise = studentAnswerRef.once('value').then((studentAnswerSnapshot) => {
                return {
                    id: assignmentId,
                    ...assignmentData,
                    studentData: studentAnswerSnapshot.exists() ? studentAnswerSnapshot.val() : null
                };
            });

            assignmentPromises.push(promise);
        });

        const assignments = await Promise.all(assignmentPromises);
        assignments.sort((a, b) => {
            const dateA = a.dueDate ? new Date(a.dueDate) : new Date(0);
            const dateB = b.dueDate ? new Date(b.dueDate) : new Date(0);
            return dateA - dateB;
        });

        assignmentsList.innerHTML = generateAssignmentsHTML(assignments);
        setupStudentAnswerListeners(classId, studentId, assignments);
        setupAssignmentFilters();
        
        // Setup event listeners for buttons
        setupAssignmentButtonHandlers(classId, studentId);
    }, (error) => {
        console.error("Error loading assignments:", error);
        assignmentsList.innerHTML = '<div class="error-message">Error loading assignments</div>';
    });

    assignmentsCleanup = () => {
        if (listeners.assignments) {
            assignmentsRef.off('value', listeners.assignments);
        }
        Object.keys(listeners.studentAnswers).forEach(assignmentId => {
            db.ref(
                `classes/${classId}/assignments/${assignmentId}/studentAnswers/${studentId}`
            ).off('value', listeners.studentAnswers[assignmentId]);
        });
    };

    return assignmentsCleanup;
}

function setupAssignmentButtonHandlers(classId, studentId) {
    document.addEventListener('click', async (e) => {
        if (e.target.classList.contains('btn-submit')) {
            const assignmentId = e.target.dataset.assignmentId;
            await openAssignmentSubmissionModal(classId, assignmentId, studentId);
        }
        
        if (e.target.classList.contains('btn-view')) {
            const assignmentId = e.target.dataset.assignmentId;
            await openAssignmentDetailsModal(classId, assignmentId, studentId);
        }
        
        if (e.target.classList.contains('close-modal')) {
            closeModal();
        }
    });
}

async function openAssignmentSubmissionModal(classId, assignmentId, studentId) {
    const db = firebase.database();
    const assignmentRef = db.ref(`classes/${classId}/assignments/${assignmentId}`);
    const assignmentSnapshot = await assignmentRef.once('value');
    const assignment = assignmentSnapshot.val();
    
    let modalContent = '';
    const dueDate = assignment.dueDate ? new Date(assignment.dueDate) : null;
    const isOverdue = dueDate && new Date() > dueDate;
    
    if (isOverdue) {
        modalContent = `
            <div class="assignment-overdue">
                <h3>Submission Closed</h3>
                <p>This assignment is overdue and can no longer be submitted.</p>
                <p>Due date: ${dueDate.toLocaleString()}</p>
                <div class="modal-actions">
                    <button id="close-overdue" class="btn-secondary">Close</button>
                </div>
            </div>
        `;
    } else {
        if (assignment.type === 'homework') {
            modalContent = `
                <div class="assignment-submission">
                    <h3>${assignment.title}</h3>
                    <p class="assignment-description">${assignment.description || ''}</p>
                    <div class="form-group">
                        <label for="homework-answer">Your Answer:</label>
                        <textarea id="homework-answer" placeholder="Type your answer here..." rows="10"></textarea>
                    </div>
                    <div class="modal-actions">
                        <button id="submit-assignment" class="btn-primary">Submit</button>
                        <button id="cancel-assignment" class="btn-secondary">Cancel</button>
                    </div>
                </div>
            `;
        } else if (assignment.type === 'quiz' || assignment.type === 'exam') {
            const questionsRef = db.ref(`classes/${classId}/assignments/${assignmentId}/questions`);
            const questionsSnapshot = await questionsRef.once('value');
            const questions = questionsSnapshot.val() || [];
            
            modalContent = `
                <div class="assignment-submission">
                    <h3>${assignment.title}</h3>
                    <p class="assignment-description">${assignment.description || ''}</p>
                    <form id="quiz-form">
                        ${questions.map((question, index) => renderQuestion(question, index)).join('')}
                    </form>
                    <div class="modal-actions">
                        <button id="submit-assignment" class="btn-primary">Submit</button>
                        <button id="cancel-assignment" class="btn-secondary">Cancel</button>
                    </div>
                </div>
            `;
        }
    }
    
    showModal(modalContent);
    
    // Only add event listeners if the assignment is not overdue and buttons exist
    if (!isOverdue) {
        const submitBtn = document.getElementById('submit-assignment');
        const cancelBtn = document.getElementById('cancel-assignment');
        
        if (submitBtn) {
            submitBtn.addEventListener('click', async () => {
                if (assignment.type === 'homework') {
                    const answer = document.getElementById('homework-answer').value.trim();
                    if (!answer) {
                        showToast('Please enter your answer before submitting', 'error');
                        return;
                    }
                    await submitHomeworkAnswer(classId, assignmentId, studentId, answer);
                } else if (assignment.type === 'quiz' || assignment.type === 'exam') {
                    const questionsRef = db.ref(`classes/${classId}/assignments/${assignmentId}/questions`);
                    const questionsSnapshot = await questionsRef.once('value');
                    const questions = questionsSnapshot.val() || [];
                    const answers = collectQuizAnswers(questions);
                    
                    if (questions.some((q, i) => q.required && !answers[i])) {
                        showToast('Please answer all required questions', 'error');
                        return;
                    }
                    
                    await submitQuizAnswers(classId, assignmentId, studentId, answers, questions);
                }
            });
        }
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                closeModal();
            });
        }
    } else {
        // For overdue assignments, add a close button listener if it exists
        const closeBtn = document.getElementById('close-overdue');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                closeModal();
            });
        }
    }
}

function renderQuestion(question, index) {
    let questionHtml = `
        <div class="question" data-type="${question.type}" data-index="${index}">
            <div class="question-header">
                <h4>Question ${index + 1}</h4>
                <span class="points">${question.points} point${question.points !== 1 ? 's' : ''}</span>
            </div>
            <p class="question-text">${question.question}</p>
    `;
    
    switch(question.type) {
        case 'mcq_single':
            questionHtml += `
                <div class="options">
                    ${question.options.map((option, i) => `
                        <label class="option">
                            <input type="radio" name="q${index}" value="${i}" ${question.required ? 'required' : ''}>
                            <span class="option-text">${option}</span>
                        </label>
                    `).join('')}
                </div>
            `;
            break;
            
        case 'mcq_multiple':
            questionHtml += `
                <div class="options">
                    ${question.options.map((option, i) => `
                        <label class="option">
                            <input type="checkbox" name="q${index}" value="${i}">
                            <span class="option-text">${option}</span>
                        </label>
                    `).join('')}
                </div>
                <p class="hint">Select all that apply</p>
            `;
            break;
            
        case 'true_false':
            questionHtml += `
                <div class="options">
                    <label class="option">
                        <input type="radio" name="q${index}" value="true" ${question.required ? 'required' : ''}>
                        <span class="option-text">True</span>
                    </label>
                    <label class="option">
                        <input type="radio" name="q${index}" value="false" ${question.required ? 'required' : ''}>
                        <span class="option-text">False</span>
                    </label>
                </div>
            `;
            break;
            
        case 'enumeration':
            questionHtml += `
                <div class="answer">
                    <textarea name="q${index}" placeholder="Your answer..." ${question.required ? 'required' : ''}></textarea>
                </div>
            `;
            break;
    }
    
    questionHtml += `</div>`;
    return questionHtml;
}

function collectQuizAnswers(questions) {
    const answers = {};
    
    questions.forEach((question, index) => {
        const questionKey = `q${index}`;
        
        switch(question.type) {
            case 'mcq_single':
            case 'true_false':
                const selectedRadio = document.querySelector(`[name="${questionKey}"]:checked`);
                answers[index] = selectedRadio ? selectedRadio.value : null;
                break;
                
            case 'mcq_multiple':
                const checkedBoxes = Array.from(document.querySelectorAll(`[name="${questionKey}"]:checked`));
                answers[index] = checkedBoxes.map(box => box.value);
                break;
                
            case 'enumeration':
                const textarea = document.querySelector(`[name="${questionKey}"]`);
                answers[index] = textarea ? textarea.value.trim() : '';
                break;
        }
    });
    
    return answers;
}

async function submitHomeworkAnswer(classId, assignmentId, studentId, answer) {
    const db = firebase.database();
    const updates = {
        [`classes/${classId}/assignments/${assignmentId}/studentAnswers/${studentId}/answer`]: answer,
        [`classes/${classId}/assignments/${assignmentId}/studentAnswers/${studentId}/submittedAt`]: firebase.database.ServerValue.TIMESTAMP,
        [`classes/${classId}/assignments/${assignmentId}/studentAnswers/${studentId}/status`]: 'submitted',
        [`classes/${classId}/assignments/${assignmentId}/studentAnswers/${studentId}/needsTeacherGrading`]: true,
        [`classes/${classId}/assignments/${assignmentId}/studentAnswers/${studentId}/grade`]: null
    };
    
    try {
        await db.ref().update(updates);
        closeModal();
        showToast('Homework submitted successfully! It will be graded by your teacher.');
    } catch (error) {
        console.error('Error submitting homework:', error);
        showToast('Error submitting homework', 'error');
    }
}

async function submitQuizAnswers(classId, assignmentId, studentId, answers, questions) {
    const db = firebase.database();
    let totalScore = 0;
    const gradedAnswers = {};
    
    questions.forEach((question, index) => {
        const studentAnswer = answers[index];
        gradedAnswers[index] = {
            answer: studentAnswer,
            points: 0,
            correct: false,
            needsTeacherGrading: question.type === 'enumeration'
        };
        
        // Only auto-grade non-enumeration questions
        if (question.type !== 'enumeration') {
            if (question.type === 'mcq_single' || question.type === 'true_false') {
                if (studentAnswer != null && studentAnswer.toString() === question.correctAnswer.toString()) {
                    gradedAnswers[index].points = question.points;
                    gradedAnswers[index].correct = true;
                    totalScore += question.points;
                }
            } else if (question.type === 'mcq_multiple') {
                if (Array.isArray(studentAnswer)) {
                    const correctAnswers = Object.values(question.correctAnswer || {}).map(String);
                    const correctCount = studentAnswer.filter(ans => 
                        correctAnswers.includes(ans.toString())
                    ).length;
                    
                    const pointsEarned = correctCount * (question.pointsPerItem || 1);
                    gradedAnswers[index].points = pointsEarned;
                    gradedAnswers[index].correct = correctCount === correctAnswers.length;
                    totalScore += pointsEarned;
                }
            }
        }
    });
    
    // Determine if any questions need teacher grading
    const needsTeacherGrading = questions.some(q => q.type === 'enumeration');
    
    const updates = {
        [`classes/${classId}/assignments/${assignmentId}/studentAnswers/${studentId}/answers`]: gradedAnswers,
        [`classes/${classId}/assignments/${assignmentId}/studentAnswers/${studentId}/submittedAt`]: firebase.database.ServerValue.TIMESTAMP,
        [`classes/${classId}/assignments/${assignmentId}/studentAnswers/${studentId}/status`]: needsTeacherGrading ? 'submitted' : 'graded',
        [`classes/${classId}/assignments/${assignmentId}/studentAnswers/${studentId}/needsTeacherGrading`]: needsTeacherGrading,
        [`classes/${classId}/assignments/${assignmentId}/studentAnswers/${studentId}/grade`]: needsTeacherGrading ? null : totalScore
    };
    
    try {
        await db.ref().update(updates);
        closeModal();
        if (needsTeacherGrading) {
            showToast('Answers submitted! Some questions will be graded by your teacher.');
        } else {
            showToast('Quiz submitted and graded successfully!');
        }
    } catch (error) {
        console.error('Error submitting quiz:', error);
        showToast('Error submitting quiz', 'error');
    }
}

async function openAssignmentDetailsModal(classId, assignmentId, studentId) {
    const db = firebase.database();
    const assignmentRef = db.ref(`classes/${classId}/assignments/${assignmentId}`);
    const assignmentSnapshot = await assignmentRef.once('value');
    const assignment = assignmentSnapshot.val();
    
    const studentAnswersRef = db.ref(
        `classes/${classId}/assignments/${assignmentId}/studentAnswers/${studentId}`
    );
    const studentAnswersSnapshot = await studentAnswersRef.once('value');
    const studentData = studentAnswersSnapshot.exists() ? studentAnswersSnapshot.val() : null;
    
    let modalContent = `
        <div class="assignment-details">
            <h3>${assignment.title}</h3>
            <p class="assignment-description">${assignment.description || 'No description'}</p>
            <div class="assignment-meta">
                <p><strong>Type:</strong> ${capitalizeFirstLetter(assignment.type)}</p>
                ${assignment.dueDate ? `<p><strong>Due:</strong> ${new Date(assignment.dueDate).toLocaleString()}</p>` : ''}
                ${assignment.points ? `<p><strong>Total Points:</strong> ${assignment.points}</p>` : ''}
            </div>
    `;
    
    if (studentData) {
        const gradingStatus = studentData.needsTeacherGrading && studentData.grade === undefined ? 
            '<span class="grading-badge pending"><i class="fas fa-clock"></i> Pending Grading</span>' : '';
            
        modalContent += `
            <div class="submission-details">
                <h4>Your Submission ${gradingStatus}</h4>
                <p><strong>Status:</strong> ${capitalizeFirstLetter(studentData.status) || 'Not submitted'}</p>
                ${studentData.submittedAt ? `<p><strong>Submitted:</strong> ${new Date(studentData.submittedAt).toLocaleString()}</p>` : ''}
                ${studentData.grade !== undefined ? 
                    `<p><strong>Your Points:</strong> ${studentData.grade}/${assignment.points || '?'}</p>` : 
                    studentData.needsTeacherGrading ? `<p class="grading-notice"><i class="fas fa-info-circle"></i> This assignment is awaiting teacher review</p>` : ''}
            </div>
        `;
        
        if (assignment.type === 'homework') {
            modalContent += `
                <div class="homework-answer">
                    <h4>Your Answer:</h4>
                    <div class="answer-content">${studentData.answer || 'No answer submitted'}</div>
                    ${studentData.needsTeacherGrading && studentData.grade === undefined ? 
                        '<div class="grading-status"><i class="fas fa-clock"></i> Waiting for teacher evaluation</div>' : ''}
                    ${studentData.feedback ? `
                        <div class="teacher-feedback">
                            <h5>Teacher Feedback:</h5>
                            <div class="feedback-content">${studentData.feedback}</div>
                        </div>
                    ` : ''}
                </div>
            `;
        } else if ((assignment.type === 'quiz' || assignment.type === 'exam') && studentData.answers) {
            const questionsRef = db.ref(`classes/${classId}/assignments/${assignmentId}/questions`);
            const questionsSnapshot = await questionsRef.once('value');
            const questions = questionsSnapshot.val() || [];
            
            modalContent += `
                <div class="quiz-results">
                    <h4>Your Answers:</h4>
                    ${questions.map((question, index) => 
                        renderQuestionResult(question, index, studentData.answers[index], studentData.status === 'graded')
                    ).join('')}
                </div>
            `;
        }
    } else {
        modalContent += `
            <div class="no-submission">
                <p>You haven't submitted this assignment yet.</p>
                ${assignment.dueDate && new Date(assignment.dueDate) < new Date() ? 
                    '<p class="overdue-notice"><i class="fas fa-exclamation-triangle"></i> This assignment is now overdue</p>' : ''}
            </div>
        `;
    }
    
    modalContent += `</div>`;
    showModal(modalContent);
}

function renderQuestionResult(question, index, studentAnswer, isAssignmentGraded) {
    let resultHtml = `
        <div class="question-result" data-type="${question.type}">
            <div class="question-header">
                <h5>Question ${index + 1}</h5>
                ${question.type === 'enumeration' && !isAssignmentGraded ? 
                    '<span class="points">Pending teacher grading</span>' : 
                    `<span class="points">${studentAnswer?.points || 0}/${question.points} point${question.points !== 1 ? 's' : ''}</span>`}
            </div>
            <p class="question-text">${question.question}</p>
    `;
    
    if (question.type === 'mcq_single' || question.type === 'mcq_multiple' || question.type === 'true_false') {
        resultHtml += `<p class="your-answer"><strong>Your answer:</strong> ${formatAnswer(question, studentAnswer)}</p>`;
        
        if (question.type !== 'enumeration') {
            resultHtml += `<p class="correct-answer"><strong>Correct answer:</strong> ${formatCorrectAnswer(question)}</p>`;
        }
    } else if (question.type === 'enumeration') {
        resultHtml += `
            <div class="enumeration-answer">
                <p><strong>Your answer:</strong></p>
                <div class="answer-content">${studentAnswer?.answer || 'No answer provided'}</div>
                ${isAssignmentGraded && studentAnswer?.teacherFeedback ? `
                    <div class="teacher-feedback">
                        <h5>Teacher Feedback:</h5>
                        <div class="feedback-content">${studentAnswer.teacherFeedback}</div>
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    resultHtml += `</div>`;
    return resultHtml;
}

function formatAnswer(question, studentAnswer) {
    if (!studentAnswer) return 'Not answered';
    
    if (question.type === 'mcq_single' || question.type === 'true_false') {
        if (question.type === 'true_false') {
            return studentAnswer.answer === 'true' ? 'True' : 'False';
        }
        return question.options[studentAnswer.answer] || 'Invalid answer';
    } else if (question.type === 'mcq_multiple') {
        if (!Array.isArray(studentAnswer.answer)) return 'Not answered';
        return studentAnswer.answer.map(ans => question.options[ans]).filter(Boolean).join(', ') || 'No correct options selected';
    }
    return studentAnswer.answer || 'Not answered';
}

function formatCorrectAnswer(question) {
    if (question.type === 'mcq_single') {
        return question.options[question.correctAnswer] || 'No correct answer specified';
    } else if (question.type === 'mcq_multiple') {
        const correctAnswers = Object.values(question.correctAnswer || {});
        return correctAnswers.map(ans => question.options[ans]).filter(Boolean).join(', ') || 'No correct answers specified';
    } else if (question.type === 'true_false') {
        return question.correctAnswer === 'true' ? 'True' : 'False';
    }
    return 'No correct answer specified';
}

// Helper functions
function showModal(content) {
    const modal = document.getElementById('assignment-modal');
    const modalBody = document.getElementById('modal-body');
    
    if (!modal || !modalBody) return;
    
    modalBody.innerHTML = content;
    modal.style.display = 'block';
    currentModal = modal;
    
    // Close modal when clicking outside content
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
}

function closeModal() {
    if (currentModal) {
        currentModal.style.display = 'none';
        currentModal = null;
    }
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    
    setTimeout(() => {
        toast.className = toast.className.replace('show', '');
    }, 3000);
}

// Existing functions from your original code
function setupStudentAnswerListeners(classId, studentId, assignments) {
    const assignmentsList = document.getElementById('assignments-list');
    if (!assignmentsList) return;

    assignments.forEach((assignment) => {
        const assignmentId = assignment.id;
        const db = firebase.database();
        const studentAnswerRef = db.ref(
            `classes/${classId}/assignments/${assignmentId}/studentAnswers/${studentId}`
        );

        studentAnswerRef.on('value', (snapshot) => {
            const assignmentElement = document.getElementById(`assignment-${assignmentId}`);
            if (!assignmentElement) return;

            const studentData = snapshot.exists() ? snapshot.val() : null;
            updateAssignmentStatus(assignmentElement, studentData);
        });
    });
}

function updateAssignmentStatus(assignmentElement, studentData) {
    const statusElement = assignmentElement.querySelector('.assignment-status');
    const actionsElement = assignmentElement.querySelector('.assignment-actions');
    
    assignmentElement.classList.remove('pending', 'overdue', 'submitted', 'graded');
    
    const dueDateText = assignmentElement.querySelector('.due-date')?.textContent;
    const dueDateMatch = dueDateText?.match(/Due: (.+)/);
    const dueDate = dueDateMatch ? new Date(dueDateMatch[1]) : null;
    const isOverdue = dueDate && new Date() > dueDate;

    let status = 'Pending';
    if (studentData) {
        if (studentData.status === 'graded' && studentData.grade !== undefined && studentData.grade !== null) {
            status = 'Graded';
            assignmentElement.classList.add('graded');
        } else if (studentData.status === 'submitted' && studentData.grade !== undefined && studentData.grade !== null) {
            status = 'Graded';
            assignmentElement.classList.add('graded');
        } else if (studentData.status === 'submitted') {
            status = 'Submitted (Pending Grading)';
            assignmentElement.classList.add('submitted');
        } else {
            status = isOverdue ? 'Overdue' : 'Pending';
            assignmentElement.classList.add(status.toLowerCase());
        }
    } else {
        status = isOverdue ? 'Overdue' : 'Pending';
        assignmentElement.classList.add(status.toLowerCase());
    }

    statusElement.textContent = status;
    
    const assignmentId = assignmentElement.id.replace('assignment-', '');
    actionsElement.innerHTML = `
        ${status === 'Pending' ? 
            `<button class="btn-submit" data-assignment-id="${assignmentId}">Submit Work</button>` : 
            ''}
        ${status === 'Graded' && studentData?.grade !== undefined ? 
            `<span class="grade-badge">Points: ${studentData.grade}</span>` : 
            ''}
        <button class="btn-view" data-assignment-id="${assignmentId}">View Details</button>
    `;
}

function generateAssignmentsHTML(assignments) {
    if (assignments.length === 0) {
        return '<div class="no-assignments">No assignments found for this class</div>';
    }

    return assignments
    .filter(assignment => assignment.type === 'quiz' || assignment.type === 'exam')
    .map(assignment => {
        const dueDate = assignment.dueDate ? new Date(assignment.dueDate) : null;
        const formattedDueDate = dueDate ? dueDate.toLocaleDateString() + ' ' + dueDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'No due date';
        
        const status = getAssignmentStatus(assignment);
        const statusClass = status.toLowerCase();
        
        const isPendingGrading = assignment.studentData?.needsTeacherGrading && 
                               assignment.studentData.grade === undefined;
        const gradingStatus = isPendingGrading ? 
            '<span class="grading-status"><i class="fas fa-clock"></i> Pending Grading</span>' : '';

        return `
            <div class="assignment-card ${statusClass}" id="assignment-${assignment.id}">
                <div class="assignment-header">
                    <h3>${assignment.title || 'Untitled Assignment'}</h3>
                    <div class="status-container">
                        <span class="assignment-status">${status}</span>
                    </div>
                </div>
                <div class="assignment-details">
                    <p class="assignment-description">${assignment.description || 'No description provided'}</p>
                    <div class="assignment-meta">
                        <span class="due-date"><i class="far fa-calendar-alt"></i> Due: ${formattedDueDate}</span>
                        ${assignment.points ? `<span class="points"><i class="fas fa-star"></i> ${assignment.points} points</span>` : ''}
                        <span class="assignment-type ${assignment.type}">${capitalizeFirstLetter(assignment.type)}</span>
                    </div>
                </div>
                <div class="assignment-actions">
                    ${status === 'Pending' ? 
                        `<button class="btn-submit" data-assignment-id="${assignment.id}">Submit Work</button>` : 
                        ''}
                    ${status === 'Graded' && assignment.studentData?.grade !== undefined ? 
                        `<span class="grade-badge">Grade: ${assignment.studentData.grade}</span>` : 
                        ''}
                    <button class="btn-view" data-assignment-id="${assignment.id}">View Details</button>
                </div>
            </div>
        `;
    }).join('');
}

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
}

function getAssignmentStatus(assignment) {
    const now = new Date();
    const dueDate = assignment.dueDate ? new Date(assignment.dueDate) : null;
    const isOverdue = dueDate && now > dueDate;

    if (!assignment.studentData) {
        return isOverdue ? 'Overdue' : 'Pending';
    }

    // If it's marked as graded or has a grade value without needing teacher grading
    if (assignment.studentData.status === 'graded' || 
        (!assignment.studentData.needsTeacherGrading && assignment.studentData.grade !== undefined)) {
        return 'Graded';
    }

    if (assignment.studentData.status === 'submitted') {
        return 'Submitted';
    }

    return isOverdue ? 'Overdue' : 'Pending';
}

function setupAssignmentFilters() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    const assignmentsList = document.getElementById('assignments-list');
    
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            filterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            const filter = button.dataset.filter;
            const assignmentCards = assignmentsList.querySelectorAll('.assignment-card');
            
            assignmentCards.forEach(card => {
                const shouldShow = 
                    filter === 'all' ||
                    (filter === 'pending' && card.classList.contains('pending')) ||
                    (filter === 'overdue' && card.classList.contains('overdue')) ||
                    (filter === 'submitted' && card.classList.contains('submitted')) ||
                    (filter === 'graded' && card.classList.contains('graded'));
                
                card.style.display = shouldShow ? 'block' : 'none';
            });
        });
    });
}

// Initialize when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Modal and toast are now included in the main implementation
});