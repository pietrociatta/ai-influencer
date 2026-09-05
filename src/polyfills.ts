/**
 * x-client-transaction-id pulls in @std/encoding, which calls
 * ArrayBuffer.prototype.transfer — missing on Node 20.
 * Must be imported before any x-client-transaction-id usage.
 */
const proto = ArrayBuffer.prototype as ArrayBuffer & {
  transfer?: (newLength?: number) => ArrayBuffer
}
if (typeof proto.transfer !== "function") {
  proto.transfer = function transfer(
    this: ArrayBuffer,
    newLength = this.byteLength,
  ): ArrayBuffer {
    const src = new Uint8Array(this)
    const buf = new ArrayBuffer(newLength)
    new Uint8Array(buf).set(src.subarray(0, Math.min(src.byteLength, newLength)))
    return buf
  }
}
