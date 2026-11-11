"use client";
import { NimiqProviderError } from "@nimiq/mini-app-sdk";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { getNimiq, inNimiqPay, nimExplorerTx, walletErrorMessage } from "@/lib/client/nimiq";
import { useSession } from "@/lib/client/session";
import { LUNA_PER_NIM } from "@/lib/currencies";
import {
  MIN_STAKE_LUNA,
  MIN_STAKE_NIM,
  type StakingPosition,
  unstakeProblem,
  untilText,
  waitingLuna,
  withdrawableLuna,
} from "@/lib/staking";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  DescriptionList,
  type DescriptionRow,
  Field,
  Input,
  Loader,
  OpenInNimiqPay,
  RadioCard,
  TextButton,
  TextLink,
  labelStyles,
} from "./ui";

type Validator = { name: string; address: string; fee: number; payoutType: string; logo?: string };
type Mode = "summary" | "stake" | "unstake";
type Action = "stake" | "unstake" | "withdraw";

const nimText = (luna: number) => `${(luna / LUNA_PER_NIM).toLocaleString(undefined, { maximumFractionDigits: 2 })} NIM`;
const sameAddress = (a: string, b: string) => a.replace(/\s/g, "") === b.replace(/\s/g, "");
const shortAddress = (a: string) => `${a.slice(0, 9)} … ${a.slice(-4)}`;
const rewardsText = (v: Validator) =>
  `${(v.fee * 100).toFixed(v.fee * 100 < 1 ? 1 : 0)}% pool fee · ${v.payoutType === "restake" ? "rewards auto-compound" : "rewards paid to wallet"}`;

const fetchStaker = async () => (await api<{ staker: StakingPosition | null }>("/api/staker")).staker;

/**
 * Wait until the chain shows what a transaction changed (a block takes about a second; allow 30s).
 * Returns the new position, or undefined if the change did not show up in time.
 */
async function waitForStaker(changed: (s: StakingPosition | null) => boolean): Promise<StakingPosition | null | undefined> {
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    try {
      const s = await fetchStaker();
      if (changed(s)) return s;
    } catch {
      // A failed read is not an answer; try again.
    }
  }
  return undefined;
}

/** Staking for the merchant's NIM: what is staked and where, stake more, unstake, and move unstaked NIM back to the wallet. */
export function StakeCard({ suggestedLuna, title = "Put your NIM to work" }: { suggestedLuna: number; title?: string }) {
  const { merchant } = useSession();
  // undefined: loading, null: not a staker
  const [staker, setStaker] = useState<StakingPosition | null | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const [validators, setValidators] = useState<Validator[] | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("summary");
  const [needsWallet, setNeedsWallet] = useState(false);
  const [choice, setChoice] = useState("");
  const [amount, setAmount] = useState(() => String(Math.floor(suggestedLuna / LUNA_PER_NIM)));
  const [unstakeAmount, setUnstakeAmount] = useState("");
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [poolsError, setPoolsError] = useState(false);
  const [poolsRetry, setPoolsRetry] = useState(0); // bump to load the pool list again
  const [done, setDone] = useState<{ text: string; hash: string } | null>(null);

  const address = merchant?.address;

  const load = useCallback(
    () =>
      fetchStaker()
        .then((s) => {
          setStaker(s);
          setLoadFailed(false);
        })
        .catch(() => setLoadFailed(true)),
    [],
  );

  useEffect(() => {
    if (address) void load();
  }, [address, load]);

  // The pool list names the current pool and fills the picker, so it is needed once the
  // merchant stakes or opens the form.
  const wantValidators = !!address && !validators && (!!staker || mode === "stake");
  useEffect(() => {
    if (!wantValidators) return;
    let alive = true;
    api<{ validators: Validator[] }>("/api/validators")
      .then((r) => {
        if (!alive) return;
        setValidators(r.validators);
        setChoice((c) => c || r.validators[0]?.address || "");
      })
      .catch(() => alive && setPoolsError(true));
    return () => {
      alive = false;
    };
  }, [wantValidators, poolsRetry]);

  const retryPools = () => {
    setPoolsError(false);
    setPoolsRetry((n) => n + 1);
  };

  useEffect(() => {
    if (mode !== "stake" || !address) return;
    let alive = true;
    getNimiq()
      .then(async (n) => {
        if (typeof n.getBalance !== "function") return;
        const b = await n.getBalance(address);
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
  }, [mode, address]);

  if (!merchant) return null;

  const pool = staker ? validators?.find((v) => sameAddress(v.address, staker.delegation)) : undefined;
  const waiting = staker ? waitingLuna(staker) : 0;
  const ready = staker ? withdrawableLuna(staker) : 0;

  // Stake form
  const nim = Number(amount);
  const needsMin = !staker || staker.balance + staker.inactiveBalance < MIN_STAKE_LUNA;
  const tooSmall = !(nim > 0) || (needsMin && nim < MIN_STAKE_NIM);
  const tooBig = balance !== null && nim * LUNA_PER_NIM > balance;

  // Unstake form: typing the full staked amount means "everything", whatever the rounding.
  const typedLuna = Math.round(Number(unstakeAmount) * LUNA_PER_NIM);
  const unstakeLuna = staker && Math.abs(typedLuna - staker.balance) < 1 ? staker.balance : typedLuna;
  const unstakeError = staker ? unstakeProblem(staker, unstakeLuna) : null;

  /** Open a form, or ask for the wallet when the page is not inside Nimiq Pay. */
  function start(next: Mode) {
    setError(null);
    setDone(null);
    if (!inNimiqPay()) return setNeedsWallet(true);
    if (next === "unstake" && staker) setUnstakeAmount(String(staker.balance / LUNA_PER_NIM));
    setMode(next);
  }

  async function run(action: Action, fn: (nimiq: Awaited<ReturnType<typeof getNimiq>>) => Promise<void>) {
    setBusy(action);
    setError(null);
    setDone(null);
    try {
      await fn(await getNimiq());
    } catch (e) {
      // The shared message for a rejected transaction talks about not having enough NIM, which is wrong here.
      const stale = action !== "stake" && NimiqProviderError.is(e) && e.type === "INVALID_TRANSACTION";
      setError(
        stale ? "Nimiq Pay rejected the transaction. Your staking details may have changed. Reload and try again." : walletErrorMessage(e),
      );
    } finally {
      setBusy(null);
    }
  }

  const stake = () =>
    run("stake", async (nimiq) => {
      const value = Math.round(nim * LUNA_PER_NIM);
      const before = staker?.balance ?? 0;
      const hash = staker
        ? await nimiq.sendStakeTransaction({ value })
        : await nimiq.sendNewStakerTransaction({ delegation: choice, value });
      setDone({ text: "Staked! Your NIM is now earning rewards.", hash });
      setMode("summary");
      const next = await waitForStaker((s) => !!s && s.balance > before);
      if (next !== undefined) setStaker(next);
    });

  const unstake = () =>
    run("unstake", async (nimiq) => {
      if (!staker) return;
      const before = staker.inactiveBalance;
      const hash = await nimiq.sendSetActiveStakeTransaction({ newActiveBalance: staker.balance - unstakeLuna });
      setDone({ text: "Unstaking started. When the waiting period ends, come back here to move the NIM to your wallet.", hash });
      setMode("summary");
      const next = await waitForStaker((s) => !!s && s.inactiveBalance > before);
      if (next !== undefined) setStaker(next);
    });

  // Unlocked NIM is first retired, then removed to the wallet: two transactions, two confirmations.
  const withdraw = () =>
    run("withdraw", async (nimiq) => {
      if (!staker) return;
      if (!inNimiqPay()) return setNeedsWallet(true);
      let retired = staker.retiredBalance;
      if (staker.unlocked && staker.inactiveBalance > 0) {
        await nimiq.sendRetireStakeTransaction({ retireStake: staker.inactiveBalance });
        const next = await waitForStaker((s) => !!s && s.retiredBalance > retired);
        if (!next) throw new Error("The first step was sent but is not confirmed yet. Wait a minute, then tap Withdraw again.");
        setStaker(next);
        retired = next.retiredBalance;
      }
      const hash = await nimiq.sendRemoveStakeTransaction({ value: retired });
      setDone({ text: `${nimText(retired)} is on its way back to your wallet.`, hash });
      const next = await waitForStaker((s) => !s || s.retiredBalance < retired);
      if (next !== undefined) setStaker(next);
    });

  const rows: DescriptionRow[] = staker
    ? [
        { term: "Staked", detail: <span className="font-bold tabular-nums">{nimText(staker.balance)}</span> },
        {
          term: "Pool",
          detail: pool ? (
            <>
              {pool.name}
              <span className="block text-xs text-muted">{rewardsText(pool)}</span>
            </>
          ) : (
            <span className="font-mono text-xs">{shortAddress(staker.delegation)}</span>
          ),
        },
        ...(waiting > 0
          ? [
              {
                term: "Unstaking",
                detail: (
                  <>
                    <span className="tabular-nums">{nimText(waiting)}</span>
                    <span className="block text-xs text-muted">
                      {staker.unlocksAt ? `Unlocks ${untilText(staker.unlocksAt)}` : "In the waiting period"}
                    </span>
                  </>
                ),
              },
            ]
          : []),
        ...(ready > 0 ? [{ term: "Unlocked", detail: <span className="tabular-nums">{nimText(ready)} · ready to withdraw</span> }] : []),
      ]
    : [];

  return (
    <Card tone="strong">
      <CardHeader
        icon="%"
        title={staker ? "Your staking" : title}
        description={
          staker
            ? "Staked NIM earns rewards and stays in your wallet's control."
            : "Stake your NIM earnings with a staking pool and earn rewards. Your NIM stays in your wallet's control."
        }
      />

      <div className="mt-4 space-y-4">
        {staker === undefined && !loadFailed && <Loader compact />}
        {loadFailed && (
          <Alert kind="warn">
            We could not load your staking details. <TextButton onClick={() => void load()}>Try again</TextButton>
          </Alert>
        )}

        {done && (
          <Alert kind="success">
            {done.text}{" "}
            <TextLink href={nimExplorerTx(done.hash)} external muted>
              View transaction
            </TextLink>
          </Alert>
        )}

        {staker && mode === "summary" && (
          <>
            <DescriptionList rows={rows} className="text-sm" />
            {ready > 0 && (
              <div className="space-y-1">
                <Button block loading={busy === "withdraw"} disabled={!!busy} onClick={withdraw}>
                  Withdraw {nimText(ready)} to wallet
                </Button>
                {staker.unlocked && staker.inactiveBalance > 0 && (
                  <p className="text-center text-xs text-muted">Nimiq Pay will ask you to confirm twice.</p>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Button variant={ready > 0 ? "secondary" : "primary"} block disabled={!!busy} onClick={() => start("stake")}>
                Stake more
              </Button>
              <Button variant="secondary" block disabled={!!busy || staker.balance <= 0} onClick={() => start("unstake")}>
                Unstake
              </Button>
            </div>
          </>
        )}

        {staker === null && !loadFailed && mode === "summary" && (
          <Button block disabled={!!busy} onClick={() => start("stake")}>
            Stake my earnings
          </Button>
        )}

        {needsWallet && <OpenInNimiqPay text="Staking happens in your Nimiq Pay wallet." />}

        {mode === "stake" && (
          <>
            {!validators && !poolsError && <Loader compact />}
            {!validators && poolsError && (
              <Alert kind="warn">
                We could not load the staking pools. <TextButton onClick={retryPools}>Try again</TextButton> or{" "}
                <TextButton onClick={() => setMode("summary")}>cancel</TextButton>.
              </Alert>
            )}
            {validators && (
              <>
                {staker ? (
                  <Alert>
                    This adds to the {nimText(staker.balance)} you already stake{pool ? ` with ${pool.name}` : ""}.
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
                            <span className="block text-xs text-muted">{rewardsText(v)}</span>
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
                      {balance !== null && <>Available: {nimText(balance)}</>}
                      {balance !== null && needsMin && " · "}
                      {needsMin && <>Minimum {MIN_STAKE_NIM} NIM</>}
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
                {needsMin && nim > 0 && nim < MIN_STAKE_NIM && (
                  <Alert kind="warn">Staking starts at {MIN_STAKE_NIM} NIM. Keep invoicing — you&apos;ll get there!</Alert>
                )}

                <Button block loading={busy === "stake"} disabled={tooSmall || tooBig || (!staker && !choice)} onClick={stake}>
                  Stake {nim > 0 ? nim.toLocaleString() : ""} NIM
                </Button>
                <p className="text-center text-xs text-muted">
                  You can unstake any time; unstaked NIM unlocks after a waiting period.{" "}
                  <TextButton onClick={() => setMode("summary")}>Cancel</TextButton>
                </p>
              </>
            )}
          </>
        )}

        {mode === "unstake" && staker && (
          <>
            <Field label="Amount to unstake (NIM)" htmlFor="unstake-amount" hint={<>Staked: {nimText(staker.balance)}</>}>
              <Input
                id="unstake-amount"
                inputMode="decimal"
                value={unstakeAmount}
                onChange={(e) => setUnstakeAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              />
            </Field>

            {unstakeAmount !== "" && unstakeError && <Alert kind="warn">{unstakeError}</Alert>}
            <Alert>
              Unstaked NIM stops earning rewards and is locked for a waiting period, usually less than a day. After that you can move it to
              your wallet from here.
              {staker.inactiveBalance > 0 &&
                (staker.unlocked ? (
                  <> This also locks the {nimText(staker.inactiveBalance)} you already unlocked again, so withdraw that first.</>
                ) : (
                  <> This also restarts the wait for the {nimText(staker.inactiveBalance)} you are already unstaking.</>
                ))}
            </Alert>

            <Button block loading={busy === "unstake"} disabled={!!unstakeError} onClick={unstake}>
              Unstake {unstakeError ? "" : nimText(unstakeLuna)}
            </Button>
            <p className="text-center text-xs text-muted">
              <TextButton onClick={() => setMode("summary")}>Cancel</TextButton>
            </p>
          </>
        )}

        {error && <Alert kind="error">{error}</Alert>}
      </div>
    </Card>
  );
}
