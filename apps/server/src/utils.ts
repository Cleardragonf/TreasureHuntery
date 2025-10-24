import sharp from 'sharp';
import pixelmatch from 'pixelmatch';

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function imageSimilarity(referencePath: string, uploadedPath: string): Promise<number> {
  const size = 256; // normalize size
  const [refPng, upPng] = await Promise.all([
    sharp(referencePath).resize(size, size, { fit: 'cover' }).ensureAlpha().png().toBuffer(),
    sharp(uploadedPath).resize(size, size, { fit: 'cover' }).ensureAlpha().png().toBuffer()
  ]);

  const { data: refRaw } = await sharp(refPng).raw().toBuffer({ resolveWithObject: true });
  const { data: upRaw } = await sharp(upPng).raw().toBuffer({ resolveWithObject: true });

  const width = size;
  const height = size;
  const bytesPerPixel = 4;
  const diff = Buffer.alloc(width * height * bytesPerPixel);
  const mismatch = pixelmatch(refRaw, upRaw, diff, width, height, { threshold: 0.1 });
  const total = width * height;
  const similarity = 1 - mismatch / total;
  return similarity; // 0..1, higher is more similar
}

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

export function textSimilarity(a: string, b: string): number {
  const A = normalizeText(a);
  const B = normalizeText(b);
  if (!A && !B) return 1;
  const dist = levenshtein(A, B);
  const maxLen = Math.max(A.length, B.length) || 1;
  return 1 - dist / maxLen; // 0..1
}
