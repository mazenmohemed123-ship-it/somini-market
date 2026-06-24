'use client';
// خلفية غابة مبنية بالكامل بـ SVG/CSS — بدون أي صور خارجية.
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
          {/* سماء الغابة المتدرّجة */}
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1d3b2a" />
            <stop offset="45%" stopColor="#234a31" />
            <stop offset="100%" stopColor="#0e2419" />
          </linearGradient>
          {/* ضباب */}
          <radialGradient id="mist" cx="50%" cy="35%" r="60%">
            <stop offset="0%" stopColor="#9fd9b0" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#9fd9b0" stopOpacity="0" />
          </radialGradient>
          {/* أشعة ضوء */}
          <linearGradient id="ray" x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0%" stopColor="#d8f3c4" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#d8f3c4" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* السماء */}
        <rect width="1440" height="900" fill="url(#sky)" />

        {/* أشعة الضوء المائلة */}
        <g opacity="0.7">
          <polygon points="300,0 520,0 360,900 80,900" fill="url(#ray)" />
          <polygon points="760,0 900,0 820,900 600,900" fill="url(#ray)" />
          <polygon points="1100,0 1240,0 1180,900 980,900" fill="url(#ray)" />
        </g>

        {/* الضباب */}
        <rect width="1440" height="900" fill="url(#mist)" />

        {/* طبقة أشجار خلفية (داكنة، بعيدة) */}
        <g fill="#10301f" opacity="0.85">
          {treeRow(0, 760, 7, 220, 0.9)}
        </g>
        {/* طبقة أشجار وسطى */}
        <g fill="#0c2719" opacity="0.92">
          {treeRow(-60, 820, 6, 300, 1.15)}
        </g>
        {/* طبقة أشجار أمامية (الأقرب) */}
        <g fill="#06170e">
          {treeRow(-120, 900, 5, 380, 1.5)}
        </g>

        {/* أرضية الغابة */}
        <ellipse cx="720" cy="900" rx="900" ry="120" fill="#06170e" />
      </svg>

      {/* جسيمات ضوء (bokeh) متحركة */}
      <div className="forest-bg__bokeh">
        {Array.from({ length: 14 }).map((_, i) => (
          <span
            key={i}
            style={{
              left: `${(i * 7.3 + 5) % 100}%`,
              top: `${(i * 13.7 + 10) % 90}%`,
              width: `${6 + (i % 4) * 5}px`,
              height: `${6 + (i % 4) * 5}px`,
              animationDelay: `${(i % 6) * 0.8}s`,
              animationDuration: `${5 + (i % 5)}s`
            }}
          />
        ))}
      </div>

      {/* طبقة تعتيم للوضوح */}
      <div className="forest-bg__overlay" />
    </div>
  );
}

// مولّد صف أشجار صنوبرية مثلثة بأحجام متدرجة
function treeRow(offsetX, baseY, count, height, scale) {
  const trees = [];
  const gap = 1560 / count;
  for (let i = 0; i < count; i++) {
    const x = offsetX + i * gap + (i % 2) * 40;
    const h = height * (0.85 + (i % 3) * 0.12);
    const w = h * 0.55 * scale;
    trees.push(<Pine key={`${offsetX}-${i}`} x={x} baseY={baseY} w={w} h={h} />);
  }
  return trees;
}

// شجرة صنوبر من 3 طبقات مثلثة + جذع
function Pine({ x, baseY, w, h }) {
  const cx = x;
  const layer = h / 3.2;
  const trunkW = w * 0.12;
  return (
    <g>
      <rect x={cx - trunkW / 2} y={baseY - layer * 0.4} width={trunkW} height={layer * 0.5} />
      <polygon points={`${cx},${baseY - h} ${cx - w / 2},${baseY - h + layer * 1.5} ${cx + w / 2},${baseY - h + layer * 1.5}`} />
      <polygon points={`${cx},${baseY - h + layer * 0.9} ${cx - w * 0.58},${baseY - h + layer * 2.4} ${cx + w * 0.58},${baseY - h + layer * 2.4}`} />
      <polygon points={`${cx},${baseY - h + layer * 1.9} ${cx - w * 0.65},${baseY - layer * 0.2} ${cx + w * 0.65},${baseY - layer * 0.2}`} />
    </g>
  );
}
