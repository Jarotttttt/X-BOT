const MAX_ACCESS_UNIT_BYTES = 8 * 1024 * 1024;

function findStartCode(data, from = 0) {
  for (let i = from; i <= data.length - 3; i += 1) {
    if (data[i] === 0 && data[i + 1] === 0) {
      if (data[i + 2] === 1) return { index: i, length: 3 };
      if (data[i + 2] === 0 && data[i + 3] === 1) return { index: i, length: 4 };
    }
  }
  return null;
}

function join(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/** Splits a byte stream with inserted H.264 AUD NALs into VOIP access units. */
export function createAnnexBAccessUnitParser(onAccessUnit) {
  let pending = new Uint8Array();
  let currentUnit = [];
  let currentSize = 0;
  let closed = false;

  const pushNal = (nal) => {
    const start = findStartCode(nal);
    if (!start || start.index + start.length >= nal.length) return;
    const nalType = nal[start.index + start.length] & 0x1f;
    if (nalType === 9 && currentUnit.length > 0) {
      onAccessUnit(join(currentUnit));
      currentUnit = [];
      currentSize = 0;
    }
    currentUnit.push(nal);
    currentSize += nal.length;
    if (currentSize > MAX_ACCESS_UNIT_BYTES) {
      throw new Error("H.264 access unit exceeds 8 MiB limit");
    }
  };

  return {
    push(chunk) {
      if (closed) throw new Error("H.264 parser is already closed");
      pending = join([pending, chunk]);
      let first = findStartCode(pending);
      if (!first) {
        if (pending.length > 4) pending = pending.slice(-3);
        return;
      }
      if (first.index > 0) pending = pending.slice(first.index);
      while (true) {
        const start = findStartCode(pending);
        const next = start && findStartCode(pending, start.index + start.length);
        if (!next) break;
        pushNal(pending.slice(start.index, next.index));
        pending = pending.slice(next.index);
      }
    },
    flush() {
      if (closed) return;
      closed = true;
      const start = findStartCode(pending);
      if (start) pushNal(pending.slice(start.index));
      if (currentUnit.length > 0) onAccessUnit(join(currentUnit));
      pending = new Uint8Array();
      currentUnit = [];
    },
  };
}
