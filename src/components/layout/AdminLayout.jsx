"use client";

import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { 
  Plus, 
  Home, 
  LogOut, 
  Menu, 
  Database, 
  ChevronDown, 
  ChevronRight,
  FileText,
  Box,
  Settings2,
  Wrench,
  X,
  Layout,
  User
} from 'lucide-react';

export default function AdminLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [userRole, setUserRole] = useState("");

  useEffect(() => {
    const storedUsername = sessionStorage.getItem('username');
    const storedName = sessionStorage.getItem('name');
    const storedRole = sessionStorage.getItem('role');
    
    if (!storedUsername) {
      navigate("/login");
      return;
    }
  
    setUsername(storedName || storedUsername);
    setUserRole(storedRole || "user");
  }, [navigate]);

  const handleLogout = () => {
    sessionStorage.clear();
    navigate("/login");
  };

  const routes = [
    {
      href: "/dashboard/admin",
      label: "Dashboard",
      icon: Layout,
      active: location.pathname === "/dashboard/admin",
      showFor: ["admin", "user"]
    },
    {
      href: "/dashboard/stock",
      label: "Stock",
      icon: Database,
      active: location.pathname === "/dashboard/stock",
      showFor: ["admin", "user"]
    },
    {
      href: "/dashboard/Inventory",
      label: "Inventory",
      icon: Box,
      active: location.pathname === "/dashboard/Inventory",
      showFor: ["admin", "user"]
    },
    {
      href: "/dashboard/master",
      label: "Master",
      icon: Wrench,
      active: location.pathname === "/dashboard/master",
      showFor: ["admin"]
    },
    {
      href: "/dashboard/settings",
      label: "Settings",
      icon: Settings2,
      active: location.pathname === "/dashboard/settings",
      showFor: ["admin"]
    }
  ];

  const getAccessibleRoutes = () => {
    return routes.filter(route => route.showFor.includes(userRole));
  };

  const accessibleRoutes = getAccessibleRoutes();

  const SidebarContent = () => (
    <>
      <div className="flex h-16 items-center px-6 border-b border-violet-50">
        <div className="flex items-center gap-3">
          <span className="text-xl font-semibold text-slate-800 tracking-tight">Crockery Cutlery</span>
        </div>
      </div>
      
      <nav className="flex-1 overflow-y-auto p-2 custom-scrollbar">
        <ul className="space-y-0.5">
          {accessibleRoutes.map((route) => (
            <li key={route.label}>
              <Link
                to={route.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-medium font-medium transition-all duration-300 ${
                  route.active
                    ? "bg-violet-600 text-white shadow-lg shadow-violet-200"
                    : "text-slate-500 hover:text-violet-600 hover:bg-violet-50"
                }`}
              >
                <route.icon className={`h-4 w-4 ${route.active ? "text-white" : ""}`} />
                {route.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="p-3 border-t border-violet-50">
        <div className="bg-violet-50/50 rounded-2xl p-3 flex items-center justify-between group">
          <button className="flex items-center gap-3 px-3 py-2 rounded-2xl group relative overflow-hidden transition-all duration-300 hover:bg-violet-600/5">
            <div className="h-8 w-8 flex items-center justify-center rounded-xl bg-white shadow-sm border border-violet-100 group-hover:scale-110 transition-transform">
              <User className="h-4 w-4 text-violet-600" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-xs font-semibold text-slate-900 leading-none">{username}</span>
              <span className="text-[9px] font-medium text-slate-400 mt-1 uppercase tracking-wider">{userRole}</span>
            </div>
            <ChevronDown className="h-3 w-3 ml-1 text-slate-300 group-hover:text-violet-600 transition-colors" />
          </button>
          <button 
            onClick={handleLogout}
            className="h-8 w-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[#f5f3ff]">
      {/* Desktop Sidebar */}
      <aside className="hidden w-52 flex-shrink-0 border-r border-violet-100 bg-white md:flex md:flex-col shadow-xl shadow-violet-500/5 transition-all">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => setIsMobileMenuOpen(false)}
          ></div>
          <aside className="absolute left-0 inset-y-0 w-64 bg-white flex flex-col shadow-2xl transition-transform duration-500 animate-in slide-in-from-left duration-500">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile Navigation Header */}
        <header className="md:hidden h-14 bg-white border-b border-violet-100 px-4 flex items-center justify-between shrink-0 z-30 shadow-xs">
          <span className="text-base font-bold text-slate-800 tracking-tight">Crockery Cutlery</span>
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="h-9 w-9 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center text-slate-700 active:scale-95 transition-all"
            aria-label="Toggle Menu"
          >
            {isMobileMenuOpen ? <X className="h-4.5 w-4.5" /> : <Menu className="h-4.5 w-4.5" />}
          </button>
        </header>
        <main className="flex-1 overflow-y-auto custom-scrollbar bg-[#f5f3ff] pb-12">
          <div className="w-full">
            {children}
          </div>
        </main>

        <footer className="h-10 bg-white border-t border-violet-100 flex items-center justify-center shrink-0">
          <div className="flex items-center gap-2 text-[10px] font-medium text-slate-400">
            <span className="uppercase tracking-[0.1em]">Powered by</span>
            <a
              href="https://www.botivate.in/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-slate-600 hover:text-violet-600 transition-colors uppercase tracking-wider"
            >
              Botivate
            </a>
          </div>
        </footer>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 transparent;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
          height: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 9999px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}} />
    </div>
  );
}