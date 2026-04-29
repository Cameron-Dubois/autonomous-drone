import {
  CRTP_MAX_PAYLOAD,
  crtpHeaderByte,
  decodeCrtpDatagram,
  encodeCrtpDatagram,
} from "../src/litewing/crtp";

function toHex(u8: Uint8Array): string {
  return Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("");
}

describe("CRTP wire format", () => {
  it("crtpHeaderByte matches Bitcraze layout (port high nibble, channel low nibble)", () => {
    expect(crtpHeaderByte(3, 0)).toBe(0x30);
    expect(crtpHeaderByte(0xf, 0x3)).toBe(0xf3);
    expect(crtpHeaderByte(0, 0)).toBe(0x00);
  });

  it("encodes and decodes round-trip with empty payload", () => {
    const d = encodeCrtpDatagram(2, 1, new Uint8Array(0));
    expect(d.length).toBe(2);
    const r = decodeCrtpDatagram(d);
    expect(r.port).toBe(2);
    expect(r.channel).toBe(1);
    expect(r.payload.length).toBe(0);
  });

  it("rejects payload over CRTP_MAX_PAYLOAD", () => {
    const tooBig = new Uint8Array(CRTP_MAX_PAYLOAD + 1);
    expect(() => encodeCrtpDatagram(0, 0, tooBig)).toThrow(/exceeds/);
  });

  it("fails decode on bad checksum", () => {
    const d = encodeCrtpDatagram(1, 0, new Uint8Array([0xab]));
    d[d.length - 1] = (d[d.length - 1]! + 1) & 0xff;
    expect(() => decodeCrtpDatagram(d)).toThrow(/checksum/);
  });

  /**
   * Golden from esp-drone issue: commander-style bytes, header 0x3C, payload 5 bytes,
   * checksum 0xAA. Confirms (sum of first 6 bytes) % 256 = last byte.
   */
  it("matches ESP-Drone style commander golden (0x3c00…204e, cksum 0xaa)", () => {
    const golden = new Uint8Array([0x3c, 0x00, 0x00, 0x00, 0x20, 0x4e, 0xaa]);
    const r = decodeCrtpDatagram(golden);
    expect(r.port).toBe(3);
    expect(r.channel).toBe(0x0c);
    expect(toHex(r.payload)).toBe("000000204e");
    const again = encodeCrtpDatagram(r.port, r.channel, r.payload);
    expect(toHex(again)).toBe(toHex(golden));
  });

  it("port 3 channel 0 standard commander: roll/pitch/yaw/thrust pattern matches checksum", () => {
    const payload = new Uint8Array([0, 0, 0, 0x20, 0x4e]);
    const d = encodeCrtpDatagram(3, 0, payload);
    // header 0x30 + 00+00+00+20+4e => sum = 0x9e
    expect(d).toEqual(new Uint8Array([0x30, 0, 0, 0, 0x20, 0x4e, 0x9e]));
    decodeCrtpDatagram(d);
  });
});
