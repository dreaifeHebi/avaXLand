import { useI18n } from "../lib/i18n";
import { PageHead } from "../components/PageHead";
import { FlowTicker, StatsCard, TopEarners } from "../components/Sidebar";

/** 窄屏没有右栏，把右栏的三块内容放成单独一页 */
export function PulsePage() {
  const { t } = useI18n();
  return (
    <>
      <PageHead title={t("nav.flows")} sub={t("flow.subtitle")} />
      <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
        <StatsCard />
        <FlowTicker limit={30} />
        <TopEarners />
      </div>
    </>
  );
}
