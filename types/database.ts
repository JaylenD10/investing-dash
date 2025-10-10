export interface Trade {
  id: string;
  user_id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entry_date: string;
  exit_date?: string;
  entry_price: number;
  exit_price?: number;
  quantity: number;
  commission: number;
  pnl?: number;
  percentage_gain?: number;
  status: 'OPEN' | 'CLOSED';
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface DailyStats {
  id: string;
  user_id: string;
  date: string;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  total_pnl: number;
  win_rate: number;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  updated_at: string;
}

export interface ChartDataPoint {
  date: string;
  fullDate: string;
  pnl: number;
  cumulativePnL: number;
  trades: number;
  winRate?: number;
}

export interface AccountBalance {
  id: string;
  user_id: string;
  starting_balance: number;
  current_balance: number;
  created_at: string;
  updated_at: string;
}

export interface AccountTransaction {
  id: string;
  user_id: string;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'STARTING_BALANCE';
  amount: number;
  balance_after: number;
  description?: string;
  transaction_date: string;
  created_at: string;
}
