import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import firebaseConfig from "./firebase-applet-config.json";

const app = initializeApp({
  credential: applicationDefault(),
  projectId: firebaseConfig.projectId,
});

const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function test() {
  try {
    console.log("Testing Firestore Admin connection...");
    const doc = await db.collection("config").doc("ranking").get();
    console.log("Success! Found config:", doc.exists);
  } catch (e) {
    console.error("Failed:", e);
  }
}

test();
