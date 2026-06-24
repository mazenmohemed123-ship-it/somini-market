'use client';
// خلفية غابة واقعية مبنية بالكامل بـ SVG/CSS — بدون أي صور خارجية.
// تظهر فقط في ثيم "forest".
import { useTheme } from '../lib/theme';

export default function ForestBackground() {
  const { theme } = useTheme();
  if (theme !== 'forest') return null;

  return (
    <div className="forest-bg" aria-hidden="true">
      <svg
        className="forest-bg__svg"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* سماء الغابة: من أزرق فاتح في الأعلى إلى أخضر داكن أسفل */}
          <linearGradient id="skyForest" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2d5a4a" />
            <stop offset="40%" stopColor="#1f4a3a" />
            <stop offset="100%" stopColor="#0f2c1f" />
          </linearGradient>

          {/* ضباب: شفاف متدرج من الأعلى */}
          <radialGradient id="mistForest" cx="50%" cy="20%" r="70%">
            <stop offset="0%" stopColor="#a8d5ba" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#a8d5ba" stopOpacity="0" />
          </radialGradient>

          {/* أشعة ضوء دافئة من الشمس */}
          <linearGradient id="sunRay" x1="30%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#f5e6a8" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#f5e6a8" stopOpacity="0" />
          </linearGradient>

          {/* تدرج أرضية الغابة */}
          <linearGradient id="groundForest" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a3a2a" />
            <stop offset="100%" stopColor="#0a1a0f" />
          </linearGradient>
        </defs>

        {/* السماء */}
        <rect width="1440" height="900" fill="url(#skyForest)" />

        {/* أشعة الشمس الدافئة */}
        <g opacity="0.6">
          <polygon points="250,0 550,0 350,900 50,900" fill="url(#sunRay)" />
          <polygon points="800,0 1000,0 900,900 650,900" fill="url(#sunRay)" />
        </g>

        {/* ضباب الصباح */}
        <rect width="1440" height="900" fill="url(#mistForest)" />

        {/* طبقة أشجار بعيدة جداً (ألوان داكنة جداً) */}
        <g fill="#0a2415" opacity="0.75">
          {treeRowRealistic(-200, 650, 8, 180, 1.0)}
        </g>

        {/* طبقة أشجار متوسطة البعد */}
        <g fill="#0f3620" opacity="0.85">
          {treeRowRealistic(-100, 750, 7, 280, 1.3)}
        </g>

        {/* طبقة أشجار قريبة (الأمامية) - الأكثر وضوحاً */}
        <g fill="#0a2415">
          {treeRowRealistic(0, 850, 6, 400, 1.6)}
        </g>

        {/* أرضية الغابة مع التفاصيل */}
        <ellipse cx="720" cy="900" rx="1000" ry="150" fill="url(#groundForest)" />

        {/* نقاط ضوئية على الأرض (أوراق متناثرة تعكس الضوء) */}
        <g opacity="0.3">
          <circle cx="200" cy="820" r="3" fill="#d4af77" />
          <circle cx="350" cy="840" r="2.5" fill="#d4af77" />
          <circle cx="520" cy="835" r="2" fill="#d4af77" />
          <circle cx="680" cy="850" r="3" fill="#d4af77" />
          <circle cx="900" cy="830" r="2.5" fill="#d4af77" />
          <circle cx="1100" cy="845" r="2" fill="#d4af77" />
          <circle cx="1250" cy="825" r="2.5" fill="#d4af77" />
        </g>
      </svg>

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
              background: i % 3 === 0 ? 'radial-gradient(circle, rgba(245,230,168,0.95) 0%, rgba(245,230,168,0) 70%)' : 'radial-gradient(circle, rgba(216,243,196,0.85) 0%, rgba(216,243,196,0) 70%)'
            }}
          />
        ))}
      </div>

      {/* طبقة تعتيم لتحسين التباين والوضوح */}
      <div className="forest-bg__overlay" />
    </div>
  );
}

// مولّد صف أشجار صنوبرية واقعية بأحجام متدرجة
function treeRowRealistic(offsetX, baseY, count, height, scale) {
  const trees = [];
  const gap = 1560 / count;
  for (let i = 0; i < count; i++) {
    const x = offsetX + i * gap + (i % 2) * 60 - 30;
    const h = height * (0.8 + (i % 4) * 0.15);
    const w = h * 0.5 * scale;
    const variation = (i % 3) - 1;
    trees.push(
      <PineRealistic
        key={`${offsetX}-${i}`}
        x={x + variation * 20}
        baseY={baseY}
        w={w}
        h={h}
      />
    );
  }
  return trees;
}

// شجرة صنوبر واقعية: 4 طبقات مثلثية + جذع سميك
function PineRealistic({ x, baseY, w, h }) {
  const cx = x;
  const layer = h / 4;
  const trunkW = w * 0.15;
  const trunkH = layer * 0.8;

  return (
    <g>
      {/* الطبقة العليا (الأضيق) */}
      <polygon points={`${cx},${baseY - h} ${cx - w * 0.35},${baseY - h + layer * 1.2} ${cx + w * 0.35},${baseY - h + layer * 1.2}`} />
      {/* الطبقة الثانية */}
      <polygon points={`${cx},${baseY - h + layer * 0.7} ${cx - w * 0.55},${baseY - h + layer * 2.3} ${cx + w * 0.55},${baseY - h + layer * 2.3}`} />
      {/* الطبقة الثالثة */}
      <polygon points={`${cx},${baseY - h + layer * 1.8} ${cx - w * 0.68},${baseY - h + layer * 3.5} ${cx + w * 0.68},${baseY - h + layer * 3.5}`} />
      {/* الطبقة السفلى (الأعرض) */}
      <polygon points={`${cx},${baseY - h + layer * 2.8} ${cx - w * 0.75},${baseY - layer * 0.1} ${cx + w * 0.75},${baseY - layer * 0.1}`} />
      {/* الجذع */}
      <rect x={cx - trunkW / 2} y={baseY - trunkH} width={trunkW} height={trunkH} fill="#3d2817" />
    </g>
  );
}
