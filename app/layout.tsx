import "./globals.css";
import type { Metadata, Viewport } from "next";
import PwaRegister from "@/components/PwaRegister";
import ClientLayout from "@/components/ClientLayout"; // साइडबार और लेआउट रैपर

export const metadata: Metadata = {
  title: "GATE 2027 Dashboard",
  description: "GATE 2027 Study Roadmap & Performance Tracker",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "GATE 2027",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#1f4e79",
  width: "device-width",
  initialScale: 1,
};

const THEME_SCRIPT = `(function(){try{var t=null;try{t=localStorage.getItem("theme")}catch(e){}var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;if(d)document.documentElement.classList.add("dark")}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Paint se pehle dark class lagata hai (flash nahi hota). Saved theme na ho to OS preference. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 min-h-screen m-0 p-0 antialiased">
        {/* PWA Service Worker Registration */}
        <PwaRegister />

        {/* Sidebar aur baaki pages ClientLayout ke andar */}
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}