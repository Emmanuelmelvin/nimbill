// The Nimbill number (NMN): a short code a merchant can send instead of the invoice link.
// The client types or pastes it into NimBill to open and pay the invoice.
//
// It is the invoice id, written to be read and typed: "k7m2p9qx4z" <-> "NMN-K7M2P-9QX4Z".
// Nothing extra is stored, every invoice (old ones too) has one, and it is exactly as hard to
// guess as the link.

const ID = /^[2-9a-hjkmnp-z]{10}$/; // newId()'s alphabet: no 0, 1, i, l or o

export function nimbillNumber(invoiceId: string): string {
  const s = invoiceId.toUpperCase();
  return `NMN-${s.slice(0, 5)}-${s.slice(5)}`;
}

/**
 * The invoice id for whatever the client pasted, or null if it can't be a Nimbill number.
 * Forgiving on purpose: any case, with or without "NMN", dashes or spaces, and text around it
 * ("Pay NMN-K7M2P-9QX4Z please"). A pasted invoice link works too.
 */
export function parseNimbillNumber(input: string): string | null {
  const text = input.trim();
  const link = text.match(/\/i\/([a-z0-9]{10})(?![a-z0-9])/i);
  if (link && ID.test(link[1].toLowerCase())) return link[1].toLowerCase();

  const tagged = text.match(/NMN[\s\-–—:#]*((?:[a-z0-9][\s\-–—]*){10})(?![a-z0-9])/i);
  const body = (tagged ? tagged[1] : text).replace(/[\s\-–—]/g, "").toLowerCase();
  return ID.test(body) ? body : null;
}
