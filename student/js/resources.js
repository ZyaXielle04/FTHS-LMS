// resources.js

/**
 * Loads and displays resources for a specific class
 * @param {string} classId - The ID of the class to load resources for
 * @returns {Promise<string>} HTML content for the resources section
 */
async function loadResourcesContent(classId) {
    try {
        // Fetch resources from Firebase
        const resourcesRef = firebase.database().ref(`classes/${classId}/resources`);
        const snapshot = await resourcesRef.once('value');
        
        if (!snapshot.exists()) {
            return `
                <div class="resources-container">
                    <h2 class="resources-title">Resources</h2>
                    <p class="no-resources-message">No resources available for this class yet.</p>
                </div>
            `;
        }

        const resourcesData = snapshot.val();
        const resources = Object.entries(resourcesData).map(([id, resource]) => ({
            id,
            name: resource.title || 'Untitled Resource',
            description: resource.description || '',
            size: resource.fileSize || 0,
            type: getFileType(resource.filePath || ''), // Using the previous getFileType function
            downloadURL: resource.filePath || '#',
            uploadDate: resource.timestamp ? new Date(resource.timestamp) : new Date(),
            fileName: resource.filePath ? resource.filePath.split('/').pop() : ''
        }));

        // Sort resources by upload date (newest first)
        resources.sort((a, b) => b.uploadDate - a.uploadDate);

        // Generate HTML
        let html = `
            <div class="resources-container">
                <h2 class="resources-title">Resources</h2>
                <div class="resources-grid">
        `;

        resources.forEach(resource => {
            const uploadDate = resource.uploadDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
            
            const iconClass = getFileIconClass(resource.type);
            const statusClass = resource.type.toLowerCase(); // For status badge styling
            
            html += `
                <div class="resource-card" data-resource-id="${resource.id}">
                    <div class="resource-icon">
                        <i class="${iconClass}"></i>
                    </div>
                    <div class="resource-info">
                        <h3 class="resource-name">${resource.name}</h3>
                        <p class="resource-description">${resource.description}</p>
                        <div class="resource-meta">
                            <span class="resource-date">${uploadDate}</span>
                            <span class="resource-size">${formatFileSize(resource.size)}</span>
                            <span class="resource-type-badge ${statusClass}">${resource.type}</span>
                        </div>
                    </div>
                    <div class="resource-actions">
                        <a href="${resource.downloadURL}" class="download-btn" download="${resource.fileName}">
                            <i class="fas fa-download"></i> Download
                        </a>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;

        return html;
    } catch (error) {
        console.error('Error loading resources:', error);
        return `
            <div class="error-message">
                Failed to load resources. Please try again later.
            </div>
        `;
    }
}

/**
 * Determines file type from filename or path
 * @param {string} filename 
 * @returns {string} file type (capitalized)
 */
function getFileType(filename) {
    if (!filename) return 'Unknown';
    
    const extension = filename.split('.').pop().toLowerCase();
    
    if (['pdf'].includes(extension)) return 'PDF';
    if (['doc', 'docx'].includes(extension)) return 'Word';
    if (['ppt', 'pptx'].includes(extension)) return 'PowerPoint';
    if (['xls', 'xlsx'].includes(extension)) return 'Excel';
    if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(extension)) return 'Image';
    if (['mp4', 'mov', 'avi'].includes(extension)) return 'Video';
    if (['mp3', 'wav'].includes(extension)) return 'Audio';
    if (['zip', 'rar'].includes(extension)) return 'Archive';
    if (['txt', 'rtf'].includes(extension)) return 'Text';
    
    return 'File'; // Default type
}

/**
 * Gets appropriate Font Awesome icon class for file type
 * @param {string} fileType 
 * @returns {string} icon class
 */
function getFileIconClass(fileType) {
    const icons = {
        'pdf': 'fas fa-file-pdf',
        'word': 'fas fa-file-word',
        'powerpoint': 'fas fa-file-powerpoint',
        'excel': 'fas fa-file-excel',
        'image': 'fas fa-file-image',
        'video': 'fas fa-file-video',
        'audio': 'fas fa-file-audio',
        'archive': 'fas fa-file-archive',
        'text': 'fas fa-file-alt',
        'file': 'fas fa-file'
    };
    
    // Convert to lowercase for case-insensitive matching
    return icons[fileType.toLowerCase()] || icons.file;
}

/**
 * Formats file size in human-readable format
 * @param {number} bytes 
 * @returns {string} formatted size
 */
function formatFileSize(bytes) {
    if (typeof bytes !== 'number' || bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Sets up event listeners for resource interactions
 */
function setupResourcesInteractions() {
    document.addEventListener('click', function(e) {
        const downloadBtn = e.target.closest('.download-btn');
        if (downloadBtn) {
            // Track download event if needed
            const resourceCard = downloadBtn.closest('.resource-card');
            const resourceId = resourceCard.dataset.resourceId;
            console.log('Downloading resource:', resourceId);
        }
        
        const resourceCard = e.target.closest('.resource-card');
        if (resourceCard && !downloadBtn) {
            // Handle resource card click (excluding download button)
            const resourceId = resourceCard.dataset.resourceId;
            console.log('Viewing resource details:', resourceId);
        }
    });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupResourcesInteractions);
} else {
    setupResourcesInteractions();
}