// Firebase Class Management System with Room Number Support
document.addEventListener('DOMContentLoaded', function() {
    const db = firebase.database();
    let sectionListener = null;
    let studentListeners = {};
    let classesListener = null;
    let subjectListener = null;
    let uiUpdateCallbacks = [];

    // Register UI update callback
    function registerUIUpdateCallback(callback) {
        if (typeof callback === 'function') {
            uiUpdateCallbacks.push(callback);
        } else {
            console.error('registerUIUpdateCallback requires a function parameter');
        }
    }

    // Notify UI to update
    function notifyUIUpdate(updateType, classData) {
        uiUpdateCallbacks.forEach(callback => callback(updateType, classData));
    }

    async function createClassesForSection(sectionId, sectionData) {
        try {
            // Get required reference data
            const [curriculumSnap, subjectsSnap] = await Promise.all([
                db.ref(`curriculums/${sectionData.curriculum}`).once('value'),
                db.ref('subjects').once('value')
            ]);

            const curriculum = curriculumSnap.val();
            const subjects = subjectsSnap.val() || {};
            
            if (!curriculum || !curriculum.subjects) {
                console.warn(`No curriculum/subjects found for section ${sectionId}`);
                return [];
            }

            const studentsSnap = await db.ref(`sections/${sectionId}/students`).once('value');
            const students = studentsSnap.val() || {};
            const newClasses = {};

            // Create class for each subject in curriculum
            Object.entries(curriculum.subjects).forEach(([key, subjectId]) => {
                if (!subjects[subjectId]) return;

                const classId = `${sectionId}_${subjectId}`;
                const subject = subjects[subjectId];
                
                newClasses[classId] = {
                    sectionId,
                    subjectId,
                    gradeLevel: sectionData.gradeLevel,
                    strand: sectionData.strand,
                    sectionNumber: sectionData.sectionNumber,
                    status: sectionData.status || 'active',
                    subjectName: subject.subjectName,
                    teacher: subject.subjectTeacher || 'Not assigned',
                    roomNumber: subject.roomNumber || null, // Added room number
                    studentCount: Object.keys(students).length,
                    students: Object.entries(students).reduce((acc, [id, student]) => {
                        acc[id] = { name: student.name, lrn: student.lrn, id };
                        return acc;
                    }, {}),
                    createdAt: Date.now(),
                    lastUpdated: Date.now(),
                    schedule: null
                };

                // Setup real-time student count listener
                setupStudentCountListener(sectionId, subjectId);
            });

            // Save to Firebase
            if (Object.keys(newClasses).length > 0) {
                await db.ref('classes').update(newClasses);
                console.log(`Created ${Object.keys(newClasses).length} classes for section ${sectionId}`);
                
                // Return the created classes data
                return Object.entries(newClasses).map(([id, classData]) => ({ id, ...classData }));
            }
            
            return [];
        } catch (error) {
            console.error(`Failed to create classes for section ${sectionId}:`, error);
            return [];
        }
    }

    // 2. Real-time Student Count Management
    function setupStudentCountListener(sectionId, subjectId) {
        const classId = `${sectionId}_${subjectId}`;
        
        // Remove existing listener if any
        if (studentListeners[classId]) {
            db.ref(`sections/${sectionId}/students`).off('value', studentListeners[classId]);
            delete studentListeners[classId];
        }

        // Create new listener
        const listener = db.ref(`sections/${sectionId}/students`).on('value', async (snap) => {
            const currentStudents = snap.val() || {};
            const count = Object.keys(currentStudents).length;
            
            try {
                await db.ref(`classes/${classId}`).update({
                    studentCount: count,
                    lastUpdated: Date.now()
                });
                
                // Notify UI of the update
                const classSnap = await db.ref(`classes/${classId}`).once('value');
                notifyUIUpdate('update', { id: classId, ...classSnap.val() });
            } catch (error) {
                console.error(`Failed to update student count for ${classId}:`, error);
            }
        });

        studentListeners[classId] = listener;
    }

    // 3. Section Change Detection
    function setupSectionListener() {
        // Clean up existing listener
        if (sectionListener) {
            db.ref('sections').off('child_added', sectionListener);
            db.ref('sections').off('child_changed', sectionListener);
            db.ref('sections').off('child_removed', sectionListener);
        }

        // Listen for new sections
        sectionListener = db.ref('sections').on('child_added', async (snapshot) => {
            const sectionId = snapshot.key;
            const sectionData = snapshot.val();
            
            if (sectionData.curriculum) {
                console.log(`New section detected: ${sectionId}`);
                const createdClasses = await createClassesForSection(sectionId, sectionData);
                
                // Notify UI for each created class
                createdClasses.forEach(classData => {
                    notifyUIUpdate('create', classData);
                });
            }
        });

        // Listen for section changes that might affect classes
        db.ref('sections').on('child_changed', async (snapshot) => {
            const sectionId = snapshot.key;
            const sectionData = snapshot.val();
            
            if (sectionData.curriculum) {
                console.log(`Section updated: ${sectionId}`);
                await updateClassesForSection(sectionId, sectionData);
            }
        });

        // Listen for section removal
        db.ref('sections').on('child_removed', async (snapshot) => {
            const sectionId = snapshot.key;
            await handleSectionRemoval(sectionId);
        });
    }

    // 4. Section Update Handler with Room Number Support
    async function updateClassesForSection(sectionId, sectionData) {
        try {
            // Get all classes for this section
            const classesSnap = await db.ref('classes')
                .orderByChild('sectionId')
                .equalTo(sectionId)
                .once('value');

            if (!classesSnap.exists()) return;

            // Get current subjects data for room numbers
            const subjectsSnap = await db.ref('subjects').once('value');
            const subjects = subjectsSnap.val() || {};

            const updates = {};
            const updatedClasses = [];
            
            classesSnap.forEach(classSnap => {
                const classId = classSnap.key;
                const classData = classSnap.val();
                
                // Prepare updates for changed fields
                const classUpdates = {};
                
                if (classData.gradeLevel !== sectionData.gradeLevel) {
                    classUpdates.gradeLevel = sectionData.gradeLevel;
                }
                if (classData.strand !== sectionData.strand) {
                    classUpdates.strand = sectionData.strand;
                }
                if (classData.sectionNumber !== sectionData.sectionNumber) {
                    classUpdates.sectionNumber = sectionData.sectionNumber;
                }
                if (classData.status !== (sectionData.status || 'active')) {
                    classUpdates.status = sectionData.status || 'active';
                }
                
                // Check for room number updates from subject
                const subject = subjects[classData.subjectId];
                if (subject && subject.roomNumber !== classData.roomNumber) {
                    classUpdates.roomNumber = subject.roomNumber;
                }
                
                if (Object.keys(classUpdates).length > 0) {
                    classUpdates.lastUpdated = Date.now();
                    updates[`classes/${classId}`] = classUpdates;
                    updatedClasses.push({ id: classId, ...classData, ...classUpdates });
                }
            });

            if (Object.keys(updates).length > 0) {
                await db.ref().update(updates);
                console.log(`Updated ${Object.keys(updates).length} classes for section ${sectionId}`);
                
                // Notify UI for each updated class
                updatedClasses.forEach(classData => {
                    notifyUIUpdate('update', classData);
                });
            }
        } catch (error) {
            console.error(`Failed to update classes for section ${sectionId}:`, error);
        }
    }

    // 5. Handle Section Removal - Deletes Classes
    async function handleSectionRemoval(sectionId) {
        try {
            // Get all classes for this section
            const classesSnap = await db.ref('classes')
                .orderByChild('sectionId')
                .equalTo(sectionId)
                .once('value');

            if (!classesSnap.exists()) return;

            // Remove all classes for this section
            const updates = {};
            const removedClasses = [];
            
            classesSnap.forEach(classSnap => {
                const classId = classSnap.key;
                updates[`classes/${classId}`] = null; // This will delete the class
                removedClasses.push(classId);
                
                // Remove student count listener
                if (studentListeners[classId]) {
                    db.ref(`sections/${sectionId}/students`).off('value', studentListeners[classId]);
                    delete studentListeners[classId];
                }
            });

            // Perform the deletion
            await db.ref().update(updates);
            console.log(`Deleted ${removedClasses.length} classes for removed section ${sectionId}`);
            
            // Notify UI of removed classes
            removedClasses.forEach(classId => {
                notifyUIUpdate('remove', { id: classId });
            });
        } catch (error) {
            console.error(`Failed to handle removal of section ${sectionId}:`, error);
        }
    }

    // 6. Subject Change Listener for Room Number Updates
    function setupSubjectListener() {
        // Clean up existing listener
        if (subjectListener) {
            db.ref('subjects').off('child_changed', subjectListener);
        }

        // Listen for subject changes that might affect room numbers
        subjectListener = db.ref('subjects').on('child_changed', async (snapshot) => {
            const subjectId = snapshot.key;
            const subjectData = snapshot.val();
            
            if (subjectData.roomNumber) {
                // Find all classes using this subject
                const classesSnap = await db.ref('classes')
                    .orderByChild('subjectId')
                    .equalTo(subjectId)
                    .once('value');

                if (!classesSnap.exists()) return;

                const updates = {};
                const updatedClasses = [];
                
                classesSnap.forEach(classSnap => {
                    const classId = classSnap.key;
                    const classData = classSnap.val();
                    
                    // Only update if room number actually changed
                    if (classData.roomNumber !== subjectData.roomNumber) {
                        updates[`classes/${classId}/roomNumber`] = subjectData.roomNumber;
                        updates[`classes/${classId}/lastUpdated`] = Date.now();
                        updatedClasses.push({
                            id: classId,
                            ...classData,
                            roomNumber: subjectData.roomNumber
                        });
                    }
                });

                if (Object.keys(updates).length > 0) {
                    await db.ref().update(updates);
                    console.log(`Updated room numbers for ${Object.keys(updates).length/2} classes using subject ${subjectId}`);
                    
                    // Notify UI of updated classes
                    updatedClasses.forEach(classData => {
                        notifyUIUpdate('update', classData);
                    });
                }
            }
        });
    }

    // 7. Setup real-time classes listener
    function setupClassesListener() {
        // Clean up existing listener
        if (classesListener) {
            db.ref('classes').off('value', classesListener);
            db.ref('classes').off('child_changed');
            db.ref('classes').off('child_removed');
        }

        // Listen for all class changes
        classesListener = db.ref('classes').on('value', (snapshot) => {
            const classesData = snapshot.val() || {};
            
            // Convert to array and notify UI
            Object.entries(classesData).forEach(([id, classData]) => {
                notifyUIUpdate('create', { id, ...classData });
            });
        });

        // Listen for individual class changes
        db.ref('classes').on('child_changed', (snapshot) => {
            notifyUIUpdate('update', { id: snapshot.key, ...snapshot.val() });
        });

        // Listen for class removal
        db.ref('classes').on('child_removed', (snapshot) => {
            notifyUIUpdate('remove', { id: snapshot.key });
        });
    }

    // 8. Initialization
    async function initializeClassSystem() {
        // First, process all existing sections
        const sectionsSnap = await db.ref('sections').once('value');
        const sections = sectionsSnap.val() || {};
        
        await Promise.all(Object.entries(sections).map(async ([sectionId, sectionData]) => {
            if (sectionData.curriculum) {
                await createClassesForSection(sectionId, sectionData);
            }
        }));

        // Then setup real-time listeners
        setupSectionListener();
        setupClassesListener();
        setupSubjectListener(); // Add subject listener
    }

    // 9. Cleanup Function
    function cleanup() {
        // Remove section listeners
        if (sectionListener) {
            db.ref('sections').off('child_added', sectionListener);
            db.ref('sections').off('child_changed', sectionListener);
            db.ref('sections').off('child_removed', sectionListener);
        }
        
        // Remove all student count listeners
        Object.keys(studentListeners).forEach(classId => {
            const [sectionId] = classId.split('_');
            db.ref(`sections/${sectionId}/students`).off('value', studentListeners[classId]);
        });
        
        // Remove classes listener
        if (classesListener) {
            db.ref('classes').off('value', classesListener);
            db.ref('classes').off('child_changed');
            db.ref('classes').off('child_removed');
        }
        
        // Remove subject listener
        if (subjectListener) {
            db.ref('subjects').off('child_changed', subjectListener);
        }
        
        studentListeners = {};
        uiUpdateCallbacks = [];
    }

    // Start the system
    initializeClassSystem();

    // Clean up when needed
    window.addEventListener('beforeunload', cleanup);

    // Expose the register function to the global scope
    window.ClassManagementSystem = {
        registerUIUpdateCallback,
        cleanup
    };
});