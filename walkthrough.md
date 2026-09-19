# Aliran Sambungan Akaun cTrader (Connection Wizard) Telah Ditetapkan Mengikut Urutan Yang Betul

## 1. Ringkasan Perubahan
Memastikan modul **Aliran Sambungan Akaun cTrader (Connection Wizard)** pada Tab 5 (`CTraderBrokerConnectionHub.tsx`) dan Modal Panduan Pengguna Baharu (`CommercialOnboardingModal.tsx`) mematuhi aliran urutan (flow) langkah-demi-langkah yang betul:

### Aliran Urutan Langkah (Sequential Flow):
1. **Langkah 1: Mod & Pelayan (Mod Sambungan & Pemilihan Broker)**
   - Pengguna memilih kaedah sambungan: *cTrader Open API Direct*, *cTrader FIX API 4.4*, atau *1-Click Spotware ID SSO*.
   - Memilih broker rakan kongsi (Spotware Cloud, Pepperstone, IC Markets, FxPro, Fondex, Tradeview).
   - Memilih persekitaran (*DEMO* vs *REAL LIVE*).
   - Menekan butang **"Seterusnya: Masukkan Kelayakan Akaun ➔"** untuk beralih ke Langkah 2.

2. **Langkah 2: Kelayakan & Ujian Sambungan (Live Socket Verification)**
   - Memasukkan Nombor Akaun cTrader & CTID (atau menggunakan Auto-Fill Pintar daripada salinan FIX API).
   - Menekan butang **"Sahkan & Uji Sambungan Soket cTrader"**.
   - Sistem membuat pengesahan TLS Socket dan protokol ProtoOA 2101/2103 ke gerbang cTrader secara langsung.
   - Apabila disahkan, baki sebenar disegerak dan sistem **secara automatik beralih ke Langkah 3**.

3. **Langkah 3: Had Risiko & Kawalan Modal (Non-Custodial Safety)**
   - Menetapkan Had Kerugian Harian Maksimum (USD) & Had Saiz Lot Maksimum.
   - Jaminan 100% Non-Custodial (dana kekal selamat di broker, tiada akses pengeluaran).
   - Menekan butang **"Simpan Konfigurasi & Aktifkan Akaun"**.
   - Sistem mendaftarkan akaun ke dalam perkhidmatan multi-client copier dan **secara automatik beralih ke Langkah 4**.

4. **Langkah 4: Selesai & Aktif (Hubungan Sedia Digunakan)**
   - Paparan kad hijau kejayaan dengan nombor akaun pelanggan, baki sebenar, latency ping soket, dan 6 isyarat keselamatan.
   - Butang navigasi terus ke:
     - **1. Portal VIP Saya (Personal Cockpit)**
     - **2. Buka Meja Dagangan AI (Terminal Analisis SMC)**
     - **3. Statistik & Prestasi (Rekod Lejar Disahkan)**
   - Pilihan butang "Ubah Konfigurasi / Sambung Akaun Lain" sekiranya pengguna ingin mengkonfigurasi semula dari Langkah 1.

---

## 2. Pengesahan & Ujian
- [x] Tiada lagi data Master bocor sebagai nilai lalai akaun pelanggan baharu.
- [x] Urutan navigasi Stepper di atas disegerakkan dengan status aktif/selesai.
- [x] `npm run build` berjaya dikompilasi 100% tanpa sebarang ralat.
- [x] Pelayan `server.ts` aktif dan beroperasi dengan latency rendah.
