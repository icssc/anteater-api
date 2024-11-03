import type { Metadata } from "next";
import "./globals.css";
import React from "react";
import { Inter } from "next/font/google";
import Header from "@/components/layout/Header";

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
        <Header />
        {children}
      </body>
    </html>
  );
}
