import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-white mb-4">Trade Syndicate</h1>
        <p className="text-xl text-gray-400 mb-8">
          Professional Trading Journal & Analytics
        </p>
        <div className="space-x-4">
          <Link
            href="/auth/login"
            className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Login
          </Link>
          <Link
            href="/auth/signup"
            className="inline-block px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
          >
            Sign Up
          </Link>
        </div>
      </div>
    </div>
  );
}
