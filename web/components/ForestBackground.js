'use client';
// خلفية الغابة: صورة حقيقية (public/forest-bg.jpg) + جسيمات ضوء متحركة فوقها.
// تظهر فقط في ثيم "forest".
import { useTheme } from '../lib/theme';

export default function ForestBackground() {
  const { theme } = useTheme();
  if (theme !== 'forest') return null;

  return (
    <div className="forest-bg" aria-hidden="true">
      {/* الصورة الحقيقية للغابة */}
      <div className="forest-bg__photo" />

      {/* جسيمات ضوء (bokeh) متحركة - أضواء دافئة */}
      <div className="forest-bg__bokeh">
        {Array.from({ length: 16 }).map((_, i) => (
          <span
            key={i}
            style={{
              left: `${(i * 6.25 + 3) % 100}%`,
              top: `${(i * 5.6 + 8) % 85}%`,
              width: `${5 + (i % 5) * 4}px`,
              height: `${5 + (i % 5) * 4}px`,
              animationDelay: `${(i % 8) * 0.6}s`,
              animationDuration: `${6 + (i % 6)}s`,
              background: i % 3 === 0
                ? 'radial-gradient(circle, rgba(245,230,168,0.95) 0%, rgba(245,230,168,0) 70%)'
                : 'radial-gradient(circle, rgba(216,243,196,0.85) 0%, rgba(216,243,196,0) 70%)'
            }}
          />
        ))}
      </div>

      {/* طبقة تعتيم لتحسين التباين والوضوح فوق الصورة */}
      <div className="forest-bg__overlay" />
    </div>
  );
}
