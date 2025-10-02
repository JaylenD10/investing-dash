import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <div className="flex h-screen bg-grey-900">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-grey-900">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
