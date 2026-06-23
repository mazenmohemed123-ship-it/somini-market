// =============================================================
// الشات الخاص 1:1 (بدون محادثات جماعية)
// الرسائل الحيّة في Realtime Database؛ هنا ميتاداتا المحادثة في
// Firestore (آخر رسالة، المشاركون، عدّاد غير المقروء) + إنشاء آمن.
// =============================================================
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onValueCreated } = require('firebase-functions/v2/database');
const { REGION } = require('../lib/config');
const { db, rtdb, FieldValue } = require('../lib/admin');

// معرّف محادثة ثابت بين طرفين (مرتّب أبجدياً ⇒ نفس المعرّف لأي اتجاه).
function chatIdFor(a, b) {
  return [a, b].sort().join('_');
}

/**
 * openChat — يفتح (أو يعيد) محادثة 1:1 بين المستخدم الحالي وطرف آخر.
 * يضمن وجود مستند الميتاداتا في Firestore وفرع المحادثة في RTDB.
 */
const openChat = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'مطلوب تسجيل الدخول.');

  const peerId = request.data?.peerId;
  if (!peerId || peerId === uid) {
    throw new HttpsError('invalid-argument', 'الطرف الآخر غير صالح.');
  }

  const chatId = chatIdFor(uid, peerId);
  const chatRef = db.collection('chats').doc(chatId);
  const snap = await chatRef.get();

  if (!snap.exists) {
    const meta = {
      chatId,
      participants: [uid, peerId].sort(),
      context: request.data?.context || null, // مثل { type:'product', id }
      lastMessage: null,
      lastSenderId: null,
      unread: { [uid]: 0, [peerId]: 0 },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };
    await chatRef.set(meta);
    // فرع RTDB للمشاركين (تُستخدم في قواعد RTDB)
    await rtdb().ref(`chats/${chatId}/metadata/participants`).set({
      [uid]: true,
      [peerId]: true
    });
  }

  return { chatId };
});

/**
 * onChatMessage — Trigger عند كتابة رسالة جديدة في RTDB.
 * يحدّث ميتاداتا Firestore (آخر رسالة + عدّاد غير المقروء للطرف الآخر).
 */
const onChatMessage = onValueCreated(
  { region: REGION, ref: '/chats/{chatId}/messages/{messageId}' },
  async (event) => {
    const msg = event.data.val();
    const { chatId } = event.params;
    if (!msg || !msg.senderId) return;

    const chatRef = db.collection('chats').doc(chatId);
    const snap = await chatRef.get();
    if (!snap.exists) return;

    const participants = snap.data().participants || [];
    const receiver = participants.find((p) => p !== msg.senderId);

    const update = {
      lastMessage: (msg.text || '[مرفق]').toString().slice(0, 120),
      lastSenderId: msg.senderId,
      updatedAt: FieldValue.serverTimestamp()
    };
    if (receiver) {
      update[`unread.${receiver}`] = FieldValue.increment(1);
    }
    await chatRef.update(update);

    // (إشعار FCM للطرف المستقبِل يُطلق من هنا — انظر notifications.js)
  }
);

/**
 * markChatRead — تصفير عدّاد غير المقروء للمستخدم الحالي.
 */
const markChatRead = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'مطلوب تسجيل الدخول.');
  const chatId = request.data?.chatId;
  if (!chatId) throw new HttpsError('invalid-argument', 'chatId مفقود.');

  const chatRef = db.collection('chats').doc(chatId);
  const snap = await chatRef.get();
  if (!snap.exists || !snap.data().participants.includes(uid)) {
    throw new HttpsError('permission-denied', 'لست مشاركاً في هذه المحادثة.');
  }
  await chatRef.update({ [`unread.${uid}`]: 0 });
  return { ok: true };
});

module.exports = { openChat, onChatMessage, markChatRead, chatIdFor };
