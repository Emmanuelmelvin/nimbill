import { Badge, Card, CardHeader, Eyebrow, Header, LinkButton, LogoMark, PageTitle } from "@/components/ui";

// Cheques aren't built yet. This page says what they will be, so the Cheque and Cash buttons on
// the home screen lead somewhere useful. The money design (a throwaway wallet that only the cheque
// link can open, so NimBill never holds funds) still has to be proven before anything ships.

const WRITE = [
  ["Pick an amount", "In your currency or NIM, with an optional note and who it's for."],
  ["Fund it", "The NIM moves from your wallet into the cheque, so it can't bounce."],
  ["Hand it over", "Send the link, or show the QR code in person."],
  ["Change your mind", "Cancel any time before it's cashed and the NIM comes back. Uncashed cheques return to you when they expire."],
] as const;

const CASH = [
  ["Open the link", "Or scan the QR code. You see who wrote it, the amount and the note."],
  ["Cash it", "One tap in Nimiq Pay moves the NIM to your wallet."],
  ["Done", "The writer sees it was cashed. A cheque can be cashed only once."],
] as const;

const WHY = [
  ["✦", "Gifts and red envelopes", "Send money to someone who doesn't have NimBill yet. They cash it when they're ready."],
  ["→", "Pay later, promise now", "Write the cheque today, hand it over at the meeting, the event or the finish line."],
  ["◎", "In person, no typing", "Show a QR code. No address to copy, no tag to spell."],
] as const;

export default function Cheques() {
  return (
    <>
      <Header back="/" />
      <div className="mb-5 flex items-start justify-between gap-3">
        <PageTitle
          className="mb-0"
          title="Cheques"
          description="Money you can hand to anyone as a link. Fully funded, so it never bounces."
        />
        <Badge variant="muted" className="mt-1">
          Coming soon
        </Badge>
      </div>

      <div className="space-y-6">
        <ChequePicture />

        <section aria-labelledby="write" className="space-y-3">
          <Eyebrow>01 / Write a cheque</Eyebrow>
          <h2 id="write" className="text-xl font-bold">
            Like writing a cheque, but the money is already inside.
          </h2>
          <Steps steps={WRITE} />
        </section>

        <section id="cash" aria-labelledby="cash-title" className="scroll-mt-20 space-y-3">
          <Eyebrow>02 / Cash a cheque</Eyebrow>
          <h2 id="cash-title" className="text-xl font-bold">
            Got a cheque link? Cashing takes one tap.
          </h2>
          <Steps steps={CASH} />
        </section>

        <section aria-labelledby="why" className="space-y-3">
          <Eyebrow>03 / Why cheques</Eyebrow>
          <h2 id="why" className="text-xl font-bold">
            For the payments that don&apos;t fit an invoice.
          </h2>
          <div className="grid gap-3">
            {WHY.map(([icon, title, text]) => (
              <Card key={title} padding="sm">
                <CardHeader
                  icon={<span className="text-base">{icon}</span>}
                  title={<span className="text-base">{title}</span>}
                  description={text}
                />
              </Card>
            ))}
          </div>
        </section>

        <Card tone="subtle">
          <CardHeader
            title="Why it isn't here yet"
            description="NimBill never holds anyone's money, and cheques must keep that promise. The plan is for each cheque to be its own small wallet that only the cheque link can open. We're testing that it's safe before switching it on."
          />
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <LinkButton href="/send" variant="secondary" block>
            Send by tag
          </LinkButton>
          <LinkButton href="/" block>
            Back home
          </LinkButton>
        </div>
      </div>
    </>
  );
}

function Steps({ steps }: { steps: readonly (readonly [string, string])[] }) {
  return (
    <ol className="divide-y divide-line border border-ink">
      {steps.map(([title, text], i) => (
        <li key={title} className="flex gap-4 p-4">
          <span className="font-mono text-sm font-bold">{String(i + 1).padStart(2, "0")}</span>
          <div>
            <p className="font-semibold">{title}</p>
            <p className="text-sm text-muted">{text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** An example cheque, drawn the NimBill way: black and white, sharp, with a torn edge. */
function ChequePicture() {
  return (
    <figure aria-label="Example cheque: pay to the order of Ada Studio, 5,000 Naira, for the logo deposit" className="relative">
      <div aria-hidden className="absolute inset-0 translate-x-2 translate-y-2 border border-ink bg-subtle" />
      <div aria-hidden className="relative border border-ink bg-paper p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 border-b border-dashed border-edge pb-3">
          <span className="flex items-center gap-2">
            <LogoMark size={20} />
            <span className="font-bold tracking-tighter">NimBill cheque</span>
          </span>
          <span className="font-mono text-[10px] tracking-wider text-muted">NO. CHQ-0007 · EXAMPLE</span>
        </div>
        <div className="mt-4 grid grid-cols-[1fr_auto] items-end gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] tracking-wider text-muted uppercase">Pay to the order of</p>
            <p className="mt-1 truncate border-b border-ink pb-1 font-semibold">Ada Studio · ada@nimbill</p>
          </div>
          <div className="border-2 border-ink px-3 py-1.5 text-right">
            <p className="font-mono text-[10px] tracking-wider text-muted uppercase">Amount</p>
            <p className="font-mono text-lg font-bold tabular-nums">₦5,000</p>
          </div>
        </div>
        <p className="mt-3 border-b border-line pb-1 text-sm italic">Five thousand naira only · ≈ 15,700 NIM</p>
        <div className="mt-4 grid grid-cols-2 items-end gap-4">
          <div>
            <p className="font-mono text-[10px] tracking-wider text-muted uppercase">For</p>
            <p className="text-sm">Logo deposit</p>
          </div>
          <div className="text-right">
            <p className="border-b border-ink pb-0.5 font-serif text-lg italic">Tunde B.</p>
            <p className="mt-1 font-mono text-[10px] tracking-wider text-muted uppercase">Signed in Nimiq Pay</p>
          </div>
        </div>
        <p className="mt-4 flex items-center justify-between font-mono text-[10px] tracking-[0.2em] text-muted">
          <span>⑆ NQ42 8K3M ⑆ 0007 ⑈</span>
          <span className="border border-ink px-1.5 py-0.5 text-ink">FUNDED</span>
        </p>
      </div>
    </figure>
  );
}
