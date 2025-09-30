"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { User, Bell, Shield, CreditCard, Save, Check, X } from "lucide-react";
import { Profile } from "@/types/database";

const profileSchema = z.object({
  full_name: z.string().min(1, "Full name is required"),
  email: z.string().email("Invalid email address"),
});

const passwordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(6, "Password must be at least 6 characters"),
    newPassword: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z
      .string()
      .min(6, "Password must be at least 6 characters"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type ProfileFormData = z.infer<typeof profileSchema>;
type PasswordFormData = z.infer<typeof passwordSchema>;

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<
    "profile" | "notifications" | "security" | "billing"
  >("profile");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [notifications, setNotifications] = useState({
    emailTrades: true,
    emailReports: false,
    pushTrades: true,
    pushGoals: true,
  });

  const supabase = createClient();

  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
  });

  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) throw error;
      if (data) {
        setProfile(data);
        profileForm.reset({
          full_name: data.full_name || "",
          email: data.email || user.email || "",
        });
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
    }
  };

  const handleProfileUpdate = async (data: ProfileFormData) => {
    setLoading(true);
    setMessage(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Update profile
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: data.full_name,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (profileError) throw profileError;

      // Update email if changed
      if (data.email !== user.email) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: data.email,
        });
        if (emailError) throw emailError;
      }

      setMessage({ type: "success", text: "Profile updated successfully!" });
      fetchProfile();
    } catch (error) {
      setMessage({
        type: "error",
        text: "Error updating profile. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordUpdate = async (data: PasswordFormData) => {
    setLoading(true);
    setMessage(null);

    try {
      // First, verify current password by attempting to sign in
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) return;

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: data.currentPassword,
      });

      if (signInError) {
        setMessage({ type: "error", text: "Current password is incorrect" });
        return;
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: data.newPassword,
      });

      if (updateError) throw updateError;

      setMessage({ type: "success", text: "Password updated successfully!" });
      passwordForm.reset();
    } catch (error) {
      setMessage({
        type: "error",
        text: "Error updating password. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleNotificationUpdate = async () => {
    setLoading(true);
    setMessage(null);

    try {
      // Here you would typically save notification preferences to your database
      // For now, we'll just show a success message
      setMessage({
        type: "success",
        text: "Notification preferences updated!",
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: "Error updating notifications. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: "profile", label: "Profile", icon: User },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "security", label: "Security", icon: Shield },
    { id: "billing", label: "Billing", icon: CreditCard },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-white">Settings</h1>
        <p className="text-gray-400 mt-2">Manage your account preferences</p>
      </div>

      {/* Tabs */}
      <div className="mt-8 border-b border-gray-700">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center space-x-2 py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? "border-blue-500 text-blue-500"
                    : "border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Alert Message */}
      {message && (
        <div
          className={`mt-6 p-4 rounded-lg flex items-center justify-between ${
            message.type === "success"
              ? "bg-green-500/10 border border-green-500 text-green-500"
              : "bg-red-500/10 border border-red-500 text-red-500"
          }`}
        >
          <div className="flex items-center space-x-2">
            {message.type === "success" ? (
              <Check className="w-5 h-5" />
            ) : (
              <X className="w-5 h-5" />
            )}
            <span>{message.text}</span>
          </div>
          <button
            onClick={() => setMessage(null)}
            className="text-current hover:opacity-70"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tab Content */}
      <div className="mt-6">
        {/* Profile Tab */}
        {activeTab === "profile" && (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-6">
              Profile Information
            </h2>

            <form
              onSubmit={profileForm.handleSubmit(handleProfileUpdate)}
              className="space-y-6"
            >
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  {...profileForm.register("full_name")}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="John Doe"
                />
                {profileForm.formState.errors.full_name && (
                  <p className="text-red-500 text-sm mt-1">
                    {profileForm.formState.errors.full_name.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  {...profileForm.register("email")}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="you@example.com"
                />
                {profileForm.formState.errors.email && (
                  <p className="text-red-500 text-sm mt-1">
                    {profileForm.formState.errors.email.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4 mr-2" />
                {loading ? "Saving..." : "Save Changes"}
              </button>
            </form>
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === "notifications" && (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-6">
              Notification Preferences
            </h2>

            <div className="space-y-6">
              <div>
                <h3 className="text-white font-medium mb-4">
                  Email Notifications
                </h3>
                <div className="space-y-4">
                  <label className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-300">Trade Confirmations</p>
                      <p className="text-gray-500 text-sm">
                        Receive email when trades are executed
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifications.emailTrades}
                      onChange={(e) =>
                        setNotifications({
                          ...notifications,
                          emailTrades: e.target.checked,
                        })
                      }
                      className="w-5 h-5 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                    />
                  </label>

                  <label className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-300">Weekly Reports</p>
                      <p className="text-gray-500 text-sm">
                        Get weekly performance summary
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifications.emailReports}
                      onChange={(e) =>
                        setNotifications({
                          ...notifications,
                          emailReports: e.target.checked,
                        })
                      }
                      className="w-5 h-5 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                    />
                  </label>
                </div>
              </div>

              <div>
                <h3 className="text-white font-medium mb-4">
                  Push Notifications
                </h3>
                <div className="space-y-4">
                  <label className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-300">Trade Alerts</p>
                      <p className="text-gray-500 text-sm">
                        Real-time trade notifications
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifications.pushTrades}
                      onChange={(e) =>
                        setNotifications({
                          ...notifications,
                          pushTrades: e.target.checked,
                        })
                      }
                      className="w-5 h-5 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                    />
                  </label>

                  <label className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-300">Goal Achievements</p>
                      <p className="text-gray-500 text-sm">
                        Notify when goals are reached
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifications.pushGoals}
                      onChange={(e) =>
                        setNotifications({
                          ...notifications,
                          pushGoals: e.target.checked,
                        })
                      }
                      className="w-5 h-5 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                    />
                  </label>
                </div>
              </div>

              <button
                onClick={handleNotificationUpdate}
                disabled={loading}
                className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4 mr-2" />
                {loading ? "Saving..." : "Save Preferences"}
              </button>
            </div>
          </div>
        )}

        {/* Security Tab */}
        {activeTab === "security" && (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-6">
              Security Settings
            </h2>

            <form
              onSubmit={passwordForm.handleSubmit(handlePasswordUpdate)}
              className="space-y-6"
            >
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Current Password
                </label>
                <input
                  type="password"
                  {...passwordForm.register("currentPassword")}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="Enter current password"
                />
                {passwordForm.formState.errors.currentPassword && (
                  <p className="text-red-500 text-sm mt-1">
                    {passwordForm.formState.errors.currentPassword.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  New Password
                </label>
                <input
                  type="password"
                  {...passwordForm.register("newPassword")}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="Enter new password"
                />
                {passwordForm.formState.errors.newPassword && (
                  <p className="text-red-500 text-sm mt-1">
                    {passwordForm.formState.errors.newPassword.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  {...passwordForm.register("confirmPassword")}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="Confirm new password"
                  // Continuing from where it was cut off...
                />
                {passwordForm.formState.errors.confirmPassword && (
                  <p className="text-red-500 text-sm mt-1">
                    {passwordForm.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Shield className="w-4 h-4 mr-2" />
                {loading ? "Updating..." : "Update Password"}
              </button>
            </form>

            <div className="mt-8 pt-8 border-t border-gray-700">
              <h3 className="text-white font-medium mb-4">
                Two-Factor Authentication
              </h3>
              <p className="text-gray-400 text-sm mb-4">
                Add an extra layer of security to your account by enabling
                two-factor authentication.
              </p>
              <button className="inline-flex items-center px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors">
                Enable 2FA
              </button>
            </div>

            <div className="mt-8 pt-8 border-t border-gray-700">
              <h3 className="text-white font-medium mb-4">Active Sessions</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-700 rounded-lg">
                  <div>
                    <p className="text-gray-300 font-medium">Current Session</p>
                    <p className="text-gray-500 text-sm">
                      Browser · Your location
                    </p>
                  </div>
                  <span className="text-green-500 text-sm">Active now</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Billing Tab */}
        {activeTab === "billing" && (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-6">
              Billing & Subscription
            </h2>

            <div className="space-y-6">
              {/* Current Plan */}
              <div className="bg-gray-700 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-white font-medium">Current Plan</h3>
                  <span className="px-3 py-1 bg-blue-600 text-white text-sm rounded-full">
                    Free
                  </span>
                </div>
                <p className="text-gray-400 text-sm mb-4">
                  You're currently on the free plan with basic features.
                </p>
                <ul className="space-y-2 text-sm text-gray-400">
                  <li className="flex items-center">
                    <Check className="w-4 h-4 text-green-500 mr-2" />
                    Up to 100 trades per month
                  </li>
                  <li className="flex items-center">
                    <Check className="w-4 h-4 text-green-500 mr-2" />
                    Basic analytics and reports
                  </li>
                  <li className="flex items-center">
                    <Check className="w-4 h-4 text-green-500 mr-2" />
                    Manual trade entry
                  </li>
                </ul>
              </div>

              {/* Upgrade Options */}
              <div>
                <h3 className="text-white font-medium mb-4">Available Plans</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-gray-700 rounded-lg p-6 border-2 border-gray-600 hover:border-blue-500 transition-colors">
                    <h4 className="text-white font-medium mb-2">Pro</h4>
                    <p className="text-3xl font-bold text-white mb-4">
                      $19
                      <span className="text-gray-400 text-base font-normal">
                        /month
                      </span>
                    </p>
                    <ul className="space-y-2 text-sm text-gray-400 mb-6">
                      <li className="flex items-center">
                        <Check className="w-4 h-4 text-green-500 mr-2" />
                        Unlimited trades
                      </li>
                      <li className="flex items-center">
                        <Check className="w-4 h-4 text-green-500 mr-2" />
                        Advanced analytics
                      </li>
                      <li className="flex items-center">
                        <Check className="w-4 h-4 text-green-500 mr-2" />
                        PDF import
                      </li>
                      <li className="flex items-center">
                        <Check className="w-4 h-4 text-green-500 mr-2" />
                        Priority support
                      </li>
                    </ul>
                    <button className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors">
                      Upgrade to Pro
                    </button>
                  </div>

                  <div className="bg-gray-700 rounded-lg p-6 border-2 border-gray-600 hover:border-purple-500 transition-colors">
                    <h4 className="text-white font-medium mb-2">Premium</h4>
                    <p className="text-3xl font-bold text-white mb-4">
                      $39
                      <span className="text-gray-400 text-base font-normal">
                        /month
                      </span>
                    </p>
                    <ul className="space-y-2 text-sm text-gray-400 mb-6">
                      <li className="flex items-center">
                        <Check className="w-4 h-4 text-green-500 mr-2" />
                        Everything in Pro
                      </li>
                      <li className="flex items-center">
                        <Check className="w-4 h-4 text-green-500 mr-2" />
                        API access
                      </li>
                      <li className="flex items-center">
                        <Check className="w-4 h-4 text-green-500 mr-2" />
                        Custom reports
                      </li>
                      <li className="flex items-center">
                        <Check className="w-4 h-4 text-green-500 mr-2" />
                        Team collaboration
                      </li>
                    </ul>
                    <button className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors">
                      Upgrade to Premium
                    </button>
                  </div>
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <h3 className="text-white font-medium mb-4">Payment Method</h3>
                <div className="bg-gray-700 rounded-lg p-4">
                  <p className="text-gray-400 text-sm">
                    No payment method on file
                  </p>
                  <button className="mt-4 inline-flex items-center px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white font-medium rounded-lg transition-colors">
                    <CreditCard className="w-4 h-4 mr-2" />
                    Add Payment Method
                  </button>
                </div>
              </div>

              {/* Billing History */}
              <div>
                <h3 className="text-white font-medium mb-4">Billing History</h3>
                <div className="bg-gray-700 rounded-lg p-4">
                  <p className="text-gray-400 text-sm text-center py-8">
                    No billing history available
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
