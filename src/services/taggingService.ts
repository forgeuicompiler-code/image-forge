import { auth, db, handleFirestoreError, OperationType } from "../lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

export interface AITags {
  subject: string[];
  brand: string | null;
  ui_role_fit: string[];
  composition: string[];
  confidence: number;
}

export async function tagAndLogTrace(traceData: any, description?: string) {
  try {
    const user = auth.currentUser;
    if (!user) return;

    const idToken = await user.getIdToken();
    
    // 1. Get AI Tags from server
    let ai_tags = null;
    if (description) {
      try {
        const response = await fetch("/api/ai/tag", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${idToken}`
          },
          body: JSON.stringify({ description })
        });
        const data = await response.json();
        ai_tags = data.tags;
      } catch (e) {
        console.error("AI Tagging failed:", e);
      }
    }

    // 2. Log Trace directly to Firestore from Client
    const path = "traces";
    try {
      const traceRef = doc(db, path, traceData.id);
      await setDoc(traceRef, {
        ...traceData,
        ai_tags,
        timestamp: new Date().toISOString(),
        server_timestamp: serverTimestamp(),
        logged_by: user.email,
        uid: user.uid,
        schema_version: 1
      });
      console.log("Trace logged successfully to Firestore from client.");
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, path);
    }
  } catch (error) {
    console.error("Tagging/logging process failed:", error);
  }
}
