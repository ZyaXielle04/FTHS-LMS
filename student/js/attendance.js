// attendance.js

async function loadAttendanceContent(classId) {
    try {
        // Get the authenticated student ID
        const authUser = JSON.parse(localStorage.getItem('authUser')) || 
                        JSON.parse(sessionStorage.getItem('authUser'));
        
        if (!authUser) {
            return '<div class="error-message">Authentication required</div>';
        }

        const studentId = authUser.id;

        // Fetch class and attendance data
        const classRef = firebase.database().ref(`classes/${classId}`);
        const attendanceRef = firebase.database().ref(`classes/${classId}/attendance`);
        
        const [classSnapshot, attendanceSnapshot] = await Promise.all([
            classRef.once('value'),
            attendanceRef.once('value')
        ]);

        if (!classSnapshot.exists()) {
            return '<div class="error-message">Class not found</div>';
        }

        const attendanceData = attendanceSnapshot.exists() ? attendanceSnapshot.val() : {};

        // Calculate attendance statistics
        let totalDays = 0;
        let presentDays = 0;
        let absentDays = 0;
        let lateDays = 0;
        let excusedDays = 0;

        const attendanceRecords = [];
        
        if (attendanceData) {
            Object.entries(attendanceData).forEach(([date, students]) => {
                if (students && students[studentId]) {
                    const { status, notes } = students[studentId];
                    
                    totalDays++;
                    switch (status) {
                        case 'present':
                            presentDays++;
                            break;
                        case 'absent':
                            absentDays++;
                            break;
                        case 'late':
                            lateDays++;
                            break;
                        case 'excused':
                            excusedDays++;
                            break;
                    }
                    attendanceRecords.push({ date, status, notes });
                }
            });
        }

        // Sort records by date (newest first)
        attendanceRecords.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Attendance percentage
        const attendancePercentage = totalDays > 0 
            ? Math.round(((presentDays + lateDays) / totalDays) * 100)
            : 0;

        // Generate HTML
        let html = `
            <div class="attendance-module">
                <h2 class="attendance-module-title">Attendance</h2>
                
                <div class="attendance-module-content">
                    <div class="attendance-module-stats-grid">
                        <div class="attendance-stat-card attendance-stat-primary rate">
                            <div class="attendance-stat-value">${attendancePercentage}%</div>
                            <div class="attendance-stat-label">Attendance Rate</div>
                        </div>
                        <div class="attendance-stat-card attendance-stat-primary total-present">
                            <div class="attendance-stat-value">${presentDays}</div>
                            <div class="attendance-stat-label">Present</div>
                        </div>
                        <div class="attendance-stat-card attendance-stat-primary total-absent">
                            <div class="attendance-stat-value">${absentDays}</div>
                            <div class="attendance-stat-label">Absent</div>
                        </div>
                        <div class="attendance-stat-card attendance-stat-primary total-late">
                            <div class="attendance-stat-value">${lateDays}</div>
                            <div class="attendance-stat-label">Late</div>
                        </div>
                        <div class="attendance-stat-card attendance-stat-primary total-excused">
                            <div class="attendance-stat-value">${excusedDays}</div>
                            <div class="attendance-stat-label">Excused</div>
                        </div>
                    </div>

                    <div class="attendance-module-records">
                        <h3 class="attendance-records-title">Recent Attendance Records</h3>
                        <div class="attendance-table-wrapper">
                            <table class="attendance-records-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Status</th>
                                        <th>Notes</th>
                                    </tr>
                                </thead>
                                <tbody>
        `;

        if (attendanceRecords.length === 0) {
            html += `
                <tr>
                    <td colspan="3" class="no-records">No attendance records found</td>
                </tr>
            `;
        } else {
            attendanceRecords.forEach(record => {
                const formattedDate = new Date(record.date).toLocaleDateString('en-US', {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
                
                let statusClass = '';
                switch (record.status) {
                    case 'present': statusClass = 'present'; break;
                    case 'absent': statusClass = 'absent'; break;
                    case 'late': statusClass = 'late'; break;
                    case 'excused': statusClass = 'excused'; break;
                }
                
                html += `
                    <tr>
                        <td>${formattedDate}</td>
                        <td><span class="attendance-status-badge ${statusClass}">${record.status}</span></td>
                        <td>${record.notes || '-'}</td>
                    </tr>
                `;
            });
        }

        html += `
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        return html;
    } catch (error) {
        console.error('Error loading attendance:', error);
        return `
            <div class="error-message">
                Failed to load attendance data. Please try again later.
            </div>
        `;
    }
}