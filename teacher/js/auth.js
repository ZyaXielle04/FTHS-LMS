document.addEventListener('DOMContentLoaded', function() {
    // Check authentication status
    function checkAuth() {
        const authUser = JSON.parse(localStorage.getItem('authUser')) || 
                         JSON.parse(sessionStorage.getItem('authUser'));

        if (!authUser || authUser.role !== 'teacher') {
            localStorage.removeItem('authUser');
            sessionStorage.removeItem('authUser');
            window.location.href = '../../index.html';
            window.history.replaceState(null, null, window.location.href);
            return false;
        }
        
        return authUser; // Return the user object if authenticated
    }

    // Check auth on page load
    const currentUser = checkAuth();
    if (!currentUser) return;

    // Set teacher name in the dashboard
    if (currentUser.name) {
        document.getElementById('teacherName').textContent = currentUser.name;
    }

    // Logout functionality
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            localStorage.removeItem('authUser');
            sessionStorage.removeItem('authUser');
            window.location.href = '../../index.html';
        });
    }

    // Password Change Modal
    const changePasswordBtn = document.getElementById('changePasswordBtn');
    const changePasswordModal = document.getElementById('changePasswordModal');
    const closeModalBtn = document.querySelector('.close-modal');
    const changePasswordForm = document.getElementById('changePasswordForm');
    const newPasswordInput = document.getElementById('newPassword');
    const strengthMeterFill = document.querySelector('.strength-meter-fill');
    
    // Open modal
    if (changePasswordBtn) {
        changePasswordBtn.addEventListener('click', function() {
            changePasswordModal.style.display = 'flex';
        });
    }
    
    // Close modal
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', function() {
            changePasswordModal.style.display = 'none';
        });
    }
    
    // Close modal when clicking outside
    if (changePasswordModal) {
        changePasswordModal.addEventListener('click', function(e) {
            if (e.target === changePasswordModal) {
                changePasswordModal.style.display = 'none';
            }
        });
    }
    
    // Password strength indicator
    if (newPasswordInput) {
        newPasswordInput.addEventListener('input', function() {
            const password = newPasswordInput.value;
            let strength = 0;
            
            if (password.length >= 8) strength += 1;
            if (password.length >= 12) strength += 1;
            if (/[A-Z]/.test(password)) strength += 1;
            if (/[0-9]/.test(password)) strength += 1;
            if (/[^A-Za-z0-9]/.test(password)) strength += 1;
            
            let width = 0;
            let color = '#e74c3c';
            
            if (strength === 1) {
                width = 25;
            } else if (strength === 2) {
                width = 50;
                color = '#f39c12';
            } else if (strength === 3) {
                width = 75;
                color = '#f1c40f';
            } else if (strength >= 4) {
                width = 100;
                color = '#2ecc71';
            }
            
            strengthMeterFill.style.width = width + '%';
            strengthMeterFill.style.background = color;
        });
    }
    
    // Handle password change form submission
    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const currentPassword = document.getElementById('currentPassword').value;
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            
            // Basic validation
            if (newPassword !== confirmPassword) {
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'New passwords do not match!',
                });
                return;
            }
            
            if (newPassword.length < 8) {
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'Password must be at least 8 characters long!',
                });
                return;
            }
            
            // Get current user from auth system
            const authUser = JSON.parse(localStorage.getItem('authUser')) || 
                           JSON.parse(sessionStorage.getItem('authUser'));
            
            if (!authUser || !authUser.id) {
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'User not authenticated!',
                });
                return;
            }
            
            // Reference to the user in Firebase
            const userRef = firebase.database().ref('users/' + authUser.id);
            
            // Get current password from database
            userRef.once('value').then((snapshot) => {
                const userData = snapshot.val();
                
                if (!userData || !userData.password) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error',
                        text: 'User data not found!',
                    });
                    return;
                }
                
                // Verify current password
                if (userData.password !== currentPassword) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error',
                        text: 'Current password is incorrect!',
                    });
                    return;
                }
                
                // Update password in Firebase
                userRef.update({ password: newPassword })
                    .then(() => {
                        // Update authUser in storage if password was stored there
                        if (authUser.password) {
                            authUser.password = newPassword;
                            if (localStorage.getItem('authUser')) {
                                localStorage.setItem('authUser', JSON.stringify(authUser));
                            }
                            if (sessionStorage.getItem('authUser')) {
                                sessionStorage.setItem('authUser', JSON.stringify(authUser));
                            }
                        }
                        
                        Swal.fire({
                            icon: 'success',
                            title: 'Success',
                            text: 'Password updated successfully!',
                        });
                        changePasswordModal.style.display = 'none';
                        changePasswordForm.reset();
                        strengthMeterFill.style.width = '0%';
                    })
                    .catch((error) => {
                        Swal.fire({
                            icon: 'error',
                            title: 'Error',
                            text: 'Failed to update password: ' + error.message,
                        });
                    });
            });
        });
    }

    // Periodically check auth status (every 5 minutes)
    setInterval(checkAuth, 300000);
});