/**
 * Unit tests for the zero-dependency WebSocket protocol implementation.
 *
 * Tests the WebSocket frame encoding/decoding, handshake computation,
 * and protocol-level behavior independent of the HTTP server.
 *
 * The module under test exports:
 *   - computeAcceptKey(clientKey) -> string
 *   - encodeFrame(opcode, payload) -> Buffer
 *   - decodeFrame(buffer) -> { opcode, payload, bytesConsumed } | null
 *   - OPCODES: { TEXT, CLOSE, PING, PONG }
 */

const crypto = require('crypto');
const path = require('path');

const SERVER_PATH = path.join(__dirname, '../../skills/brainstorming/scripts/server.cjs');
let ws;

try {
  ws = require(SERVER_PATH);
} catch (e) {
  console.error(`Cannot load ${SERVER_PATH}: ${e.message}`);
  console.error('This is expected if running tests before implementation.');
  process.exit(1);
}

function makeClientFrame(opcode, payload, fin = true) {
  const buf = Buffer.from(payload);
  const mask = crypto.randomBytes(4);
  const masked = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    masked[i] = buf[i] ^ mask[i % 4];
  }

  let header;
  const finBit = fin ? 0x80 : 0x00;
  if (buf.length < 126) {
    header = Buffer.alloc(6);
    header[0] = finBit | opcode;
    header[1] = 0x80 | buf.length;
    mask.copy(header, 2);
  } else if (buf.length < 65536) {
    header = Buffer.alloc(8);
    header[0] = finBit | opcode;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(buf.length, 2);
    mask.copy(header, 4);
  } else {
    header = Buffer.alloc(14);
    header[0] = finBit | opcode;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(buf.length), 2);
    mask.copy(header, 10);
  }

  return Buffer.concat([header, masked]);
}

describe('WebSocket Protocol', () => {

  describe('Handshake', () => {
    it('computeAcceptKey produces correct RFC 6455 accept value', () => {
      const clientKey = 'dGhlIHNhbXBsZSBub25jZQ==';
      const expected = 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=';
      expect(ws.computeAcceptKey(clientKey)).toBe(expected);
    });

    it('computeAcceptKey produces valid base64 for random keys', () => {
      for (let i = 0; i < 10; i++) {
        const randomKey = crypto.randomBytes(16).toString('base64');
        const result = ws.computeAcceptKey(randomKey);
        expect(Buffer.from(result, 'base64').toString('base64')).toBe(result);
        expect(result.length).toBe(28);
      }
    });
  });

  describe('Frame Encoding (server -> client)', () => {
    it('encodes small text frame (< 126 bytes)', () => {
      const payload = 'Hello';
      const frame = ws.encodeFrame(ws.OPCODES.TEXT, Buffer.from(payload));
      expect(frame[0]).toBe(0x81);
      expect(frame[1]).toBe(5);
      expect(frame.slice(2).toString()).toBe('Hello');
      expect(frame.length).toBe(7);
    });

    it('encodes empty text frame', () => {
      const frame = ws.encodeFrame(ws.OPCODES.TEXT, Buffer.alloc(0));
      expect(frame[0]).toBe(0x81);
      expect(frame[1]).toBe(0);
      expect(frame.length).toBe(2);
    });

    it('encodes medium text frame (126-65535 bytes)', () => {
      const payload = Buffer.alloc(200, 0x41);
      const frame = ws.encodeFrame(ws.OPCODES.TEXT, payload);
      expect(frame[0]).toBe(0x81);
      expect(frame[1]).toBe(126);
      expect(frame.readUInt16BE(2)).toBe(200);
      expect(frame.slice(4).toString()).toBe(payload.toString());
      expect(frame.length).toBe(204);
    });

    it('encodes frame at exactly 126 bytes (boundary)', () => {
      const payload = Buffer.alloc(126, 0x42);
      const frame = ws.encodeFrame(ws.OPCODES.TEXT, payload);
      expect(frame[1]).toBe(126);
      expect(frame.readUInt16BE(2)).toBe(126);
      expect(frame.length).toBe(130);
    });

    it('encodes frame at exactly 125 bytes (max small)', () => {
      const payload = Buffer.alloc(125, 0x43);
      const frame = ws.encodeFrame(ws.OPCODES.TEXT, payload);
      expect(frame[1]).toBe(125);
      expect(frame.length).toBe(127);
    });

    it('encodes large frame (> 65535 bytes)', () => {
      const payload = Buffer.alloc(70000, 0x44);
      const frame = ws.encodeFrame(ws.OPCODES.TEXT, payload);
      expect(frame[0]).toBe(0x81);
      expect(frame[1]).toBe(127);
      const len = Number(frame.readBigUInt64BE(2));
      expect(len).toBe(70000);
      expect(frame.length).toBe(10 + 70000);
    });

    it('encodes close frame', () => {
      const frame = ws.encodeFrame(ws.OPCODES.CLOSE, Buffer.alloc(0));
      expect(frame[0]).toBe(0x88);
      expect(frame[1]).toBe(0);
    });

    it('encodes pong frame with payload', () => {
      const payload = Buffer.from('ping-data');
      const frame = ws.encodeFrame(ws.OPCODES.PONG, payload);
      expect(frame[0]).toBe(0x8A);
      expect(frame[1]).toBe(payload.length);
      expect(frame.slice(2).toString()).toBe('ping-data');
    });

    it('server frames are never masked (per RFC 6455)', () => {
      const frame = ws.encodeFrame(ws.OPCODES.TEXT, Buffer.from('test'));
      expect(frame[1] & 0x80).toBe(0);
    });
  });

  describe('Frame Decoding (client -> server)', () => {
    it('decodes small masked text frame', () => {
      const frame = makeClientFrame(0x01, 'Hello');
      const result = ws.decodeFrame(frame);
      expect(result).toBeTruthy();
      expect(result.opcode).toBe(ws.OPCODES.TEXT);
      expect(result.payload.toString()).toBe('Hello');
      expect(result.bytesConsumed).toBe(frame.length);
    });

    it('decodes empty masked text frame', () => {
      const frame = makeClientFrame(0x01, '');
      const result = ws.decodeFrame(frame);
      expect(result).toBeTruthy();
      expect(result.opcode).toBe(ws.OPCODES.TEXT);
      expect(result.payload.length).toBe(0);
    });

    it('decodes medium masked text frame (126-65535 bytes)', () => {
      const payload = 'A'.repeat(200);
      const frame = makeClientFrame(0x01, payload);
      const result = ws.decodeFrame(frame);
      expect(result).toBeTruthy();
      expect(result.payload.toString()).toBe(payload);
    });

    it('decodes large masked text frame (> 65535 bytes)', () => {
      const payload = 'B'.repeat(70000);
      const frame = makeClientFrame(0x01, payload);
      const result = ws.decodeFrame(frame);
      expect(result).toBeTruthy();
      expect(result.payload.length).toBe(70000);
      expect(result.payload.toString()).toBe(payload);
    });

    it('decodes masked close frame', () => {
      const frame = makeClientFrame(0x08, '');
      const result = ws.decodeFrame(frame);
      expect(result).toBeTruthy();
      expect(result.opcode).toBe(ws.OPCODES.CLOSE);
    });

    it('decodes masked ping frame', () => {
      const frame = makeClientFrame(0x09, 'ping!');
      const result = ws.decodeFrame(frame);
      expect(result).toBeTruthy();
      expect(result.opcode).toBe(ws.OPCODES.PING);
      expect(result.payload.toString()).toBe('ping!');
    });

    it('returns null for incomplete frame (not enough header bytes)', () => {
      const result = ws.decodeFrame(Buffer.from([0x81]));
      expect(result).toBeNull();
    });

    it('returns null for incomplete frame (header ok, payload truncated)', () => {
      const frame = makeClientFrame(0x01, 'Hello World');
      const truncated = frame.slice(0, frame.length - 3);
      const result = ws.decodeFrame(truncated);
      expect(result).toBeNull();
    });

    it('returns null for incomplete extended-length header', () => {
      const buf = Buffer.alloc(3);
      buf[0] = 0x81;
      buf[1] = 0x80 | 126;
      const result = ws.decodeFrame(buf);
      expect(result).toBeNull();
    });

    it('rejects unmasked client frame', () => {
      const buf = Buffer.alloc(7);
      buf[0] = 0x81;
      buf[1] = 5;
      Buffer.from('Hello').copy(buf, 2);
      expect(() => ws.decodeFrame(buf)).toThrow(/mask/i);
    });

    it('handles multiple frames in a single buffer', () => {
      const frame1 = makeClientFrame(0x01, 'first');
      const frame2 = makeClientFrame(0x01, 'second');
      const combined = Buffer.concat([frame1, frame2]);

      const result1 = ws.decodeFrame(combined);
      expect(result1).toBeTruthy();
      expect(result1.payload.toString()).toBe('first');
      expect(result1.bytesConsumed).toBe(frame1.length);

      const result2 = ws.decodeFrame(combined.slice(result1.bytesConsumed));
      expect(result2).toBeTruthy();
      expect(result2.payload.toString()).toBe('second');
    });

    it('correctly unmasks with all mask byte values', () => {
      const payload = Buffer.from('ABCDEFGH');
      const frame = makeClientFrame(0x01, payload);
      const result = ws.decodeFrame(frame);
      expect(result).toBeTruthy();
      expect(result.payload.toString()).toBe('ABCDEFGH');
    });

    it('handles fragmented frames (fin=0)', () => {
      const frame1 = makeClientFrame(0x01, 'Hel', false);
      const frame2 = makeClientFrame(0x00, 'lo', true);

      const result1 = ws.decodeFrame(frame1);
      expect(result1).toBeTruthy();
      expect(result1.opcode).toBe(ws.OPCODES.TEXT);
      expect(result1.payload.toString()).toBe('Hel');

      const result2 = ws.decodeFrame(frame2);
      expect(result2).toBeTruthy();
      expect(result2.payload.toString()).toBe('lo');
    });

    it('decodes JSON payload correctly', () => {
      const msg = { type: 'click', choice: 'a', text: 'Option A', timestamp: 1706000101 };
      const frame = makeClientFrame(0x01, JSON.stringify(msg));
      const result = ws.decodeFrame(frame);
      const decoded = JSON.parse(result.payload.toString());
      expect(decoded).toEqual(msg);
    });
  });
});
