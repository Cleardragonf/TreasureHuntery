import sharp from 'sharp';
import pixelmatch from 'pixelmatch';
export function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; // meters
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
export async function imageSimilarity(referencePath, uploadedPath) {
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
