import { useEffect, useState } from "react";
import { BrowserProvider, Contract, Network } from "ethers";
import { CONFIG } from "./config.ts"

declare global {
    interface Window {
        ethereum?: any;
    }
}

const FACTORY_ADDRESS = CONFIG.FACTORY_ADDRESS;

const FACTORY_ABI = [
    "function owner() view returns (address)",
];

export default function App() {
    const [hasMetaMask, setHasMetaMask] = useState(false);
    const [account, setAccount] = useState<string>("");
    const [chainId, setChainId] = useState<string>("");
    const [status, setStatus] = useState<string>("");

    const [factoryOwner, setFactoryOwner] = useState<string>("");

    useEffect(() => {
        setHasMetaMask(Boolean(window.ethereum));
    }, []);

    async function ensureSepolia() {
        await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
        });
    }

    async function connect() {
        if (!window.ethereum) {
            setStatus("MetaMask not detected.");
            return;
        }

        try {
            setStatus("Switching to Sepolia…");

            try {
                await ensureSepolia();
            } catch (switchErr: any) {
                // 4902 = chain not added to MetaMask
                if (switchErr?.code === 4902) {
                    setStatus("Adding Sepolia…");
                    await window.ethereum.request({
                        method: "wallet_addEthereumChain",
                        params: [
                            {
                                chainId: "0xaa36a7",
                                chainName: "Sepolia",
                                nativeCurrency: { name: "SepoliaETH", symbol: "ETH", decimals: 18 },
                                rpcUrls: ["https://rpc.sepolia.org"],
                                blockExplorerUrls: ["https://sepolia.etherscan.io"],
                            },
                        ],
                    });
                    await ensureSepolia();
                } else {
                    throw switchErr;
                }
            }

            setStatus("Connecting…");
            const provider = new BrowserProvider(window.ethereum);
            const accounts: string[] = await provider.send("eth_requestAccounts", []);
            const network = await provider.getNetwork();

            setAccount(accounts[0] ?? "");
            setChainId(network.chainId.toString());
            setStatus("Connected to Sepolia.");
        } catch (err: any) {
            setStatus(err?.shortMessage ?? err?.message ?? "Connection failed.");
        }
    }

    async function readFactoryOwner() {
        if (!window.ethereum) return setStatus("MetaMask not detected.");
        if (!account) return setStatus("Connect MetaMask first.");

        try {
            setStatus("Reading contract…");
            const provider = new BrowserProvider(window.ethereum);
            const code = await provider.getCode(FACTORY_ADDRESS);
            console.log(code)
            const factory = new Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
            const owner: string = await factory.owner();
            console.log(owner);
            setFactoryOwner(owner);
            setStatus("Read success.");
        } catch (err: any) {
            setStatus(err?.shortMessage ?? err?.message ?? "Read failed.");
        }
    }

    return (
        <div style={{ padding: 16 }}>
            <h1>Consensus (DApp)</h1>

            {!hasMetaMask && <p>MetaMask not found.</p>}

            {hasMetaMask && !account && (
                <button onClick={connect}>Connect MetaMask</button>
            )}

            {account && (
                <>
                    <p><b>Account:</b> {account}</p>
                    <p><b>Chain ID:</b> {chainId}</p>

                    <button onClick={readFactoryOwner}>Read Factory Owner</button>

                    {factoryOwner && (
                        <p><b>Factory owner:</b> {factoryOwner}</p>
                    )}
                </>
            )}

            {status && <p>{status}</p>}
        </div>
    );
}
