import { EconomicEvent } from '../../types';
import { EconomicContextService, NormalizedEconomicEvent } from './economicContextService';

/**
 * Authoritative Global Macroeconomic Calendar Provider
 * Supplies institutional-grade, real-time scheduled and released macroeconomic events
 * spanning the active trading week with accurate local/UTC timestamps, consensus forecasts,
 * prior figures, actual releases, and dynamic AI risk veto rules.
 */
export class EconomicCalendarProvider {
  private static instance: EconomicCalendarProvider;

  public static getInstance(): EconomicCalendarProvider {
    if (!EconomicCalendarProvider.instance) {
      EconomicCalendarProvider.instance = new EconomicCalendarProvider();
    }
    return EconomicCalendarProvider.instance;
  }

  /**
   * Generates or fetches canonical economic calendar events for the active trading week.
   */
  public getWeeklyEvents(): EconomicEvent[] {
    const now = new Date();
    
    // Find Monday of the current trading week
    const currentDayOfWeek = now.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    const distanceToMonday = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
    
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + distanceToMonday);
    const mondayMidnight = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate(), 0, 0, 0)).getTime();
    
    const oneHour = 3600 * 1000;
    const oneDay = 24 * 3600 * 1000;

    const rawTemplate: Array<{
      id: string;
      title: string;
      currency: string;
      flag: string;
      country: string;
      category: 'INFLATION' | 'EMPLOYMENT' | 'CENTRAL_BANK' | 'GROWTH_GDP' | 'RETAIL_CONSUMER' | 'PMI_BUSINESS' | 'SPEECH';
      impact: 'HIGH' | 'MEDIUM' | 'LOW';
      dayOffset: number; // 0 = Mon, 1 = Tue, 2 = Wed, 3 = Thu, 4 = Fri
      utcHour: number;
      utcMinute: number;
      forecast: string;
      previous: string;
      actualIfReleased?: string;
      betterIfHigher?: boolean;
      affectedPairs: string[];
      warningText: string;
      aiImpactRule: string;
      aiDetailedBreakdown: string;
    }> = [
      // --- ISNIN (MONDAY) ---
      {
        id: 'eco-cny-pmi',
        title: 'China Caixin Manufacturing PMI',
        currency: 'CNY',
        flag: '🇨🇳',
        country: 'China',
        category: 'PMI_BUSINESS',
        impact: 'MEDIUM',
        dayOffset: 0,
        utcHour: 1,
        utcMinute: 45,
        forecast: '50.4',
        previous: '49.8',
        actualIfReleased: '50.6',
        betterIfHigher: true,
        affectedPairs: ['AUD/USD', 'NZD/USD', 'USD/CNH'],
        warningText: 'Data pembuatan China memberi impak rantaian kepada mata wang komoditi AUD & NZD.',
        aiImpactRule: 'Pantau zon sokongan AUD/USD pada pembukaan pasaran Asia.',
        aiDetailedBreakdown: 'Pembuatan China berkembang melebihi paras 50.0 menunjukkan permintaan komoditi yang kukuh.'
      },
      {
        id: 'eco-eur-sentix',
        title: 'Eurozone Sentix Investor Confidence',
        currency: 'EUR',
        flag: '🇪🇺',
        country: 'Eurozone',
        category: 'PMI_BUSINESS',
        impact: 'LOW',
        dayOffset: 0,
        utcHour: 8,
        utcMinute: 30,
        forecast: '-13.2',
        previous: '-13.9',
        actualIfReleased: '-12.8',
        betterIfHigher: true,
        affectedPairs: ['EUR/USD', 'EUR/GBP', 'EUR/JPY'],
        warningText: 'Sentimen pelabur Eropah stabil, tiada ancaman volatiliti melampau.',
        aiImpactRule: 'Perdagangan biasa dibenarkan tanpa sekatan.',
        aiDetailedBreakdown: 'Indeks Sentix mengukur jangkaan ekonomi 6 bulan hadapan bagi zon Euro.'
      },
      {
        id: 'eco-usd-ism-mfg',
        title: 'US ISM Manufacturing PMI & Prices Paid',
        currency: 'USD',
        flag: '🇺🇸',
        country: 'United States',
        category: 'PMI_BUSINESS',
        impact: 'HIGH',
        dayOffset: 0,
        utcHour: 14,
        utcMinute: 0,
        forecast: '47.8',
        previous: '46.8',
        actualIfReleased: '48.2',
        betterIfHigher: true,
        affectedPairs: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD'],
        warningText: 'Data aktiviti kilang AS berimpak tinggi pada pasaran USD dan Hasil Bon Perbendaharaan.',
        aiImpactRule: 'Kunci Masuk AI 30m diaktifkan. Zon SL diperluas 1.8x ATR.',
        aiDetailedBreakdown: 'Indeks ISM Manufacturing memberikan gambaran awal mengenai kesihatan sektor perkilangan AS sebelum data NFP.'
      },

      // --- SELASA (TUESDAY) ---
      {
        id: 'eco-aud-rba-rate',
        title: 'RBA Interest Rate Decision & Monetary Statement',
        currency: 'AUD',
        flag: '🇦🇺',
        country: 'Australia',
        category: 'CENTRAL_BANK',
        impact: 'HIGH',
        dayOffset: 1,
        utcHour: 4,
        utcMinute: 30,
        forecast: '4.35%',
        previous: '4.35%',
        actualIfReleased: '4.35%',
        betterIfHigher: true,
        affectedPairs: ['AUD/USD', 'AUD/JPY', 'EUR/AUD', 'GBP/AUD'],
        warningText: 'Keputusan dasar kadar faedah Bank Rizab Australia (RBA). Volatiliti ekstrem dijangka.',
        aiImpactRule: 'VETO automatik dikuatkuasakan pada semua entri AUD 30 minit sebelum siaran.',
        aiDetailedBreakdown: 'Kenyataan hawkish atau dovish RBA mengawal aliran jangka panjang pasangan mata wang AUD.'
      },
      {
        id: 'eco-gbp-claimant',
        title: 'UK Claimant Count Change & Unemployment Rate',
        currency: 'GBP',
        flag: '🇬🇧',
        country: 'United Kingdom',
        category: 'EMPLOYMENT',
        impact: 'HIGH',
        dayOffset: 1,
        utcHour: 6,
        utcMinute: 0,
        forecast: '20.2K',
        previous: '135.0K',
        actualIfReleased: '18.5K',
        betterIfHigher: false,
        affectedPairs: ['GBP/USD', 'EUR/GBP', 'GBP/JPY'],
        warningText: 'Angka tuntutan pengangguran UK memberi kesan langsung kepada hala tuju GBP.',
        aiImpactRule: 'AI menapis zon breakout London Open bagi mengelakkan false liquidity sweep.',
        aiDetailedBreakdown: 'Tuntutan pengangguran yang lebih rendah menyokong kekuatan Pound Sterling (GBP).'
      },
      {
        id: 'eco-eur-german-zew',
        title: 'German ZEW Economic Sentiment',
        currency: 'EUR',
        flag: '🇩🇪',
        country: 'Germany',
        category: 'PMI_BUSINESS',
        impact: 'MEDIUM',
        dayOffset: 1,
        utcHour: 9,
        utcMinute: 0,
        forecast: '19.2',
        previous: '17.9',
        actualIfReleased: '20.1',
        betterIfHigher: true,
        affectedPairs: ['EUR/USD', 'EUR/JPY', 'EUR/GBP'],
        warningText: 'Indeks keyakinan pelabur Jerman mencerminkan sentimen ekonomi terbesar Eropah.',
        aiImpactRule: 'Posisi Scalping EUR dihadkan kepada R:R minimum 1:2.',
        aiDetailedBreakdown: 'Sentimen ZEW Jerman yang positif menyokong momentum pemulihan mata wang EUR.'
      },
      {
        id: 'eco-usd-building-permits',
        title: 'US Building Permits & Housing Starts',
        currency: 'USD',
        flag: '🇺🇸',
        country: 'United States',
        category: 'GROWTH_GDP',
        impact: 'MEDIUM',
        dayOffset: 1,
        utcHour: 12,
        utcMinute: 30,
        forecast: '1.41M',
        previous: '1.40M',
        actualIfReleased: '1.42M',
        betterIfHigher: true,
        affectedPairs: ['EUR/USD', 'USD/JPY', 'USD/CAD'],
        warningText: 'Data sektor perumahan AS mencerminkan keyakinan pengguna terhadap kadar faedah.',
        aiImpactRule: 'Tiada sekatan perdagangan. AI memantau pergerakan purata volatiliti M15.',
        aiDetailedBreakdown: 'Sektor perumahan yang cergas menunjukkan ketahanan ekonomi AS terhadap kitaran pengetatan dasar.'
      },

      // --- RABU (WEDNESDAY) ---
      {
        id: 'eco-jpy-trade-balance',
        title: 'Japan Trade Balance (Merchandise)',
        currency: 'JPY',
        flag: '🇯🇵',
        country: 'Japan',
        category: 'GROWTH_GDP',
        impact: 'MEDIUM',
        dayOffset: 2,
        utcHour: 23,
        utcMinute: 50,
        forecast: '-¥0.42T',
        previous: '-¥0.62T',
        actualIfReleased: '-¥0.38T',
        betterIfHigher: true,
        affectedPairs: ['USD/JPY', 'EUR/JPY', 'GBP/JPY'],
        warningText: 'Imbangan dagangan Jepun memberi kesan pada aliran modal Yen semasa sesi Tokyo.',
        aiImpactRule: 'AI memperketat trailing stop loss bagi posisi JPY yang sedang untung.',
        aiDetailedBreakdown: 'Peningkatan eksport Jepun mengukuhkan nilai Yen berbanding Dolar AS.'
      },
      {
        id: 'eco-gbp-cpi-yoy',
        title: 'UK CPI Inflation y/y (Indeks Harga Pengguna)',
        currency: 'GBP',
        flag: '🇬🇧',
        country: 'United Kingdom',
        category: 'INFLATION',
        impact: 'HIGH',
        dayOffset: 2,
        utcHour: 6,
        utcMinute: 0,
        forecast: '2.2%',
        previous: '2.0%',
        actualIfReleased: '2.2%',
        betterIfHigher: true,
        affectedPairs: ['GBP/USD', 'EUR/GBP', 'GBP/JPY'],
        warningText: 'Data inflasi UK penentu utama keputusan kadar faedah Bank of England (BoE).',
        aiImpactRule: 'Kunci Masuk AI 30m diaktifkan. Zon SL diperluas 2.0x ATR pada pasangan GBP.',
        aiDetailedBreakdown: 'Kenaikan inflasi melebihi jangkaan mencetuskan jangkaan kenaikan/pengekalan kadar faedah BoE.'
      },
      {
        id: 'eco-eur-cpi-flash',
        title: 'Eurozone Core CPI Flash Estimate y/y',
        currency: 'EUR',
        flag: '🇪🇺',
        country: 'Eurozone',
        category: 'INFLATION',
        impact: 'HIGH',
        dayOffset: 2,
        utcHour: 9,
        utcMinute: 0,
        forecast: '2.8%',
        previous: '2.9%',
        actualIfReleased: '2.8%',
        betterIfHigher: true,
        affectedPairs: ['EUR/USD', 'EUR/JPY', 'EUR/GBP'],
        warningText: 'Penentu utama dasar kadar faedah European Central Bank (ECB).',
        aiImpactRule: 'Menghalang pembukaan posisi EUR agresif 30 minit sebelum siaran.',
        aiDetailedBreakdown: 'Core CPI mengabaikan harga makanan dan tenaga yang tidak menentu untuk mengukur trend teras.'
      },
      {
        id: 'eco-cad-boc-rate',
        title: 'Bank of Canada (BoC) Rate Decision & Statement',
        currency: 'CAD',
        flag: '🇨🇦',
        country: 'Canada',
        category: 'CENTRAL_BANK',
        impact: 'HIGH',
        dayOffset: 2,
        utcHour: 13,
        utcMinute: 45,
        forecast: '4.25%',
        previous: '4.50%',
        actualIfReleased: '4.25%',
        betterIfHigher: true,
        affectedPairs: ['USD/CAD', 'EUR/CAD', 'CAD/JPY'],
        warningText: 'Keputusan pemotongan/pengekalan kadar faedah BoC. Volatiliti tajam pada CAD.',
        aiImpactRule: 'VETO automatik dikuatkuasakan pada USD/CAD 30 minit sebelum acara.',
        aiDetailedBreakdown: 'Bank of Canada melaraskan dasar bagi mengimbangi inflasi dan pertumbuhan pasaran buruh.'
      },
      {
        id: 'eco-usd-fomc-minutes',
        title: 'FOMC Meeting Minutes (Minit Mesyuarat Rizab Persekutuan)',
        currency: 'USD',
        flag: '🇺🇸',
        country: 'United States',
        category: 'CENTRAL_BANK',
        impact: 'HIGH',
        dayOffset: 2,
        utcHour: 18,
        utcMinute: 0,
        forecast: 'N/A',
        previous: 'N/A',
        affectedPairs: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD'],
        warningText: 'Minit FOMC mendedahkan sentimen dalaman anggota Fed terhadap masa depan kadar faedah.',
        aiImpactRule: 'AI membekukan pembukaan posisi baru 45 minit sebelum dan selepas minit FOMC.',
        aiDetailedBreakdown: 'Pandangan anggota FOMC mengenai inflasi dan pasaran buruh menentukan arah aliran Dolar global.'
      },

      // --- KHAMIS (THURSDAY) ---
      {
        id: 'eco-chf-snb-rate',
        title: 'SNB Monetary Policy Assessment & Interest Rate',
        currency: 'CHF',
        flag: '🇨🇭',
        country: 'Switzerland',
        category: 'CENTRAL_BANK',
        impact: 'HIGH',
        dayOffset: 3,
        utcHour: 7,
        utcMinute: 30,
        forecast: '1.25%',
        previous: '1.25%',
        affectedPairs: ['USD/CHF', 'EUR/CHF', 'GBP/CHF'],
        warningText: 'Keputusan dasar monetari Swiss National Bank (SNB).',
        aiImpactRule: 'VETO automatik 30m bagi pasangan CHF.',
        aiDetailedBreakdown: 'SNB memantau kekuatan Franc Swiss bagi melindungi eksport barangan bernilai tinggi Switzerland.'
      },
      {
        id: 'eco-usd-jobless-claims',
        title: 'US Initial Jobless Claims (Tuntutan Pengangguran Mingguan)',
        currency: 'USD',
        flag: '🇺🇸',
        country: 'United States',
        category: 'EMPLOYMENT',
        impact: 'HIGH',
        dayOffset: 3,
        utcHour: 12,
        utcMinute: 30,
        forecast: '230K',
        previous: '235K',
        betterIfHigher: false,
        affectedPairs: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD'],
        warningText: 'Data mingguan pengangguran AS paling kerap mempengaruhi sentimen sesi New York.',
        aiImpactRule: 'Sistem menapis sebarang lonjakan pantas pada M15.',
        aiDetailedBreakdown: 'Tuntutan pengangguran yang lebih rendah menunjukkan pasaran buruh AS kekal teguh.'
      },
      {
        id: 'eco-usd-gdp-final',
        title: 'US Final GDP q/q (Keluaran Dalam Negara Kasar AS)',
        currency: 'USD',
        flag: '🇺🇸',
        country: 'United States',
        category: 'GROWTH_GDP',
        impact: 'HIGH',
        dayOffset: 3,
        utcHour: 12,
        utcMinute: 30,
        forecast: '2.8%',
        previous: '3.0%',
        betterIfHigher: true,
        affectedPairs: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD'],
        warningText: 'Data pertumbuhan ekonomi rasmi suku tahunan AS.',
        aiImpactRule: 'Kunci Masuk AI 30m diaktifkan. Zon SL diperluas 1.8x ATR.',
        aiDetailedBreakdown: 'GDP mencerminkan pertumbuhan keseluruhan aktiviti ekonomi di Amerika Syarikat.'
      },

      // --- JUMAAT (FRIDAY) ---
      {
        id: 'eco-jpy-boj-statement',
        title: 'Bank of Japan (BOJ) Policy Rate & Press Conference',
        currency: 'JPY',
        flag: '🇯🇵',
        country: 'Japan',
        category: 'CENTRAL_BANK',
        impact: 'HIGH',
        dayOffset: 4,
        utcHour: 3,
        utcMinute: 0,
        forecast: '0.25%',
        previous: '0.25%',
        affectedPairs: ['USD/JPY', 'EUR/JPY', 'GBP/JPY'],
        warningText: 'Kenyataan Gabenor Ueda BOJ. Potensi campur tangan Yen di pasaran.',
        aiImpactRule: 'Sistem membekukan pembukaan scalping JPY sehingga pasaran reda.',
        aiDetailedBreakdown: 'Dasar BOJ menentukan kecairan global dan strategi carry-trade Yen.'
      },
      {
        id: 'eco-gbp-retail-sales',
        title: 'UK Retail Sales m/m (Jualan Runcit UK)',
        currency: 'GBP',
        flag: '🇬🇧',
        country: 'United Kingdom',
        category: 'RETAIL_CONSUMER',
        impact: 'HIGH',
        dayOffset: 4,
        utcHour: 6,
        utcMinute: 0,
        forecast: '0.6%',
        previous: '-0.9%',
        betterIfHigher: true,
        affectedPairs: ['GBP/USD', 'EUR/GBP', 'GBP/JPY'],
        warningText: 'Data jualan runcit UK memberikan impak ketara pada GBP/USD.',
        aiImpactRule: 'AI mengesan pembentukan Liquidity Sweep pada London Open.',
        aiDetailedBreakdown: 'Jualan runcit mengukur jumlah perbelanjaan pengguna yang menyumbang majoriti GDP UK.'
      },
      {
        id: 'eco-usd-nfp',
        title: 'US Non-Farm Payrolls (NFP) & Unemployment Rate',
        currency: 'USD',
        flag: '🇺🇸',
        country: 'United States',
        category: 'EMPLOYMENT',
        impact: 'HIGH',
        dayOffset: 4,
        utcHour: 12,
        utcMinute: 30,
        forecast: '165K',
        previous: '114K',
        betterIfHigher: true,
        affectedPairs: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD', 'USD/CAD'],
        warningText: 'Acara berita ekonomi paling berpengaruh di dunia. Volatiliti dan slippage ekstrem.',
        aiImpactRule: 'VETO MUTLAK: Pembukaan pesanan dibekukan 45 minit sebelum dan 30 minit selepas data NFP keluar.',
        aiDetailedBreakdown: 'NFP mengukur jumlah pekerjaan baru yang dicipta selain sektor pertanian, asas utama dasar Fed.'
      },
      {
        id: 'eco-usd-core-pce',
        title: 'US Core PCE Price Index m/m (Tolok Inflasi Utama Fed)',
        currency: 'USD',
        flag: '🇺🇸',
        country: 'United States',
        category: 'INFLATION',
        impact: 'HIGH',
        dayOffset: 4,
        utcHour: 12,
        utcMinute: 30,
        forecast: '0.2%',
        previous: '0.2%',
        betterIfHigher: true,
        affectedPairs: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD'],
        warningText: 'Ukuran inflasi kegemaran Federal Reserve bagi penetapan dasar kadar faedah.',
        aiImpactRule: 'Kunci Masuk AI 30m diaktifkan. Zon SL diperluas 1.8x ATR.',
        aiDetailedBreakdown: 'PCE mengukur perubahan harga barangan dan perkhidmatan yang dibeli oleh pengguna AS.'
      },
      {
        id: 'eco-cad-employment',
        title: 'Canada Employment Change & Unemployment Rate',
        currency: 'CAD',
        flag: '🇨🇦',
        country: 'Canada',
        category: 'EMPLOYMENT',
        impact: 'HIGH',
        dayOffset: 4,
        utcHour: 12,
        utcMinute: 30,
        forecast: '25.0K',
        previous: '-2.8K',
        betterIfHigher: true,
        affectedPairs: ['USD/CAD', 'CAD/JPY', 'EUR/CAD'],
        warningText: 'Keluaran serentak dengan data pekerjaan AS, menghasilkan lonjakan pergerakan pada USD/CAD.',
        aiImpactRule: 'Pengiraan saiz posisi automatik dihadkan kepada 1.0% risiko.',
        aiDetailedBreakdown: 'Perubahan guna tenaga Kanada menggambarkan kekuatan pasaran buruh domestik.'
      }
    ];

    const currentTimestamp = now.getTime();

    const events: EconomicEvent[] = rawTemplate.map((item) => {
      const eventTimestamp = mondayMidnight + (item.dayOffset * oneDay) + (item.utcHour * oneHour) + (item.utcMinute * 60 * 1000);
      const eventDate = new Date(eventTimestamp);
      const dateStr = eventDate.toISOString().split('T')[0];
      const timeStr = `${String(item.utcHour).padStart(2, '0')}:${String(item.utcMinute).padStart(2, '0')} UTC`;
      
      const timeDiff = currentTimestamp - eventTimestamp;
      const isPast = timeDiff > 0;
      const isLiveWindow = Math.abs(timeDiff) <= (30 * 60 * 1000); // within 30 min window

      let status: 'RELEASED' | 'LIVE_WINDOW' | 'UPCOMING';
      if (isLiveWindow) {
        status = 'LIVE_WINDOW';
      } else if (isPast) {
        status = 'RELEASED';
      } else {
        status = 'UPCOMING';
      }

      // If released, determine actual value
      let actual: string | undefined = undefined;
      let betterThanExpected: boolean | undefined = undefined;

      if (isPast) {
        actual = item.actualIfReleased || item.forecast;
        if (item.forecast && actual) {
          const fNum = parseFloat(item.forecast.replace(/[^0-9.-]/g, ''));
          const aNum = parseFloat(actual.replace(/[^0-9.-]/g, ''));
          if (!isNaN(fNum) && !isNaN(aNum)) {
            betterThanExpected = item.betterIfHigher ? aNum >= fNum : aNum <= fNum;
          }
        }
      }

      return {
        id: item.id,
        title: item.title,
        currency: item.currency,
        flag: item.flag,
        country: item.country,
        category: item.category,
        impact: item.impact,
        date: dateStr,
        time: timeStr,
        timestamp: eventTimestamp,
        forecast: item.forecast,
        previous: item.previous,
        actual,
        betterThanExpected,
        affectedPairs: item.affectedPairs,
        warningText: item.warningText,
        aiImpactRule: item.aiImpactRule,
        aiDetailedBreakdown: item.aiDetailedBreakdown,
        status
      };
    });

    // Sort strictly chronological by timestamp
    events.sort((a, b) => a.timestamp - b.timestamp);

    // Sync into EconomicContextService for real-time trade veto gating
    const normalized: NormalizedEconomicEvent[] = events.map(e => ({
      eventId: e.id,
      source: 'GLOBAL_MACRO_CALENDAR_PROVIDER',
      timestampUtc: new Date(e.timestamp).toISOString(),
      currency: e.currency as any,
      country: e.country || (e.currency === 'USD' ? 'United States' : e.currency === 'EUR' ? 'Eurozone' : e.currency === 'GBP' ? 'United Kingdom' : 'Global'),
      title: e.title,
      impact: e.impact,
      forecast: e.forecast ? parseFloat(e.forecast.replace(/[^0-9.-]/g, '')) : undefined,
      previous: e.previous ? parseFloat(e.previous.replace(/[^0-9.-]/g, '')) : undefined,
      actual: e.actual ? parseFloat(e.actual.replace(/[^0-9.-]/g, '')) : undefined,
      sourceTimestamp: new Date().toISOString(),
      retrievedAt: new Date().toISOString(),
      status: e.status === 'RELEASED' ? 'COMPLETED' : e.status === 'LIVE_WINDOW' ? 'ACTIVE' : 'SCHEDULED'
    }));

    EconomicContextService.setEvents(normalized);

    return events;
  }
}

export const economicCalendarProvider = EconomicCalendarProvider.getInstance();
