document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');
    const resetPassword = document.getElementById('resetPassword');

    const maxAttempts = 5;

    // Helper to get localStorage key for a specific user
    function getAttemptsKey(userId) {
        return `loginAttempts_${userId}`;
    }

    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const loginId = document.getElementById('loginId').value.trim();
        const password = document.getElementById('password').value.trim();
        const rememberMe = document.querySelector('input[name="remember"]').checked;

        loginBtn.disabled = true;
        loginBtn.textContent = 'Logging in...';

        try {
            const usersRef = firebase.database().ref('users');
            const snapshot = await usersRef.once('value');

            if (!snapshot.exists()) {
                throw new Error('No users found in database');
            }

            let userFound = false;
            let userData = null;
            let userId = null;

            snapshot.forEach((childSnapshot) => {
                const user = childSnapshot.val();
                if (user.email === loginId || childSnapshot.key === loginId) {
                    userFound = true;
                    userData = user;
                    userId = childSnapshot.key;
                    return true; // break loop
                }
            });

            if (!userFound) {
                Swal.fire({
                    icon: 'error',
                    title: 'Login Failed',
                    text: 'User not found.'
                });
                return;
            }

            // Admins cannot be locked
            const isAdmin = userData.role === 'admin';

            // Check if account is locked in RTDB (only for non-admins)
            if (!isAdmin && userData.locked) {
                Swal.fire({
                    icon: 'error',
                    title: 'Account Locked',
                    text: 'Your account is locked due to multiple failed login attempts. Please consult to the ICT Department to unlock your account.'
                });
                return;
            }

            // Get current failed attempts from localStorage
            const attemptsKey = getAttemptsKey(userId);
            let attempts = parseInt(localStorage.getItem(attemptsKey)) || 0;

            if (userData.password !== password) {
                if (!isAdmin) {
                    attempts++;
                    localStorage.setItem(attemptsKey, attempts);

                    // Lock account in Firebase after max attempts
                    if (attempts >= maxAttempts) {
                        await usersRef.child(userId).update({ locked: true });
                        Swal.fire({
                            icon: 'error',
                            title: 'Account Locked',
                            text: 'Your account has been locked due to 5 failed login attempts. Please consult to the ICT Department to unlock your account.'
                        });
                        return;
                    }
                }

                Swal.fire({
                    icon: 'error',
                    title: 'Login Failed',
                    text: `Incorrect password.`
                });
                return;
            }

            // Successful login -> reset failed attempts
            if (!isAdmin) localStorage.setItem(attemptsKey, 0);

            // Store auth info
            const authData = {
                id: userId,
                email: userData.email,
                role: userData.role
            };

            if (rememberMe) {
                localStorage.setItem('authUser', JSON.stringify(authData));
            } else {
                sessionStorage.setItem('authUser', JSON.stringify(authData));
            }

            // Redirect based on role
            switch (userData.role) {
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
            Swal.fire({
                icon: 'error',
                title: 'Login Error',
                text: 'Login failed. Please try again.'
            });
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Login';
        }
    });

    // Password reset placeholder
    resetPassword.addEventListener('click', function(e) {
        e.preventDefault();
        Swal.fire({
            icon: 'info',
            title: 'Password Reset',
            text: 'Password reset functionality will be implemented here.'
        });
    });
});
