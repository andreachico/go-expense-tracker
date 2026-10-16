"use client";

// Decides whether to show the app chrome (sidebar + top bar). The login page is
// a standalone full-screen view, so we render just its content there; every
// other route gets the normal workspace layout.
import { usePathname } from "next/navigation";
import Sidebar from "./sidebar";
import TopBar from "./topbar";

export default function Chrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <TopBar />
        {children}
      </div>
    </>
  );
}
