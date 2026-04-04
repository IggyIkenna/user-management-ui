import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    "AIzaSyAd6_p1UIGPY2Va5yGzLOR4DyxyHJ8QCzo",
  authDomain: "central-element-323112.firebaseapp.com",
  projectId: "central-element-323112",
  storageBucket: "central-element-323112.appspot.com",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const firebaseAuth = getAuth(app);
export default app;
