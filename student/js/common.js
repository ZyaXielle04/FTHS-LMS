document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const burgerMenu = document.querySelector('.burger-menu');
    const sidebar = document.querySelector('.student-sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    const mainContent = document.querySelector('.student-main');

    // Profile Modal Logic
    const profileBtn = document.getElementById("profileBtn");
    const profileModal = document.getElementById("profileModal");
    const closeProfileModal = document.querySelector(".close-profile-modal");
    const saveProfileBtn = document.getElementById("saveProfileBtn"); // New Save button

    const fullNameField = document.getElementById("profileFullName");
    const emailField = document.getElementById("profileEmail");
    const roleField = document.getElementById("profileRole");
    const guardianField = document.getElementById("profileGuardian");
    const contactField = document.getElementById("profileContact");
    const addressField = document.getElementById("profileAddress");

    // Make editable on focus
    [guardianField, contactField, addressField].forEach(field => {
        field.addEventListener('focus', () => field.removeAttribute('readonly'));
        field.addEventListener('blur', () => field.setAttribute('readonly', true)); // just re-lock after focus out
    });

    if (profileBtn && profileModal) {
        profileBtn.addEventListener("click", async () => {
            const authUser = JSON.parse(localStorage.getItem("authUser")) || 
                             JSON.parse(sessionStorage.getItem("authUser"));
            if (!authUser) return;

            try {
                const snapshot = await firebase.database().ref("students/" + authUser.id).once("value");
                const studentData = snapshot.val() || {};

                fullNameField.value = (studentData.firstName || "") + " " + (studentData.lastName || "");
                emailField.value = authUser.email || "No Email Found";
                roleField.value = authUser.role?.toUpperCase() || "STUDENT";
                guardianField.value = studentData.guardianName || "";
                contactField.value = studentData.contactNumber || "";
                addressField.value = studentData.address || "";

                profileModal.classList.add("show");
            } catch (err) {
                console.error(err);
                Swal.fire({
                    icon: "error",
                    title: "Error",
                    text: "Failed to load profile information."
                });
            }
        });
    }

    if (closeProfileModal) {
        closeProfileModal.addEventListener("click", () => profileModal.classList.remove("show"));
    }
    window.addEventListener("click", (e) => { 
        if (e.target === profileModal) profileModal.classList.remove("show"); 
    });

    // Save all changes on button click
    if (saveProfileBtn) {
        saveProfileBtn.addEventListener("click", async () => {
            const authUser = JSON.parse(localStorage.getItem("authUser")) || 
                             JSON.parse(sessionStorage.getItem("authUser"));
            if (!authUser) return;

            try {
                const updateData = {
                    guardianName: guardianField.value,
                    contactNumber: contactField.value,
                    address: addressField.value
                };

                await firebase.database().ref("students/" + authUser.id).update(updateData);

                Swal.fire({
                    icon: "success",
                    title: "Saved",
                    text: "Profile updated successfully",
                    timer: 1500,
                    showConfirmButton: false
                });

                profileModal.classList.remove("show");
            } catch (err) {
                console.error(err);
                Swal.fire({
                    icon: "error",
                    title: "Error",
                    text: "Failed to save profile information."
                });
            }
        });
    }

    // Sidebar toggle
    function toggleSidebar() {
        burgerMenu.classList.toggle('active');
        sidebar.classList.toggle('expanded');
        overlay.classList.toggle('active');
        if (window.innerWidth <= 480) mainContent.classList.toggle('no-scroll');
    }

    function closeSidebar() {
        burgerMenu.classList.remove('active');
        sidebar.classList.remove('expanded');
        overlay.classList.remove('active');
        mainContent.classList.remove('no-scroll');
    }

    burgerMenu.addEventListener('click', toggleSidebar);
    overlay.addEventListener('click', closeSidebar);

    const navLinks = document.querySelectorAll('.sidebar-nav a');
    navLinks.forEach(link => {
        link.addEventListener('click', function() {
            if (window.innerWidth < 1024) closeSidebar();
        });
    });

    window.addEventListener('resize', function() {
        if (window.innerWidth >= 1024) closeSidebar();
    });

    function initSidebar() {
        if (window.innerWidth >= 1024) sidebar.classList.add('expanded');
        else sidebar.classList.remove('expanded');
    }

    function updateDateTime() {
        const now = new Date();
        const options = {
            timeZone: 'Asia/Manila',
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        };
        const formattedDateTime = now.toLocaleString('en-PH', options);
        document.getElementById('currentDateTime').textContent = formattedDateTime;
    }

    updateDateTime();
    setInterval(updateDateTime, 1000);
    initSidebar();
});
