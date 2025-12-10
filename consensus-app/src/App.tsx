import { useEffect, useState } from "react";
import { BrowserProvider } from "ethers";

declare global {
    interface Window {
        ethereum?: any;
    }
}

export default function App() {
    const [hasMetaMask, setHasMetaMask] = useState(false);
    const [account, setAccount] = useState<string>("");
    const [chainId, setChainId] = useState<string>("");
    const [status, setStatus] = useState<string>("");

    useEffect(() => {
        setHasMetaMask(Boolean(window.ethereum));
    }, []);

    async function connect() {
        if (!window.ethereum) {
            setStatus("MetaMask not detected.");
            return;
        }

        try {
            setStatus("Connecting…");
            const provider = new BrowserProvider(window.ethereum);

            const accounts: string[] = await provider.send("eth_requestAccounts", []);
            const network = await provider.getNetwork();

            setAccount(accounts[0] ?? "");
            setChainId(network.chainId.toString());
            setStatus("Connected.");
        } catch (err: any) {
            setStatus(err?.message ?? "User rejected or connection failed.");
        }
    }

    return (
        <div>
            <h1>Consensus</h1>

            {!hasMetaMask && (
                <p>
                    MetaMask not found. Install it to continue.
                </p>
            )}

            {hasMetaMask && !account && (
                <button onClick={connect}>Connect MetaMask</button>
            )}

            {account && (
                <>
                    <p><b>Account:</b> {account}</p>
                </>
            )}

            {status && <p>{status}</p>}
        </div>
    );
}
