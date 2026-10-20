import AdminSidebar from '@/components/admin/AdminSidebar';

export const metadata = {
  title: 'Dashboard Admin | Sistem Absensi',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminSidebar>{children}</AdminSidebar>;
}
