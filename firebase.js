import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, increment, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBdwzCGhUtqGm0Ggfmrl2MC8_u10c_AuMQ",
    authDomain: "stronacritmcpl.firebaseapp.com",
    projectId: "stronacritmcpl",
    storageBucket: "stronacritmcpl.firebasestorage.app",
    messagingSenderId: "674591154096",
    appId: "1:674591154096:web:fee55d9cf1c83dcfbe8075",
    measurementId: "G-B1BTDJHZ27"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- KONKURSY ---

// Zapisz zgłoszenie do konkursu
export async function joinContest(contestId, playerNick) {
    try {
        // Sprawdź czy gracz już dołączył
        const entryRef = doc(db, "contests", contestId, "entries", playerNick);
        const entrySnap = await getDoc(entryRef);
        if (entrySnap.exists()) {
            return { success: false, message: "Już bierzesz udział w tym konkursie!" };
        }

        // Dodaj zgłoszenie
        await setDoc(entryRef, {
            nick: playerNick,
            joinedAt: new Date()
        });

        // Zwiększ licznik
        const contestRef = doc(db, "contests", contestId);
        const contestSnap = await getDoc(contestRef);
        if (!contestSnap.exists()) {
            await setDoc(contestRef, { participants: 1 });
        } else {
            await updateDoc(contestRef, { participants: increment(1) });
        }

        return { success: true, message: "Zapisano!" };
    } catch (e) {
        return { success: false, message: "Błąd: " + e.message };
    }
}

// Pobierz liczbę uczestników konkursu
export async function getContestCount(contestId) {
    try {
        const contestRef = doc(db, "contests", contestId);
        const contestSnap = await getDoc(contestRef);
        if (contestSnap.exists()) {
            return contestSnap.data().participants || 0;
        }
        return 0;
    } catch (e) {
        return 0;
    }
}

// --- ANKIETY ---

// Oddaj głos w ankiecie
export async function vote(pollId, option, voterNick) {
    try {
        // Sprawdź czy już głosował
        const voterRef = doc(db, "polls", pollId, "voters", voterNick);
        const voterSnap = await getDoc(voterRef);
        if (voterSnap.exists()) {
            return { success: false, message: "Już głosowałeś w tej ankiecie!" };
        }

        // Zapisz głos
        await setDoc(voterRef, { option, votedAt: new Date() });

        // Zwiększ licznik opcji
        const pollRef = doc(db, "polls", pollId);
        const pollSnap = await getDoc(pollRef);
        if (!pollSnap.exists()) {
            await setDoc(pollRef, { [option]: 1 });
        } else {
            await updateDoc(pollRef, { [option]: increment(1) });
        }

        return { success: true, message: "Głos oddany!" };
    } catch (e) {
        return { success: false, message: "Błąd: " + e.message };
    }
}

// Pobierz wyniki ankiety
export async function getPollResults(pollId) {
    try {
        const pollRef = doc(db, "polls", pollId);
        const pollSnap = await getDoc(pollRef);
        if (pollSnap.exists()) {
            return pollSnap.data();
        }
        return {};
    } catch (e) {
        return {};
    }
}
