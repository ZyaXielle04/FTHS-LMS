// =======================================================
//   Student Notifications System (Firebase RTDB)
// =======================================================

document.addEventListener('DOMContentLoaded', () => {
    const authUser = JSON.parse(localStorage.getItem('authUser')) || 
                     JSON.parse(sessionStorage.getItem('authUser'));

    if (!authUser || authUser.role !== 'student') {
        window.location.href = '../index.html';
        return;
    }

    const studentId = authUser.id;

    loadAllNotifications(studentId);
    listenForNewNotifications(studentId);
});

// =======================================================
//   Realtime new notification listener (toast popup)
// =======================================================
function listenForNewNotifications(studentId) {
    firebase.database()
        .ref(`notifications/${studentId}`)
        .limitToLast(1)
        .on("child_added", snapshot => {
            const notif = snapshot.val();
            if (!notif.seen) {
                showNotificationToast(notif.title, notif.message);
            }
        });
}

// =======================================================
//   Load all notifications in notifications.html
// =======================================================
function loadAllNotifications(studentId) {
    const list = document.getElementById("notificationsList");
    if (!list) return;

    firebase.database()
        .ref(`notifications/${studentId}`)
        .orderByChild("timestamp")
        .on("value", snapshot => {

            list.innerHTML = "";

            if (!snapshot.exists()) {
                list.innerHTML = `<p class="no-notifs">No notifications yet.</p>`;
                return;
            }

            snapshot.forEach(child => {
                const notif = child.val();
                const key = child.key;

                const div = document.createElement("div");
                div.className = `notification-item ${notif.seen ? "" : "unread"}`;
                div.setAttribute("data-key", key);
                div.innerHTML = `
                    <div class="notif-icon"><i class="fas fa-info-circle"></i></div>
                    <div class="notif-info">
                        <h3>${notif.title}</h3>
                        <p>${notif.message}</p>
                        <span class="notif-time">${formatTime(notif.timestamp)}</span>
                    </div>
                    <button class="mark-read-btn" ${notif.seen ? "style='display:none'" : ""}>
                        Mark as Read
                    </button>
                `;

                list.prepend(div);
            });

            activateMarkReadButtons(studentId);
            activateNotificationClicks(studentId);
        });
}

// =======================================================
//   Mark notification as read (button)
// =======================================================
function activateMarkReadButtons(studentId) {
    document.querySelectorAll(".mark-read-btn").forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation(); // prevent parent click
            const key = btn.parentElement.getAttribute("data-key");
            markNotificationAsSeen(studentId, key, btn.parentElement, btn);
        };
    });
}

// =======================================================
//   Mark notification item as seen (click on item)
// =======================================================
function activateNotificationClicks(studentId) {
    document.querySelectorAll(".notification-item").forEach(item => {
        item.onclick = () => {
            const key = item.getAttribute("data-key");
            const btn = item.querySelector(".mark-read-btn");
            markNotificationAsSeen(studentId, key, item, btn);
        };
    });
}

// =======================================================
//   Common function to mark notification as seen
// =======================================================
function markNotificationAsSeen(studentId, key, item, btn) {
    if (!item.classList.contains("unread")) return;

    firebase.database()
        .ref(`notifications/${studentId}/${key}/seen`)
        .set(true)
        .then(() => {
            item.classList.remove("unread");
            if (btn) btn.style.display = "none";
        });
}

// =======================================================
//   Toast popup (bottom-right)
// =======================================================
function showNotificationToast(title, message) {
    const toast = document.createElement("div");
    toast.className = "notif-toast";
    toast.innerHTML = `<strong>${title}</strong><br>${message}`;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("fade");
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// =======================================================
//   Helper to format time
// =======================================================
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString();
}
