// =============================================================
// Somni Market — Cloud Functions (2nd gen, Node 20)
// نقطة التصدير المركزية لكل الدوال.
// =============================================================
const { setGlobalOptions } = require('firebase-functions/v2');
const { REGION } = require('./lib/config');

// إعدادات عامة لكل الدوال (المنطقة + حدود التزامن المعقولة)
setGlobalOptions({ region: REGION, maxInstances: 20 });

// --- Tenants والمصادقة ---
const tenants = require('./src/tenants');
exports.createTenant = tenants.createTenant;
exports.setUserRole = tenants.setUserRole;
exports.onUserCreate = tenants.onUserCreate;

// --- المنتجات ---
const products = require('./src/products');
exports.createProduct = products.createProduct;
exports.processBulkUpload = products.processBulkUpload;

// --- الدفع (Paymob) ---
const payments = require('./src/payments');
exports.createPaymentIntent = payments.createPaymentIntent;
exports.handlePaymobWebhook = payments.handlePaymobWebhook;

// --- الضمان (Escrow) ---
const escrow = require('./src/escrow');
exports.releaseEscrow = escrow.releaseEscrow;
exports.openDispute = escrow.openDispute;
exports.resolveDispute = escrow.resolveDispute;
exports.autoReleaseEscrows = escrow.autoReleaseEscrows;

// --- الشات 1:1 ---
const chat = require('./src/chat');
exports.openChat = chat.openChat;
exports.onChatMessage = chat.onChatMessage;
exports.markChatRead = chat.markChatRead;

// --- البوت المساعد القواعدي ---
const bot = require('./src/bot');
exports.assistantBot = bot.assistantBot;

// --- إحصائيات لوحة التحكم ---
const stats = require('./src/stats');
exports.sellerDashboard = stats.sellerDashboard;

// --- REST API للتكاملات الخارجية ---
const api = require('./src/api');
exports.api = api.api;
