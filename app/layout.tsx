import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Google Ads Advisor — HAI Digital Marketing",
  description: "Campaign strategy and recommendations powered by AI",
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
      <body className="min-h-full flex flex-col bg-gray-950 text-gray-100">
        <div className="flex flex-1 flex-col">{children}</div>
        <footer className="border-t border-gray-800 bg-gray-950 px-6 py-3 text-center text-xs text-gray-500">
          Google Ads Helper v{process.env.NEXT_PUBLIC_APP_VERSION}
        </footer>
      </body>
    </html>
  );
}
