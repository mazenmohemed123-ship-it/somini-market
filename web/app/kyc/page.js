'use client';
// صفحة التحقق من الهوية (KYC) — تقديم الوثائق للحصول على مستويات الثقة
import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { useRouter } from 'next/navigation';
import { functions, storage } from '../../lib/firebase';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import Navbar from '../../components/Navbar';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export default function KycPage() {
  const { user, role, claims } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  const [kycLevel, setKycLevel] = useState('L1');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [files, setFiles] = useState({
    idImage: null,
    livenessImage: null,
    businessDoc: null,
    taxDoc: null,
    exportLicense: null
  });
  const [data, setData] = useState({
    idNumber: '',
    companyName: '',
    businessRegistration: '',
    taxId: '',
    representativeName: ''
  });

  if (!user) {
    return (
      <>
        <Navbar />
        <main className="container" style={{ maxWidth: '560px' }}>
          <div className="panel">
            <p>سجّل الدخول أولاً.</p>
          </div>
        </main>
      </>
    );
  }

  const handleFileChange = (field, e) => {
    setFiles({ ...files, [field]: e.target.files?.[0] || null });
  };

  const uploadFile = async (file, path) => {
    if (!file) return null;
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, file);
    return await getDownloadURL(fileRef);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    try {
      // رفع الملفات
      const idImageUrl = await uploadFile(files.idImage, `kyc/${user.uid}/id.jpg`);
      const livenessImageUrl = await uploadFile(files.livenessImage, `kyc/${user.uid}/liveness.jpg`);
      const businessDocUrl = await uploadFile(files.businessDoc, `kyc/${user.uid}/business-doc.pdf`);
      const taxDocUrl = await uploadFile(files.taxDoc, `kyc/${user.uid}/tax-doc.pdf`);
      const exportLicenseUrl = await uploadFile(files.exportLicense, `kyc/${user.uid}/export-license.pdf`);

      // استدعاء Cloud Function
      const submitKyc = httpsCallable(functions, 'submitKyc');
      const result = await submitKyc({
        kycLevel,
        idNumber: kycLevel === 'L1' ? data.idNumber : null,
        idImage: idImageUrl,
        livenessImage: livenessImageUrl,
        companyName: kycLevel >= 'L2' ? data.companyName : null,
        businessRegistration: kycLevel >= 'L2' ? data.businessRegistration : null,
        taxId: kycLevel >= 'L2' ? data.taxId : null,
        representativeName: kycLevel >= 'L2' ? data.representativeName : null,
        exportLicense: kycLevel === 'L3' ? exportLicenseUrl : null,
        foundingDocs: null,
        activityProof: null
      });

      setMsg('✅ تم رفع طلبك. انتظر موافقة الفريق.');
      setTimeout(() => router.push('/'), 2000);
    } catch (e) {
      setMsg('⚠️ ' + (e.message || 'حدث خطأ في الرفع'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Navbar />
      <main className="container" style={{ maxWidth: '560px' }}>
        <div className="page-head">
          <h1>🔐 التحقق من الهوية (KYC)</h1>
        </div>

        <div className="panel">
          <h2 className="panel__title">اختر مستوى التحقق</h2>
          <p className="panel__sub">اختر المستوى المناسب لنوع نشاطك</p>

          <div className="form-stack" style={{ marginBottom: '1.5rem' }}>
            <label style={{ marginBottom: '0.75rem' }}>
              <input
                type="radio"
                name="kycLevel"
                value="L1"
                checked={kycLevel === 'L1'}
                onChange={(e) => setKycLevel(e.target.value)}
              />
              {' '}L1 — بائع فرد (بطاقة هوية + صورة حية)
            </label>
            <label style={{ marginBottom: '0.75rem' }}>
              <input
                type="radio"
                name="kycLevel"
                value="L2"
                checked={kycLevel === 'L2'}
                onChange={(e) => setKycLevel(e.target.value)}
              />
              {' '}L2 — شركة أساسي (سجل تجاري + بطاقة ضريبية)
            </label>
            <label>
              <input
                type="radio"
                name="kycLevel"
                value="L3"
                checked={kycLevel === 'L3'}
                onChange={(e) => setKycLevel(e.target.value)}
              />
              {' '}L3 — شركة موسّعة (صفقات كبيرة/تصدير)
            </label>
          </div>

          <form onSubmit={handleSubmit}>
            {/* L1: بيانات البائع الفرد */}
            {kycLevel === 'L1' && (
              <>
                <div className="form-stack">
                  <div>
                    <label>رقم البطاقة</label>
                    <input
                      placeholder="3010110223456"
                      value={data.idNumber}
                      onChange={(e) => setData({ ...data, idNumber: e.target.value })}
                    />
                  </div>
                  <div>
                    <label>صورة البطاقة</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileChange('idImage', e)}
                      required
                    />
                  </div>
                  <div>
                    <label>صورة حية (Selfie بجانب البطاقة)</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileChange('livenessImage', e)}
                      required
                    />
                  </div>
                </div>
              </>
            )}

            {/* L2+: بيانات الشركة */}
            {kycLevel >= 'L2' && (
              <>
                <div className="form-stack">
                  <div>
                    <label>اسم الشركة</label>
                    <input
                      placeholder="مثال: شركة الزراعة للتصدير"
                      value={data.companyName}
                      onChange={(e) => setData({ ...data, companyName: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label>رقم السجل التجاري</label>
                    <input
                      placeholder="12345"
                      value={data.businessRegistration}
                      onChange={(e) => setData({ ...data, businessRegistration: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label>رقم البطاقة الضريبية</label>
                    <input
                      placeholder="600-123-456"
                      value={data.taxId}
                      onChange={(e) => setData({ ...data, taxId: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label>اسم الممثل القانوني</label>
                    <input
                      placeholder="أحمد محمد علي"
                      value={data.representativeName}
                      onChange={(e) => setData({ ...data, representativeName: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label>صورة البطاقة (الممثل)</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileChange('idImage', e)}
                      required
                    />
                  </div>
                  <div>
                    <label>صورة حية (الممثل)</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileChange('livenessImage', e)}
                      required
                    />
                  </div>
                  <div>
                    <label>السجل التجاري (PDF)</label>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => handleFileChange('businessDoc', e)}
                      required
                    />
                  </div>
                  <div>
                    <label>الشهادة الضريبية (PDF)</label>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => handleFileChange('taxDoc', e)}
                      required
                    />
                  </div>
                </div>
              </>
            )}

            {/* L3: وثائق إضافية */}
            {kycLevel === 'L3' && (
              <>
                <div className="form-stack">
                  <div>
                    <label>ترخيص التصدير (اختياري)</label>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => handleFileChange('exportLicense', e)}
                    />
                  </div>
                </div>
              </>
            )}

            {msg && <p className="toast-msg" style={{ marginTop: '1rem' }}>{msg}</p>}

            <button className="btn btn--primary btn--block" disabled={loading} style={{ marginTop: '1.5rem' }}>
              {loading ? 'جاري الرفع...' : 'تقديم الطلب'}
            </button>
          </form>
        </div>
      </main>
    </>
  );
}
