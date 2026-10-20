'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Users, 
  Image as ImageIcon, 
  FileSpreadsheet, 
  LogOut, 
  ChevronLeft, 
  ChevronRight, 
  Menu, 
  X,
  GraduationCap,
  ExternalLink
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

const NAV_ITEMS = [
  {
    name: 'Monitoring Absensi',
    href: '/admin',
    icon: LayoutDashboard,
  },
  {
    name: 'Data Mahasiswa',
    href: '/admin/mahasiswa',
    icon: Users,
  },
  {
    name: 'Kustomisasi Tampilan',
    href: '/admin/settings/landing',
    icon: ImageIcon,
  },
  {
    name: 'Pengaturan Sheets',
    href: '/admin/settings/sheets',
    icon: FileSpreadsheet,
  },
];

export default function AdminSidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Dynamic branding state
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [institutionName, setInstitutionName] = useState('Admin Panel');

  const fetchBranding = async () => {
    try {
      const res = await fetch('/api/admin/settings/landing');
      const data = await res.json();
      if (res.ok && data.data) {
        if (data.data.logo_url) setLogoUrl(data.data.logo_url);
        if (data.data.institution_name) setInstitutionName(data.data.institution_name);
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchBranding();

    // Listen to updates from settings page
    const handleUpdate = () => fetchBranding();
    window.addEventListener('landing-settings-updated', handleUpdate);
    return () => window.removeEventListener('landing-settings-updated', handleUpdate);
  }, []);

  const handleLogout = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch (e) {}
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex">
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden backdrop-blur-xs transition-opacity"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* SIDEBAR ASIDE */}
      <aside
        className={`fixed md:sticky top-0 h-screen bg-white border-r border-black/5 z-50 flex flex-col justify-between transition-all duration-300 ease-in-out ${
          isCollapsed ? 'md:w-20' : 'md:w-64'
        } ${mobileOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0'}`}
      >
        {/* Top Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-black/5 relative">
          <div className="flex items-center gap-3 overflow-hidden">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={institutionName}
                className="w-9 h-9 object-contain rounded-xl border border-black/10 p-0.5 bg-white shrink-0 shadow-2xs"
              />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-[#2563EB] flex items-center justify-center text-white shrink-0 shadow-xs">
                <GraduationCap size={20} />
              </div>
            )}
            {!isCollapsed && (
              <div className="truncate">
                <h2 className="font-bold text-sm text-[#111827] truncate">
                  {institutionName}
                </h2>
                <p className="text-[11px] text-[#6B7280] truncate">Admin Kehadiran</p>
              </div>
            )}
          </div>

          {/* Desktop Collapse Toggle */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden md:flex absolute -right-3.5 top-1/2 -translate-y-1/2 bg-white border border-black/10 rounded-full p-1 text-[#4B5563] hover:text-[#111827] shadow-sm hover:shadow-md transition-all z-10 cursor-pointer"
            title={isCollapsed ? 'Perluas Sidebar' : 'Ciutkan Sidebar'}
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>

          {/* Mobile Close Button */}
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden text-[#4B5563] p-1.5 hover:bg-gray-100 rounded-lg cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation List */}
        <div className="flex-1 py-4 px-3 space-y-1.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === '/admin'
                ? pathname === '/admin'
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all group ${
                  isActive
                    ? 'bg-[#2563EB] text-white shadow-xs'
                    : 'text-[#4B5563] hover:bg-[#F8F9FA] hover:text-[#111827]'
                }`}
                title={isCollapsed ? item.name : undefined}
              >
                <Icon
                  size={18}
                  className={`shrink-0 ${
                    isActive ? 'text-white' : 'text-[#6B7280] group-hover:text-[#111827]'
                  }`}
                />
                {!isCollapsed && <span className="truncate">{item.name}</span>}
              </Link>
            );
          })}
        </div>

        {/* Bottom User Profile & Logout */}
        <div className="p-3 border-t border-black/5">
          <div className="flex items-center justify-between p-2 rounded-xl bg-[#F8F9FA] border border-black/5">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-[#2563EB] font-bold text-xs flex items-center justify-center shrink-0">
                A
              </div>
              {!isCollapsed && (
                <div className="truncate">
                  <p className="text-xs font-bold text-[#111827] truncate">Administrator</p>
                  <p className="text-[10px] text-[#6B7280] truncate">Admin Kehadiran</p>
                </div>
              )}
            </div>

            <button
              onClick={handleLogout}
              className="text-gray-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 transition-all shrink-0 cursor-pointer"
              title="Keluar"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Top Navbar */}
        <header className="md:hidden h-14 bg-white border-b border-black/5 px-4 flex items-center justify-between sticky top-0 z-30">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-[#111827] p-1.5 hover:bg-gray-100 rounded-lg cursor-pointer"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            {logoUrl && (
              <img src={logoUrl} alt="Logo" className="w-6 h-6 object-contain rounded-md" />
            )}
            <span className="font-bold text-sm text-[#111827] truncate max-w-[180px]">{institutionName}</span>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
