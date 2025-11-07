document.addEventListener('DOMContentLoaded', function() {
    // Initialize Firebase
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    
    const database = firebase.database();
    const usersRef = database.ref('users');
    
    // DOM Elements
    const statsContainer = document.querySelector('.stats-container');
    const changePasswordModal = document.getElementById('changePasswordModal');
    const changePasswordForm = document.getElementById('changePasswordForm');
    const currentPasswordInput = document.getElementById('currentPassword');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const closeModalBtn = document.querySelector('.close-modal');
    const strengthMeterFill = document.querySelector('.strength-meter-fill');
    
    // Initialize the dashboard
    initDashboard();
    
    function initDashboard() {
        // Create stat cards container
        statsContainer.innerHTML = `
            <div class="stats-grid">
                <!-- First Row (3 items) -->
                <div class="stat-card" id="students-stat">
                    <div class="stat-icon">
                        <i class="fas fa-users"></i>
                    </div>
                    <div class="stat-info">
                        <h3>Enrolled Students</h3>
                        <p class="stat-count">0</p>
                    </div>
                </div>
                <div class="stat-card" id="teachers-stat">
                    <div class="stat-icon">
                        <i class="fas fa-chalkboard-teacher"></i>
                    </div>
                    <div class="stat-info">
                        <h3>Active Teachers</h3>
                        <p class="stat-count">0</p>
                    </div>
                </div>
                <div class="stat-card" id="sections-stat">
                    <div class="stat-icon">
                        <i class="fas fa-columns"></i>
                    </div>
                    <div class="stat-info">
                        <h3>Total Sections</h3>
                        <p class="stat-count">0</p>
                    </div>
                </div>
                
                <!-- Second Row (3 items - including Change Password) -->
                <div class="stat-card" id="subjects-stat">
                    <div class="stat-icon">
                        <i class="fas fa-book"></i>
                    </div>
                    <div class="stat-info">
                        <h3>Active Subjects</h3>
                        <p class="stat-count">0</p>
                    </div>
                </div>
                <div class="stat-card" id="curriculums-stat">
                    <div class="stat-icon">
                        <i class="fas fa-folder-open"></i>
                    </div>
                    <div class="stat-info">
                        <h3>Active Curriculums</h3>
                        <p class="stat-count">0</p>
                    </div>
                </div>
                <div class="stat-card" id="change-password-stat">
                    <div class="stat-icon">
                        <i class="fas fa-key"></i>
                    </div>
                    <div class="stat-info">
                        <h3>Change Password</h3>
                        <p class="stat-count">Click to change</p>
                    </div>
                </div>
            </div>
        `;
        
        // Set up real-time listeners for each stat
        setupRealTimeCounts();
        
        // Add click event for change password panel
        document.getElementById('change-password-stat').addEventListener('click', showPasswordModal);
    }
    
    function showPasswordModal() {
        changePasswordModal.style.display = 'flex';
        resetPasswordStrengthMeter();
    }
    
    function resetPasswordStrengthMeter() {
        if (strengthMeterFill) {
            strengthMeterFill.style.width = '0%';
            strengthMeterFill.style.background = '#e74c3c';
        }
    }
    
    function setupRealTimeCounts() {
        // Students count (active only)
        database.ref('students').orderByChild('status').equalTo('active').on('value', snapshot => {
            const count = snapshot.numChildren();
            document.querySelector('#students-stat .stat-count').textContent = count;
        });
        
        // Teachers count (active only)
        database.ref('teachers').orderByChild('status').equalTo('active').on('value', snapshot => {
            const count = snapshot.numChildren();
            document.querySelector('#teachers-stat .stat-count').textContent = count;
        });
        
        // Sections count (active only)
        database.ref('sections').orderByChild('status').equalTo('active').on('value', snapshot => {
            const count = snapshot.numChildren();
            document.querySelector('#sections-stat .stat-count').textContent = count;
        });
        
        // Subjects count (active only)
        database.ref('subjects').orderByChild('status').equalTo('active').on('value', snapshot => {
            const count = snapshot.numChildren();
            document.querySelector('#subjects-stat .stat-count').textContent = count;
        });
        
        // Curriculums count (active only)
        database.ref('curriculums').orderByChild('status').equalTo('active').on('value', snapshot => {
            const count = snapshot.numChildren();
            document.querySelector('#curriculums-stat .stat-count').textContent = count;
        });
    }
    
    // Password strength calculation
    if (newPasswordInput) {
        newPasswordInput.addEventListener('input', function() {
            const password = this.value;
            let strength = 0;
            
            if (password.length > 0) strength += 20;
            if (password.length >= 8) strength += 20;
            if (/[A-Z]/.test(password)) strength += 20;
            if (/[0-9]/.test(password)) strength += 20;
            if (/[^A-Za-z0-9]/.test(password)) strength += 20;
            
            strengthMeterFill.style.width = strength + '%';
            
            if (strength < 40) {
                strengthMeterFill.style.background = '#e74c3c';
            } else if (strength < 80) {
                strengthMeterFill.style.background = '#f39c12';
            } else {
                strengthMeterFill.style.background = '#2ecc71';
            }
        });
    }
    
    // Change Password Form Submission
    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const currentPassword = currentPasswordInput.value;
            const newPassword = newPasswordInput.value;
            const confirmPassword = confirmPasswordInput.value;
            
            // Validate inputs
            if (!currentPassword || !newPassword || !confirmPassword) {
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'Please fill all fields',
                    confirmButtonColor: '#e74c3c'
                });
                return;
            }
            
            if (newPassword !== confirmPassword) {
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'New passwords do not match',
                    confirmButtonColor: '#e74c3c'
                });
                return;
            }
            
            if (newPassword.length < 8) {
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'Password must be at least 8 characters',
                    confirmButtonColor: '#e74c3c'
                });
                return;
            }
            
            if (!/[A-Z]/.test(newPassword)) {
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'Password must contain at least one uppercase letter',
                    confirmButtonColor: '#e74c3c'
                });
                return;
            }
            
            if (!/[0-9]/.test(newPassword)) {
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'Password must contain at least one number',
                    confirmButtonColor: '#e74c3c'
                });
                return;
            }
            
            // Get current user from sessionStorage
            const authUser = JSON.parse(sessionStorage.getItem('authUser'));
            if (!authUser || !authUser.id) {
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'User not authenticated',
                    confirmButtonColor: '#e74c3c'
                });
                return;
            }
            
            const userId = authUser.id;
            
            // Show loading state
            Swal.fire({
                title: 'Updating Password',
                html: 'Please wait while we update your password...',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });
            
            // Verify current password
            usersRef.child(userId).once('value')
                .then(snapshot => {
                    const userData = snapshot.val();
                    if (!userData) {
                        throw new Error('User not found');
                    }
                    
                    if (userData.password !== currentPassword) {
                        throw new Error('Current password is incorrect');
                    }
                    
                    // Update password
                    return usersRef.child(userId).update({
                        password: newPassword,
                        updatedAt: firebase.database.ServerValue.TIMESTAMP
                    });
                })
                .then(() => {
                    Swal.fire({
                        icon: 'success',
                        title: 'Success',
                        text: 'Password changed successfully!',
                        confirmButtonColor: '#4e73df',
                        timer: 3000,
                        timerProgressBar: true
                    });
                    resetForm();
                })
                .catch(error => {
                    console.error("Error changing password:", error);
                    Swal.fire({
                        icon: 'error',
                        title: 'Error',
                        text: error.message,
                        confirmButtonColor: '#e74c3c'
                    });
                });
        });
    }
    
    function resetForm() {
        if (changePasswordForm) changePasswordForm.reset();
        resetPasswordStrengthMeter();
        if (changePasswordModal) changePasswordModal.style.display = 'none';
    }
    
    // Close modal handlers
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', resetForm);
    }
    window.addEventListener('click', (e) => {
        if (e.target === changePasswordModal) {
            resetForm();
        }
    });
    
    // Logout functionality
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            sessionStorage.removeItem('authUser');
            window.location.href = '../index.html';
        });
    }
});