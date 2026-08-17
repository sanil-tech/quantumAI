# TASK 8B-P7 — EVIDENCE AUDIT

## 1. Test File Exists
VERIFIED: `tests/scanner-paper-crash-recovery.test.ts` was created and contains the exact simulation model requested.


## 2. Test Execution
VERIFIED: Task `2202` (`npx vitest run tests/scanner-paper-crash-recovery.test.ts`) passed (1 test, 94ms duration).


## 3. Crash Injection
VERIFIED: Line 42 of the test uses `vi.spyOn(check, 'closePositionTransaction')` and throws `Error('SIMULATED CRASH: Process exited before commit')` to simulate the pre-commit failure before any local mutation occurs.


## 4. Restart Boundary
VERIFIED: Line 62 explicitly creates a `new TradingRepository()` instance (`REPOB`$�Ѽ�����ɔ������Ё�хє��ͽ��ѥ�����ɥ���ɕ��ٕ��ͥ�ձ�ѥ���(((���Ը�������є�ٕ�ЁI�����)YI%%�1�����āɕ�ɥ�́����͕A�ͥѥ��QɅ�ͅ�ѥ����ݥѠ�����͕Aɥ���ĸ�����������ɕ���镑Aɽ���������������ɕ��	����ɽ٥����Ё�́����ɕ��(((���ظ�A90��	��������5��ɥ�̰�����%���ѥ��)YI%%�Q���ѕ�Ё�������ѱ䁅�͕��́������A����ɕ���镑Aɽ��Ё��̀�����������Ѐ��䤰�����ɥ�̹ѽх�QɅ��̀������ݥ��չр��ɔ��ᅍѱ䁁��͕�������ŀ���������ͥѥ��%���͕���%����ɔ�չ��������(((���ܸ�������є�I�܁�չ�)YI%%�Q���ѕ�Ё�ᕍ�ѕ́�M1P�=U9P������ȁ��Ʌ䁙��ѕɥ���������͕��́���չЀ���ŀ�(((���ก�QɅ��ȁM�����)YI%%�Q���ɕ�ɕ�ͥ����եє�����Ց������Ʌ��ȵ��������ɕ�������ѕ�й�̀�ݡ������͕��́�%`����������������ـ��ɔ���������������I}=91e}5=}9=I���́��ѥٔ�((((���丁ձ��I��ɕ�ͥ���Mեѕ�)YI%%�Q�ͬ�����倁���͕�������ȁѕ�Ё�եѕ́�����ԁѕ��̰���Ʌѥ���и��̸((((�������Aɽ�Սѥ���	ե��)YI%%�Q�ͬ�����ـ�������ո��ե��������͕���٥є��ե�������ĸ��̰���Ё��������(