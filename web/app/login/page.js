'use client';
// تسجيل الدخول/الإنشاء عبر البريد + Google OAuth — بتصميم بطاقة زجاجية وثيمين.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { signInWithGoogle } from '../../lib/firebase-auth';
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
      if (form.password !== form.confirm) {
        setErr('كلمتا المرور غير متطابقتين');
        return;
      }
      if (scorePassword(form.password) < 2) {
        setErr('كلمة المرور ضعيفة جداً — اجعلها أقوى');
        return;
      }
      if (!agree) {
        setErr('يجب الموافقة على الشروط والأحكام أولاً');
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, form.email, form.password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
        await updateProfile(cred.user, { displayName: form.fullName });
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
      setErr(translateError(e.code) || e.message);
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setErr(null);
    setBusy(true);
    try {
      await signInWithGoogle();
      router.push('/');
    } catch (e) {
      setErr(translateError(e.code) || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-screen">
      <div className="auth-toggle-theme">
        <ThemeToggle />
      </div>

      <div style={{ width: '100%', maxWidth: '440px' }}>
        {/* الهوية */}
        <div className="auth-brand">
          <h1>Somini Market</h1>
          <p>اكتشف أفضل المنتجات بلمسة عصرية</p>
          <small>من شركة SomniX</small>
        </div>

        {/* البطاقة */}
        <div className="auth-card">
          <div className="auth-tabs">
            <button
              type="button"
              className={mode === 'login' ? 'active' : ''}
              onClick={() => { setMode('login'); setErr(null); }}
            >
              تسجيل الدخول
            </button>
            <button
              type="button"
              className={mode === 'signup' ? 'active' : ''}
              onClick={() => { setMode('signup'); setErr(null); }}
            >
              إنشاء حساب
            </button>
          </div>

          <form onSubmit={submit}>
            {mode === 'signup' && (
              <div className="auth-field">
                <label>الاسم الكامل</label>
                <input
                  type="text"
                  placeholder="أحمد محمد"
                  value={form.fullName}
                  onChange={update('fullName')}
                  required
                />
              </div>
            )}

            <div className="auth-field">
              <label>البريد الإلكتروني</label>
              <input
                type="email"
                placeholder="example@domain.com"
                value={form.email}
                onChange={update('email')}
                required
              />
            </div>

            <div className="auth-field">
              <label>كلمة المرور</label>
              <input
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={update('password')}
                required
              />
              {mode === 'signup' && <PasswordStrength password={form.password} />}
            </div>

            {mode === 'signup' && (
              <div className="auth-field">
                <label>تأكيد كلمة المرور</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={form.confirm}
                  onChange={update('confirm')}
                  required
                />
              </div>
            )}

            {mode === 'signup' && (
              <label className="terms-check">
                <input
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                />
                <span>
                  أوافق على <a href="#" onClick={(e) => e.preventDefault()}>الشروط والأحكام</a> و
                  <a href="#" onClick={(e) => e.preventDefault()}> سياسة الخصوصية</a>
                </span>
              </label>
            )}

            {err && <p className="error" style={{ marginTop: '0.5rem' }}>{err}</p>}

            <button
              className="auth-btn"
              disabled={busy || (mode === 'signup' && !agree)}
            >
              {busy ? 'جاري...' : mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب'}
            </button>
          </form>

          <div className="auth-divider">أو</div>

          <button type="button" className="auth-google" onClick={google} disabled={busy}>
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            التسجيل بواسطة جوجل
          </button>
        </div>

        {/* روابط أسفل */}
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
    'auth/popup-closed-by-user': 'تم إغلاق نافذة جوجل قبل الإكمال',
    'auth/too-many-requests': 'محاولات كثيرة — حاول لاحقاً'
  };
  return map[code];
}
