// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {
    // Get teacher ID from sessionStorage
    const authUser = sessionStorage.getItem('authUser') ? JSON.parse(sessionStorage.getItem('authUser')) : null;
    const teacherId = authUser ? authUser.id : null;
    
    if (!teacherId) {
        console.error('No teacher ID found in sessionStorage');
        return;
    }

    // Initialize Firebase
    const database = firebase.database();

    // Fetch teacher name from /users path
    fetchTeacherName(teacherId);

    // Fetch and display dashboard statistics
    fetchDashboardStatistics(teacherId);

    // Fetch and display today's schedule
    fetchTodaysSchedule(teacherId);

    function fetchTeacherName(teacherId) {
        const userRef = database.ref(`users/${teacherId}`);
        
        userRef.once('value').then(snapshot => {
            const userData = snapshot.val();
            const teacherName = userData ? userData.name : '[Teacher Name]';
            document.getElementById('teacherName').textContent = teacherName;
        }).catch(error => {
            console.error('Error fetching teacher name:', error);
            document.getElementById('teacherName').textContent = '[Teacher Name]';
        });
    }

    function fetchDashboardStatistics(teacherId) {
        // Fetch active classes count
        fetchActiveClassesCount(teacherId);
        
        // Fetch total students count
        fetchTotalStudentsCount(teacherId);
        
        // Fetch new announcements count
        fetchNewAnnouncementsCount();
    }

    function fetchActiveClassesCount(teacherId) {
        const classesRef = database.ref('classes');
        
        classesRef.once('value').then(snapshot => {
            let count = 0;
            snapshot.forEach(classSnapshot => {
                const classData = classSnapshot.val();
                if (classData.teacher === teacherId) {
                    count++;
                }
            });
            document.getElementById('activeClassesCount').textContent = count;
        }).catch(error => {
            console.error('Error fetching classes:', error);
        });
    }

    function fetchTotalStudentsCount(teacherId) {
        const classesRef = database.ref('classes');
        const uniqueStudentIds = new Set();
        
        classesRef.once('value').then(snapshot => {
            const promises = [];
            
            snapshot.forEach(classSnapshot => {
                const classData = classSnapshot.val();
                if (classData.teacher === teacherId) {
                    const classId = classSnapshot.key;
                    const studentsRef = database.ref(`classes/${classId}/students`);
                    
                    promises.push(
                        studentsRef.once('value').then(studentsSnapshot => {
                            studentsSnapshot.forEach(studentSnapshot => {
                                uniqueStudentIds.add(studentSnapshot.key);
                            });
                        })
                    );
                }
            });
            
            return Promise.all(promises);
        }).then(() => {
            document.getElementById('totalStudentsCount').textContent = uniqueStudentIds.size;
        }).catch(error => {
            console.error('Error fetching students:', error);
        });
    }

    function fetchNewAnnouncementsCount() {
        const announcementsRef = database.ref('announcements');
        let count = 0;
        
        announcementsRef.once('value').then(snapshot => {
            snapshot.forEach(announcementSnapshot => {
                const announcement = announcementSnapshot.val();
                if ((announcement.createdBy && announcement.createdBy.startsWith('ADM')) && 
                    (announcement.audience === 'all' || announcement.audience === 'teachers')) {
                    count++;
                }
            });
            document.getElementById('newAnnouncementsCount').textContent = count;
        }).catch(error => {
            console.error('Error fetching announcements:', error);
        });
    }

    function fetchTodaysSchedule(teacherId) {
        const classesRef = database.ref('classes');
        const todaysScheduleContainer = document.getElementById('todaysSchedule');
        
        // Clear existing schedule items
        todaysScheduleContainer.innerHTML = '';
        
        // Get current day (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
        const today = new Date().getDay();
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const todayName = dayNames[today];
        
        classesRef.once('value').then(snapshot => {
            const scheduleItems = [];
            
            snapshot.forEach(classSnapshot => {
                const classData = classSnapshot.val();
                const classId = classSnapshot.key;
                
                // Check if this is the teacher's class and has schedule data
                if (classData.teacher === teacherId && classData.schedule) {
                    const schedule = classData.schedule;
                    
                    // Check if this class occurs today
                    if (schedule.days && schedule.days.includes(todayName)) {
                        // Create schedule item HTML
                        const startTime = formatTime(schedule.start_time);
                        const endTime = formatTime(schedule.end_time);
                        
                        const scheduleItem = document.createElement('div');
                        scheduleItem.className = 'schedule-item';
                        scheduleItem.innerHTML = `
                            <div class="class-time">${startTime} - ${endTime}</div>
                            <div class="class-info">
                                <h3>${classData.gradeLevel ? 'Grade ' + classData.gradeLevel + ' - ' : ''}${classData.subjectName || 'No Subject'}</h3>
                                <p>${classData.sectionNumber ? 'Section ' + classData.sectionNumber : ''}${classData.roomNumber ? ' | Room ' + classData.roomNumber : ''}</p>
                            </div>
                            <button class="attendance-btn" data-class-id="${classId}">Take Attendance</button>
                        `;
                        
                        // Convert time to minutes for sorting
                        const startMinutes = convertTimeToMinutes(schedule.start_time);
                        scheduleItems.push({
                            startTime: startMinutes,
                            element: scheduleItem
                        });
                    }
                }
            });
            
            // Sort schedule items by start time
            scheduleItems.sort((a, b) => a.startTime - b.startTime);
            
            // Add sorted items to the container
            scheduleItems.forEach(item => {
                todaysScheduleContainer.appendChild(item.element);
            });
            
            // Add event listeners to attendance buttons
            document.querySelectorAll('.attendance-btn').forEach(button => {
                button.addEventListener('click', function() {
                    const classId = this.getAttribute('data-class-id');
                    window.location.href = `attendance.html?class=${classId}`;
                });
            });
            
            // If no classes today, show message
            if (scheduleItems.length === 0) {
                todaysScheduleContainer.innerHTML = '<div class="no-classes">No classes scheduled for today.</div>';
            }
            
        }).catch(error => {
            console.error('Error fetching today\'s schedule:', error);
            todaysScheduleContainer.innerHTML = '<div class="error">Error loading schedule. Please try again.</div>';
        });
    }

    // Add this function to fetch and display recent announcements
    function fetchRecentAnnouncements() {
        const announcementsRef = firebase.database().ref('announcements');
        const announcementList = document.querySelector('.announcement-list');
        
        // Clear existing announcements
        announcementList.innerHTML = '';
        
        announcementsRef.orderByChild('createdAt').limitToLast(5).once('value').then(snapshot => {
            const announcements = [];
            
            snapshot.forEach(announcementSnapshot => {
                const announcement = announcementSnapshot.val();
                const announcementId = announcementSnapshot.key;
                
                // Check if announcement is for teachers or all users
                if (announcement.audience === 'teachers' || announcement.audience === 'all') {
                    announcements.push({
                        id: announcementId,
                        ...announcement
                    });
                }
            });
            
            // Sort announcements by date (newest first)
            announcements.sort((a, b) => b.createdAt - a.createdAt);
            
            // Display announcements
            if (announcements.length === 0) {
                announcementList.innerHTML = '<div class="no-announcements">No recent announcements found.</div>';
                return;
            }
            
            announcements.forEach(announcement => {
                const announcementItem = document.createElement('div');
                announcementItem.className = 'announcement-item';
                
                // Format the date
                const announcementDate = new Date(announcement.createdAt);
                const formattedDate = formatAnnouncementDate(announcementDate);
                
                announcementItem.innerHTML = `
                    <h4>${announcement.title || 'No Title'}</h4>
                    <p>${announcement.content || ''}</p>
                    <span class="announcement-date">${formattedDate}</span>
                `;
                
                announcementList.appendChild(announcementItem);
            });
            
        }).catch(error => {
            console.error('Error fetching announcements:', error);
            announcementList.innerHTML = '<div class="error">Error loading announcements. Please try again.</div>';
        });
    }

    // Helper function to format announcement date
    function formatAnnouncementDate(date) {
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);
        
        if (diffInSeconds < 60) {
            return 'Just now';
        }
        
        const diffInMinutes = Math.floor(diffInSeconds / 60);
        if (diffInMinutes < 60) {
            return `${diffInMinutes} minute${diffInMinutes !== 1 ? 's' : ''} ago`;
        }
        
        const diffInHours = Math.floor(diffInMinutes / 60);
        if (diffInHours < 24) {
            return `${diffInHours} hour${diffInHours !== 1 ? 's' : ''} ago`;
        }
        
        const diffInDays = Math.floor(diffInHours / 24);
        if (diffInDays === 1) {
            return 'Yesterday, ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        
        if (diffInDays < 7) {
            return `${diffInDays} days ago`;
        }
        
        return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    // Call this function in your fetchDashboardStatistics function
    function fetchDashboardStatistics(teacherId) {
        // Fetch active classes count
        fetchActiveClassesCount(teacherId);
        
        // Fetch total students count
        fetchTotalStudentsCount(teacherId);
        
        // Fetch new announcements count
        fetchNewAnnouncementsCount();
        
        // Fetch recent announcements
        fetchRecentAnnouncements();
    }

    // Helper function to convert "HH:MM" time to minutes for sorting
    function convertTimeToMinutes(timeStr) {
        if (!timeStr) return 0;
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    }

    // Helper function to format military time (HH:MM) to AM/PM format
    function formatTime(timeStr) {
        if (!timeStr) return '';
        
        const [hoursStr, minutesStr] = timeStr.split(':');
        const hours = parseInt(hoursStr, 10);
        const minutes = parseInt(minutesStr, 10);
        
        const period = hours >= 12 ? 'PM' : 'AM';
        const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
        
        return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
    }
});