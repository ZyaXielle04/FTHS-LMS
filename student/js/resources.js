document.addEventListener('DOMContentLoaded', function() {
    // resources.js - Student version with complete homework handling

    // Global variables for homework handling
    let currentHomeworkModal = null;

    /**
     * Loads and displays resources (including homeworks) for a specific class
     * @param {string} classId 
     * @param {string} studentId
     * @returns {Promise<string>} HTML content for resources section
     */
    async function loadResourcesContent(classId, studentId) {
        if (!classId || !studentId) {
            console.error("Missing classId or studentId");
            return `<div class="error-message">Invalid class or student. Please try again.</div>`;
        }

        try {
            const db = firebase.database();
            
            // Fetch resources safely
            let resourcesData = {};
            try {
                const resourcesRef = db.ref(`classes/${classId}/resources`);
                const resourcesSnapshot = await resourcesRef.once('value');
                resourcesData = resourcesSnapshot.exists() ? resourcesSnapshot.val() : {};
            } catch(err) {
                console.warn("Failed to fetch resources:", err);
            }

            // Fetch assignments safely
            let assignmentsData = {};
            try {
                const assignmentsRef = db.ref(`classes/${classId}/assignments`);
                const assignmentsSnapshot = await assignmentsRef.once('value');
                assignmentsData = assignmentsSnapshot.exists() ? assignmentsSnapshot.val() : {};
            } catch(err) {
                console.warn("Failed to fetch assignments:", err);
            }

            // Prepare resources array and map homework assignments to their linked resources
            const resourcesWithHomeworks = await Promise.all(
                Object.entries(resourcesData).map(async ([resourceId, resource]) => {
                    // Find homeworks linked to this resource
                    const linkedHomeworks = await Promise.all(
                        Object.entries(assignmentsData)
                            .filter(([assignmentId, assignment]) => 
                                assignment.type === 'homework' && 
                                assignment.linkedResourceId === resourceId
                            )
                            .map(async ([assignmentId, assignment]) => {
                                // Get student data for this homework
                                let studentData = null;
                                try {
                                    const snap = await db.ref(
                                        `classes/${classId}/assignments/${assignmentId}/studentAnswers/${studentId}`
                                    ).once('value');
                                    studentData = snap.exists() ? snap.val() : null;
                                } catch(err) {
                                    console.warn("Failed to fetch student answer for homework", assignmentId, err);
                                }
                                
                                return {
                                    assignmentId,
                                    ...assignment,
                                    studentData
                                };
                            })
                    );

                    return {
                        id: resourceId,
                        name: resource.title || 'Untitled Resource',
                        description: resource.description || '',
                        size: resource.fileSize || 0,
                        type: getFileType(resource.filePath || ''),
                        downloadURL: resource.filePath || '#',
                        uploadDate: resource.timestamp ? new Date(resource.timestamp) : new Date(),
                        fileName: resource.filePath ? resource.filePath.split('/').pop() : '',
                        isResource: true,
                        homeworks: linkedHomeworks
                    };
                })
            );

            // Prepare standalone homeworks (not linked to any resource)
            const standaloneHomeworks = await Promise.all(
                Object.entries(assignmentsData)
                    .filter(([assignmentId, assignment]) => 
                        assignment.type === 'homework' && 
                        (!assignment.linkedResourceId || !resourcesData[assignment.linkedResourceId])
                    )
                    .map(async ([assignmentId, assignment]) => {
                        // Get student data for this homework
                        let studentData = null;
                        try {
                            const snap = await db.ref(
                                `classes/${classId}/assignments/${assignmentId}/studentAnswers/${studentId}`
                            ).once('value');
                            studentData = snap.exists() ? snap.val() : null;
                        } catch(err) {
                            console.warn("Failed to fetch student answer for homework", assignmentId, err);
                        }
                        
                        return {
                            assignmentId,
                            ...assignment,
                            studentData,
                            isStandaloneHomework: true
                        };
                    })
            );

            // Sort resources by date descending
            resourcesWithHomeworks.sort((a, b) => b.uploadDate - a.uploadDate);

            // Generate HTML
            let html = `
                <div class="resources-container">
                    <h2 class="resources-title">Learning Materials</h2>
                    <div class="resources-grid">
            `;

            // Add resources with nested homeworks
            resourcesWithHomeworks.forEach(resource => {
                const uploadDate = resource.uploadDate.toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
                const statusClass = resource.type.toLowerCase();
                const hasHomeworks = resource.homeworks.length > 0;

                html += `
                    <div class="resource-row" data-resource-id="${resource.id}" data-type="resource">
                        <div class="resource-main">
                            <div class="resource-title">${resource.name}</div>
                            <span class="resource-type-badge ${statusClass}">${resource.type}</span>
                            <span class="resource-size">${formatFileSize(resource.size)}</span>
                            ${hasHomeworks ? `<span class="homework-count">${resource.homeworks.length} homework${resource.homeworks.length !== 1 ? 's' : ''}</span>` : ''}
                            <a href="${resource.downloadURL}" class="download-btn" download="${resource.fileName}">
                                <i class="fas fa-download"></i> Download
                            </a>
                            <button class="toggle-details-btn">${hasHomeworks ? 'Show Homeworks' : 'Show Details'}</button>
                        </div>
                        <div class="resource-details">
                            <p class="resource-description"><strong>Description:</strong> ${resource.description || 'No description provided.'}</p>
                            <p class="resource-date"><strong>Uploaded:</strong> ${uploadDate}</p>
                            ${resource.downloadURL && resource.downloadURL !== '#' ? `
                                <div class="resource-action">
                                    <a href="${resource.downloadURL}" class="btn-primary" download="${resource.fileName}" target="_blank">
                                        <i class="fas fa-download"></i> Download File
                                    </a>
                                </div>
                            ` : ''}
                            
                            ${hasHomeworks ? `
                                <div class="nested-homeworks">
                                    <h4 class="nested-homeworks-title">Related Homework Assignments</h4>
                                    ${resource.homeworks.map(hw => generateHomeworkHTML(hw, classId, studentId)).join('')}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            });

            // Add standalone homeworks (not linked to any resource)
            if (standaloneHomeworks.length > 0) {
                html += `
                    <div class="standalone-homeworks-section">
                        <h3 class="standalone-homeworks-title">Homework Assignments</h3>
                        ${standaloneHomeworks.map(hw => generateStandaloneHomeworkHTML(hw, classId, studentId)).join('')}
                    </div>
                `;
            }

            // If no content
            if (resourcesWithHomeworks.length === 0 && standaloneHomeworks.length === 0) {
                html += `
                    <div class="empty-state">
                        <i class="fas fa-book-open"></i>
                        <h3>No Learning Materials</h3>
                        <p>There are no resources or assignments available for this class yet.</p>
                    </div>
                `;
            }

            html += `</div></div>`;
            return html;

        } catch (err) {
            console.error("Error in loadResourcesContent:", err);
            return `<div class="error-message">Failed to load resources data: ${err.message || err}</div>`;
        }
    }

    // Helper function to generate homework HTML for nested display
    function generateHomeworkHTML(hw, classId, studentId) {
        const dueDate = new Date(hw.dueDate).toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const isSubmitted = hw.studentData?.status === 'submitted' || hw.studentData?.status === 'graded';
        const isGraded = hw.studentData?.status === 'graded';
        const isOverdue = new Date() > new Date(hw.dueDate);
        const hasAnswer = hw.studentData?.answer || hw.studentData?.answers;

        // Format the student's answer for display
        let answerDisplay = '';
        if (hasAnswer) {
            if (hw.studentData.answer) {
                // Simple text answer
                answerDisplay = hw.studentData.answer;
            } else if (hw.studentData.answers && Array.isArray(hw.studentData.answers)) {
                // Array of answers (for quizzes)
                answerDisplay = hw.studentData.answers.map((ans, index) => 
                    `Q${index + 1}: ${ans.answer || ans}`
                ).join('<br>');
            }
        }

        return `
            <div class="nested-homework-item" data-homework-id="${hw.assignmentId}">
                <div class="nested-homework-header">
                    <div class="nested-homework-title">${hw.title || 'Untitled Homework'}</div>
                    <div class="nested-homework-meta">
                        <span class="homework-points">${hw.points} pts</span>
                        <span class="homework-status ${hw.studentData?.status || 'pending'}">${(hw.studentData?.status || 'pending').toUpperCase()}</span>
                        ${isOverdue && hw.studentData?.status !== 'graded' ? '<span class="overdue-badge">OVERDUE</span>' : ''}
                    </div>
                </div>
                <div class="nested-homework-details">
                    <p class="homework-description"><strong>Description:</strong> ${hw.description || 'No description provided.'}</p>
                    <p class="homework-due-date"><strong>Due:</strong> ${dueDate}</p>
                    <p class="homework-points-display"><strong>Total Points:</strong> ${hw.points}</p>
                    
                    ${hasAnswer ? `
                        <div class="submission-info">
                            <h5>Your Submission:</h5>
                            <div class="submission-content">
                                ${answerDisplay}
                            </div>
                            ${hw.studentData?.submittedAt ? `
                                <p class="submission-date"><strong>Submitted on:</strong> ${new Date(hw.studentData.submittedAt).toLocaleString()}</p>
                            ` : ''}
                        </div>
                    ` : ''}
                    
                    ${isGraded && hw.studentData ? `
                        <div class="grade-info">
                            <h5>Grading Results:</h5>
                            <p><strong>Your Grade:</strong> ${hw.studentData.grade || 'N/A'} / ${hw.points}</p>
                            ${hw.studentData.feedback ? `
                                <div class="feedback">
                                    <strong>Teacher Feedback:</strong> 
                                    <p>${hw.studentData.feedback}</p>
                                </div>
                            ` : ''}
                            ${hw.studentData.gradedAt ? `
                                <p class="graded-date"><strong>Graded on:</strong> ${new Date(hw.studentData.gradedAt).toLocaleString()}</p>
                            ` : ''}
                        </div>
                    ` : isSubmitted && !isGraded ? `
                        <div class="submission-status-info">
                            <p class="awaiting-grade"><i class="fas fa-clock"></i> Submitted - Awaiting teacher grading</p>
                        </div>
                    ` : ''}
                    
                    <div class="nested-homework-actions">
                        <button class="btn-submit-homework nested ${isSubmitted ? 'submitted' : ''}" 
                                data-homework-id="${hw.assignmentId}"
                                data-homework-title="${hw.title || 'Homework'}"
                                data-class-id="${classId}"
                                data-student-id="${studentId}">
                            ${isGraded ? 'View Details' : isSubmitted ? 'View Submission' : 'Submit Answer'}
                        </button>
                        
                        ${isSubmitted ? `
                            <button class="btn-resubmit-homework" 
                                    data-homework-id="${hw.assignmentId}"
                                    data-homework-title="${hw.title || 'Homework'}"
                                    data-class-id="${classId}"
                                    data-student-id="${studentId}">
                                <i class="fas fa-redo"></i> Resubmit
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    // Helper function to generate standalone homework HTML
    function generateStandaloneHomeworkHTML(hw, classId, studentId) {
        const dueDate = new Date(hw.dueDate).toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const isSubmitted = hw.studentData?.status === 'submitted' || hw.studentData?.status === 'graded';
        const isGraded = hw.studentData?.status === 'graded';
        const isOverdue = new Date() > new Date(hw.dueDate);

        return `
            <div class="resource-row homework-row standalone-homework" data-homework-id="${hw.assignmentId}" data-type="homework">
                <div class="resource-main">
                    <div class="resource-title">${hw.title || 'Untitled Homework'}</div>
                    <span class="resource-type-badge homework">Homework</span>
                    <span class="resource-points">${hw.points} pts</span>
                    <span class="homework-status ${hw.studentData?.status || 'pending'}">${(hw.studentData?.status || 'pending').toUpperCase()}</span>
                    ${isOverdue && hw.studentData?.status !== 'graded' ? '<span class="overdue-badge">OVERDUE</span>' : ''}
                    <button class="toggle-details-btn">Show Details</button>
                    <button class="btn-submit-homework ${isSubmitted ? 'submitted' : ''}" 
                            data-homework-id="${hw.assignmentId}"
                            data-homework-title="${hw.title || 'Homework'}"
                            data-class-id="${classId}"
                            data-student-id="${studentId}">
                        ${isGraded ? 'View Grade' : isSubmitted ? 'View Submission' : 'Submit Answer'}
                    </button>
                </div>
                <div class="resource-details">
                    <p class="resource-description"><strong>Description:</strong> ${hw.description || 'No description provided.'}</p>
                    <p class="resource-date"><strong>Due Date:</strong> ${dueDate}</p>
                    <p class="homework-points"><strong>Points:</strong> ${hw.points}</p>
                    
                    ${hw.studentData?.status === 'graded' ? `
                        <div class="grade-info">
                            <p><strong>Your Grade:</strong> ${hw.studentData.grade || 'N/A'} / ${hw.points}</p>
                            ${hw.studentData.feedback ? `
                                <div class="feedback">
                                    <strong>Teacher Feedback:</strong> ${hw.studentData.feedback}
                                </div>
                            ` : ''}
                        </div>
                    ` : ''}
                    
                    <div class="homework-actions">
                        <button class="btn-submit-homework large ${isSubmitted ? 'submitted' : ''}" 
                                data-homework-id="${hw.assignmentId}"
                                data-homework-title="${hw.title || 'Homework'}"
                                data-class-id="${classId}"
                                data-student-id="${studentId}">
                            ${isGraded ? 'View Grade Details' : isSubmitted ? 'View Submission' : 'Submit Answer'}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    // ===== HOMEWORK SUBMISSION FUNCTIONS =====

    /**
     * Opens the homework submission modal
     */
    async function openAssignmentSubmissionModal(classId, assignmentId, studentId, assignmentTitle = 'Homework', isResubmit = false) {
        console.log('openAssignmentSubmissionModal called with:', {
            classId, assignmentId, studentId, assignmentTitle, isResubmit
        });
        
        const db = firebase.database();
        const assignmentRef = db.ref(`classes/${classId}/assignments/${assignmentId}`);
        const assignmentSnapshot = await assignmentRef.once('value');
        const assignment = assignmentSnapshot.val();
        
        console.log('Assignment data:', assignment);
        
        let modalContent = '';
        const dueDate = assignment.dueDate ? new Date(assignment.dueDate) : null;
        const isOverdue = dueDate && new Date() > dueDate;
        
        console.log('Due date check:', { dueDate, isOverdue, now: new Date() });
        
        if (isOverdue) {
            modalContent = `
                <div class="assignment-overdue">
                    <h3>Submission Closed</h3>
                    <p>This assignment is overdue and can no longer be submitted.</p>
                    <p>Due date: ${dueDate ? dueDate.toLocaleString() : 'No due date'}</p>
                    <div class="modal-actions">
                        <button id="close-overdue" class="btn-secondary">Close</button>
                    </div>
                </div>
            `;
        } else {
            modalContent = `
                <div class="assignment-submission">
                    <h3>${assignment.title}</h3>
                    <p class="assignment-description">${assignment.description || ''}</p>
                    <div class="form-group">
                        <label for="homework-answer">Your Answer:</label>
                        <textarea id="homework-answer" placeholder="Type your answer here..." rows="10"></textarea>
                    </div>
                    <div class="modal-actions">
                        <button id="submit-homework" class="btn-primary">${isResubmit ? 'Resubmit' : 'Submit'}</button>
                        <button id="cancel-homework" class="btn-secondary">Cancel</button>
                    </div>
                </div>
            `;
        }
        
        console.log('Calling showHomeworkModal with content length:', modalContent.length);
        showHomeworkModal(modalContent);
        console.log('Modal should be visible now');
        
        // Add event listeners based on the modal content
        if (isOverdue) {
            // For overdue assignments, only add close button listener
            const closeBtn = document.getElementById('close-overdue');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    closeHomeworkModal();
                });
            }
        } else {
            // For active assignments, add submit and cancel listeners
            const submitBtn = document.getElementById('submit-homework');
            const cancelBtn = document.getElementById('cancel-homework');
            
            if (submitBtn) {
                submitBtn.addEventListener('click', async () => {
                    const answer = document.getElementById('homework-answer').value.trim();
                    if (!answer) {
                        showHomeworkToast('Please enter your answer before submitting', 'error');
                        return;
                    }
                    await submitHomeworkAnswer(classId, assignmentId, studentId, answer);
                });
            }
            
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => {
                    closeHomeworkModal();
                });
            }
        }
    }

    /**
     * Submits homework answer to Firebase
     */
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
            closeHomeworkModal();
            showHomeworkToast('Homework submitted successfully! It will be graded by your teacher.');
            
            // Refresh the resources display to show updated status
            setTimeout(() => {
                if (typeof window.refreshStudentContent === 'function') {
                    window.refreshStudentContent();
                }
            }, 1000);
            
        } catch (error) {
            console.error('Error submitting homework:', error);
            showHomeworkToast('Error submitting homework', 'error');
        }
    }

    /**
     * Opens assignment details modal
     */
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
        } else {
            modalContent += `
                <div class="no-submission">
                    <p>You haven't submitted this assignment yet.</p>
                    ${assignment.dueDate && new Date(assignment.dueDate) < new Date() ? 
                        '<p class="overdue-notice"><i class="fas fa-exclamation-triangle"></i> This assignment is now overdue</p>' : ''}
                </div>
            `;
        }
        
        modalContent += `
            <div class="modal-actions">
                ${!studentData ? `<button id="submit-now" class="btn-primary">Submit Now</button>` : ''}
                <button id="close-details" class="btn-secondary">Close</button>
            </div>
        </div>`;
        
        showHomeworkModal(modalContent);
        
        if (!studentData) {
            const submitNowBtn = document.getElementById('submit-now');
            if (submitNowBtn) {
                submitNowBtn.addEventListener('click', () => {
                    closeHomeworkModal();
                    setTimeout(() => {
                        openAssignmentSubmissionModal(classId, assignmentId, studentId, assignment.title);
                    }, 300);
                });
            }
        }
        
        const closeDetailsBtn = document.getElementById('close-details');
        if (closeDetailsBtn) {
            closeDetailsBtn.addEventListener('click', () => {
                closeHomeworkModal();
            });
        }
    }

    // ===== MODAL MANAGEMENT FUNCTIONS =====

    function showHomeworkModal(content) {
        console.log('showHomeworkModal called with content length:', content.length);
        
        // Remove any existing modal first
        const existingModal = document.getElementById('homework-modal');
        if (existingModal) {
            console.log('Removing existing modal');
            existingModal.remove();
        }

        // Create new modal
        const modal = document.createElement('div');
        modal.id = 'homework-modal';
        modal.className = 'homework-modal active';
        modal.innerHTML = `
            <div class="homework-modal-content">
                <span class="homework-close-modal">&times;</span>
                <div class="homework-modal-body">
                    ${content}
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        currentHomeworkModal = modal;

        // Force display
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        document.body.style.overflow = 'hidden'; // Prevent background scrolling

        console.log('Modal created and appended to body. Display:', modal.style.display);
        console.log('Modal element:', modal);

        // Add close event listeners
        const closeBtn = modal.querySelector('.homework-close-modal');
        closeBtn.addEventListener('click', closeHomeworkModal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeHomeworkModal();
            }
        });

        // Add escape key listener
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                closeHomeworkModal();
            }
        };
        document.addEventListener('keydown', escapeHandler);
        
        // Store the handler for cleanup
        modal._escapeHandler = escapeHandler;

        // Force a reflow and check if modal is visible
        setTimeout(() => {
            const modalCheck = document.getElementById('homework-modal');
            console.log('Modal check after creation:', modalCheck);
            console.log('Modal computed display:', window.getComputedStyle(modalCheck).display);
            console.log('Modal computed visibility:', window.getComputedStyle(modalCheck).visibility);
        }, 100);
    }

    function closeHomeworkModal() {
        if (currentHomeworkModal) {
            // Remove escape key listener
            if (currentHomeworkModal._escapeHandler) {
                document.removeEventListener('keydown', currentHomeworkModal._escapeHandler);
            }
            
            currentHomeworkModal.remove();
            currentHomeworkModal = null;
            document.body.style.overflow = ''; // Restore scrolling
        }
    }

    function showHomeworkToast(message, type = 'success') {
        // Remove existing toast
        const existingToast = document.getElementById('homework-toast');
        if (existingToast) {
            existingToast.remove();
        }

        // Create new toast
        const toast = document.createElement('div');
        toast.id = 'homework-toast';
        toast.textContent = message;
        toast.style.position = 'fixed';
        toast.style.top = '20px';
        toast.style.right = '20px';
        toast.style.padding = '15px 20px';
        toast.style.borderRadius = '8px';
        toast.style.color = 'white';
        toast.style.fontWeight = '600';
        toast.style.zIndex = '1001';
        toast.style.transform = 'translateX(400px)';
        toast.style.transition = 'transform 0.3s ease';
        toast.style.maxWidth = '300px';

        if (type === 'success') {
            toast.style.background = 'linear-gradient(135deg, #27ae60 0%, #2ecc71 100%)';
        } else {
            toast.style.background = 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)';
        }

        document.body.appendChild(toast);

        // Show toast
        setTimeout(() => {
            toast.style.transform = 'translateX(0)';
        }, 100);

        // Hide toast after 3 seconds
        setTimeout(() => {
            toast.style.transform = 'translateX(400px)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        }, 3000);
    }

    // ===== EVENT HANDLERS =====

    // Event delegation for Show More / Answer buttons
    document.addEventListener('click', async function(e) {
        console.log('Click event detected:', e.target);

        // Handle toggle details buttons
        const toggleBtn = e.target.closest('.toggle-details-btn');
        if (toggleBtn) {
            console.log('Toggle button clicked');
            const card = toggleBtn.closest('.resource-row');
            const details = card.querySelector('.resource-details');
            const isShowing = details.classList.contains('show');
            
            // Close all other open details
            document.querySelectorAll('.resource-details.show').forEach(detail => {
                if (detail !== details) {
                    detail.classList.remove('show');
                    const btn = detail.previousElementSibling.querySelector('.toggle-details-btn');
                    const hasHomeworks = detail.querySelector('.nested-homeworks') !== null;
                    btn.textContent = hasHomeworks ? 'Show Homeworks' : 'Show Details';
                }
            });
            
            // Toggle current
            details.classList.toggle('show');
            const hasHomeworks = details.querySelector('.nested-homeworks') !== null;
            toggleBtn.textContent = details.classList.contains('show') ? 'Hide Details' : (hasHomeworks ? 'Show Homeworks' : 'Show Details');
            
            return; // Stop propagation
        }

        // Handle homework submission buttons
        const answerBtn = e.target.closest('.btn-submit-homework');
        if (answerBtn) {
            console.log('Homework button clicked:', answerBtn);
            e.preventDefault();
            e.stopPropagation();
            
            const homeworkId = answerBtn.dataset.homeworkId;
            const classId = answerBtn.dataset.classId || window.currentClassId;
            const studentId = answerBtn.dataset.studentId || window.currentStudentId;
            const homeworkTitle = answerBtn.dataset.homeworkTitle || 'Homework';
            
            console.log('Homework data:', { homeworkId, classId, studentId, homeworkTitle });
            
            if (!classId || !studentId) {
                console.error('Missing classId or studentId');
                showHomeworkToast('Error: Missing class or student information', 'error');
                return;
            }
            
            // Check if we should open details or submission
            const isSubmitted = answerBtn.classList.contains('submitted');
            console.log('Is submitted:', isSubmitted);
            
            if (isSubmitted) {
                console.log('Opening details modal');
                await openAssignmentDetailsModal(classId, homeworkId, studentId);
            } else {
                console.log('Opening submission modal');
                await openAssignmentSubmissionModal(classId, homeworkId, studentId, homeworkTitle);
            }
            
            return; // Stop propagation
        }

        // Handle resubmit buttons
        const resubmitBtn = e.target.closest('.btn-resubmit-homework');
        if (resubmitBtn) {
            console.log('Resubmit button clicked');
            e.preventDefault();
            e.stopPropagation();
            
            const homeworkId = resubmitBtn.dataset.homeworkId;
            const classId = resubmitBtn.dataset.classId || window.currentClassId;
            const studentId = resubmitBtn.dataset.studentId || window.currentStudentId;
            const homeworkTitle = resubmitBtn.dataset.homeworkTitle || 'Homework';
            
            if (!classId || !studentId) {
                console.error('Missing classId or studentId');
                showHomeworkToast('Error: Missing class or student information', 'error');
                return;
            }
            
            await openAssignmentSubmissionModal(classId, homeworkId, studentId, homeworkTitle, true);
            
            return; // Stop propagation
        }
    });

    // ===== HELPER FUNCTIONS =====

    function formatFileSize(bytes) {
        if (!bytes) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes','KB','MB','GB'];
        const i = Math.floor(Math.log(bytes)/Math.log(k));
        return parseFloat((bytes/Math.pow(k,i)).toFixed(1)) + ' ' + sizes[i];
    }

    function getFileType(filename) {
        if (!filename) return 'File';
        const ext = filename.split('.').pop().toLowerCase();
        if (['pdf'].includes(ext)) return 'PDF';
        if (['doc','docx'].includes(ext)) return 'Word';
        if (['ppt','pptx'].includes(ext)) return 'PowerPoint';
        if (['xls','xlsx'].includes(ext)) return 'Excel';
        if (['jpg','jpeg','png','gif','svg'].includes(ext)) return 'Image';
        if (['mp4','mov','avi'].includes(ext)) return 'Video';
        if (['mp3','wav'].includes(ext)) return 'Audio';
        if (['zip','rar'].includes(ext)) return 'Archive';
        if (['txt','rtf'].includes(ext)) return 'Text';
        return 'File';
    }

    function capitalizeFirstLetter(string) {
        return string ? string.charAt(0).toUpperCase() + string.slice(1).toLowerCase() : '';
    }

    // Make functions available globally for cross-file access
    window.loadResourcesContent = loadResourcesContent;
    window.openAssignmentSubmissionModalFromAssignments = openAssignmentSubmissionModal;
    window.openAssignmentDetailsModalFromAssignments = openAssignmentDetailsModal;
});