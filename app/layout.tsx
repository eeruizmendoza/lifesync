import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width:              'device-width',
  initialScale:       1,
  maximumScale:       1,
  userScalable:       false,
  themeColor:         '#6366f1',
  colorScheme:        'light',
  viewportFit:        'cover',
};

export const metadata: Metadata = {
  title: {
    default: 'LifeSync — Universal Communication Hub',
    template: '%s | LifeSync',
  },
  description:
    'Every conversation, every language, one app. Real-time translation for calls, chat, SMS, email, and in-person meetings.',
  keywords: ['translation', 'communication', 'multilingual', 'real-time', 'room mode', 'chat'],
  authors: [{ name: 'LifeSync' }],
  creator: 'LifeSync',
  publisher: 'LifeSync',
  metadataBase: new URL('https://lifesync.app'),
  openGraph: {
    type:  'website',
    title: 'LifeSync — Universal Communication Hub',
    description: 'Real-time translation on every channel. One timeline per contact.',
    siteName: 'LifeSync',
  },
  manifest: '/manifest.json',
  icons: {
    icon:    [
      { url: '/icons/icon-192x192.svg', sizes: '192x192', type: 'image/svg+xml' },
      { url: '/icons/icon-512x512.svg', sizes: '512x512', type: 'image/svg+xml' },
    ],
    apple:   [
      { url: '/icons/icon-152x152.svg', sizes: '152x152', type: 'image/svg+xml' },
    ],
    shortcut:'/icons/icon-192x192.svg',
  },
  appleWebApp: {
    capable:    true,
    statusBarStyle: 'black-translucent',
    title:      'LifeSync',
    startupImage: [],
  },
  applicationName: 'LifeSync',
  formatDetection: {
    telephone: false,
    date:      false,
    address:   false,
    email:     false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* PWA — service worker registration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js', { scope: '/' })
                    .catch(function() {});
                });
              }
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
