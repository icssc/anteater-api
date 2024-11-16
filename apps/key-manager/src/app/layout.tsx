import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/layout/Header";
import { Inter } from "next/font/google";
import type React from "react";
import { SessionProvider } from "next-auth/react";

export const metadata: Metadata = {};

const inter = Inter({
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body>
        <SessionProvider>
          <Header />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
