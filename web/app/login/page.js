'use client';
// تسجيل الدخول/الإنشاء عبر البريد + إنشاء ملف المستخدم في Firestore.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useI18n } from '../../lib/i18n';
import Navbar from '../../components/Navbar';

export default function LoginPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', fullName: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, form.email, form.password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
        await updateProfile(cred.user, { displayName: form.fullName });
        // ملف المستخدم — الدور buyer افتراضاً (يُضبط أيضاً في Custom Claims)
        await setDoc(doc(db, 'users', cred.user.uid), {
          uid: cred.user.uid,
          tenantId: 'public',
          role: 'buyer',
          email: form.email,
          fullName: form.fullName,
          createdAt: serverTimestamp()
        });
      }
      router.push('/');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Navbar />
      <main className="container auth">
        <h1>{mode === 'login' ? t('nav.login') : t('nav.sell')}</h1>
        <form onSubmit={submit} className="auth__form">
          {mode === 'signup' && (
            <input
              placeholder="الاسم الكامل"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              required
            />
          )}
          <input
            type="email"
            placeholder="البريد الإلكتروني"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <input
            type="password"
            placeholder="كلمة المرور"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
          {err && <p className="error">{err}</p>}
          <button className="btn btn--primary" disabled={busy}>
            {busy ? t('common.loading') : mode === 'login' ? t('nav.login') : 'إنشاء حساب'}
          </button>
        </form>
        <button className="link-btn" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
          {mode === 'login' ? 'ليس لديك حساب؟ سجّل الآن' : 'لديك حساب؟ سجّل الدخول'}
        </button>
      </main>
    </>
  );
}
