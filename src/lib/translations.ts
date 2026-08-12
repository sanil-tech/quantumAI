export type Language = 'ms' | 'en' | 'id';

export interface TranslationSchema {
  // Header
  instrument: string;
  lastPrice: string;
  change24h: string;
  alarms: string;
  riskCalc: string;
  aiChat: string;
  backtest: string;
  journal: string;
  languageSelect: string;

  // Trading Styles
  scalper: string;
  dayTrader: string;
  swingTrader: string;
  positionTrader: string;

  // News Ticker
  macroAlert: string;

  // Backtest / Performance Dashboard
  backtestTitle: string;
  backtestSub: string;
  pairSelect: string;
  timeframeSelect: string;
  strategySelect: string;
  newsRuleNotice: string;
  runSimulation: string;
  runningSimulation: string;
  winRate: string;
  netReturn: string;
  skippedNews: string;
  profitFactor: string;
  riskReward: string;
  executionLogs: string;
  filterAll: string;
  filterWin: string;
  filterLoss: string;
  filterNewsSkipped: string;
  reasonForEntry: string;
  newsStatusLabel: string;
  noTradesFound: string;

  // AI Card
  marketNarrative: string;
  probSetup: string;
  currentMarketBias: string;
  aiConfluenceReasoning: string;
  actionableSetup: string;
  newsProtectionActive: string;
  safeForEntry: string;
  entryZone: string;
  stopLoss: string;
  takeProfit1: string;
  takeProfit2: string;
  invalidation: string;
  confidenceScore: string;
  syncRiskCalc: string;
  journalLog: string;
  explainSlTp: string;
  probabilityRationale: string;

  // Chart Widget
  indicatorsOverlays: string;
  liveFeed: string;

  // Multi Timeframe Panel
  mtfTitle: string;
  confluenceScore: string;
  trend: string;

  // Indicators Panel
  technicalIndicators: string;
  overbought: string;
  oversold: string;
  neutral: string;

  // SMC Panel
  smcTitle: string;
  orderBlocks: string;
  fvg: string;
  liquidityPools: string;

  // Economic Calendar Widget
  ecoCalendarTitle: string;
  impactHigh: string;
  impactMedium: string;
  blackoutWindow: string;

  // Modals & Tools
  priceAlarmTitle: string;
  riskCalcTitle: string;
  journalTitle: string;

  // Risk Calc Details
  accountBalance: string;
  riskPercent: string;
  stopLossPips: string;
  calculatedLot: string;
  riskAmount: string;

  // Price Alarm Details
  targetPrice: string;
  addAlarm: string;
  activeAlarms: string;

  // Journal Details
  addEntry: string;
  winCount: string;
  lossCount: string;
  totalPnl: string;

  // AI Chat Assistant
  aiChatTitle: string;
  askPlaceholder: string;
  send: string;
}

export const translations: Record<Language, TranslationSchema> = {
  ms: {
    instrument: 'Instrumen',
    lastPrice: 'Harga Terkini',
    change24h: 'Perubahan 24j',
    alarms: 'Penggera',
    riskCalc: 'Kalkulator Risiko',
    aiChat: 'Sembang AI',
    backtest: 'Ujian Backtest',
    journal: 'Jurnal Trade',
    languageSelect: 'Pilihan Bahasa',

    scalper: 'Scalper',
    dayTrader: 'Day Trader',
    swingTrader: 'Swing',
    positionTrader: 'Posisi',

    macroAlert: 'AMARAN BERITA MAKRO:',

    backtestTitle: 'Dashboard Eksekusi Strategi & Laporan Prestasi AI',
    backtestSub: 'Automated SMC Entry, TP/SL Trailing & Peraturan Penapis Berita Impak Tinggi (±30m)',
    pairSelect: 'Aset Pasar (Pair)',
    timeframeSelect: 'Kerangka Masa (Timeframe)',
    strategySelect: 'Modul Strategi & Penapis',
    newsRuleNotice: 'Peraturan Keselamatan Berita: Sistem tidak akan memasuk (entry) posisi sekiranya terdapat berita ekonomi berimpak tinggi dalam tempoh 30 minit sebelum & 30 minit selepas release.',
    runSimulation: 'Jalankan Eksekusi Analisis & Hasilkan Laporan Prestasi',
    runningSimulation: 'Sistem Sedang Menjalankan Eksekusi Analisis & Penapis Berita...',
    winRate: 'Kadar Kemenangan',
    netReturn: 'Jumlah Pulangan Net',
    skippedNews: 'Dielakkan Berita (±30m)',
    profitFactor: 'Profit Factor',
    riskReward: 'Nisbah Risk:Reward',
    executionLogs: 'Laporan & Log Eksekusi Posisi',
    filterAll: 'Semua',
    filterWin: 'Win',
    filterLoss: 'Loss',
    filterNewsSkipped: 'Dielakkan Berita',
    reasonForEntry: 'Sebab Masuk',
    newsStatusLabel: 'Penapis Berita',
    noTradesFound: 'Tiada rekod trade bagi kategori tapisan ini.',

    marketNarrative: 'Naratif Pasaran AI',
    probSetup: 'Persediaan Kebarangkalian Kuantitatif',
    currentMarketBias: 'Kecenderungan Pasaran Terkini',
    aiConfluenceReasoning: 'Sebab & Konfluens AI',
    actionableSetup: 'Pelan Entry & Had Posisi AI',
    newsProtectionActive: 'Penapis Berita Impak Tinggi (±30m): Stat Penapis Berita Aktif',
    safeForEntry: '🟢 Selamat untuk Entry',
    entryZone: 'Zon Entry',
    stopLoss: 'Stop Loss (SL)',
    takeProfit1: 'Take Profit 1',
    takeProfit2: 'Take Profit 2',
    invalidation: 'Tahap Batal',
    confidenceScore: 'Tahap Keyakinan AI',
    syncRiskCalc: 'Salin ke Kalkulator',
    journalLog: 'Simpan ke Jurnal',
    explainSlTp: 'Terangkan SL/TP',
    probabilityRationale: 'Sebab Kebarangkalian',

    indicatorsOverlays: 'Penunjuk & Struktur SMC',
    liveFeed: 'Masa Nyata (Live)',

    mtfTitle: 'Analisis Pelbagai Kerangka Masa (MTF)',
    confluenceScore: 'Skor Konfluens MTF',
    trend: 'Arah Trend',

    technicalIndicators: 'Penunjuk Teknikal',
    overbought: 'Terlebih Beli (Overbought)',
    oversold: 'Terlebih Jual (Oversold)',
    neutral: 'Neutral',

    smcTitle: 'Struktur SMC & Zon Likuiditi',
    orderBlocks: 'Order Blocks (OB)',
    fvg: 'Fair Value Gap (FVG)',
    liquidityPools: 'Kolam Likuiditi',

    ecoCalendarTitle: 'Kalendar Berita Ekonomi & Makro',
    impactHigh: 'Impak Tinggi',
    impactMedium: 'Impak Sederhana',
    blackoutWindow: 'Penapis ±30m Aktif',

    priceAlarmTitle: 'Tetapan Penggera Harga & Amaran Target',
    riskCalcTitle: 'Kalkulator Saiz Posisi & Pengurusan Risiko',
    journalTitle: 'Jurnal Prestasi Dagangan',

    accountBalance: 'Baki Akaun ($)',
    riskPercent: 'Risiko Akaun (%)',
    stopLossPips: 'Stop Loss (Pips)',
    calculatedLot: 'Saiz Lot Cadangan',
    riskAmount: 'Jumlah Risiko Dollar ($)',

    targetPrice: 'Harga Sasaran',
    addAlarm: 'Tambah Penggera',
    activeAlarms: 'Penggera Aktif',

    addEntry: 'Rekod Trade Baharu',
    winCount: 'Menang (Win)',
    lossCount: 'Rugi (Loss)',
    totalPnl: 'Jumlah PnL',

    aiChatTitle: 'Pembantu Desk Forex AI Quantum',
    askPlaceholder: 'Tanya AI tentang analisis pasaran, strategi SMC, atau risiko...',
    send: 'Hantar',
  },

  en: {
    instrument: 'Instrument',
    lastPrice: 'Last Price',
    change24h: '24h Change',
    alarms: 'Alarms',
    riskCalc: 'Risk Calc',
    aiChat: 'AI Chat',
    backtest: 'Backtest',
    journal: 'Journal',
    languageSelect: 'Language',

    scalper: 'Scalper',
    dayTrader: 'Day Trader',
    swingTrader: 'Swing',
    positionTrader: 'Position',

    macroAlert: 'MACRO NEWS ALERT:',

    backtestTitle: 'Strategy Execution Dashboard & AI Performance Report',
    backtestSub: 'Automated SMC Entry, TP/SL Trailing & High Impact News Filter (±30m)',
    pairSelect: 'Asset Pair',
    timeframeSelect: 'Timeframe',
    strategySelect: 'Strategy Module & Filter',
    newsRuleNotice: 'News Safety Rule: The system will skip entering positions if high-impact economic news falls within 30 minutes before or after release.',
    runSimulation: 'Execute Strategy Analysis & Generate Performance Report',
    runningSimulation: 'Executing Strategy Analysis & News Blackout Filter...',
    winRate: 'Win Rate',
    netReturn: 'Total Net Return',
    skippedNews: 'News Skipped (±30m)',
    profitFactor: 'Profit Factor',
    riskReward: 'Risk:Reward Ratio',
    executionLogs: 'Position Execution Logs & Report',
    filterAll: 'All',
    filterWin: 'Win',
    filterLoss: 'Loss',
    filterNewsSkipped: 'News Skipped',
    reasonForEntry: 'Reason for Entry',
    newsStatusLabel: 'News Filter',
    noTradesFound: 'No trade records found for this filter category.',

    marketNarrative: 'AI Market Narrative',
    probSetup: 'Quantitative Probability Setup',
    currentMarketBias: 'Current Market Bias',
    aiConfluenceReasoning: 'AI Confluence Reasoning',
    actionableSetup: 'Actionable Setup & Entry Limits',
    newsProtectionActive: 'High Impact News Filter (±30m): Protection Active',
    safeForEntry: '🟢 Safe for Entry',
    entryZone: 'Entry Zone',
    stopLoss: 'Stop Loss (SL)',
    takeProfit1: 'Take Profit 1',
    takeProfit2: 'Take Profit 2',
    invalidation: 'Invalidation Level',
    confidenceScore: 'AI Confidence Score',
    syncRiskCalc: 'Sync to Risk Calc',
    journalLog: 'Log to Journal',
    explainSlTp: 'Explain SL/TP',
    probabilityRationale: 'Probability Rationale',

    indicatorsOverlays: 'Indicators & SMC Structures',
    liveFeed: 'Live Feed',

    mtfTitle: 'Multi-Timeframe Confluence Analysis',
    confluenceScore: 'MTF Confluence Score',
    trend: 'Trend Bias',

    technicalIndicators: 'Technical Indicators',
    overbought: 'Overbought',
    oversold: 'Oversold',
    neutral: 'Neutral',

    smcTitle: 'SMC Structures & Liquidity Zones',
    orderBlocks: 'Order Blocks (OB)',
    fvg: 'Fair Value Gap (FVG)',
    liquidityPools: 'Liquidity Pools',

    ecoCalendarTitle: 'Economic Calendar & Macro Events',
    impactHigh: 'High Impact',
    impactMedium: 'Medium Impact',
    blackoutWindow: '±30m Filter Active',

    priceAlarmTitle: 'Price Level Alarms & Target Alerts',
    riskCalcTitle: 'Lot Size & Risk Management Calculator',
    journalTitle: 'Trading Performance Journal',

    accountBalance: 'Account Balance ($)',
    riskPercent: 'Risk Percentage (%)',
    stopLossPips: 'Stop Loss (Pips)',
    calculatedLot: 'Recommended Lot Size',
    riskAmount: 'Dollar Risk Amount ($)',

    targetPrice: 'Target Price',
    addAlarm: 'Add Alarm',
    activeAlarms: 'Active Alarms',

    addEntry: 'New Journal Entry',
    winCount: 'Wins',
    lossCount: 'Losses',
    totalPnl: 'Total PnL',

    aiChatTitle: 'Quantum AI Forex Desk Assistant',
    askPlaceholder: 'Ask AI about market analysis, SMC strategies, or risk management...',
    send: 'Send',
  },

  id: {
    instrument: 'Instrumen',
    lastPrice: 'Harga Terkini',
    change24h: 'Perubahan 24j',
    alarms: 'Alarm Harga',
    riskCalc: 'Kalkulator Risiko',
    aiChat: 'Obrolan AI',
    backtest: 'Pengujian Backtest',
    journal: 'Jurnal Trading',
    languageSelect: 'Pilihan Bahasa',

    scalper: 'Scalper',
    dayTrader: 'Day Trader',
    swingTrader: 'Swing',
    positionTrader: 'Posisi',

    macroAlert: 'PERINGATAN BERITA MAKRO:',

    backtestTitle: 'Dasbor Eksekusi Strategi & Laporan Performa AI',
    backtestSub: 'Eksekusi Otomatis SMC, Trailing TP/SL & Filter Berita Berdampak Tinggi (±30m)',
    pairSelect: 'Pasangan Aset',
    timeframeSelect: 'Kerangka Waktu',
    strategySelect: 'Modul Strategi & Filter',
    newsRuleNotice: 'Aturan Keselamatan Berita: Sistem tidak akan membuka posisi jika ada berita ekonomi berdampak tinggi dalam waktu 30 menit sebelum & 30 menit sesudah rilis.',
    runSimulation: 'Jalankan Analisis Eksekusi & Buat Laporan Performa',
    runningSimulation: 'Sistem Sedang Menjalankan Eksekusi Analisis & Filter Berita...',
    winRate: 'Tingkat Kemenangan',
    netReturn: 'Total Pengembalian Bersih',
    skippedNews: 'Dihindari Berita (±30m)',
    profitFactor: 'Faktor Keuntungan',
    riskReward: 'Rasio Risiko:Hadiah',
    executionLogs: 'Laporan & Log Eksekusi Posisi',
    filterAll: 'Semua',
    filterWin: 'Menang',
    filterLoss: 'Kalah',
    filterNewsSkipped: 'Dihindari Berita',
    reasonForEntry: 'Alasan Entry',
    newsStatusLabel: 'Filter Berita',
    noTradesFound: 'Tidak ada catatan perdagangan untuk kategori filter ini.',

    marketNarrative: 'Naratif Pasar AI',
    probSetup: 'Pengaturan Probabilitas Kuantitatif',
    currentMarketBias: 'Bias Pasar Saat Ini',
    aiConfluenceReasoning: 'Alasan Konfluensi AI',
    actionableSetup: 'Rencana Entry & Batas Posisi AI',
    newsProtectionActive: 'Filter Berita Dampak Tinggi (±30m): Perlindungan Aktif',
    safeForEntry: '🟢 Aman untuk Entry',
    entryZone: 'Zona Entry',
    stopLoss: 'Stop Loss (SL)',
    takeProfit1: 'Take Profit 1',
    takeProfit2: 'Take Profit 2',
    invalidation: 'Tingkat Pembatalan',
    confidenceScore: 'Tingkat Keyakinan AI',
    syncRiskCalc: 'Salin ke Kalkulator',
    journalLog: 'Simpan ke Jurnal',
    explainSlTp: 'Jelaskan SL/TP',
    probabilityRationale: 'Rasional Probabilitas',

    indicatorsOverlays: 'Indikator & Struktur SMC',
    liveFeed: 'Umpan Langsung',

    mtfTitle: 'Analisis Multi-Timeframe',
    confluenceScore: 'Skor Konfluensi MTF',
    trend: 'Arah Tren',

    technicalIndicators: 'Indikator Teknikal',
    overbought: 'Jenuh Beli (Overbought)',
    oversold: 'Jenuh Jual (Oversold)',
    neutral: 'Netral',

    smcTitle: 'Struktur SMC & Zona Likuiditas',
    orderBlocks: 'Order Block (OB)',
    fvg: 'Fair Value Gap (FVG)',
    liquidityPools: 'Pool Likuiditas',

    ecoCalendarTitle: 'Kalender Berita Ekonomi & Makro',
    impactHigh: 'Dampak Tinggi',
    impactMedium: 'Dampak Sedang',
    blackoutWindow: 'Filter ±30m Aktif',

    priceAlarmTitle: 'Pengaturan Alarm Harga & Peringatan Target',
    riskCalcTitle: 'Kalkulator Ukuran Lot & Manajemen Risiko',
    journalTitle: 'Jurnal Performa Trading',

    accountBalance: 'Saldo Akun ($)',
    riskPercent: 'Persentase Risiko (%)',
    stopLossPips: 'Stop Loss (Pips)',
    calculatedLot: 'Rekomendasi Ukuran Lot',
    riskAmount: 'Jumlah Risiko Dolar ($)',

    targetPrice: 'Harga Target',
    addAlarm: 'Tambah Alarm',
    activeAlarms: 'Alarm Aktif',

    addEntry: 'Catat Trade Baru',
    winCount: 'Menang (Win)',
    lossCount: 'Kalah (Loss)',
    totalPnl: 'Total PnL',

    aiChatTitle: 'Asisten Desk Forex AI Quantum',
    askPlaceholder: 'Tanyakan AI tentang analisis pasar, strategi SMC, atau manajemen risiko...',
    send: 'Kirim',
  }
};
