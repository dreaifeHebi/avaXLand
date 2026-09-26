import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { api, type MyAccount } from "./api";

interface AccountCtx {
  accounts: MyAccount[];
  current: MyAccount | null;
  select(id: number): void;
  refetch(): Promise<unknown>;
  loading: boolean;
}

const Ctx = createContext<AccountCtx>({ accounts: [], current: null, select: () => {}, refetch: async () => {}, loading: false });

/** 当前钱包名下的账号（一个钱包可以持有多个账号 NFT），以及选中的那个 */
export function AccountProvider({ children }: { children: ReactNode }) {
  const { address } = useAccount();
  const q = useQuery({
    queryKey: ["myAccounts", address],
    queryFn: () => api.accountsByOwner(address!),
    enabled: !!address,
    refetchInterval: 6000,
  });
  const key = address ? `avaxland:account:${address.toLowerCase()}` : null;
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    if (!key) return setSelected(null);
    const saved = Number(localStorage.getItem(key));
    setSelected(saved || null);
  }, [key]);

  useEffect(() => {
    const items = q.data?.items;
    if (!items) return;
    if (selected === null || !items.some((i) => i.id === selected)) setSelected(items[0]?.id ?? null);
  }, [q.data, selected]);

  const select = useCallback(
    (id: number) => {
      setSelected(id);
      if (key) localStorage.setItem(key, String(id));
    },
    [key],
  );

  const value = useMemo<AccountCtx>(
    () => ({
      accounts: q.data?.items ?? [],
      current: q.data?.items.find((i) => i.id === selected) ?? null,
      select,
      refetch: q.refetch,
      loading: q.isLoading,
    }),
    [q.data, selected, select, q.refetch, q.isLoading],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useMyAccount = () => useContext(Ctx);
