import { db, handleFirestoreError, OperationType, auth } from "../lib/firebase";
import { collection, doc, setDoc, serverTimestamp, query, orderBy, limit, getDocs } from "firebase/firestore";

export interface VerificationLabels {
  subject_correct: boolean;
  brand_correct: boolean;
  composition_correct: boolean;
  ui_fit_correct: boolean;
  notes: string;
}

export async function saveVerification(traceId: string, labels: VerificationLabels, aiTags?: any) {
  const path = "verifications";
  try {
    const verificationId = `ver-${traceId}-${auth.currentUser?.uid}-${Date.now()}`; // Versioning via timestamp
    const verificationRef = doc(collection(db, path), verificationId);
    
    const disagreement = {
      subject: !labels.subject_correct,
      brand: !labels.brand_correct,
      composition: !labels.composition_correct,
      ui_fit: !labels.ui_fit_correct
    };

    const hasAnyDisagreement = Object.values(disagreement).some(v => v);

    await setDoc(verificationRef, {
      trace_id: traceId,
      timestamp: new Date().toISOString(),
      server_timestamp: serverTimestamp(),
      user_email: auth.currentUser?.email,
      uid: auth.currentUser?.uid,
      labels,
      ai_tags_snapshot: aiTags || null,
      disagreement,
      has_disagreement: hasAnyDisagreement
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function fetchTraces(count: number = 10) {
  const path = "traces";
  try {
    const q = query(collection(db, path), orderBy("timestamp", "desc"), limit(count));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}
