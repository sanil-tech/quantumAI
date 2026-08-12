# IATI OS: Institutional Adaptive Trading Intelligence Operating System
## Phase 13: Advanced Market Forecasting & Probabilistic Intelligence Engine

Dokumen ini merupakan spesifikasi rasmi untuk Fasa 13 (Advanced Market Forecasting & Probabilistic Intelligence Engine) bagi IATI OS. Matlamat fasa ini adalah untuk membina lapisan kecerdasan peramalan (forecasting) yang meramalkan senario pasaran berdasarkan kebarangkalian, mengukur ketidakpastian (uncertainty), dan mengenal pasti peralihan rejim lebih awal. Ia **bukan** sebuah mesin ramalan harga yang mutlak (Price Prediction Machine), tetapi sebuah **Enjin Kebarangkalian Senario (Scenario Probability Engine)**.

---

### 1. Forecast Architecture & Integration Flow

Seni bina peramalan direka untuk menerima input pasaran yang komprehensif, memprosesnya melalui model ensembel pelbagai, dan menghasilkan senario berasaskan kebarangkalian (probabilistic scenarios) yang akan disalurkan kepada Decision Engine.

```mermaid
flowchart TD
    subgraph Data Foundation
        A[Historical & Real-time Data] --> B[Time Series & Multi-Timeframe Analysis]
        C[Sentiment & Event Data] --> B
    end

    subgraph ML Model Pipeline (Ensemble)
        B --> D[Regime Forecasting Engine]
        B --> E[Volatility Forecast Engine]
        B --> F[Market Transition & Anomaly Detector]
        D & E & F --> G[Model Ensemble Engine]
    end

    subgraph Scenario & Probability Engine
        G --> H[Scenario Generation Engine]
        H --> I[Uncertainty Quantification]
        I --> J[Probability Calibration Engine]
    end

    subgraph Execution Bridge & Evaluation
        J --> K{Fail Safe Rule?}
        K -- High Uncertainty --> L[Output: INSUFFICIENT INFO]
        K -- Low/Med Uncertainty --> M[Forecast to Decision Bridge]
        M --> N[Decision Engine - Phase 3]
        
        M -.-> O[Forecast Memory Engine]
        O --> P[Forecast Performance Report]
        P -.-> J
    end
```

---

### 2. Probability Model Design & ML Model Pipeline

Sistem tidak bergantung kepada satu model tunggal. Ia menggunakan pendekatan **Model Ensemble Engine** yang menggabungkan:

*   **Statistical Models:** ARIMA/GARCH untuk analisis kitaran volatiliti dan *mean reversion*.
*   **Machine Learning Models:** Random Forest atau Gradient Boosting (XGBoost/LightGBM) untuk pengelasan rejim (regime classification) berdasarkan *feature engineering*.
*   **Deep Learning / Time Series Models:** LSTM atau Transformer-based models untuk pengesanan urutan (sequence detection) memori pasaran.
*   **LLM Reasoning Models:** Analisis sentimen berita dan impak acara makro.

Semua hasil daripada model-model ini diagregatkan menggunakan pembobotan dinamik (dynamic weighting) berdasarkan ketepatan model tersebut dalam fasa baru-baru ini.

---

### 3. Scenario Engine Design

Modul teras (**Scenario Generation Engine**) akan mengambil unjuran ensemble dan memecahkannya kepada tiga kemungkinan senario pasaran. Setiap senario diikat dengan skor kebarangkalian (Probability Score).

*Contoh Output:*
*   **Senario A (Expected Case):** Penerusan Trend (Trend Continuation) ➜ Kebarangkalian: **65%**
*   **Senario B (Alternative Case):** Sideways / Julat (Range) ➜ Kebarangkalian: **25%**
*   **Senario C (Worst Case):** Pembalikan Arah (Reversal / False Breakout) ➜ Kebarangkalian: **10%**

---

### 4. Data Requirements & Feature Engineering

Bagi mengelakkan kecacatan ramalan, asas data peramalan (Forecasting Data Foundation) memerlukan set input tanpa kebocoran data masa hadapan (No future data leakage).

*   **Input Data:** Harga Sejarah, Volum, Struktur Pasaran, *Liquidity Pools*, Data Ekonomi, Tingkah Laku Sesi (Session Behaviour), Data Sentimen.
*   **Multi-Timeframe Forecasting:** Menyegerakkan ramalan merentas rangka masa (Daily, H4, H1, M15). Jika H4 menunjukkan kelanjutan (Bullish), tetapi M15 menunjukkan kehilangan momentum (Neutral), skor penjajaran (Alignment Score) akan dipertimbangkan dalam pengiraan kebarangkalian akhir.

---

### 5. Regime, Volatility & Transition Forecasting

Enjin tidak meramalkan "ke mana harga pergi", tetapi "bagaimana sifat harga bergerak".

*   **Regime Forecasting Engine:** Mengunjurkan kebarangkalian adakah pasaran akan kekal dalam trend semasa, memasuki *range*, *breakout*, atau *reverse*.
*   **Volatility Forecast Engine:** Meramal keadaan kemeruapan masa depan (Rendah, Normal, Mengembang, Ekstrem) berasaskan kluster kemeruapan (volatility clustering) dan pergerakan ATR.
*   **Market Transition Detector:** Mengesan pergeseran awal sebelum ia jelas di carta. Contohnya, mengesan pengumpulan (Accumulation) atau pengedaran (Distribution) melalui kehilangan kekuatan ADX dan pengurangan volum sebelum pembalikan arah berlaku.

---

### 6. Calibration Framework (Probability Calibration Engine)

Skor keyakinan kebarangkalian (Confidence Score) mestilah sejajar dengan realiti. Kalibrasi adalah wajib bagi mengelakkan sistem menjadi terlalu yakin (Overconfident).

*   **Mekanisme:** Sistem menjejaki (Track) "Ramalan vs Hasil Sebenar".
*   **Logik Kalibrasi:** Jika enjin AI secara purata memberikan kebarangkalian *Continuation* 90%, tetapi secara empirikal hasil itu hanya berlaku 55% dari masa tersebut, sistem akan melaraskan secara automatik tahap keyakinan model menggunakan teknik seperti *Platt Scaling* atau *Isotonic Regression*.

---

### 7. Anomaly Detection & Event Impact Forecasting

Modul pelindung untuk mengenal pasti kelakuan pasaran yang menyimpang daripada unjuran probabiliti biasa.

*   **Anomaly Detection Engine:** Memantau keadaan yang tidak lazim.
    *   *Contoh:* Purata pergerakan (ATR) harian pasangan adalah 50 pip. Tiba-tiba bergerak 250 pip tanpa berita yang disahkan. Modul mencetuskan: **Market Anomaly Warning**.
*   **Event Impact Forecasting:** Meramalkan impak turun naik untuk peristiwa kalendar ekonomi (Cth: FOMC, NFP) pada tiga fasa: *Before, During, After*. Penyesuaian risiko diaktifkan mengikut tahap kejutan yang dijangkakan.

---

### 8. Uncertainty Quantification & Fail Safe Rule

Ketidakpastian (Uncertainty) mesti dikuantifikasi dan diletakkan bersebelahan dengan Skor Kebarangkalian.

*   **Format Ketidakpastian:** Setiap ramalan menyenaraikan `Selang Keyakinan (Confidence Interval)`, `Tahap Risiko (Risk Level)`, dan `Faktor Tidak Diketahui (Unknown Factors)`.
    *   *Contoh:* Forecast: Bullish | Probability: 70% | Uncertainty: High (Oleh sebab kecairan nipis).
*   **Fail Safe Rule:** Apabila metrik `Uncertainty` memuncak melebihi paras selamat, sistem mengeluarkan arahan khusus: **INSUFFICIENT INFORMATION**. Tiada ramalan atau amaran isyarat akan diteruskan. Sistem memilih untuk bertahan.

---

### 9. Forecast Evaluation System

Enjin untuk memantau prestasi kesihatan ekosistem peramalan.

*   **Forecast Memory Engine:** Menyimpan semua unjuran (Prediction), hasil sebenar (Actual result), nilai ralat, dan pembelajaran untuk memperbaiki kitaran peramalan masa depan (Improve future forecast).
*   **Forecast Performance Report:** Menjana laporan harian/mingguan untuk menilai ketepatan unjuran arah (Direction Accuracy), tahap kalibrasi kebarangkalian (Probability Calibration), dan keupayaan peramalan senario rejim (Regime Prediction Accuracy).

---

### 10. Implementation Roadmap (Phase 13)

1.  **Tahap 1:** Penyediaan Pangkalan Data Ramalan (Forecasting Data Foundation) yang bebas dari kecacatan dan kebocoran (Data Leakage).
2.  **Tahap 2:** Pembangunan *Time Series Analysis Engine* & saluran model pengelasan (Machine Learning Model Pipeline).
3.  **Tahap 3:** Pembinaan logik teras *Regime, Volatility & Market Transition Forecasting*.
4.  **Tahap 4:** Penciptaan *Scenario Generation Engine* yang memecahkan analisis kepada hasil kes terbaik, dijangka, dan kes terburuk.
5.  **Tahap 5:** Penjajaran dengan *Uncertainty Quantification* dan *Probability Calibration Engine* untuk ketepatan saintifik.
6.  **Tahap 6:** Pembinaan sistem jambatan maklumat (*Forecast To Decision Bridge*) untuk melengkapkan kitaran peramalan ke Enjin Keputusan Fasa 3.
