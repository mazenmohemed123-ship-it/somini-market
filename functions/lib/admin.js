// تهيئة Firebase Admin مرّة واحدة ومشاركتها بين كل الوحدات.
const admin = require('firebase-admin');
// الواجهة المعيارية (modular) لـ FieldValue/Timestamp أكثر موثوقية تحت
// الـ Functions Emulator من الوصول الساكن admin.firestore.FieldValue.
const { FieldValue, Timestamp } = require('firebase-admin/firestore');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const auth = admin.auth();

// Realtime Database يُهيّأ بكسل (lazy): استدعاء admin.database() يتطلب
// databaseURL، ونريد أن تُحمّل الوحدات التي لا تستخدمه (مثل البوت) بأمان.
let _rtdb = null;
function rtdb() {
  if (!_rtdb) _rtdb = admin.database();
  return _rtdb;
}

module.exports = { admin, db, rtdb, auth, FieldValue, Timestamp };
