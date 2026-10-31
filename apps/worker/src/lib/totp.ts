import { timingSafeEqual } from "./cryptoUtils";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const v = BASE32.indexOf(ch);
    if (v < 0) throw new Error("Invalid base32");
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** RFC 6238: HMAC-SHA1, 30-second step. Digits as in authenticator apps (6 by default). */
export async function totpCode(secret: Uint8Array, unixSeconds: number, digits = 6): Promise<string> {
  const counter = Math.floor(unixSeconds / 30);
  const msg = new Uint8Array(8);
  new DataView(msg.buffer).setUint32(0, Math.floor(counter / 2 ** 32));
  new DataView(msg.buffer).setUint32(4, counter % 2 ** 32);
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const offset = mac[mac.length - 1]! & 15;
  const bin = new DataView(mac.buffer, offset, 4).getUint32(0) & 0x7fffffff;
  return String(bin % 10 ** digits).padStart(digits, "0");
}

/** Accepts the current step and one on either side, for clock drift. */
export async function verifyTotp(
  base32Secret: string,
  code: string | undefined,
  nowMs = Date.now()
): Promise<boolean> {
  const given = (code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(given)) return false;
  const secret = base32Decode(base32Secret);
  const now = Math.floor(nowMs / 1000);
  let ok = false;
  for (const drift of [-30, 0, 30]) {
    if (timingSafeEqual(await totpCode(secret, now + drift), given)) ok = true;
  }
  return ok;
}
