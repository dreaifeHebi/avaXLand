import { usdcAbi } from "@avaxland/protocol";
import { useAccount, useReadContract } from "wagmi";
import { avalancheFuji } from "wagmi/chains";
import { useConfig } from "./useConfig";

/** Circle 官方的测试币水龙头：不用登录，每个地址每 2 小时可以领 20 USDC，网络选 Avalanche Fuji */
export const USDC_FAUCET = "https://faucet.circle.com/";
/** 只有把收益提现到钱包时才需要 AVAX 付手续费 */
export const AVAX_FAUCET = "https://build.avax.network/console/primary-network/faucet";

/** 水龙头只对测试网有意义：本地链的测试币是脚本发的 */
export function useOnTestnet(): boolean {
  return useConfig().data?.chainId === avalancheFuji.id;
}

/** 当前钱包里的 USDC（最小单位）；没连钱包或者还没读到时是 undefined */
export function useUsdcBalance(): bigint | undefined {
  const cfg = useConfig();
  const { address } = useAccount();
  const q = useReadContract({
    address: cfg.data?.addresses.usdc,
    abi: usdcAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: cfg.data?.chainId as 43113 | 31337 | undefined,
    query: { enabled: !!address && !!cfg.data, refetchInterval: 15_000 },
  });
  return q.data;
}
