export interface FuturesContract {
  symbol: string;
  name: string;
  exchange: string;
  tickSize: number;
  tickValue: number;
  pointValue: number;
  initialMargin: number;
  maintenanceMargin: number;
}

export const FUTURES_CONTRACTS: Record<string, FuturesContract> = {
  // E-mini S&P 500
  ES: {
    symbol: 'ES',
    name: 'E-mini S&P 500',
    exchange: 'CME',
    tickSize: 0.25,
    tickValue: 12.5,
    pointValue: 50,
    initialMargin: 13200,
    maintenanceMargin: 12000,
  },
  // Micro E-mini S&P 500
  MES: {
    symbol: 'MES',
    name: 'Micro E-mini S&P 500',
    exchange: 'CME',
    tickSize: 0.25,
    tickValue: 1.25,
    pointValue: 5,
    initialMargin: 1320,
    maintenanceMargin: 1200,
  },
  // E-mini Nasdaq-100
  NQ: {
    symbol: 'NQ',
    name: 'E-mini Nasdaq-100',
    exchange: 'CME',
    tickSize: 0.25,
    tickValue: 5,
    pointValue: 20,
    initialMargin: 17600,
    maintenanceMargin: 16000,
  },
  // Micro E-mini Nasdaq-100
  MNQ: {
    symbol: 'MNQ',
    name: 'Micro E-mini Nasdaq-100',
    exchange: 'CME',
    tickSize: 0.25,
    tickValue: 0.5,
    pointValue: 2,
    initialMargin: 1760,
    maintenanceMargin: 1600,
  },
  // E-mini Russell 2000
  RTY: {
    symbol: 'RTY',
    name: 'E-mini Russell 2000',
    exchange: 'CME',
    tickSize: 0.1,
    tickValue: 5,
    pointValue: 50,
    initialMargin: 6820,
    maintenanceMargin: 6200,
  },
  // E-mini Dow Jones
  YM: {
    symbol: 'YM',
    name: 'E-mini Dow Jones',
    exchange: 'CBOT',
    tickSize: 1,
    tickValue: 5,
    pointValue: 5,
    initialMargin: 8800,
    maintenanceMargin: 8000,
  },
  // Crude Oil
  CL: {
    symbol: 'CL',
    name: 'Crude Oil',
    exchange: 'NYMEX',
    tickSize: 0.01,
    tickValue: 10,
    pointValue: 1000,
    initialMargin: 5060,
    maintenanceMargin: 4600,
  },
  // Micro Crude Oil
  MCL: {
    symbol: 'MCL',
    name: 'Micro Crude Oil',
    exchange: 'NYMEX',
    tickSize: 0.01,
    tickValue: 1,
    pointValue: 100,
    initialMargin: 506,
    maintenanceMargin: 460,
  },
  // Gold
  GC: {
    symbol: 'GC',
    name: 'Gold',
    exchange: 'COMEX',
    tickSize: 0.1,
    tickValue: 10,
    pointValue: 100,
    initialMargin: 10230,
    maintenanceMargin: 9300,
  },
  // Micro Gold
  MGC: {
    symbol: 'MGC',
    name: 'Micro Gold',
    exchange: 'COMEX',
    tickSize: 0.1,
    tickValue: 1,
    pointValue: 10,
    initialMargin: 1023,
    maintenanceMargin: 930,
  },
  // Euro FX
  '6E': {
    symbol: '6E',
    name: 'Euro FX',
    exchange: 'CME',
    tickSize: 0.00005,
    tickValue: 6.25,
    pointValue: 125000,
    initialMargin: 2310,
    maintenanceMargin: 2100,
  },
  // Natural Gas
  NG: {
    symbol: 'NG',
    name: 'Natural Gas',
    exchange: 'NYMEX',
    tickSize: 0.001,
    tickValue: 10,
    pointValue: 10000,
    initialMargin: 3080,
    maintenanceMargin: 2800,
  },
  // 10-Year T-Note
  ZN: {
    symbol: 'ZN',
    name: '10-Year T-Note',
    exchange: 'CBOT',
    tickSize: 0.015625, // 1/64
    tickValue: 15.625,
    pointValue: 1000,
    initialMargin: 1650,
    maintenanceMargin: 1500,
  },
  // 30-Year T-Bond
  ZB: {
    symbol: 'ZB',
    name: '30-Year T-Bond',
    exchange: 'CBOT',
    tickSize: 0.03125, // 1/32
    tickValue: 31.25,
    pointValue: 1000,
    initialMargin: 3850,
    maintenanceMargin: 3500,
  },
};

export function calculateFuturesPnL(
  symbol: string,
  entryPrice: number,
  exitPrice: number,
  quantity: number,
  side: 'LONG' | 'SHORT'
): number {
  const contract = FUTURES_CONTRACTS[symbol.toUpperCase()];

  if (!contract) {
    // If contract not found, use a default point value of 1 (like for stocks)
    const priceDiff =
      side === 'LONG' ? exitPrice - entryPrice : entryPrice - exitPrice;
    return priceDiff * quantity;
  }

  // Calculate the price difference
  const priceDiff =
    side === 'LONG' ? exitPrice - entryPrice : entryPrice - exitPrice;

  // Calculate P&L based on point value
  return priceDiff * contract.pointValue * quantity;
}

export function getContractSpecs(symbol: string): FuturesContract | null {
  return FUTURES_CONTRACTS[symbol.toUpperCase()] || null;
}
