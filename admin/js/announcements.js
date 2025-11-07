document.addEventListener('DOMContentLoaded', function() {
    // Check authentication first
    const authUser = JSON.parse(localStorage.getItem('authUser')) || 
                     JSON.parse(sessionStorage.getItem('authUser'));
    
    if (!authUser) {
        window.location.href = '../../index.html';
        return;
    }

    // Initialize Firebase (make sure firebase-config.js is loaded first)
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    const database = firebase.database();

    // DOM Elements
    const addNewAnnouncementBtn = document.getElementById('addNewAnnouncementBtn');
    const announcementModal = document.getElementById('announcementModal');
    const cancelAnnouncementBtn = document.getElementById('cancelAnnouncementBtn');
    const announcementForm = document.getElementById('announcementForm');
    const announcementsList = document.getElementById('announcementsList');
    const searchInput = document.getElementById('announcementSearch');
    const searchBtn = document.getElementById('searchBtn');
    const audienceFilter = document.getElementById('audienceFilter');
    const statusFilter = document.getElementById('statusFilter');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const pageInfo = document.getElementById('pageInfo');

    // Modal Elements
    const modalTitle = document.getElementById('modalTitle');
    const announcementTitle = document.getElementById('announcementTitle');
    const announcementContent = document.getElementById('announcementContent');
    const announcementAudience = document.getElementById('announcementAudience');
    const specificSectionsContainer = document.getElementById('specificSectionsContainer');
    const startDate = document.getElementById('startDate');
    const endDate = document.getElementById('endDate');
    const announcementStatus = document.getElementById('announcementStatus');
    const attachmentInput = document.getElementById('attachment');

    // State variables
    let currentPage = 1;
    const announcementsPerPage = 5;
    let allAnnouncements = [];
    let filteredAnnouncements = [];
    let currentEditId = null;

    // Initialize date fields
    const today = new Date().toISOString().split('T')[0];
    startDate.value = today;
    startDate.min = today;
    endDate.min = today;

    // Event Listeners
    addNewAnnouncementBtn.addEventListener('click', showAddModal);
    cancelAnnouncementBtn.addEventListener('click', closeModal);
    announcementModal.addEventListener('click', function(e) {
        if (e.target === announcementModal) closeModal();
    });
    announcementAudience.addEventListener('change', toggleSpecificSections);
    startDate.addEventListener('change', function() {
        endDate.min = this.value;
    });
    announcementForm.addEventListener('submit', handleFormSubmit);
    searchBtn.addEventListener('click', filterAnnouncements);
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') filterAnnouncements();
    });
    audienceFilter.addEventListener('change', filterAnnouncements);
    statusFilter.addEventListener('change', filterAnnouncements);
    prevPageBtn.addEventListener('click', goToPrevPage);
    nextPageBtn.addEventListener('click', goToNextPage);

    // Initialize
    loadAnnouncements();
    loadSections();

    // Functions
    function showAddModal() {
        currentEditId = null;
        modalTitle.textContent = 'Create New Announcement';
        announcementForm.reset();
        startDate.value = today;
        announcementModal.style.display = 'flex';
    }

    function showEditModal(announcement) {
        currentEditId = announcement.id;
        modalTitle.textContent = 'Edit Announcement';
        
        // Fill form with announcement data
        announcementTitle.value = announcement.title;
        announcementContent.value = announcement.content;
        announcementAudience.value = announcement.audience;
        startDate.value = announcement.startDate;
        endDate.value = announcement.endDate || '';
        announcementStatus.value = announcement.status;
        
        // Handle specific sections
        if (announcement.audience === 'specific') {
            specificSectionsContainer.style.display = 'block';
            // Check the sections that were selected
            const checkboxes = document.querySelectorAll('input[name="sections"]');
            checkboxes.forEach(checkbox => {
                checkbox.checked = announcement.sections.includes(checkbox.value);
            });
        } else {
            specificSectionsContainer.style.display = 'none';
        }
        
        announcementModal.style.display = 'flex';
    }

    function closeModal() {
        announcementModal.style.display = 'none';
    }

    function toggleSpecificSections() {
        specificSectionsContainer.style.display = 
            this.value === 'specific' ? 'block' : 'none';
    }

    function loadAnnouncements() {
        const announcementsRef = database.ref('announcements');
        
        announcementsRef.on('value', (snapshot) => {
            allAnnouncements = [];
            snapshot.forEach((childSnapshot) => {
                const announcement = childSnapshot.val();
                announcement.id = childSnapshot.key;
                allAnnouncements.push(announcement);
            });
            
            // Sort by date (newest first)
            allAnnouncements.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
            
            filterAnnouncements();
        }, (error) => {
            console.error("Error loading announcements:", error);
            Swal.fire('Error', 'Failed to load announcements', 'error');
        });
    }

    function loadSections() {
        const classesRef = database.ref('classes');
        const sectionOptions = document.getElementById('sectionOptions');
        
        classesRef.once('value')
            .then((snapshot) => {
                sectionOptions.innerHTML = ''; // Clear existing options
                
                if (!snapshot.exists()) {
                    sectionOptions.innerHTML = '<p class="no-sections">No classes found</p>';
                    return;
                }
                
                snapshot.forEach((classSnapshot) => {
                    const classData = classSnapshot.val();
                    const classId = classSnapshot.key;
                    
                    // Format the display text
                    const displayText = `Gr. ${classData.gradeLevel} ${classData.strand} - ${classData.sectionNumber}`;
                    
                    // Create checkbox element
                    const label = document.createElement('label');
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.name = 'sections';
                    checkbox.value = classId;
                    
                    const textSpan = document.createElement('span');
                    textSpan.textContent = displayText;
                    
                    label.appendChild(checkbox);
                    label.appendChild(textSpan);
                    sectionOptions.appendChild(label);
                });
            })
            .catch((error) => {
                console.error("Error loading classes:", error);
                sectionOptions.innerHTML = '<p class="error-loading">Error loading classes</p>';
            });
    }

    function filterAnnouncements() {
        const searchTerm = searchInput.value.toLowerCase();
        const audience = audienceFilter.value;
        const status = statusFilter.value;
        
        filteredAnnouncements = allAnnouncements.filter(announcement => {
            // Search filter
            const matchesSearch = 
                announcement.title.toLowerCase().includes(searchTerm) || 
                announcement.content.toLowerCase().includes(searchTerm);
            
            // Audience filter
            const matchesAudience = 
                !audience || 
                announcement.audience === audience || 
                (audience === 'specific' && announcement.audience === 'specific');
            
            // Status filter
            const matchesStatus = 
                !status || 
                (status === 'active' && isAnnouncementActive(announcement)) || 
                (status === 'inactive' && !isAnnouncementActive(announcement));
            
            return matchesSearch && matchesAudience && matchesStatus;
        });
        
        currentPage = 1;
        renderAnnouncements();
    }

    function isAnnouncementActive(announcement) {
        const today = new Date();
        const startDate = new Date(announcement.startDate);
        const endDate = announcement.endDate ? new Date(announcement.endDate) : null;
        
        return today >= startDate && (!endDate || today <= endDate);
    }

    function renderAnnouncements() {
        const startIndex = (currentPage - 1) * announcementsPerPage;
        const endIndex = startIndex + announcementsPerPage;
        const paginatedAnnouncements = filteredAnnouncements.slice(startIndex, endIndex);
        
        announcementsList.innerHTML = '';
        
        if (paginatedAnnouncements.length === 0) {
            announcementsList.innerHTML = `
                <div class="no-results">
                    <i class="fas fa-info-circle"></i>
                    <p>No announcements found</p>
                </div>
            `;
        } else {
            paginatedAnnouncements.forEach(announcement => {
                const announcementCard = createAnnouncementCard(announcement);
                announcementsList.appendChild(announcementCard);
            });
        }
        
        updatePaginationControls();
    }

    function createAnnouncementCard(announcement) {
        const card = document.createElement('div');
        card.className = 'announcement-card';
        
        const isActive = isAnnouncementActive(announcement);
        const statusClass = isActive ? 'active' : 'inactive';
        const statusText = isActive ? 'Active' : 'Inactive';
        
        // Format date
        const formattedDate = new Date(announcement.startDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        // Create audience badges
        let audienceBadges = '';
        if (announcement.audience === 'specific' && announcement.sections) {
            announcement.sections.forEach(sectionId => {
                audienceBadges += `<span class="audience-badge specific">${sectionId}</span>`;
            });
        } else {
            audienceBadges = `<span class="audience-badge ${announcement.audience}">${
                announcement.audience === 'all' ? 'All Users' : 
                announcement.audience === 'students' ? 'Students' : 
                'Teachers'
            }</span>`;
        }
        
        card.innerHTML = `
            <div class="announcement-header">
                <h3>${announcement.title}</h3>
                <span class="announcement-date">${formattedDate}</span>
                <span class="announcement-status ${statusClass}">${statusText}</span>
            </div>
            <div class="announcement-content">
                <p>${announcement.content}</p>
            </div>
            <div class="announcement-footer">
                <div class="audience-badges">${audienceBadges}</div>
                <div class="announcement-actions">
                    <button class="btn-icon edit-btn"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon delete-btn"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
        
        // Add event listeners to action buttons
        card.querySelector('.edit-btn').addEventListener('click', () => showEditModal(announcement));
        card.querySelector('.delete-btn').addEventListener('click', () => confirmDelete(announcement.id));
        
        return card;
    }

    function updatePaginationControls() {
        const totalPages = Math.ceil(filteredAnnouncements.length / announcementsPerPage);
        
        pageInfo.textContent = `Page ${currentPage} of ${totalPages || 1}`;
        prevPageBtn.disabled = currentPage === 1;
        nextPageBtn.disabled = currentPage === totalPages || totalPages === 0;
    }

    function goToPrevPage() {
        if (currentPage > 1) {
            currentPage--;
            renderAnnouncements();
        }
    }

    function goToNextPage() {
        const totalPages = Math.ceil(filteredAnnouncements.length / announcementsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderAnnouncements();
        }
    }

    function handleFormSubmit(e) {
        e.preventDefault();
        
        // Get user from storage (using your auth system's format)
        const authUser = JSON.parse(localStorage.getItem('authUser')) || 
                        JSON.parse(sessionStorage.getItem('authUser'));
        
        if (!authUser) {
            Swal.fire('Error', 'User session expired. Please login again.', 'error');
            return;
        }
        
        // Get user ID - adjust this based on your actual authUser structure
        const userId = authUser.uid || authUser.userId || authUser.id;
        if (!userId) {
            Swal.fire('Error', 'Could not identify user. Please login again.', 'error');
            return;
        }
        
        // Get form values
        const title = announcementTitle.value.trim();
        const content = announcementContent.value.trim();
        const audience = announcementAudience.value;
        const startDateValue = startDate.value;
        const endDateValue = endDate.value;
        const status = announcementStatus.value;
        
        // Validate
        if (!title || !content || !audience || !startDateValue) {
            Swal.fire('Error', 'Please fill in all required fields', 'error');
            return;
        }
        
        // Get selected sections if audience is specific
        let sections = [];
        if (audience === 'specific') {
            const sectionCheckboxes = document.querySelectorAll('input[name="sections"]:checked');
            sections = Array.from(sectionCheckboxes).map(cb => cb.value);
            
            if (sections.length === 0) {
                Swal.fire('Error', 'Please select at least one section', 'error');
                return;
            }
        }
        
        // Prepare announcement data
        const announcementData = {
            title,
            content,
            audience,
            startDate: startDateValue,
            endDate: endDateValue || null,
            status,
            sections: audience === 'specific' ? sections : null,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            createdBy: userId
        };
        
        // Save to Firebase
        const announcementsRef = database.ref('announcements');
        const operation = currentEditId ? 
            announcementsRef.child(currentEditId).update(announcementData) :
            announcementsRef.push(announcementData);
        
        operation.then(() => {
            Swal.fire({
                title: 'Success!',
                text: `Announcement ${currentEditId ? 'updated' : 'published'} successfully`,
                icon: 'success',
                confirmButtonText: 'OK'
            });
            closeModal();
        }).catch(error => {
            console.error("Error saving announcement:", error);
            Swal.fire('Error', 'Failed to save announcement', 'error');
        });
    }

    function confirmDelete(announcementId) {
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
                database.ref(`announcements/${announcementId}`).remove()
                    .then(() => {
                        Swal.fire(
                            'Deleted!',
                            'The announcement has been deleted.',
                            'success'
                        );
                    })
                    .catch(error => {
                        console.error("Error deleting announcement:", error);
                        Swal.fire('Error', 'Failed to delete announcement', 'error');
                    });
            }
        });
    }
});