'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import ThemeToggle from '../../components/ThemeToggle';
import PasswordStrength, { scorePassword } from '../../components/PasswordStrength';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', confirm: '', fullName: '' });
  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);

    if (mode === 'signup') {
      if (form.password !== form.confirm) { setErr('كلمتا المرور غير متطابقتين'); return; }
      if (scorePassword(form.password) < 2) { setErr('كلمة المرور ضعيفة جداً — اجعلها أقوى'); return; }
      if (!agree) { setErr('يجب الموافقة على الشروط والأحكام أولاً'); return; }
    }

    setBusy(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, form.email, form.password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
        await updateProfile(cred.user, { displayName: form.fullName });
        await setDoc(doc(db, 'users', cred.user.uid), {
          uid: cred.user.uid, tenantId: 'public', role: 'buyer',
          email: form.email, fullName: form.fullName, createdAt: serverTimestamp()
        });
      }
      router.push('/');
    } catch (e) {
      setErr(translateError(e.code) || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-screen">
      <div className="auth-toggle-theme"><ThemeToggle /></div>
      <div style={{ width: '100%', maxWidth: '440px' }}>
        <div className="auth-brand">
          <h1>Somini Market</h1>
          <p>اكتشف أفضل المنتجات بلمسة عصرية</p>
          <small>من شركة SomniX</small>
        </div>
        <div className="auth-card">
          <div className="auth-tabs">
            <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setErr(null); }}>تسجيل الدخول</button>
            <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setErr(null); }}>إنشاء حساب</button>
          </div>
          <form onSubmit={submit}>
            {mode === 'signup' && (
              <div className="auth-field">
                <label>الاسم الكامل</label>
                <input type="text" placeholder="أحمد محمد" value={form.fullName} onChange={update('fullName')} required />
              </div>
            )}
            <div className="auth-field">
              <label>البريد الإلكتروني</label>
              <input type="email" placeholder="example@domain.com" value={form.email} onChange={update('email')} required />
            </div>
            <div className="auth-field">
              <label>كلمة المرور</label>
              <input type="password" placeholder="••••••••" value={form.password} onChange={update('password')} required />
              {mode === 'signup' && <PasswordStrength password={form.password} />}
            </div>
            {mode === 'signup' && (
              <div className="auth-field">
                <label>تأكيد كلمة المرور</label>
                <input type="password" placeholder="••••••••" value={form.confirm} onChange={update('confirm')} required />
              </div>
            )}
            {mode === 'signup' && (
              <label className="terms-check">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                <span>أوافق على <a href="#" onClick={(e) => e.preventDefault()}>الشروط والأحكام</a> و<a href="#" onClick={(e) => e.preventDefault()}> سياسة الخصوصية</a></span>
              </label>
            )}
            {err && <p className="error" style={{ marginTop: '0.5rem' }}>{err}</p>}
            <button className="auth-btn" disabled={busy || (mode === 'signup' && !agree)}>
              {busy ? 'جاري...' : mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب'}
            </button>
          </form>
        </div>
        <div className="auth-footer">
          <a href="#" onClick={(e) => e.preventDefault()}>شروط الخدمة</a>
          <a href="#" onClick={(e) => e.preventDefault()}>سياسة الخصوصية</a>
          <a href="#" onClick={(e) => e.preventDefault()}>اتصل بنا</a>
        </div>
        <p className="auth-copy">© 2024 Somini Market. جميع الحقوق محفوظة.</p>
      </div>
    </main>
  );
}

function translateError(code) {
  const map = {
    'auth/invalid-email': 'البريد الإلكتروني غير صالح',
    'auth/user-not-found': 'لا يوجد حساب بهذا البريد',
    'auth/wrong-password': 'كلمة المرور غير صحيحة',
    'auth/invalid-credential': 'بيانات الدخول غير صحيحة',
    'auth/email-already-in-use': 'هذا البريد مسجّل بالفعل',
    'auth/weak-password': 'كلمة المرور ضعيفة (6 أحرف على الأقل)',
    'auth/too-many-requests': 'محاولات كثيرة — حاول لاحقاً'
  };
  return map[code];
}
