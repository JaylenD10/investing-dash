"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  FileText,
  Settings,
  LogOut,
  PlusCircle,
  BarChart3,
  Calendar,
  Menu,
  ArrowLeft,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const menuItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Calendar", href: "/dashboard/calendar", icon: Calendar },
  { name: "Trades", href: "/dashboard/trades", icon: TrendingUp },
  { name: "Add Trade", href: "/dashboard/trades/new", icon: PlusCircle },
  { name: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { name: "Reports", href: "/dashboard/reports", icon: FileText },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  return (
    <div
      className={`${
        isCollapsed ? "w-20" : "w-64"
      } bg-gray-800 border-r border-gray-700 flex flex-col transition-all duration-300`}
    >
      {/* Header */}
      <div className="p-6 flex items-center justify-between">
        {!isCollapsed && (
          <div>
            <h1 className="text-2xl font-bold text-white">Trade Syndicate</h1>
            <p className="text-gray-400 text-sm mt-1">Trading Journal</p>
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={`p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors ${
            isCollapsed ? "mx-auto" : ""
          }`}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? (
            <Menu className="w-5 h-5" />
          ) : (
            <ArrowLeft className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4">
        <ul className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center ${
                    isCollapsed ? "justify-center" : "space-x-3"
                  } px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : "text-gray-300 hover:bg-gray-700 hover:text-white"
                  }`}
                  title={isCollapsed ? item.name : ""}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!isCollapsed && (
                    <span className="font-medium">{item.name}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User section */}
      <div className="p-4 border-t border-gray-700">
        <button
          onClick={handleLogout}
          className={`flex items-center ${
            isCollapsed ? "justify-center" : "space-x-3"
          } px-4 py-3 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white transition-colors w-full`}
          title={isCollapsed ? "Logout" : ""}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!isCollapsed && <span className="font-medium">Logout</span>}
        </button>
      </div>
    </div>
  );
}
