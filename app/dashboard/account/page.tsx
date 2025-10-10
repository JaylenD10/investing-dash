"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { AccountBalance, AccountTransaction } from "@/types/database";
import { format, parseISO } from "date-fns";
import {
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Plus,
  Settings,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const transactionSchema = z.object({
  type: z.enum(["DEPOSIT", "WITHDRAWAL"]),
  amount: z.number().positive("Amount must be positive"),
  description: z.string().optional(),
  transaction_date: z.string(),
});

type TransactionFormData = z.infer<typeof transactionSchema>;

export default function AccountPage() {
  const [balance, setBalance] = useState<AccountBalance | null>(null);
  const [transactions, setTransactions] = useState<AccountTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [showStartingBalanceForm, setShowStartingBalanceForm] = useState(false);
  const [startingBalance, setStartingBalance] = useState("");
  const supabase = createClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<TransactionFormData>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      type: "DEPOSIT",
      transaction_date: new Date().toISOString().slice(0, 16),
    },
  });

  const fetchAccountData = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch account balance
      let { data: balanceData } = await supabase
        .from("account_balances")
        .select("*")
        .eq("user_id", user.id)
        .single();

      // If no balance exists, create one
      if (!balanceData) {
        const { data: newBalance } = await supabase
          .from("account_balances")
          .insert({
            user_id: user.id,
            starting_balance: 0,
            current_balance: 0,
          })
          .select()
          .single();

        balanceData = newBalance;
      }

      setBalance(balanceData);

      // Fetch transactions
      const { data: transactionsData } = await supabase
        .from("account_transactions")
        .select("*")
        .eq("user_id", user.id)
        .order("transaction_date", { ascending: false });

      if (transactionsData) {
        setTransactions(transactionsData);
      }
    } catch (error) {
      console.error("Error fetching account data:", error);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchAccountData();
  }, [fetchAccountData]);

  const handleSetStartingBalance = async () => {
    if (!startingBalance || !balance) return;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const amount = parseFloat(startingBalance);

      // Update account balance
      await supabase
        .from("account_balances")
        .update({
          starting_balance: amount,
          current_balance: amount,
        })
        .eq("user_id", user.id);

      // Create starting balance transaction
      await supabase.from("account_transactions").insert({
        user_id: user.id,
        type: "STARTING_BALANCE",
        amount: amount,
        balance_after: amount,
        description: "Initial account balance",
        transaction_date: new Date().toISOString(),
      });

      await fetchAccountData();
      setShowStartingBalanceForm(false);
      setStartingBalance("");
    } catch (error) {
      console.error("Error setting starting balance:", error);
    }
  };

  const onSubmitTransaction = async (data: TransactionFormData) => {
    if (!balance) return;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const amount = data.type === "WITHDRAWAL" ? -data.amount : data.amount;
      const newBalance = balance.current_balance + amount;

      // Insert transaction
      await supabase.from("account_transactions").insert({
        user_id: user.id,
        type: data.type,
        amount: Math.abs(data.amount),
        balance_after: newBalance,
        description: data.description,
        transaction_date: data.transaction_date,
      });

      await fetchAccountData();
      setShowTransactionForm(false);
      reset();
    } catch (error) {
      console.error("Error adding transaction:", error);
    }
  };

  // Calculate account statistics
  const calculateStats = () => {
    const deposits = transactions.filter((t) => t.type === "DEPOSIT");
    const withdrawals = transactions.filter((t) => t.type === "WITHDRAWAL");

    const totalDeposits = deposits.reduce((sum, t) => sum + t.amount, 0);
    const totalWithdrawals = withdrawals.reduce((sum, t) => sum + t.amount, 0);
    const netDeposits = totalDeposits - totalWithdrawals;

    return {
      totalDeposits,
      totalWithdrawals,
      netDeposits,
      depositCount: deposits.length,
      withdrawalCount: withdrawals.length,
    };
  };

  const stats = calculateStats();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-white">Loading account data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Account Balance</h1>
          <p className="text-neutral-400 mt-2">
            Manage your trading account balance
          </p>
        </div>
        <button
          onClick={() => setShowTransactionForm(true)}
          className="inline-flex items-center px-4 py-2 bg-white hover:bg-neutral-100 text-black font-medium rounded-lg transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Transaction
        </button>
      </div>

      {/* Balance Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-neutral-400 text-sm font-medium">
                Current Balance
              </p>
              <p className="text-2xl font-bold text-white mt-2">
                ${balance?.current_balance.toFixed(2) || "0.00"}
              </p>
              <p className="text-neutral-500 text-sm mt-1">
                Started with ${balance?.starting_balance.toFixed(2) || "0.00"}
              </p>
            </div>
            <Wallet className="w-8 h-8 text-white" />
          </div>
          {!balance?.starting_balance && (
            <button
              onClick={() => setShowStartingBalanceForm(true)}
              className="mt-4 text-sm text-neutral-400 hover:text-white"
            >
              <Settings className="w-4 h-4 inline mr-1" />
              Set starting balance
            </button>
          )}
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-neutral-400 text-sm font-medium">
                Total Deposits
              </p>
              <p className="text-2xl font-bold text-green-500 mt-2">
                ${stats.totalDeposits.toFixed(2)}
              </p>
              <p className="text-neutral-500 text-sm mt-1">
                {stats.depositCount} deposits
              </p>
            </div>
            <ArrowUpRight className="w-8 h-8 text-green-500" />
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-neutral-400 text-sm font-medium">
                Total Withdrawals
              </p>
              <p className="text-2xl font-bold text-red-500 mt-2">
                ${stats.totalWithdrawals.toFixed(2)}
              </p>
              <p className="text-neutral-500 text-sm mt-1">
                {stats.withdrawalCount} withdrawals
              </p>
            </div>
            <ArrowDownRight className="w-8 h-8 text-red-500" />
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-neutral-400 text-sm font-medium">
                Net Deposits
              </p>
              <p
                className={`text-2xl font-bold mt-2 ${
                  stats.netDeposits >= 0 ? "text-white" : "text-red-500"
                }`}
              >
                ${stats.netDeposits.toFixed(2)}
              </p>
              <p className="text-neutral-500 text-sm mt-1">
                Deposits - Withdrawals
              </p>
            </div>
            <DollarSign className="w-8 h-8 text-white" />
          </div>
        </div>
      </div>

      {/* Transaction History */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="p-6">
          <h2 className="text-xl font-semibold text-white">
            Transaction History
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-neutral-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                  Balance After
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-400 uppercase tracking-wider">
                  Description
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-700">
              {transactions.map((transaction) => (
                <tr
                  key={transaction.id}
                  className="hover:bg-neutral-800/50 transition-colors"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-300">
                    {format(
                      parseISO(transaction.transaction_date),
                      "MMM dd, yyyy"
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                        transaction.type === "DEPOSIT"
                          ? "bg-green-500/10 text-green-500"
                          : transaction.type === "WITHDRAWAL"
                          ? "bg-red-500/10 text-red-500"
                          : "bg-neutral-700 text-neutral-300"
                      }`}
                    >
                      {transaction.type === "STARTING_BALANCE"
                        ? "INITIAL"
                        : transaction.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span
                      className={
                        transaction.type === "WITHDRAWAL"
                          ? "text-red-500"
                          : "text-green-500"
                      }
                    >
                      {transaction.type === "WITHDRAWAL" ? "-" : "+"}$
                      {transaction.amount.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-300">
                    ${transaction.balance_after.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-sm text-neutral-400">
                    {transaction.description || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {transactions.length === 0 && (
            <div className="text-center py-12">
              <p className="text-neutral-400">No transactions yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Transaction Form Modal */}
      {showTransactionForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 rounded-xl max-w-md w-full p-6 border border-neutral-800">
            <h3 className="text-xl font-semibold text-white mb-6">
              Add Transaction
            </h3>

            <form
              onSubmit={handleSubmit(onSubmitTransaction)}
              className="space-y-4"
            >
              <div>
                <label className="block text-neutral-300 text-sm font-medium mb-2">
                  Transaction Type
                </label>
                <select
                  {...register("type")}
                  className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-white transition-colors"
                >
                  <option value="DEPOSIT">Deposit</option>
                  <option value="WITHDRAWAL">Withdrawal</option>
                </select>
              </div>

              <div>
                <label className="block text-neutral-300 text-sm font-medium mb-2">
                  Amount
                </label>
                <input
                  type="number"
                  step="0.01"
                  {...register("amount", { valueAsNumber: true })}
                  className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-white transition-colors"
                  placeholder="0.00"
                />
                {errors.amount && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.amount.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-neutral-300 text-sm font-medium mb-2">
                  Date & Time
                </label>
                <input
                  type="datetime-local"
                  {...register("transaction_date")}
                  className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-white transition-colors"
                />
              </div>

              <div>
                <label className="block text-neutral-300 text-sm font-medium mb-2">
                  Description (Optional)
                </label>
                <textarea
                  {...register("description")}
                  rows={3}
                  className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-white transition-colors"
                  placeholder="Add a note about this transaction..."
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowTransactionForm(false);
                    reset();
                  }}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-white hover:bg-neutral-100 text-black font-medium rounded-lg transition-colors"
                >
                  Add Transaction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Starting Balance Form Modal */}
      {showStartingBalanceForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 rounded-xl max-w-md w-full p-6 border border-neutral-800">
            <h3 className="text-xl font-semibold text-white mb-6">
              Set Starting Balance
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-neutral-300 text-sm font-medium mb-2">
                  Starting Balance
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={startingBalance}
                  onChange={(e) => setStartingBalance(e.target.value)}
                  className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-white transition-colors"
                  placeholder="0.00"
                />
              </div>

              <p className="text-neutral-400 text-sm">
                This will set your initial account balance. This action cannot
                be undone.
              </p>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowStartingBalanceForm(false);
                    setStartingBalance("");
                  }}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSetStartingBalance}
                  disabled={
                    !startingBalance || parseFloat(startingBalance) <= 0
                  }
                  className="px-4 py-2 bg-white hover:bg-neutral-100 text-black font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Set Balance
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
