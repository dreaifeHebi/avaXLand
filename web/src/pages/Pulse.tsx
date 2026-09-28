import { PageHead } from "../components/PageHead";
import { FlowTicker, StatsCard, TopEarners } from "../components/Sidebar";

/** 窄屏没有右栏，把右栏的三块内容放成单独一页 */
export function PulsePage() {
  return (
    <>
      <PageHead title="资金流" sub="钱正在怎么流动" />
      <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
        <StatsCard />
        <FlowTicker limit={30} />
        <TopEarners />
      </div>
    </>
  );
}
