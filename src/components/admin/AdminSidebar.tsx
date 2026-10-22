'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Users, 
  Image as ImageIcon, 
  FileSpreadsheet, 
  Vote,
  BarChart3,
  LogOut, 
  ChevronLeft, 
  ChevronRight, 
  Menu, 
  X,
  GraduationCap,
  ExternalLink,
  Loader2,
  Globe,
  ArrowRight
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

const NAV_ITEMS = [
  {
    name: 'Monitoring Absensi',
    href: '/admin',
    icon: LayoutDashboard,
  },
  {
    name: 'Bilik Suara (Antrean)',
    href: '/admin/bilik-suara',
    icon: Vote,
  },
  {
    name: 'Quick Count Pemira',
    href: '/admin/quick-count',
    icon: BarChart3,
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
  const [authChecking, setAuthChecking] = useState(true);

  // Online Voting Quick Summary
  const [onlineSummary, setOnlineSummary] = useState<{
    totalOnlineVoters: number;
    onlineAttended: number;
    onlineVoted: number;
    candidateTallies: Record<string, { number: string; name: string; votes: number }>;
    golputCount: number;
    totalOnlineVotesCast: number;
    isMerged: boolean;
  } | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          window.location.href = '/login';
          return;
        }
      } catch (err) {
        window.location.href = '/login';
        return;
      }
      setAuthChecking(false);
    };

    checkAuth();
  }, []);

  const fetchOnlineSummary = async () => {
    try {
      const res = await fetch('/api/admin/quick-count');
      const data = await res.json();
      if (res.ok && data.onlineStats) {
        setOnlineSummary(data.onlineStats);
      }
    } catch (e) {}
  };

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
    fetchOnlineSummary();

    const interval = setInterval(fetchOnlineSummary, 15000);

    // Listen to updates from settings page
    const handleUpdate = () => {
      fetchBranding();
      fetchOnlineSummary();
    };
    window.addEventListener('landing-settings-updated', handleUpdate);
    return () => {
      clearInterval(interval);
      window.removeEventListener('landing-settings-updated', handleUpdate);
    };
  }, []);

  const handleLogout = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch (e) {}
    window.location.href = '/login';
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-[#2563EB] animate-spin" />
        <p className="text-xs text-gray-500 font-medium">Memverifikasi sesi admin...</p>
      </div>
    );
  }

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

        {/* Live Online Votes Summary Widget (Sidebar Card) */}
        {!isCollapsed && onlineSummary && (
          <div className="px-3 pb-3">
            <div className="p-3 bg-gradient-to-br from-purple-50 to-indigo-50/50 rounded-2xl border border-purple-200/80 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-purple-900">
                  <Globe size={14} className="text-purple-600" />
                  <span>Suara Online</span>
                </div>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  onlineSummary.isMerged ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-200 text-purple-800'
                }`}>
                  {onlineSummary.isMerged ? 'Merged ✅' : 'Live'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1 text-center py-1 bg-white/70 rounded-xl border border-purple-100">
                <div>
                  <span className="text-[10px] text-gray-400 block font-bold">Total</span>
                  <span className="font-mono font-bold text-gray-800 text-xs">{onlineSummary.totalOnlineVoters}</span>
                </div>
                <div>
                  <span className="text-[10px] text-emerald-600 block font-bold">Hadir</span>
                  <span className="font-mono font-bold text-emerald-700 text-xs">{onlineSummary.onlineAttended}</span>
                </div>
                <div>
                  <span className="text-[10px] text-purple-600 block font-bold">Vote</span>
                  <span className="font-mono font-bold text-purple-700 text-xs">{onlineSummary.onlineVoted}</span>
                </div>
              </div>

              {/* Per-Paslon Quick Count in Sidebar */}
              {Object.keys(onlineSummary.candidateTallies).length > 0 && (
                <div className="space-y-1 pt-0.5">
                  {Object.entries(onlineSummary.candidateTallies).map(([id, c]) => (
                    <div key={id} className="flex items-center justify-between text-[11px] px-1">
                      <span className="text-gray-600 truncate max-w-[120px]">
                        Paslon {c.number}
                      </span>
                      <span className="font-mono font-bold text-purple-900">{c.votes} suara</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-[11px] px-1 text-gray-500">
                    <span>Golput / Rusak</span>
                    <span className="font-mono font-bold">{onlineSummary.golputCount} suara</span>
                  </div>
                </div>
              )}

              <Link
                href="/admin/quick-count"
                className="w-full mt-1.5 py-1.5 px-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 shadow-2xs transition-all"
              >
                <span>Kelola di Quick Count</span>
                <ArrowRight size={12} />
              </Link>
            </div>
          </div>
        )}

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
