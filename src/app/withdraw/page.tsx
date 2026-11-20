"use client";
import { useState } from "react";
import { TabPage } from "@/components/TabPage";
import { SegmentedControl } from "@/components/ui";
import { CryptoWithdraw } from "@/components/withdraw/CryptoWithdraw";
import { FiatWithdraw } from "@/components/withdraw/FiatWithdraw";

type Tab = "crypto" | "fiat";

export default function Withdraw() {
  const [tab, setTab] = useState<Tab>("crypto");
  return (
    <TabPage title="Withdraw" description="Payments land in your own wallet, so your NIM and USDT are already yours to move.">
      <div className="space-y-4">
        <SegmentedControl<Tab>
          label="Withdraw to"
          block
          value={tab}
          onChange={setTab}
          options={[
            { value: "crypto", label: "Crypto" },
            { value: "fiat", label: "Bank and mobile money (soon)" },
          ]}
        />
        {tab === "crypto" ? <CryptoWithdraw /> : <FiatWithdraw />}
      </div>
    </TabPage>
  );
}
