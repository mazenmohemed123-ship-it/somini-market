// اختبار تكامل end-to-end: يستدعي Cloud Function حقيقية (assistantBot)
// عبر الـ Functions Emulator بمستخدم مُصادَق، ويتحقق من الردّ ومن كتابة
// جلسة البوت في Firestore. يثبت أن ربط (Auth → Functions → Firestore) سليم.
const admin = require('firebase-admin');
const { initializeApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInWithCustomToken } = require('firebase/auth');
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require('firebase/functions');

const PROJECT = process.env.GCLOUD_PROJECT || 'somni-market-test';
const HOST = '127.0.0.1';

let adminApp;
let clientFns;
let clientAuth;

beforeAll(async () => {
  adminApp = admin.initializeApp({ projectId: PROJECT });

  const client = initializeApp({ projectId: PROJECT, apiKey: 'fake-key' });
  clientAuth = getAuth(client);
  connectAuthEmulator(clientAuth, `http://${HOST}:9099`, { disableWarnings: true });
  clientFns = getFunctions(client, 'europe-west1');
  connectFunctionsEmulator(clientFns, HOST, 5001);

  // مستخدم بائع مع custom claims، ثم تسجيل دخول العميل برمز مخصّص
  const uid = 'itest-seller';
  await admin.auth().createUser({ uid }).catch(() => {});
  await admin.auth().setCustomUserClaims(uid, { role: 'seller', tenantId: 'tenantA' });
  const token = await admin.auth().createCustomToken(uid);
  await signInWithCustomToken(clientAuth, token);
});

afterAll(async () => {
  await admin.app().delete().catch(() => {});
});

test('assistantBot يردّ بنيّة greeting ويكتب جلسة في Firestore', async () => {
  const bot = httpsCallable(clientFns, 'assistantBot');
  const res = await bot({ message: 'مرحبا' });

  expect(res.data.intent).toBe('greeting');
  expect(typeof res.data.text).toBe('string');
  expect(res.data.text.length).toBeGreaterThan(0);

  // تأكد أن البوت سجّل الجلسة في Firestore
  const sessions = await admin
    .firestore()
    .collection('botSessions')
    .where('userId', '==', 'itest-seller')
    .get();
  expect(sessions.empty).toBe(false);
});

test('assistantBot يكتشف نيّة البحث عن منتج', async () => {
  const bot = httpsCallable(clientFns, 'assistantBot');
  const res = await bot({ message: 'ابحث عن لابتوب' });
  expect(res.data.intent).toBe('search_products');
});
