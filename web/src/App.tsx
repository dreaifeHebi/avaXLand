import { useState } from "react";
import { Route, Routes } from "react-router-dom";
import { MintDialog } from "./components/MintDialog";
import { Rail, TabBar, TopBar } from "./components/Nav";
import { FlowTicker, SideFoot, StatsCard, TopEarners } from "./components/Sidebar";
import { Toasts } from "./components/Toasts";
import { useMyAccount } from "./lib/account";
import { useSocket } from "./lib/ws";
import { AccountPage } from "./pages/Account";
import { FeedPage } from "./pages/Feed";
import { LeaderboardPage } from "./pages/Leaderboard";
import { PulsePage } from "./pages/Pulse";
import { ThreadPage } from "./pages/Thread";

export default function App() {
  const [mintOpen, setMintOpen] = useState(false);
  const { accounts } = useMyAccount();
  useSocket(accounts.map((a) => a.id));
  const openMint = () => setMintOpen(true);
  return (
    <>
      <TopBar onOpenAccount={openMint} />
      <div className="shell">
        <Rail onOpenAccount={openMint} />
        <main className="col">
          <Routes>
            <Route path="/" element={<FeedPage />} />
            <Route path="/n/:id" element={<ThreadPage />} />
            <Route path="/a/:id" element={<AccountPage />} />
            <Route path="/rank" element={<LeaderboardPage />} />
            <Route path="/pulse" element={<PulsePage />} />
          </Routes>
        </main>
        <aside className="right">
          <StatsCard />
          <FlowTicker />
          <TopEarners />
          <SideFoot />
        </aside>
      </div>
      <TabBar />
      {mintOpen && <MintDialog onClose={() => setMintOpen(false)} />}
      <Toasts />
    </>
  );
}
