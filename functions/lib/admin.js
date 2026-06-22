// تهيئة Firebase Admin مرّة واحدة ومشاركتها بين كل الوحدات.
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const rtdb = admin.database();
const auth = admin.auth();
const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

module.exports = { admin, db, rtdb, auth, FieldValue, Timestamp };
