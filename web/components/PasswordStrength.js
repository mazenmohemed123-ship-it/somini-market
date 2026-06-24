'use client';
// مقياس قوة كلمة المرور: ضعيفة / مقبولة / جيدة / جيد جداً / ممتازة.

export function scorePassword(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 5);
}

const LEVELS = [
  { label: '', color: '' },
  { label: 'ضعيفة', color: '#ef4444' },
  { label: 'مقبولة', color: '#f59e0b' },
  { label: 'جيدة', color: '#eab308' },
  { label: 'جيد جداً', color: '#22c55e' },
  { label: 'ممتازة', color: '#16a34a' }
];

export default function PasswordStrength({ password }) {
  const score = scorePassword(password);
  const level = LEVELS[score];

  if (!password) return null;

  return (
    <div className="pw-strength">
      <div className="pw-strength__bars">
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className="pw-strength__bar"
            style={{ background: i <= score ? level.color : 'rgba(150,150,150,0.25)' }}
          />
        ))}
      </div>
      <span className="pw-strength__label" style={{ color: level.color }}>
        {level.label}
      </span>
    </div>
  );
}
