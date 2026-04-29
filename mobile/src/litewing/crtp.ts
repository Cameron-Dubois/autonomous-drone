/**
 * CRTP wire format for Wi‑Fi/UDP to ESP-Drone family firmware (e.g. LiteWing).
 * UDP datagram: [ header | payload... | checksum ]
 * Checksum: sum of all header + payload bytes, modulo 256 (ESP-Drone comms doc).
 *
 * @see https://espressif-docs.readthedocs-hosted.com/projects/espressif-esp-drone/en/latest/communication.html
 * @see mobile/docs/litewing-pairing.md
 */

/** Match Crazyflie on-wire payload cap (header not included). */
export const CRTP_MAX_PAYLOAD = 30;

/**
 * Bitcraze-style CRTP first byte: high nibble = port, low nibble = channel.
 * Port 0..15, channel 0..15.
 */
export function crtpHeaderByte(port: number, channel: number): number {
  return (((port & 0x0f) << 4) | (channel & 0x0f)) & 0xff;
}

function sumBytes(bytes: Uint8Array): number {
  let s = 0;
  for (let i = 0; i < bytes.length; i++) s = (s + bytes[i]!) & 0xff;
  return s;
}

/**
 * Build one UDP datagram: header + payload + 1 checksum byte (8‑bit sum of header+payload).
 */
export function encodeCrtpDatagram(port: number, channel: number, payload: Uint8Array): Uint8Array {
  if (payload.length > CRTP_MAX_PAYLOAD) {
    throw new Error(`CRTP payload exceeds ${CRTP_MAX_PAYLOAD} bytes`);
  }
  const header = crtpHeaderByte(port, channel);
  const body = new Uint8Array(1 + payload.length);
  body[0] = header;
  body.set(payload, 1);
  const cksum = sumBytes(body);
  const out = new Uint8Array(body.length + 1);
  out.set(body, 0);
  out[body.length] = cksum;
  return out;
}

export type DecodedCrtp = {
  port: number;
  channel: number;
  payload: Uint8Array;
};

/**
 * Parse and verify checksum. Fails on short buffers or bad checksum.
 */
export function decodeCrtpDatagram(dgram: Uint8Array): DecodedCrtp {
  if (dgram.length < 2) {
    throw new Error("CRTP datagram too short");
  }
  const cksum = dgram[dgram.length - 1]!;
  const body = dgram.subarray(0, dgram.length - 1);
  if (sumBytes(body) !== cksum) {
    throw new Error("CRTP checksum mismatch");
  }
  const header = body[0]!;
  const port = (header >> 4) & 0x0f;
  const channel = header & 0x0f;
  const payload = body.subarray(1);
  return { port, channel, payload };
}
