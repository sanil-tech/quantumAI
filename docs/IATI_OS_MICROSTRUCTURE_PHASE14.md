# IATI OS: Institutional Adaptive Trading Intelligence Operating System
## Phase 14: Market Microstructure & Smart Money Intelligence Engine

Dokumen ini merupakan spesifikasi rasmi untuk Fasa 14 (Market Microstructure & Smart Money Intelligence Engine) bagi IATI OS. Matlamat fasa ini adalah untuk mengalihkan pemfokusan sistem daripada sekadar bertanya *"Ke mana harga akan bergerak?"* kepada **"Apakah proses mikro yang menyebabkan harga bergerak?"** Ia menganalisis mekanik pasaran, pencarian kecairan (liquidity hunts), dan jejak institusi untuk menilai kualiti sesuatu peluang dagangan pada tahap yang paling asas.

---

### 1. Microstructure Architecture & Integration Flow

Seni bina *Microstructure Engine* bertindak sebagai penapis pra-keputusan (pre-decision filter) yang menterjemahkan data pasaran asas (tick/order flow) ke dalam *Institutional Footprint Score* sebelum dihantar ke *Decision Engine*.

```mermaid
flowchart TD
    subgraph Data Foundation (Micro & Macro)
        A[Tick Data / Order Flow / Volume] --> B{Real Limitation Handling}
        B -- Full Data --> C[Order Flow Engine]
        B -- Proxy Data --> D[Proxy Volume / Price Action]
    end

    subgraph Liquidity & Structural Mechanics
        C & D --> E[Liquidity Map Engine]
        C & D --> F[Displacement Analysis Engine]
        C & D --> G[Absorption Detection Engine]
        E --> H[Liquidity Sweep Detection]
        F --> I[Fair Value Gap & Institutional Zones]
    end

    subgraph Evaluation & Intelligence
        H & I & G --> J[False Move Detection]
        J --> K[Institutional Footprint Score]
        K --> L[Entry Quality Engine]
        L --> M[Execution Timing Engine]
    end

    subgraph Bridge to OS
        M --> N[Microstructure to Decision Bridge]
        N --> O[Decision Engine - Phase 3]
        N -.-> P[Microstructure Memory & Report]
    end
```

---

### 2. Market Participant & Institutional Behaviour Model

Enjin ini mengklasifikasikan pergerakan pasaran berdasarkan profil tingkah laku peserta (Market Participants).

*   **Retail Trader:** Biasanya dikaitkan dengan pergerakan panik, *chasing the market*, dan penciptaan sasaran kecairan (Stop Clusters).
*   **Institutional Trader / Market Maker:** Memerlukan kecairan (liquidity) yang besar untuk masuk/keluar pasaran tanpa slippage besar. Mereka mencetuskan *Sweep* dan *Displacement*.
*   **Absorption Detection:** Enjin ini mengenal pasti kelakuan pasaran yang ganjil. Contohnya, volum pesanan masuk yang sangat besar tetapi harga tidak bergerak. Ini ditafsirkan sebagai: *Possible institutional absorption* (Institusi menyerap tekanan jualan/belian runcit sebelum menukar arah pasaran).

---

### 3. Liquidity Model & Sweep Detection

Pemetaan Kecairan (Liquidity Map) adalah teras kepada Fasa 14. Pasaran bergerak dari satu zon kecairan ke zon kecairan yang lain.

*   **Liquidity Map Engine:** Mengimbas dan merakam paras penting: *Previous High/Low, Equal Highs/Lows, Stop Clusters, dan Pending Order Areas*. Sistem menghasilkan `Liquidity Map Object`.
*   **Liquidity Sweep Detection:** Mengesan percubaan pasaran mengambil kecairan. 
    *   *Pola:* Harga menembusi *Previous Low* (Break) ➜ Penolakan Pantas (Rapid Rejection / Pinbar) ➜ *Potential Reversal*.
    *   *Penyimpanan Memori:* Sistem menyimpan `Sweep strength`, `Volume`, dan kemungkinan pembalikan (`Probability`).

---

### 4. Order Flow Framework & Real Limitation Handling

Menganalisis pesanan yang sedang berlaku dalam pasaran.

*   **Order Imbalance Engine:** Menganalisis tekanan belian vs jualan (Aggressive buying/selling). Mengesan ketiadaan kecekapan harga dalam buku pesanan (Order Book).
*   **Real Limitation Handling (Protokol Kekangan):** Dalam pasaran terdesentralisasi seperti FOREX Spot (di mana data *Level 2* sebenar mungkin tiada), AI dilarang keras menuntut pengesanan pesanan institusi secara mutlak.
    *   Jika ketiadaan data order flow sebenar, AI wajib menyatakan: **"Proxy analysis only"** (menggunakan Volatiliti dan Pergerakan Harga sebagai proksi). Jangan *claim*: "Detect institutional order".

---

### 5. Fair Value Gap (FVG) & Institutional Zone Engine

Sistem mencari ketidakcekapan harga (Price Inefficiency) yang ditinggalkan oleh pergerakan institusi (Smart Money).

*   **Displacement Analysis Engine:** Mengukur kekuatan pergerakan harga melalui `Candle Size`, `Speed`, `Volume`, dan `Follow-through`. Membezakan antara *Real Breakout* dan *False Breakout*.
*   **FVG Engine:** Mengesan ketidakseimbangan pasaran. Merekodkan `Zone`, `Strength`, `Freshness` (Adakah ia belum diisi/mitigate?), dan `Reaction history`.
*   **Institutional Zone Engine:** Menstrukturkan zon *Accumulation* dan *Distribution*. Zon ini diberi skor berdasarkan tindak balas lampau, kesegaran zon, dan volum semasa penciptaan zon.

---

### 6. False Move Detection & Smart Money Confirmation

Satu isyarat tunggal tidak mencukupi. Analisis struktur mikro memerlukan susunan bukti konklusif.

*   **False Move Detection:** Mengesan *Liquidity trap*, *Stop hunt*, dan *Exhaustion move*. Jika berlaku, enjin menjana amaran (Warning) untuk menghalang pelaksanaan (Execution).
*   **Smart Money Confirmation Engine:** Pembuktian bertindan (Institutional Evidence Stack):
    *   `Liquidity Event` + `Structure Confirmation` + `Momentum Confirmation` + `Risk Acceptable`.

---

### 7. Entry Quality Framework & Execution Timing

Bukan semua susunan strategik layak didagangkan jika mekaniknya lemah.

*   **Entry Quality Engine:** Menilai kualiti entri sebelum arahan dibuat.
    *   *Location (Zon), Timing (Masa Sesi), Liquidity (Adakah ia menjadi kecairan, atau mengambil kecairan?), Structure, dan Momentum.*
    *   *Contoh:* Entry selari trend tetapi *Location* lemah (tengah julat) ➜ Skor: 65 (Wait). Entry pada *Liquidity Sweep + Structure Shift* ➜ Skor: 91 (Execute).
*   **Execution Timing Engine:** Menentukan kaedah masuk: `Entry now`, `Wait`, `Wait retest`, atau `Avoid` berdasarkan kualiti mekanik pasaran.

---

### 8. Scoring Model (Institutional Footprint Score)

Skema pemarkahan seragam (Max 100 markah) untuk menilai kekuatan jejak institusi.

| Kriteria / Metrik | Wajaran Maksimum | Penerangan |
| :--- | :---: | :--- |
| **Liquidity (25)** | 25 | Adakah pasaran baru sahaja mengambil kecairan utama (Sweep)? |
| **Structure (25)** | 25 | Adakah berlaku anjakan struktur (Market Structure Shift) mikro? |
| **Volume / Imbalance (20)** | 20 | Terdapat pengesahan FVG, ketidakseimbangan, atau kekuatan anjakan. |
| **Reaction (20)** | 20 | Penolakan kukuh, penyerapan (Absorption) yang jelas pada zon. |
| **Context (10)** | 10 | Berpadanan dengan rejim pasaran dan sesi dagangan (Macro Context). |
| **TOTAL SCORE** | **100** | **Cut-off point untuk "High Quality Entry": > 80** |

---

### 9. Data Requirement & Testing Framework

*   **Data Requirements:** 
    *   Tick data (Bid/Ask), Real Volume / Tick Volume.
    *   Level 2 / Depth of Market (DOM) / Delta Profile (Bergantung pada kelas aset dan integrasi Broker).
*   **Microstructure Memory:** Menyimpan corak mekanik pasaran (Cth: *London Liquidity Sweep untuk EURUSD mempunyai 72% Continuation Rate historis*).
*   **Testing Framework:** Menggunakan analisis pemutaran semula (Replay mode) tick-by-tick berbanding HLOC biasa. Menguji sistem pengesanan FVG dan Liquidity Sweep menggunakan data tick luar sampel (Out-of-sample tick data).

---

### 10. Implementation Roadmap (Phase 14)

1.  **Tahap 1:** Pembinaan **Real Limitation Handling & Data Proxy Mechanism** bagi memastikan integriti sistem.
2.  **Tahap 2:** Pembangunan **Liquidity Map Engine** dan logik matematik untuk **Sweep Detection**.
3.  **Tahap 3:** Pengaturcaraan **Displacement Analysis**, pengesanan **FVG (Fair Value Gap)** dan **Institutional Zone**.
4.  **Tahap 4:** Integrasi **Order Imbalance** dan **Absorption Detection** (Sekiranya data Level 2 / Tick Delta wujud).
5.  **Tahap 5:** Pembangunan sistem penjanaan skor **Institutional Footprint Score** dan kerangka **Entry Quality**.
6.  **Tahap 6:** Penyatuan sistem laporan **Microstructure Report** yang menolak keputusan ke **Microstructure to Decision Bridge** (Phase 3).
