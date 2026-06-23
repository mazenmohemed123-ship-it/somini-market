'use client';
// تهيئة Firebase على العميل + App Check (reCAPTCHA v3) + ربط الـ Emulators
// تلقائياً في التطوير. مصمَّمة لتكون نقطة الوصل الوحيدة والموثوقة مع Firebase.
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

const region = process.env.NEXT_PUBLIC_FIREBASE_REGION || 'europe-west1';
const USE_EMULATORS =
  process.env.NEXT_PUBLIC_USE_EMULATORS === 'true' ||
  process.env.NEXT_PUBLIC_USE_EMULATORS === '1';

export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, region);

// Messaging (FCM) — يُحمَّل بكسل لأنه يتطلب المتصفح ودعم Service Worker.
export async function getMessagingIfSupported() {
  if (typeof window === 'undefined') return null;
  const { isSupported, getMessaging } = await import('firebase/messaging');
  if (!(await isSupported())) return null;
  return getMessaging(app);
}

// --- ربط الـ Emulators (تطوير محلي) ---
// يضمن أن الفرونت يتكلّم مع Firebase المحلي عند التطوير دون أي مفاتيح إنتاج.
if (typeof window !== 'undefined' && USE_EMULATORS && !window.__SOMNI_EMU__) {
  const host = process.env.NEXT_PUBLIC_EMULATOR_HOST || '127.0.0.1';
  try {
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8080);
    connectDatabaseEmulator(rtdb, host, 9000);
    connectStorageEmulator(storage, host, 9199);
    connectFunctionsEmulator(functions, host, 5001);
    window.__SOMNI_EMU__ = true;
    // eslint-disable-next-line no-console
    console.info('🔧 Firebase متصل بالـ Emulators على', host);
  } catch (e) {
    console.warn('فشل ربط الـ Emulators:', e?.message);
  }
}

// --- App Check (الإنتاج فقط، وليس مع الـ Emulators) ---
if (
  typeof window !== 'undefined' &&
  !USE_EMULATORS &&
  process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY
) {
  if (process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN) {
    // eslint-disable-next-line no-undef
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN;
  }
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true
    });
  } catch (e) {
    console.warn('App Check init skipped:', e?.message);
  }
}

export default app;
