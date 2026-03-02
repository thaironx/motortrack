const firebaseConfig = {
  apiKey: "AIzaSyBT8-P-897haK7kuXGYAVujk1BmZF0F_08",
  authDomain: "micweb-e7f3d.firebaseapp.com",
  projectId: "micweb-e7f3d",
  storageBucket: "micweb-e7f3d.firebasestorage.app",
  messagingSenderId: "1068765830538",
  appId: "1:1068765830538:web:0a5eed21fa63c844423c73",
  measurementId: "G-MDXWW99YVK"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();