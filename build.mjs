/**
 * wrangler'ın build kancası için sarmalayıcı.
 *
 * Sorun: `wrangler dev` başlarken assets dizinini (.svelte-kit/cloudflare)
 * izlemeye alıyor, aynı anda kancadaki `npm run build` bu dizini silmeye
 * çalışıyor → Windows'ta EPERM. Çözüm: önizlemede derlemeyi kanca dışında
 * yapıp bir işaret bırakmak; kanca taze işaret görürse derlemeyi atlar.
 * `wrangler deploy` işaretsiz çalışır, her zaman derler.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';

const MARK = '.svelte-kit/.prebuilt';
const FRESH_MS = 120_000;
const mode = process.argv[2]; // "pre" → derle ve işaret bırak; yoksa kanca

if (mode !== 'pre' && existsSync(MARK)) {
	const at = Number(readFileSync(MARK, 'utf8'));
	unlinkSync(MARK);
	if (Date.now() - at < FRESH_MS) {
		console.log('build.mjs: taze ön derleme var, kanca derlemeyi atlıyor');
		process.exit(0);
	}
}

// Adapter çıktı dizinini silerken EPERM alıyor: az önce duran workerd / izleyici
// dizini birkaç saniye daha tutuyor. Önce biz deneyerek bekleyelim.
const OUT = '.svelte-kit/cloudflare';
for (let i = 0; i < 20 && existsSync(OUT); i++) {
	try {
		rmSync(OUT, { recursive: true, force: true });
	} catch {
		await new Promise((r) => setTimeout(r, 500));
	}
}
if (existsSync(OUT)) {
	if (mode !== 'pre') {
		// wrangler dev kaynak değişikliğinde kancayı tetikliyor ama dizini kendi tutuyor.
		// Başarısız derleme dev sunucusunu askıda bırakıyor; mevcut paket kalsın,
		// yeni kod için sunucu durdurulup `npm run preview` yeniden çalıştırılır.
		console.warn('build.mjs: çıktı dizini kilitli (wrangler dev açık) — derleme atlandı, eski paket kullanılıyor');
		process.exit(0);
	}
	console.warn('build.mjs: çıktı dizini hâlâ kilitli, derleme deniyor');
}
execSync('npm run build', { stdio: 'inherit' });
if (mode === 'pre') writeFileSync(MARK, String(Date.now()));
