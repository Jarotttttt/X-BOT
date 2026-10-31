import test from "node:test";
import assert from "node:assert/strict";
import {
  extractIdentityPair,
  saveOrUpdateContact,
  getContactByJid,
  formatContact,
} from "../src/storage/contacts.js";

test("extractIdentityPair parses LID and PN from message key", () => {
  const key1 = {
    participant: "85848460677159@lid",
    participantAlt: "6281234567890:0@s.whatsapp.net",
  };
  const pair1 = extractIdentityPair(key1);
  assert.equal(pair1.lidJid, "85848460677159@lid");
  assert.equal(pair1.pnJid, "6281234567890@s.whatsapp.net");

  const key2 = {
    remoteJid: "6289999999999@s.whatsapp.net",
    remoteJidAlt: "99999999999999@lid",
  };
  const pair2 = extractIdentityPair(key2);
  assert.equal(pair2.lidJid, "99999999999999@lid");
  assert.equal(pair2.pnJid, "6289999999999@s.whatsapp.net");

  assert.deepEqual(extractIdentityPair(null), { lidJid: null, pnJid: null });
});

test("saveOrUpdateContact saves and retrieves contact data", () => {
  const lidJid = "11122233344455@lid";
  const pnJid = "628111222333@s.whatsapp.net";

  const saved = saveOrUpdateContact({
    lidJid,
    pnJid,
    pushName: "Budi Santoso",
  });

  assert.ok(saved);
  assert.equal(saved.push_name, "Budi Santoso");

  // Lookup by LID
  const byLid = getContactByJid(lidJid);
  assert.equal(byLid?.pn_jid, pnJid);
  assert.equal(byLid?.push_name, "Budi Santoso");

  // Lookup by PN
  const byPn = getContactByJid(pnJid);
  assert.equal(byPn?.lid_jid, lidJid);

  // Formatting contact
  const formatted = formatContact(lidJid);
  assert.equal(formatted, "+628111222333 (Budi Santoso)");

  // Formatting unknown
  assert.equal(formatContact("12345678@s.whatsapp.net"), "+12345678");
});
