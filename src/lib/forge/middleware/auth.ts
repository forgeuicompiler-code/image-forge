import { initializeApp, applicationDefault, getApps, getApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import firebaseConfig from "../../../../firebase-applet-config.json";

const app = getApps().length === 0 
  ? initializeApp({
      credential: applicationDefault(),
      projectId: firebaseConfig.projectId,
    })
  : getApp();

export const adminAuth = getAuth(app);

console.log(`[Firebase Admin] Initialized Auth for project: ${firebaseConfig.projectId}`);

export async function verifyToken(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const idToken = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("Auth Error:", error);
    res.status(401).json({ error: "Invalid token" });
  }
}
