// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBKNL7YylDAk7K8yK1z-1ncXtvFQdshJcg",
    authDomain: "fths-lms-9820b.firebaseapp.com",
    databaseURL: "https://fths-lms-9820b-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "fths-lms-9820b",
    storageBucket: "fths-lms-9820b.firebasestorage.app",
    messagingSenderId: "1007759722539",
    appId: "1:1007759722539:web:898143a49e5b0d6cbf426e",
    measurementId: "G-FHC5ME16T1"
  };

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();