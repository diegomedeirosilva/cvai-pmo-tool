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
    <aside className="w-56 bg-gradient-to-b from-[#04101F] via-[#061B30] to-[#081F38] border-r border-white/10 flex flex-col h-screen flex-shrink-0">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cva-logo-white.png" alt="CVA" className="w-24 h-auto" />
        <div className="text-teal-500 text-[10px] font-semibold uppercase tracking-[2px] mt-2.5">Project Crystal · PMO</div>
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
                ? "bg-white/[0.07] text-white font-medium shadow-[inset_3px_0_0_0_#1FC6B8]"
                : "text-white/55 hover:bg-white/[0.04] hover:text-white"
            )}
          >
            <span className="text-xs opacity-70 w-4 text-center">{item.icon}</span>
            {item.label}
          </Link>
        ))}

        {/* Workstreams section */}
        <div className="mt-3 px-4 pt-3 border-t border-white/10">
          <div className="text-teal-500 text-[10px] uppercase tracking-[2px] mb-2 font-semibold">
            Workstreams
          </div>
          {workstreams.map((ws) => (
            <Link
              key={ws}
              href={`/workstreams/${encodeURIComponent(ws)}`}
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 text-xs rounded transition-colors",
                pathname === `/workstreams/${encodeURIComponent(ws)}`
                  ? "bg-white/[0.07] text-white"
                  : "text-white/50 hover:bg-white/[0.04] hover:text-white"
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500/80 flex-shrink-0" />
              {ws}
            </Link>
          ))}
        </div>
      </nav>

      {/* Bottom: logout */}
      <div className="px-4 py-3 border-t border-white/10">
        <button
          onClick={handleLogout}
          className="text-white/45 hover:text-white text-xs transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
