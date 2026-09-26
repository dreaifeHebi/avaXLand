import { useState } from "react";
import { Route, Routes } from "react-router-dom";
import { Header } from "./components/Header";
import { MintDialog } from "./components/MintDialog";
import { FlowTicker, StatsCard, TopEarners } from "./components/Sidebar";
import { Toasts } from "./components/Toasts";
import { useMyAccount } from "./lib/account";
import { useSocket } from "./lib/ws";
import { AccountPage } from "./pages/Account";
import { FeedPage } from "./pages/Feed";
import { LeaderboardPage } from "./pages/Leaderboard";
import { ThreadPage } from "./pages/Thread";

export default function App() {
  const [mintOpen, setMintOpen] = useState(false);
  const { accounts } = useMyAccount();
  useSocket(accounts.map((a) => a.id));
  return (
    <>
      <Header onOpenAccount={() => setMintOpen(true)} />
      <div className="layout">
        <main className="main">
          <Routes>
            <Route path="/" element={<FeedPage />} />
            <Route path="/n/:id" element={<ThreadPage />} />
            <Route path="/a/:id" element={<AccountPage />} />
            <Route path="/rank" element={<LeaderboardPage />} />
          </Routes>
        </main>
        <aside className="side">
          <StatsCard />
          <FlowTicker />
          <TopEarners />
        </aside>
      </div>
      {mintOpen && <MintDialog onClose={() => setMintOpen(false)} />}
      <Toasts />
    </>
  );
}
