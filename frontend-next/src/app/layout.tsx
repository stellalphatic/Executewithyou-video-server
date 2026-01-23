import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Script from "next/script";
import { Providers } from "./providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "ALLSTRM - Professional Live Streaming Platform",
  description: "Microservices-based streaming platform for real-time video communication and live streaming. Built with high performance and reliability.",
  keywords: ["streaming", "live video", "webrtc", "broadcasting", "meetings"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        {/* MediaPipe for Virtual Backgrounds */}
        <Script
          src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js"
          strategy="beforeInteractive"
          crossOrigin="anonymous"
        />
        <Script
          src="https://cdn.jsdelivr.net/npm/@mediapipe/control_utils/control_utils.js"
          strategy="beforeInteractive"
          crossOrigin="anonymous"
        />
        <Script
          src="https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js"
          strategy="beforeInteractive"
          crossOrigin="anonymous"
        />
        <Script
          src="https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js"
          strategy="beforeInteractive"
          crossOrigin="anonymous"
        />
      </head>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
