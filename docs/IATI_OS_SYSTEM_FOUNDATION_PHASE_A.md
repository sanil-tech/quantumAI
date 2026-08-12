# IATI OS: Institutional Adaptive Trading Intelligence Operating System
## Phase A: System Foundation Layer

Dokumen ini merupakan spesifikasi teknikal untuk **Fasa A (System Foundation Layer)**. Ia menetapkan asas kukuh sebelum sebarang baris kod perniagaan (business logic) ditulis, mematuhi prinsip Clean Architecture, Modular Design, dan API-First.

---

### 1. Final Technology Stack Recommendation

Memandangkan IATI OS memerlukan pemprosesan pantas (low-latency), analisis data berat (compute-heavy), dan antara muka pengguna responsif (real-time UI), timbunan teknologi (tech stack) berikut disyorkan:

*   **Backend (Core & Execution):** Node.js dengan **TypeScript** (Express.js / NestJS). TypeScript memastikan keselamatan jenis (type-safety) yang ketat untuk mengelakkan ralat kritikal ketika execution.
*   **AI & Machine Learning Microservice:** **Python** (FastAPI). Python adalah standard industri untuk pemprosesan AI, Scikit-learn, Pandas, dan integrasi LLM (Gemini API untuk Explainable AI).
*   **Frontend (Monitoring & Dashboard):** **React.js** (Vite) dengan **TypeScript** dan **Tailwind CSS**. *shadcn/ui* untuk komponen UI pantas dan kemas.
*   **Real-time Communication:** **WebSockets** (Socket.io) untuk menyalurkan data tick, PnL langsung, dan status sistem ke Papan Pemuka.
*   **Message Broker / Event Bus:** **Redis Pub/Sub** atau **RabbitMQ**. Penting untuk komunikasi *asynchronous* antara enjin (cth: Market Data menghantar event ke Intelligence Engine).

---

### 2. Folder Architecture (Modular Domain-Driven Design)

Struktur folder direka untuk menyokong pengembangan beransur-ansur (incremental development) tanpa menjadi monolitik yang berselirat.

```text
/iati-os
├── /backend                    # Core Trading System (Node.js/TS)
│   ├── /src
│   │   ├── /config             # Environment variables, DB credentials
│   │   ├── /core               # Error handling, Logging, Base interfaces
│   │   ├── /infrastructure     # DB connections, Redis clients, Broker API clients
│   │   ├── /modules            # Domain-Driven Modules (Independent)
│   │   │   ├── /market_data    # Phase B: Market Data Layer
│   │   │   ├── /intelligence   # Phase C: Intelligence Layer
│   │   │   ├── /decision       # Phase D: Decision Layer
│   │   │   ├── /risk           # Phase E: Risk Layer
│   │   │   ├── /execution      # Phase F: Execution Layer
│   │   │   ├── /learning       # Phase G: Learning Layer
│   │   │   └── /monitoring     # Phase H: Monitoring Layer
│   │   └── /api                # REST Controllers, WebSocket gateways
├── /ai_engine                  # Python Microservice for ML/Bayesian/Pattern matching
├── /frontend                   # React.js Dashboard
├── /database                   # Migrations, Seeds, Schema Definitions
├── /tests                      # Unit, Integration, E2E, Backtesting frameworks
└── /docs                       # Architecture docs, API specs (OpenAPI)
```

---

### 3. Database Technology Decision

Sistem hibrid diperlukan untuk mengendalikan pelbagai jenis struktur data IATI OS:

1.  **Primary Relational & Time-Series DB:** **PostgreSQL + TimescaleDB Extension**
    *   *Kenapa:* PostgreSQL sangat stabil dan mematuhi ACID untuk rekod transaksi/pesanan. TimescaleDB mengoptimumkan PostgreSQL untuk menyimpan jutaan *Tick Data* dan *OHLC* dengan sangat pantas.
    *   *Penggunaan:* Historical Market Data, Trade Journal, User Data, Audit Logs.
2.  **Short-Term Memory & Caching:** **Redis**
    *   *Kenapa:* Kependaman ultra-rendah (ultra-low latency).
    *   *Penggunaan:* Menyimpan Current Market State, Rate Limiting, Active Order Status, dan sistem mesej (Pub/Sub) antara modul.
3.  **Vector / Knowledge Database (Optional/Future):** **pgvector (PostgreSQL extension)**
    *   *Kenapa:* Untuk Pattern Memory dan pencarian vektor (kemiripan pasaran sejarah).
4.  **ORM (Object-Relational Mapping):** **Drizzle ORM** (TypeScript). Ringan, berprestasi tinggi, dan type-safe berbanding Prisma.

---

### 4. Backend Architecture (Event-Driven Clean Architecture)

Modul-modul tidak akan memanggil satu sama lain secara terus (tight coupling) untuk mengelakkan *spaghetti code*. Kita menggunakan **Event-Driven Architecture**.

*   **Aliran Peristiwa (Event Flow):**
    1.  `MarketDataService` menerima tick baharu ➜ *Emit Event:* `MARKET_TICK_RECEIVED`.
    2.  `IntelligenceEngine` mendengar event tersebut, mengira State baharu ➜ *Emit Event:* `MARKET_STATE_UPDATED`.
    3.  `DecisionEngine` menangkap State baharu, menjalankan model Bayesian. Jika gred A+ ➜ *Emit Event:* `TRADE_DECISION_GENERATED`.
    4.  `RiskEngine` menangkap keputusan, mengira exposure. Jika lulus ➜ *Emit Event:* `RISK_APPROVED`.
    5.  `ExecutionEngine` menangkap kelulusan, menghantar pesanan ke Broker.

*Ini memastikan jika satu modul gagal (cth: Learning Engine tergendala), Execution Engine masih boleh berjalan (Independent).*

---

### 5. API Architecture

Sistem IATI OS akan mendedahkan (expose) API dalam tiga bentuk:

1.  **REST API (Internal & Management):**
    *   Seni bina standard menggunakan JSON.
    *   Digunakan untuk konfigurasi, menukar parameter risiko, menarik laporan sejarah, dan *Audit Trail*.
    *   *Dokumentasi:* Swagger / OpenAPI.
2.  **WebSockets (WSS):**
    *   Saluran dua hala (bidirectional) yang berterusan.
    *   Digunakan untuk menyalurkan *Live PnL*, *Live Market State*, dan *Execution Alerts* ke UI (Frontend Dashboard) tanpa me-refresh halaman.
3.  **gRPC / Internal HTTP (Microservices):**
    *   Untuk komunikasi pantas antara *Node.js Core Backend* dan *Python AI Engine*.

**Keselamatan (Security Layer):**
*   Semua titik akhir (endpoints) mesti dilindungi dengan **JWT Authentication** dan **Role-Based Access Control (RBAC)**.
*   Broker API Keys mesti dienkripsi (AES-256) di dalam pangkalan data dan tidak pernah didedahkan melalui API respons.

---

### 6. Development Roadmap (Incremental Implementation)

Pembangunan akan mengikut fasa yang ketat. Tiada fasa akan dimulakan sebelum fasa sebelumnya lulus ujian unit (Unit Testing).

1.  **Tahap 1: System Foundation (Selesai Spesifikasi)** - Setup Repository, Boilerplate, Drizzle ORM Setup, Winston/Pino Logger, Global Error Handler.
2.  **Tahap 2: Phase B (Market Data Layer)** - Sambungan WebSocket ke Broker (Mock/Demo), penyimpanan TimescaleDB. *Test: Kebolehan menyimpan 10,000 tick/saat tanpa bottleneck.*
3.  **Tahap 3: Phase C (Intelligence Layer)** - Skrip pengiraan indikator, pengesan rejim. *Test: Pengesahan ketepatan keadaan pasaran.*
4.  **Tahap 4: Phase D (Decision Layer)** - Logik Multi-Agent, Bayesian Updater. *Test: Logik keputusan pada data sejarah.*
5.  **Tahap 5: Phase E (Risk Layer)** - Logik *Position Sizing*, Korelasi. *Test: Simulasi circuit breaker.*
6.  **Tahap 6: Phase F (Execution Layer)** - Sambungan ke Broker untuk hantar pesanan. *Test: Pengendalian slippage dan error recovery.*
7.  **Tahap 7: Phase G & H (Learning & Monitoring)** - Frontend React, Dashboard, Post-Trade Analysis.

---
**Status:** Phase A Architecture Specification - **APPROVED & READY FOR FOUNDATION CODE**
