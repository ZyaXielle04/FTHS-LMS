// realtime-overdue-checker.js
console.log('[RealtimeOverdueChecker] Initializing...');

// Initialize Firebase
if (!firebase.apps.length) {
    console.log('[RealtimeOverdueChecker] Initializing Firebase...');
    firebase.initializeApp({
        databaseURL: "https://fths-lms-9820b-default-rtdb.asia-southeast1.firebasedatabase.app"
    });
}

let isProcessing = false;

function setupRealtimeListeners() {
    console.log('[RealtimeOverdueChecker] Setting up realtime listeners...');
    
    // Listen for changes to all assignments
    db.ref('classes').on('value', async (classesSnapshot) => {
        if (isProcessing) {
            console.log('[RealtimeOverdueChecker] Already processing changes, skipping...');
            return;
        }
        
        isProcessing = true;
        console.log('[RealtimeOverdueChecker] Detected database changes, checking for overdue...');
        
        try {
            const currentTime = new Date();
            const updates = {};
            let count = 0;

            classesSnapshot.forEach((classSnapshot) => {
                const classId = classSnapshot.key;
                const assignments = classSnapshot.child('assignments').val();
                if (!assignments) return;

                Object.entries(assignments).forEach(([assignmentId, assignment]) => {
                    if (!assignment.dueDate) return;
                    
                    const dueDate = new Date(assignment.dueDate);
                    if (dueDate >= currentTime) return;
                    
                    const studentAnswers = assignment.studentAnswers || {};
                    Object.entries(studentAnswers).forEach(([studentId, answer]) => {
                        if (answer.status === 'pending') {
                            const path = `classes/${classId}/assignments/${assignmentId}/studentAnswers/${studentId}/status`;
                            updates[path] = 'overdue';
                            count++;
                            console.log(`[RealtimeOverdueChecker] Queuing update for student ${studentId}`);
                        }
                    });
                });
            });

            if (count > 0) {
                console.log(`[RealtimeOverdueChecker] Applying ${count} updates...`);
                await db.ref().update(updates);
                console.log('[RealtimeOverdueChecker] Updates completed');
            }
        } catch (error) {
            console.error('[RealtimeOverdueChecker] Error:', error);
        } finally {
            isProcessing = false;
        }
    });
}

// Start the real-time listener
setupRealtimeListeners();

// Also check immediately on page load
db.ref('classes').once('value').then(() => {
    console.log('[RealtimeOverdueChecker] Initial load complete, ready for realtime updates');
});

// Clean up listener when page unloads
window.addEventListener('beforeunload', () => {
    db.ref('classes').off();
    console.log('[RealtimeOverdueChecker] Cleaned up listeners');
});