"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface SidebarProps {
  workstreams: string[];
}

const navItems = [
  { href: "/", label: "Dashboard", icon: "⊞" },
  { href: "/weekly-update", label: "Weekly Update", icon: "✉" },
  { href: "/gantt", label: "Gantt Chart", icon: "▤" },
  { href: "/critical-path", label: "Critical Path", icon: "⬡" },
  { href: "/owners", label: "Owner View", icon: "◉" },
  { href: "/risks", label: "Risk Register", icon: "⚠" },
  { href: "/reports", label: "Reports & Exports", icon: "↓" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export default function Sidebar({ workstreams }: SidebarProps) {
  const pathname = usePathname();

  async function handleLogout() {
    await fetch("/api/auth", { method: "DELETE" });
    window.location.href = "/login";
  }

  return (
    <aside className="w-56 bg-[#1E3A5F] flex flex-col h-screen flex-shrink-0">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-blue-800">
        <div className="text-white font-semibold text-sm">PMO Dashboard</div>
        <div className="text-blue-300 text-xs mt-0.5">CVA · Project Crystal</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2.5 px-4 py-2 text-sm transition-colors",
              pathname === item.href
                ? "bg-blue-700 text-white font-medium"
                : "text-blue-200 hover:bg-blue-800 hover:text-white"
            )}
          >
            <span className="text-xs opacity-70 w-4 text-center">{item.icon}</span>
            {item.label}
          </Link>
        ))}

        {/* Workstreams section */}
        <div className="mt-3 px-4 pt-3 border-t border-blue-800">
          <div className="text-blue-400 text-xs uppercase tracking-wider mb-2 font-medium">
            Workstreams
          </div>
          {workstreams.map((ws) => (
            <Link
              key={ws}
              href={`/workstreams/${encodeURIComponent(ws)}`}
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 text-xs rounded transition-colors",
                pathname === `/workstreams/${encodeURIComponent(ws)}`
                  ? "bg-blue-700 text-white"
                  : "text-blue-300 hover:bg-blue-800 hover:text-white"
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
              {ws}
            </Link>
          ))}
        </div>
      </nav>

      {/* Bottom: logout */}
      <div className="px-4 py-3 border-t border-blue-800">
        <button
          onClick={handleLogout}
          className="text-blue-300 hover:text-white text-xs transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
