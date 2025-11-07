async function loadAnnouncementsContent(classId) {
    try {
        // Get the current user
        const authUser = JSON.parse(localStorage.getItem('authUser')) || 
                         JSON.parse(sessionStorage.getItem('authUser'));
        
        if (!authUser) {
            return '<div class="error-message">Please log in to view announcements</div>';
        }

        // Fetch announcements from Firebase
        const announcementsRef = firebase.database().ref('announcements');
        const snapshot = await announcementsRef
            .orderByChild('createdAt')
            .once('value');
        
        if (!snapshot.exists()) {
            return '<div class="no-content">No announcements found.</div>';
        }

        // Process announcements
        const announcements = [];
        snapshot.forEach(announcementSnapshot => {
            const announcement = announcementSnapshot.val();
            announcement.id = announcementSnapshot.key;
            
            // Check if this announcement should be shown to this student in this class
            if (shouldShowAnnouncement(announcement, classId, authUser.id)) {
                announcements.push(announcement);
            }
        });

        // Sort by date (newest first)
        announcements.sort((a, b) => b.createdAt - a.createdAt);

        // Generate HTML content
        if (announcements.length === 0) {
            return '<div class="no-content">No announcements for this class.</div>';
        }

        let html = `
            <div class="section-header">
                <h2><i class="fas fa-bullhorn"></i> Class Announcements</h2>
                <p>Important updates and information from your teacher</p>
            </div>
            <div class="announcements-container">
        `;

        announcements.forEach(announcement => {
            const date = new Date(announcement.createdAt);
            const formattedDate = formatAnnouncementDate(date);
            
            html += `
                <div class="announcement-card">
                    <div class="announcement-header">
                        <h3>${announcement.title || 'Untitled Announcement'}</h3>
                        <span class="announcement-date">${formattedDate}</span>
                    </div>
                    <div class="announcement-content">
                        <p>${announcement.content || ''}</p>
                    </div>
                    ${announcement.attachmentUrl ? `
                    <div class="announcement-attachment">
                        <i class="fas fa-paperclip"></i>
                        <a href="${announcement.attachmentUrl}" target="_blank">Download Attachment</a>
                    </div>
                    ` : ''}
                </div>
            `;
        });

        html += '</div>'; // Close announcements-container
        
        return html;
    } catch (error) {
        console.error('Error loading announcements:', error);
        return '<div class="error-message">Failed to load announcements. Please try again.</div>';
    }
}

// Helper function to determine if an announcement should be shown
function shouldShowAnnouncement(announcement, classId, studentId) {
    const audience = announcement.audience;
    
    // If audience is "all" or "students", show to everyone
    if (audience === 'all' || audience === 'students') {
        return true;
    }
    
    // If audience is "specific", check if this class is included
    if (audience === 'specific' && announcement.sections) {
        // Check if any of the sections matches the current class ID
        return Object.values(announcement.sections).includes(classId);
    }
    
    return false;
}

// Helper function to format announcement date
function formatAnnouncementDate(date) {
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
        return 'Today at ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    } else if (diffDays === 1) {
        return 'Yesterday at ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    } else if (diffDays < 7) {
        return `${diffDays} days ago`;
    } else {
        return date.toLocaleDateString();
    }
}