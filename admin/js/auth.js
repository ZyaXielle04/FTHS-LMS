document.addEventListener('DOMContentLoaded', function() {
    // Check authentication status
    function checkAuth() {
        const authUser = JSON.parse(localStorage.getItem('authUser')) || 
                         JSON.parse(sessionStorage.getItem('authUser'));
        if (!authUser || authUser.role !== 'admin') {
            localStorage.removeItem('authUser');
            sessionStorage.removeItem('authUser');
            window.location.href = '../../index.html';
            window.history.replaceState(null, null, window.location.href);
            return false;
        }
        return true;
    }

    if (!checkAuth()) return;

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            localStorage.removeItem('authUser');
            sessionStorage.removeItem('authUser');
            window.location.href = '../../index.html';
        });
    }

    setInterval(checkAuth, 300000);

    // --- PROFILE MODAL LOGIC ---
    const profileBtn = document.getElementById("profileBtn");
    const profileModal = document.getElementById("profileModal");
    const closeProfileModal = document.querySelector(".close-profile-modal");

    const fullNameField = document.getElementById("profileFullName");
    const emailField = document.getElementById("profileEmail");
    const roleField = document.getElementById("profileRole");

    // Show profile modal
    if (profileBtn && profileModal) {
        profileBtn.addEventListener("click", async (e) => {
            e.preventDefault();

            const authUser = JSON.parse(localStorage.getItem("authUser")) ||
                             JSON.parse(sessionStorage.getItem("authUser"));
            if (!authUser) return;

            try {
                const dbRef = firebase.database().ref("users/" + authUser.id);
                const snapshot = await dbRef.once("value");
                if (!snapshot.exists()) throw new Error("User not found");

                const userData = snapshot.val();
                fullNameField.value = userData.fullName || "No Name Found";
                emailField.value = userData.email || "No Email Found";
                roleField.value = userData.role?.toUpperCase() || "UNKNOWN";

                profileModal.classList.add("show");
            } catch (error) {
                console.error("Error fetching user data:", error);
                Swal.fire({
                    icon: "error",
                    title: "Error Loading Profile",
                    text: "Could not load user data from database.",
                });
            }
        });
    }

    // Close profile modal
    if (closeProfileModal) {
        closeProfileModal.addEventListener("click", () => {
            profileModal.classList.remove("show");
        });
    }

    window.addEventListener("click", (e) => {
        if (e.target === profileModal) {
            profileModal.classList.remove("show");
        }
    });

    // Auto logout after 15 minutes of inactivity
    let inactivityTimer;
    const inactivityLimit = 15 * 60 * 1000; // 15 minutes in milliseconds

    function resetInactivityTimer() {
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
            Swal.fire({
                icon: 'warning',
                title: 'Logged Out Due to Inactivity',
                text: 'You have been inactive for 15 minutes. You will be logged out now.',
                confirmButtonColor: '#3085d6',
            }).then(() => {
                localStorage.removeItem('authUser');
                sessionStorage.removeItem('authUser');
                window.location.href = '../../index.html';
            });
        }, inactivityLimit);
    }

    // Reset timer on user activity
    ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart'].forEach(event => {
        document.addEventListener(event, resetInactivityTimer, true);
    });

    // Start the timer on page load
    resetInactivityTimer();

    // --- PASSWORD UPDATE LOGIC ---
    const currentPasswordField = document.getElementById("currentPassword");
    const newPasswordField = document.getElementById("newPassword");
    const confirmPasswordField = document.getElementById("confirmPassword");
    const updatePasswordBtn = document.getElementById("updatePasswordBtn");

    if (!updatePasswordBtn) return;

    updatePasswordBtn.addEventListener("click", async (e) => {
        e.preventDefault();

        const authUser = JSON.parse(localStorage.getItem("authUser")) ||
                        JSON.parse(sessionStorage.getItem("authUser"));
        if (!authUser) return;

        const currentPassword = currentPasswordField.value.trim();
        const newPassword = newPasswordField.value.trim();
        const confirmPassword = confirmPasswordField.value.trim();

        if (!currentPassword || !newPassword || !confirmPassword) {
            Swal.fire({
                icon: "error",
                title: "Missing Fields",
                text: "Please fill in all password fields.",
                customClass: {
                    popup: 'swal-zindex'
                }
            });
            return;
        }

        if (newPassword !== confirmPassword) {
            Swal.fire({
                icon: "error",
                title: "Password Mismatch",
                text: "New password and confirm password do not match.",
                customClass: {
                    popup: 'swal-zindex'
                }
            });
            return;
        }

        if (newPassword.length < 6) {
            Swal.fire({
                icon: "error",
                title: "Weak Password",
                text: "New password should be at least 6 characters long.",
                customClass: {
                    popup: 'swal-zindex'
                }
            });
            return;
        }

        try {
            const passwordRef = firebase.database().ref(`users/${authUser.id}/password`);
            const snapshot = await passwordRef.once("value");
            const dbPassword = snapshot.val();

            if (dbPassword !== currentPassword) {
                Swal.fire({
                    icon: "error",
                    title: "Incorrect Current Password",
                    text: "Please enter your correct current password.",
                    customClass: {
                        popup: 'swal-zindex'
                    }
                });
                return;
            }

            await passwordRef.set(newPassword);

            Swal.fire({
                icon: "success",
                title: "Password Updated",
                text: "Your password has been updated successfully.",
                customClass: {
                    popup: 'swal-zindex'
                },
                didClose: () => {
                    // Reset fields and close modal
                    currentPasswordField.value = "";
                    newPasswordField.value = "";
                    confirmPasswordField.value = "";
                    profileModal.classList.remove("show");
                }
            });

        } catch (error) {
            console.error("Error updating password:", error);
            Swal.fire({
                icon: "error",
                title: "Update Failed",
                text: "Could not update password. Please try again later.",
                customClass: {
                    popup: 'swal-zindex'
                }
            });
        }
    });
});
