document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');
    const resetPassword = document.getElementById('resetPassword');
    const loginError = document.getElementById('loginError');
    const passwordError = document.getElementById('passwordError');

    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const loginId = document.getElementById('loginId').value.trim();
        const password = document.getElementById('password').value.trim();
        const rememberMe = document.querySelector('input[name="remember"]').checked;

        // Clear previous errors
        loginError.textContent = '';
        passwordError.textContent = '';
        loginBtn.disabled = true;
        loginBtn.textContent = 'Logging in...';

        try {
            // Query users in Firebase
            const usersRef = firebase.database().ref('users');
            const snapshot = await usersRef.once('value');
            
            if (!snapshot.exists()) {
                throw new Error('No users found in database');
            }

            let userFound = false;
            let userData = null;
            let userId = null;

            // Search through all users
            snapshot.forEach((childSnapshot) => {
                const user = childSnapshot.val();
                if (user.email === loginId || childSnapshot.key === loginId) {
                    userFound = true;
                    userData = user;
                    userId = childSnapshot.key;
                    return true; // Break the loop
                }
            });

            if (!userFound) {
                loginError.textContent = 'User not found';
                return;
            }

            if (userData.password !== password) {
                passwordError.textContent = 'Incorrect password';
                return;
            }

            // Successful login
            if (rememberMe) {
                localStorage.setItem('authUser', JSON.stringify({
                    id: userId,
                    email: userData.email,
                    role: userData.role
                }));
            } else {
                sessionStorage.setItem('authUser', JSON.stringify({
                    id: userId,
                    email: userData.email,
                    role: userData.role
                }));
            }

            // Redirect based on role
            switch(userData.role) {
                case 'admin':
                    window.location.href = 'admin/dashboard.html';
                    break;
                case 'teacher':
                    window.location.href = 'teacher/dashboard.html';
                    break;
                case 'student':
                    window.location.href = 'student/dashboard.html';
                    break;
                default:
                    window.location.href = 'login.html';
            }

        } catch (error) {
            console.error('Login error:', error);
            loginError.textContent = 'Login failed. Please try again.';
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Login';
        }
    });

    // Password reset functionality
    resetPassword.addEventListener('click', function(e) {
        e.preventDefault();
        alert('Password reset functionality will be implemented here');
        // You can implement Firebase password reset here
    });
});