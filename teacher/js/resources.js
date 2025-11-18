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
    const resourcesTable = document.querySelector('.resources-table');
    const resourcesTableBody = document.getElementById('resourcesTableBody');
    const emptyState = document.querySelector('.empty-state');
    const uploadResourceBtn = document.getElementById('uploadResourceBtn');
    const uploadResourceModal = document.getElementById('uploadResourceModal');
    const uploadResourceForm = document.getElementById('uploadResourceForm');
    const resourceTitle = document.getElementById('resourceTitle');
    const resourceDescription = document.getElementById('resourceDescription');
    const resourceType = document.getElementById('resourceType');
    const fileUploadGroup = document.getElementById('fileUploadGroup');
    const linkInputGroup = document.getElementById('linkInputGroup');
    const resourceLink = document.getElementById('resourceLink');
    const fileInfo = document.getElementById('fileInfo');
    const resourceFile = document.getElementById('resourceFile');
    const previewModal = document.getElementById('resourcePreviewModal');
    const downloadResourceBtn = document.getElementById('downloadResourceBtn');
    const deleteResourceBtn = document.getElementById('deleteResourceBtn');
    let currentResourceId = null;

    // 4. REAL-TIME LISTENERS
    let classListener;
    let resourcesListener;

    function setupRealTimeListeners() {
        // Clear any existing listeners
        removeAllListeners();

        // Load the specific class details
        classListener = db.ref(`classes/${classKey}`).on('value', (classSnap) => {
            const classData = classSnap.val();
            if (!classData) {
                window.location.href = 'classes.html';
                return;
            }

            // Load resources for this class
            resourcesListener = db.ref(`classes/${classKey}/resources`)
                .orderByChild('timestamp')
                .on('value', (snapshot) => {
                    const resources = [];
                    snapshot.forEach(resourceSnap => {
                        resources.push({
                            id: resourceSnap.key,
                            ...resourceSnap.val()
                        });
                    });

                    if (resources.length === 0) {
                        showEmptyState();
                        return;
                    }

                    displayResources(resources);
                });
        });
    }

    function removeAllListeners() {
        if (classListener) db.ref(`classes/${classKey}`).off('value', classListener);
        if (resourcesListener) db.ref(`classes/${classKey}/resources`).off('value', resourcesListener);
    }

    // 5. DISPLAY RESOURCES IN TABLE
    function displayResources(resources) {
        resourcesTableBody.innerHTML = '';
        const tableContainer = document.querySelector('.resources-table-container');
        
        resources.forEach(resource => {
            const uploadDate = new Date(resource.timestamp);
            const formattedDate = uploadDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });

            let fileSize = '-';
            if (resource.fileSize) {
                fileSize = formatFileSize(resource.fileSize);
            } else if (resource.type === 'link') {
                fileSize = 'Link';
            }

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <strong>${resource.title}</strong>
                    ${resource.description ? `<p class="resource-description">${resource.description}</p>` : ''}
                </td>
                <td><span class="resource-type-badge ${resource.type}">${resource.type}</span></td>
                <td>${resource.className || 'N/A'}</td>
                <td>${formattedDate}</td>
                <td>${fileSize}mb</td>
                <td>
                    <div class="resource-actions">
                        <button class="view-btn" data-id="${resource.id}">
                            <i class="fas fa-eye"></i> View
                        </button>
                        <button class="download-btn" data-path="${resource.filePath || ''}" data-url="${resource.downloadUrl || ''}">
                            <i class="fas fa-download"></i> Download
                        </button>
                        <button class="share-btn" data-id="${resource.id}">
                            <i class="fas fa-share-alt"></i> Share
                        </button>
                        <button class="delete-btn" data-id="${resource.id}">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </div>
                </td>
            `;
            resourcesTableBody.appendChild(row);
        });

        tableContainer.style.display = 'block';
        emptyState.style.display = 'none';

        // Add event listeners
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', () => viewResource(btn.dataset.id));
        });

        document.querySelectorAll('.download-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (btn.dataset.path) {
                    downloadResource(btn.dataset.path);
                } else if (btn.dataset.url) {
                    window.open(btn.dataset.url, '_blank');
                }
            });
        });

        document.querySelectorAll('.share-btn').forEach(btn => {
            btn.addEventListener('click', () => shareResource(btn.dataset.id));
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteResource(btn.dataset.id));
        });
    }

    // 6. RESOURCE SHARING FUNCTIONALITY
    function shareResource(resourceId) {
        db.ref(`classes/${classKey}/resources/${resourceId}`).once('value')
        .then(resourceSnap => {
            const resource = resourceSnap.val();
            if (!resource) return;

            // First get the current class's subjectId
            db.ref(`classes/${classKey}`).once('value')
            .then(currentClassSnap => {
                const currentClass = currentClassSnap.val();
                if (!currentClass) return;
                
                const currentSubjectId = currentClass.subjectId;

                // Get all classes for this teacher with the same subjectId (excluding current class)
                db.ref('classes')
                .orderByChild('teacher')
                .equalTo(teacherId)
                .once('value')
                .then(snapshot => {
                    const classes = snapshot.val();
                    const classOptions = [];
                    
                    // Create an array of promises to check each class
                    const checkPromises = Object.entries(classes || {}).map(([classId, classData]) => {
                        if (classId !== classKey && classData.subjectId === currentSubjectId) {
                            // Check if this class already has a resource with the same ID
                            return db.ref(`classes/${classId}/resources/${resourceId}`)
                                .once('value')
                                .then(existingSnap => {
                                    // Only include if the resource doesn't exist in this class
                                    if (!existingSnap.exists()) {
                                        classOptions.push({
                                            id: classId,
                                            name: `Grade ${classData.gradeLevel} ${classData.strand} - ${classData.sectionNumber}`
                                        });
                                    }
                                    return null;
                                });
                        }
                        return Promise.resolve();
                    });

                    // Wait for all checks to complete
                    return Promise.all(checkPromises).then(() => {
                        if (classOptions.length === 0) {
                            Swal.fire('No Classes', 'You have no other classes with the same subject to share with, or all classes already have this resource.', 'info');
                            return;
                        }

                        Swal.fire({
                            title: 'Share Resource',
                            html: `
                                <div class="share-resource-modal">
                                    <p>Share <strong>${resource.title}</strong> to:</p>
                                    <select id="shareToClass" class="form-control">
                                        ${classOptions.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                                    </select>
                                </div>
                            `,
                            showCancelButton: true,
                            confirmButtonText: 'Share',
                            cancelButtonText: 'Cancel',
                            customClass: {
                                popup: 'custom-swal-popup',
                                confirmButton: 'custom-swal-confirm-btn',
                                cancelButton: 'custom-swal-cancel-btn'
                            },
                            background: '#f8f9fa',
                            width: '450px'
                        }).then((result) => {
                            if (result.isConfirmed) {
                                const targetClassId = document.getElementById('shareToClass').value;
                                shareResourceToClass(resource, targetClassId, resourceId);
                            }
                        });
                    });
                });
            });
        });
    }

    function shareResourceToClass(resource, targetClassId, originalResourceId) {
        // Create a copy without the original ID (Firebase will generate a new one)
        const resourceCopy = { ...resource };
        delete resourceCopy.id;

        // Add sharing metadata
        resourceCopy.sharedFrom = {
            classId: classKey,
            resourceId: originalResourceId,
            timestamp: Date.now()
        };

        // Get the target class name for display
        db.ref(`classes/${targetClassId}`).once('value')
        .then(targetClassSnap => {
            const targetClass = targetClassSnap.val();
            if (targetClass) {
                resourceCopy.className = `Grade ${targetClass.gradeLevel} ${targetClass.strand} - ${targetClass.sectionNumber}`;
            }

            // Save to target class with the same resourceId
            return db.ref(`classes/${targetClassId}/resources/${originalResourceId}`).set(resourceCopy);
        })
        .then(() => {
            Swal.fire('Success', 'Resource shared successfully!', 'success');
        })
        .catch(error => {
            Swal.fire('Error', `Failed to share resource: ${error.message}`, 'error');
        });
    }

    // 7. OTHER RESOURCE FUNCTIONS (viewResource, downloadResource, deleteResource, etc.)
    function viewResource(resourceId) {
        currentResourceId = resourceId;
        db.ref(`classes/${classKey}/resources/${resourceId}`).once('value')
        .then(snapshot => {
            const resource = snapshot.val();
            if (!resource) return;

            // Update preview modal
            document.getElementById('previewResourceTitle').textContent = resource.title;
            document.getElementById('previewResourceClass').textContent = resource.className || 'N/A';
            document.getElementById('previewResourceType').textContent = resource.type;
            document.getElementById('previewResourceDate').textContent = new Date(resource.timestamp).toLocaleDateString();

            const previewContent = document.getElementById('previewContent');
            previewContent.innerHTML = '';

            if (resource.type === 'link') {
                previewContent.innerHTML = `
                    <div class="preview-message">
                        <i class="fas fa-external-link-alt preview-icon"></i>
                        <p>This is a web link resource.</p>
                        <a href="${resource.downloadUrl}" target="_blank" class="primary-btn">
                            <i class="fas fa-external-link-alt"></i> Open Link
                        </a>
                    </div>
                `;
            } else if (resource.filePath) {
                const fileUrl = `/raw/${resource.filePath}`;
                
                if (resource.filePath.match(/\.(pdf)$/i)) {
                    previewContent.innerHTML = `
                        <iframe src="${fileUrl}#toolbar=0"></iframe>
                    `;
                } else if (resource.filePath.match(/\.(mp4|webm|ogg)$/i)) {
                    previewContent.innerHTML = `
                        <video controls style="width: 100%;">
                            <source src="${fileUrl}" type="video/mp4">
                            Your browser does not support the video tag.
                        </video>
                    `;
                } else {
                    previewContent.innerHTML = `
                        <div class="preview-message">
                            <i class="fas fa-file preview-icon"></i>
                            <p>Preview not available for this file type.</p>
                            <p>Please download to view.</p>
                        </div>
                    `;
                }
            }

            previewModal.style.display = 'flex';
        });
    }

    function downloadResource(filePath) {
        if (!filePath) {
            Swal.fire('Error', 'No file path available for this resource.', 'error');
            return;
        }
        
        const a = document.createElement('a');
        a.href = `/raw/${filePath}`;
        a.download = filePath.split('/').pop();
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    function deleteResource(resourceId) {
        Swal.fire({
            title: 'Delete Resource?',
            text: "You won't be able to revert this!",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Yes, delete it!'
        }).then((result) => {
            if (result.isConfirmed) {
                db.ref(`classes/${classKey}/resources/${resourceId}`).remove()
                    .then(() => {
                        Swal.fire('Deleted!', 'The resource has been deleted.', 'success');
                        if (currentResourceId === resourceId) {
                            closePreviewModal();
                        }
                    })
                    .catch(error => {
                        Swal.fire('Error', `Failed to delete resource: ${error.message}`, 'error');
                    });
            }
        });
    }

    // 8. UPLOAD RESOURCE
    function setupUploadModal() {
        resourceType.addEventListener('change', () => {
            if (resourceType.value === 'link') {
                fileUploadGroup.style.display = 'none';
                linkInputGroup.style.display = 'block';
            } else {
                fileUploadGroup.style.display = 'block';
                linkInputGroup.style.display = 'none';
            }
        });

        resourceFile.addEventListener('change', () => {
            if (resourceFile.files.length > 0) {
                const file = resourceFile.files[0];
                fileInfo.textContent = `${file.name} (${formatFileSize(file.size)})`;
            } else {
                fileInfo.textContent = 'No file selected';
            }
        });

        uploadResourceForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const title = resourceTitle.value.trim();
            const description = resourceDescription.value.trim();
            const type = resourceType.value;
            
            if (!title || !type) {
                Swal.fire('Error', 'Please fill all required fields.', 'error');
                return;
            }

            const classSnap = await db.ref(`classes/${classKey}`).once('value');
            const classInfo = classSnap.val();
            
            if (!classInfo) {
                Swal.fire('Error', 'Class not found.', 'error');
                return;
            }

            const resourceData = {
                teacherId,
                title,
                description,
                type,
                timestamp: Date.now(),
                className: `Grade ${classInfo.gradeLevel} ${classInfo.strand} - ${classInfo.sectionNumber}`,
                classId: classKey
            };

            const uploadBtn = uploadResourceForm.querySelector('button[type="submit"]');
            uploadBtn.disabled = true;
            uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

            if (type === 'link') {
                const link = resourceLink.value.trim();
                if (!link) {
                    Swal.fire('Error', 'Please enter a valid URL.', 'error');
                    uploadBtn.disabled = false;
                    uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Upload Resource';
                    return;
                }
                resourceData.downloadUrl = link.startsWith('http') ? link : `https://${link}`;
                saveResource(resourceData);
            } else {
                if (resourceFile.files.length === 0) {
                    Swal.fire('Error', 'Please select a file to add.', 'error');
                    uploadBtn.disabled = false;
                    uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Upload Resource';
                    return;
                }

                const file = resourceFile.files[0];
                if (file.size > 25 * 1024 * 1024) {
                    Swal.fire('Error', 'File size exceeds 25MB limit.', 'error');
                    uploadBtn.disabled = false;
                    uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Upload Resource';
                    return;
                }

                resourceData.fileName = file.name;
                resourceData.fileSize = file.size;
                resourceData.filePath = `uploads/${classKey}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
                
                // Simulate upload
                setTimeout(() => {
                    saveResource(resourceData);
                }, 1000);
            }
        });
    }

    function saveResource(resourceData) {
        const uploadBtn = uploadResourceForm.querySelector('button[type="submit"]');
        
        const newResourceRef = db.ref(`classes/${classKey}/resources`).push();
        
        newResourceRef.set(resourceData)
            .then(() => {
                // 1. Send notification to students
                sendNewModuleNotificationToStudents(resourceData);

                Swal.fire('Success', 'Resource added successfully!', 'success');
                closeUploadModal();
                uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Upload Resource';
                uploadBtn.disabled = false;
            })
            .catch((error) => {
                Swal.fire('Error', `Failed to save resource: ${error.message}`, 'error');
                uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Upload Resource';
                uploadBtn.disabled = false;
            });
    }

    function sendNewModuleNotificationToStudents(resourceData) {
        // Get all students in this class
        db.ref(`classes/${classKey}/students`).once('value')
            .then(snapshot => {
                const students = snapshot.val();
                if (!students) return;

                const timestamp = Date.now();

                Object.keys(students).forEach(studentId => {
                    const notifRef = db.ref(`notifications/${studentId}`).push();
                    notifRef.set({
                        title: 'New Module Posted',
                        message: `A new module "${resourceData.title}" has been posted in your class.`,
                        timestamp: timestamp,
                        seen: false
                    });
                });
            });
    }

    // 9. HELPER FUNCTIONS
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i]);
    }

    function showEmptyState() {
        document.querySelector('.resources-table-container').style.display = 'none';
        emptyState.style.display = 'flex';
    }

    function openUploadModal() {
        uploadResourceModal.style.display = 'flex';
        uploadResourceForm.reset();
        fileInfo.textContent = 'No file selected';
        fileUploadGroup.style.display = 'block';
        linkInputGroup.style.display = 'none';
    }

    function closeUploadModal() {
        uploadResourceModal.style.display = 'none';
    }

    function closePreviewModal() {
        previewModal.style.display = 'none';
        currentResourceId = null;
    }

    // 10. EVENT LISTENERS
    uploadResourceBtn.addEventListener('click', openUploadModal);
    
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', closeUploadModal);
    });

    document.querySelector('.close-upload-modal').addEventListener('click', closeUploadModal);
    
    document.querySelector('.close-modal', previewModal).addEventListener('click', closePreviewModal);

    downloadResourceBtn.addEventListener('click', () => {
        if (!currentResourceId) return;
        
        db.ref(`classes/${classKey}/resources/${currentResourceId}`).once('value').then(snapshot => {
            const resource = snapshot.val();
            if (resource.filePath) {
                downloadResource(resource.filePath);
            } else if (resource.downloadUrl) {
                window.open(resource.downloadUrl, '_blank');
            }
        });
    });

    deleteResourceBtn.addEventListener('click', () => {
        if (!currentResourceId) return;
        deleteResource(currentResourceId);
    });

    window.addEventListener('click', (e) => {
        if (e.target === uploadResourceModal) {
            closeUploadModal();
        }
        if (e.target === previewModal) {
            closePreviewModal();
        }
    });

    // 11. INITIALIZATION
    setupRealTimeListeners();
    setupUploadModal();

    window.addEventListener('beforeunload', () => {
        removeAllListeners();
    });
});