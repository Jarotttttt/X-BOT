import test from "node:test";
import assert from "node:assert/strict";

import { createAnnexBAccessUnitParser } from "../src/features/voip/annexb.js";

const bytes = (...values) => Uint8Array.from(values);
const aud = bytes(0, 0, 0, 1, 9, 0xf0);
const idr = bytes(0, 0, 0, 1, 0x65, 0x88);
const pframe = bytes(0, 0, 1, 0x41, 0x99);
const concat = (...parts) => Uint8Array.from(parts.flatMap((part) => [...part]));

test("Annex-B parser groups NALs on AUD boundaries and flushes the last unit", () => {
  const units = [];
  const parser = createAnnexBAccessUnitParser((unit) => units.push(unit));
  parser.push(concat(aud, idr, aud, pframe));
  parser.flush();

  assert.deepEqual(units, [concat(aud, idr), concat(aud, pframe)]);
});

test("Annex-B parser handles start codes split across chunks", () => {
  const units = [];
  const parser = createAnnexBAccessUnitParser((unit) => units.push(unit));
  const stream = concat(aud, idr, aud, pframe);
  parser.push(stream.slice(0, 4));
  parser.push(stream.slice(4, 11));
  parser.push(stream.slice(11));
  parser.flush();

  assert.deepEqual(units, [concat(aud, idr), concat(aud, pframe)]);
});
