"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Trade, DailyStats } from "@/types/database";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  parseISO,
  getWeek,
  isToday,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

interface CalendarDay {
  date: Date;
  trades: Trade[];
  stats: DailyStats | null;
  isCurrentMonth: boolean;
  isToday: boolean;
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [trades, setTrades] = useState<Trade[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthStats, setMonthStats] = useState({
    pnl: 0,
    trades: 0,
    winRate: 0,
  });
  const supabase = createClient();

  useEffect(() => {
    fetchCalendarData();
  }, [currentDate]);

  const fetchCalendarData = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);

      // Fetch trades for the current month
      const { data: tradesData } = await supabase
        .from("trades")
        .select("*")
        .eq("user_id", user.id)
        .gte("entry_date", monthStart.toISOString())
        .lte("entry_date", monthEnd.toISOString())
        .order("entry_date", { ascending: true });

      // Fetch daily stats for the current month
      const { data: statsData } = await supabase
        .from("daily_stats")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", format(monthStart, "yyyy-MM-dd"))
        .lte("date", format(monthEnd, "yyyy-MM-dd"));

      if (tradesData) setTrades(tradesData);
      if (statsData) setDailyStats(statsData);

      // Calculate month stats
      const monthPnl =
        statsData?.reduce((sum, stat) => sum + stat.total_pnl, 0) || 0;
      const monthTrades =
        statsData?.reduce((sum, stat) => sum + stat.total_trades, 0) || 0;
      const winningTrades =
        statsData?.reduce((sum, stat) => sum + stat.winning_trades, 0) || 0;
      const monthWinRate =
        monthTrades > 0 ? (winningTrades / monthTrades) * 100 : 0;

      setMonthStats({
        pnl: monthPnl,
        trades: monthTrades,
        winRate: monthWinRate,
      });
    } catch (error) {
      console.error("Error fetching calendar data:", error);
    } finally {
      setLoading(false);
    }
  };

  const generateCalendarDays = (): CalendarDay[] => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);

    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    return days.map((date) => {
      const dateStr = format(date, "yyyy-MM-dd");
      const dayTrades = trades.filter(
        (trade) => format(parseISO(trade.entry_date), "yyyy-MM-dd") === dateStr
      );
      const dayStats = dailyStats.find((stat) => stat.date === dateStr);

      return {
        date,
        trades: dayTrades,
        stats: dayStats || null,
        isCurrentMonth: isSameMonth(date, currentDate),
        isToday: isToday(date),
      };
    });
  };

  const getWeekStats = (weekDays: CalendarDay[]) => {
    return weekDays.reduce(
      (acc, day) => {
        if (day.stats) {
          acc.pnl += day.stats.total_pnl;
          acc.trades += day.stats.total_trades;
        }
        return acc;
      },
      { pnl: 0, trades: 0 }
    );
  };

  const navigateMonth = (direction: "prev" | "next") => {
    setCurrentDate((prev) => {
      const newDate = new Date(prev);
      if (direction === "prev") {
        newDate.setMonth(newDate.getMonth() - 1);
      } else {
        newDate.setMonth(newDate.getMonth() + 1);
      }
      return newDate;
    });
  };

  const calendarDays = generateCalendarDays();
  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeks.push(calendarDays.slice(i, i + 7));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-white">Loading calendar...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Trading Calendar</h1>
        <p className="text-gray-400 mt-2">
          View your daily trading performance
        </p>
      </div>

      {/* Month Navigation */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigateMonth("prev")}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-semibold text-white">
              {format(currentDate, "MMMM yyyy")}
            </h2>
            <button
              onClick={() => navigateMonth("next")}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Month Summary */}
          <div className="flex items-center space-x-6 text-sm">
            <div className="text-center">
              <p className="text-gray-400">Month P&L</p>
              <p
                className={`text-lg font-semibold ${
                  monthStats.pnl >= 0 ? "text-green-500" : "text-red-500"
                }`}
              >
                ${monthStats.pnl.toFixed(2)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-gray-400">Total Trades</p>
              <p className="text-lg font-semibold text-white">
                {monthStats.trades}
              </p>
            </div>
            <div className="text-center">
              <p className="text-gray-400">Win Rate</p>
              <p className="text-lg font-semibold text-white">
                {monthStats.winRate.toFixed(1)}%
              </p>
            </div>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left text-gray-400 text-xs font-medium p-2">
                  Sun
                </th>
                <th className="text-left text-gray-400 text-xs font-medium p-2">
                  Mon
                </th>
                <th className="text-left text-gray-400 text-xs font-medium p-2">
                  Tue
                </th>
                <th className="text-left text-gray-400 text-xs font-medium p-2">
                  Wed
                </th>
                <th className="text-left text-gray-400 text-xs font-medium p-2">
                  Thu
                </th>
                <th className="text-left text-gray-400 text-xs font-medium p-2">
                  Fri
                </th>
                <th className="text-left text-gray-400 text-xs font-medium p-2">
                  Sat
                </th>
                <th className="text-center text-gray-400 text-xs font-medium p-2">
                  Week P&L
                </th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((week, weekIndex) => {
                const weekStats = getWeekStats(week);
                return (
                  <tr key={weekIndex} className="border-t border-gray-700">
                    {week.map((day, dayIndex) => (
                      <td key={dayIndex} className="p-2 align-top h-24">
                        <div
                          className={`p-3 rounded-lg h-full transition-colors ${
                            day.isCurrentMonth
                              ? "bg-gray-700/50 hover:bg-gray-700"
                              : "bg-gray-800/50"
                          } ${day.isToday ? "ring-2 ring-blue-500" : ""}`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span
                              className={`text-sm font-medium ${
                                day.isCurrentMonth
                                  ? "text-white"
                                  : "text-gray-600"
                              }`}
                            >
                              {format(day.date, "d")}
                            </span>
                            {day.stats && day.stats.total_trades > 0 && (
                              <span className="text-xs text-gray-400">
                                {day.stats.total_trades} trade
                                {day.stats.total_trades > 1 ? "s" : ""}
                              </span>
                            )}
                          </div>

                          {day.stats && day.isCurrentMonth && (
                            <div className="space-y-1">
                              <div
                                className={`text-sm font-semibold flex items-center ${
                                  day.stats.total_pnl >= 0
                                    ? "text-green-500"
                                    : "text-red-500"
                                }`}
                              >
                                {day.stats.total_pnl >= 0 ? (
                                  <TrendingUp className="w-3 h-3 mr-1" />
                                ) : (
                                  <TrendingDown className="w-3 h-3 mr-1" />
                                )}
                                ${Math.abs(day.stats.total_pnl).toFixed(2)}
                              </div>
                              <div className="text-xs text-gray-500">
                                {day.stats.win_rate.toFixed(0)}% win
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    ))}
                    <td className="p-2 text-center">
                      <div className="bg-gray-700/50 rounded-lg p-3">
                        <p
                          className={`font-semibold ${
                            weekStats.pnl >= 0
                              ? "text-green-500"
                              : "text-red-500"
                          }`}
                        >
                          ${weekStats.pnl.toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {weekStats.trades} trades
                        </p>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Daily Trade Details */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Trade Details</h3>
        <p className="text-gray-400 text-sm">
          Click on any day to view detailed trades
        </p>
      </div>
    </div>
  );
}
