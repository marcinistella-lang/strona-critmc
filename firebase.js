import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, increment, getDoc, setDoc, deleteDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

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

function formatDatetimeLocalValue(date) {
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// --- KONKURS ---

// Pobierz dane konkursu
export async function getContest(contestId) {
    const ref = doc(db, "contests", contestId);
    const snap = await getDoc(ref);
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Zapisz zgłoszenie
export async function joinContest(contestId, data) {
    const { nickMC, nickDC, secret } = data;
    const defaultDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    defaultDate.setHours(20, 0, 0, 0);

    // Sprawdź czy nick MC już dołączył
    const entryRef = doc(db, "contests", contestId, "entries", nickMC);
    const entrySnap = await getDoc(entryRef);
    if (entrySnap.exists()) {
        return { success: false, message: "Ten nick MC już bierze udział w konkursie!" };
    }

    // Zapisz zgłoszenie (secret NIE jest wyświetlany publicznie)
    await setDoc(entryRef, {
        nickMC,
        nickDC,
        secret, // tylko admin widzi
        joinedAt: new Date().toISOString()
    });

    // Zwiększ licznik
    const contestRef = doc(db, "contests", contestId);
    const contestSnap = await getDoc(contestRef);
    if (!contestSnap.exists()) {
        await setDoc(contestRef, {
            participants: 1,
            nagroda: "2x Ranga CRIT na 14 dni",
            winners: [],
            winnersCount: 2,
            wyniki: formatDatetimeLocalValue(defaultDate),
            aktywny: true
        });
    } else {
        await updateDoc(contestRef, { participants: increment(1) });
    }

    return { success: true, message: "Zapisano! Powodzenia! 🎉" };
}

// Pobierz liczbę uczestników
export async function getContestCount(contestId) {
    const ref = doc(db, "contests", contestId);
    const snap = await getDoc(ref);
    return snap.exists() ? (snap.data().participants || 0) : 0;
}

// --- ADMIN ---

// Pobierz wszystkich uczestników (tylko admin)
export async function getEntries(contestId) {
    const ref = collection(db, "contests", contestId, "entries");
    const snap = await getDocs(ref);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Usuń uczestnika
export async function removeEntry(contestId, nickMC) {
    await deleteDoc(doc(db, "contests", contestId, "entries", nickMC));
    const contestRef = doc(db, "contests", contestId);
    await updateDoc(contestRef, { participants: increment(-1) });
}

// Aktualizuj dane konkursu
export async function updateContest(contestId, updates) {
    const ref = doc(db, "contests", contestId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
        await setDoc(ref, { participants: 0, aktywny: true, ...updates });
    } else {
        await updateDoc(ref, updates);
    }
}

        // Zakończ konkurs
export async function endContest(contestId) {
    await updateContest(contestId, { aktywny: false });
}

// Ogłoś zwycięzców
export async function setWinners(contestId, winners) {
    await updateContest(contestId, { 
        aktywny: false, 
        winners: winners,
        winnersDate: new Date().toISOString()
    });
}

// Usuń cały konkurs
export async function deleteContest(contestId) {
    const entries = await getEntries(contestId);
    for (const e of entries) {
        await deleteDoc(doc(db, "contests", contestId, "entries", e.id));
    }
    await deleteDoc(doc(db, "contests", contestId));
}
