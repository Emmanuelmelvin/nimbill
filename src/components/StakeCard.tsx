"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { getNimiq, inNimiqPay, nimExplorerTx, walletErrorMessage } from "@/lib/client/nimiq";
import { useSession } from "@/lib/client/session";
import { LUNA_PER_NIM } from "@/lib/currencies";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Loader, OpenInNimiqPay, RadioCard, TextLink, labelStyles } from "./ui";

type Validator = { name: string; address: string; fee: number; payoutType: string; logo?: string };
type Staker = { delegation: string; balance: number } | null;

const MIN_STAKE_NIM = 100; // protocol minimum for a staker's balance

/** "Put your earnings to work": stake received NIM with a staking pool in one tap. */
export function StakeCard({ suggestedLuna, title = "Put your NIM to work" }: { suggestedLuna: number; title?: string }) {
  const { merchant } = useSession();
  const [open, setOpen] = useState(false);
  const [validators, setValidators] = useState<Validator[] | null>(null);
  const [staker, setStaker] = useState<Staker | undefined>(undefined);
  const [balance, setBalance] = useState<number | null>(null);
  const [choice, setChoice] = useState<string>("");
  const [amount, setAmount] = useState(() => String(Math.floor(suggestedLuna / LUNA_PER_NIM)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !merchant) return;
    let alive = true;
    api<{ validators: Validator[] }>("/api/validators")
      .then((r) => {
        if (!alive) return;
        setValidators(r.validators);
        setChoice((c) => c || r.validators[0]?.address || "");
      })
      .catch((e) => alive && setError(e.message));
    api<{ staker: Staker }>("/api/staker")
      .then((r) => alive && setStaker(r.staker))
      .catch(() => alive && setStaker(null));
    getNimiq()
      .then(async (n) => {
        if (typeof n.getBalance !== "function") return;
        const b = await n.getBalance(merchant.address);
        if (!alive) return;
        setBalance(b);
        // Never suggest more than the wallet holds (leave a little for fees).
        const max = Math.floor(Math.max(0, b - 1000) / LUNA_PER_NIM);
        setAmount((a) => String(Math.min(Number(a) || max, max)));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, merchant]);

  if (!merchant) return null;

  const isStaker = !!staker && staker.balance > 0;
  const nim = Number(amount);
  const existing = isStaker ? staker!.balance / LUNA_PER_NIM : 0;
  const tooSmall = !(nim > 0) || (!isStaker && nim < MIN_STAKE_NIM);
  const tooBig = balance !== null && nim * LUNA_PER_NIM > balance;
  const currentPool = isStaker
    ? validators?.find((v) => v.address.replace(/\s/g, "") === staker!.delegation.replace(/\s/g, ""))
    : undefined;

  async function stake() {
    setBusy(true);
    setError(null);
    try {
      const nimiq = await getNimiq();
      const value = Math.round(nim * LUNA_PER_NIM);
      const h = isStaker
        ? await nimiq.sendStakeTransaction({ value })
        : await nimiq.sendNewStakerTransaction({ delegation: choice, value });
      setHash(h);
    } catch (e) {
      setError(walletErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card tone="strong">
      <CardHeader
        icon="%"
        title={title}
        description="Stake your NIM earnings with a staking pool and earn rewards. Your NIM stays in your wallet's control."
      />

      {!open && (
        <Button block className="mt-4" onClick={() => setOpen(true)}>
          Stake my earnings
        </Button>
      )}

      {open && !inNimiqPay() && (
        <div className="mt-4">
          <OpenInNimiqPay text="Staking happens in your Nimiq Pay wallet." />
        </div>
      )}

      {open && inNimiqPay() && !hash && (
        <div className="mt-4 space-y-4">
          {(!validators || staker === undefined) && !error && <Loader compact />}

          {validators && staker !== undefined && (
            <>
              {isStaker ? (
                <Alert>
                  You already stake {existing.toLocaleString()} NIM{currentPool ? ` with ${currentPool.name}` : ""}. This adds to it.
                </Alert>
              ) : (
                <fieldset>
                  <legend className={labelStyles()}>Choose a staking pool</legend>
                  <div className="space-y-2">
                    {validators.slice(0, 4).map((v, i) => (
                      <RadioCard key={v.address} name="pool" checked={choice === v.address} onChange={() => setChoice(v.address)}>
                        {v.logo && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={v.logo} alt="" width={28} height={28} className="h-7 w-7 grayscale" />
                        )}
                        <span className="flex-1">
                          <span className="flex flex-wrap items-center gap-2 font-medium">
                            {v.name} {i === 0 && <Badge variant="solid">Top rated</Badge>}
                          </span>
                          <span className="block text-xs text-muted">
                            {(v.fee * 100).toFixed(v.fee * 100 < 1 ? 1 : 0)}% pool fee ·{" "}
                            {v.payoutType === "restake" ? "rewards auto-compound" : "rewards paid to wallet"}
                          </span>
                        </span>
                      </RadioCard>
                    ))}
                  </div>
                </fieldset>
              )}

              <Field
                label="Amount (NIM)"
                htmlFor="stake-amount"
                hint={
                  <>
                    {balance !== null && (
                      <>Available: {(balance / LUNA_PER_NIM).toLocaleString(undefined, { maximumFractionDigits: 2 })} NIM · </>
                    )}
                    {!isStaker && <>Minimum {MIN_STAKE_NIM} NIM</>}
                  </>
                }
              >
                <Input
                  id="stake-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                />
              </Field>

              {tooBig && <Alert kind="warn">That&apos;s more than your wallet holds.</Alert>}
              {!isStaker && nim > 0 && nim < MIN_STAKE_NIM && (
                <Alert kind="warn">Staking starts at {MIN_STAKE_NIM} NIM. Keep invoicing — you&apos;ll get there!</Alert>
              )}

              <Button block loading={busy} disabled={tooSmall || tooBig || (!isStaker && !choice)} onClick={stake}>
                Stake {nim > 0 ? nim.toLocaleString() : ""} NIM
              </Button>
              <p className="text-center text-xs text-muted">
                You can unstake any time from Nimiq Pay; unstaked NIM unlocks after a short waiting period.
              </p>
            </>
          )}
          {error && <Alert kind="error">{error}</Alert>}
        </div>
      )}

      {hash && (
        <div className="mt-4 space-y-2">
          <Alert kind="success">Staked! Your NIM is now earning rewards.</Alert>
          <p className="text-center text-sm">
            <TextLink href={nimExplorerTx(hash)} external muted>
              View transaction
            </TextLink>
          </p>
        </div>
      )}
    </Card>
  );
}
