'use client';
// لوحة إدارة الضمان داخل صفحة الطلب: تحرير المبلغ أو فتح نزاع.
import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import { useI18n } from '../lib/i18n';

const STATUS_LABEL = {
  held: 'escrow.held',
  released: 'escrow.released',
  refunded: 'escrow.refunded',
  disputed: 'escrow.disputed'
};

export default function EscrowPanel({ escrow }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(escrow.status);
  const [msg, setMsg] = useState('');

  const release = async () => {
    if (!confirm(t('escrow.confirmReceive'))) return;
    setBusy(true);
    try {
      await httpsCallable(functions, 'releaseEscrow')({ escrowId: escrow.escrowId });
      setStatus('released');
      setMsg('✅ ' + t('escrow.released'));
    } catch (e) {
      setMsg('⚠️ ' + (e.message || t('common.error')));
    } finally {
      setBusy(false);
    }
  };

  const dispute = async () => {
    const reason = prompt(t('escrow.openDispute'));
    if (!reason || reason.length < 5) return;
    setBusy(true);
    try {
      await httpsCallable(functions, 'openDispute')({ escrowId: escrow.escrowId, reason });
      setStatus('disputed');
      setMsg('⚖️ ' + t('escrow.disputed'));
    } catch (e) {
      setMsg('⚠️ ' + (e.message || t('common.error')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="escrow-panel">
      <div className="escrow-panel__badge" data-status={status}>
        🛡️ {t('product.escrowProtected')} — {t(STATUS_LABEL[status] || 'escrow.held')}
      </div>
      <p className="escrow-panel__amount">
        {escrow.amount} {escrow.currency}
      </p>
      {escrow.autoReleaseDate && status === 'held' && (
        <p className="escrow-panel__hint">
          {t('escrow.autoReleaseOn')}:{' '}
          {new Date(escrow.autoReleaseDate.seconds * 1000).toLocaleDateString()}
        </p>
      )}
      {status === 'held' && (
        <div className="escrow-panel__actions">
          <button onClick={release} disabled={busy} className="btn btn--primary">
            {t('escrow.confirmReceive')}
          </button>
          <button onClick={dispute} disabled={busy} className="btn btn--ghost">
            {t('escrow.openDispute')}
          </button>
        </div>
      )}
      {msg && <p className="escrow-panel__msg">{msg}</p>}
    </div>
  );
}
