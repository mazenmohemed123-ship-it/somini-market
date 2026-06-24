/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // تصدير ثابت بالكامل → استضافة مجانية على Firebase Hosting دون Cloud Functions.
  // ترويسات الـ Service Worker تُضبط في firebase.json بدلاً من headers() هنا.
  output: 'export',
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
      { protocol: 'https', hostname: 'storage.googleapis.com' }
    ]
  }
};

module.exports = nextConfig;
