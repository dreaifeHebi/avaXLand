import type { Address, Hex, TypedDataDomain } from "viem";

/** EIP-3009 ReceiveWithAuthorization 的字段定义，与 USDC 合约的 typehash 一致 */
export const RECEIVE_WITH_AUTHORIZATION_TYPES = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export interface UsdcDomain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Address;
}

export interface AuthorizationMessage {
  from: Address;
  to: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
}

/** 组出可直接交给 wagmi signTypedData / viem signTypedData / recoverTypedDataAddress 的对象 */
export function receiveWithAuthorizationTypedData(domain: UsdcDomain, message: AuthorizationMessage) {
  return {
    domain: domain satisfies TypedDataDomain,
    types: RECEIVE_WITH_AUTHORIZATION_TYPES,
    primaryType: "ReceiveWithAuthorization",
    message,
  } as const;
}
