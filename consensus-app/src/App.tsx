import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { BrowserProvider, Contract, id } from "ethers";
import { CONFIG } from "./config.ts";
import { MarketFactoryABI } from "./abi/MarketFactory.ts";
import "./App.css";

declare global {
    interface Window {
        ethereum?: any;
    }
}

const FACTORY_ADDRESS = CONFIG.FACTORY_ADDRESS;

export default function App() {
    const [hasMetaMask, setHasMetaMask] = useState(false);
    const [account, setAccount] = useState<string>("");
    const [chainId, setChainId] = useState<string>("");
    const [status, setStatus] = useState<string>("");

    const [factoryOwner, setFactoryOwner] = useState<string>("");
    const [checkingCreator, setCheckingCreator] = useState(false);
    const [isApprovedCreator, setIsApprovedCreator] = useState<boolean | null>(null);
    const [creatingMarket, setCreatingMarket] = useState(false);
    const [questionInput, setQuestionInput] = useState("");
    const [closeTimeInput, setCloseTimeInput] = useState("");
    const [resolverInput, setResolverInput] = useState("");

    useEffect(() => {
        setHasMetaMask(Boolean(window.ethereum));
    }, []);

    async function ensureSepolia() {
        await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0xaa36a7" }],
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

    useEffect(() => {
        if (!window.ethereum) {
            setIsApprovedCreator(null);
            return;
        }

        if (!account) {
            setIsApprovedCreator(null);
            return;
        }

        let cancelled = false;

        (async () => {
            try {
                setCheckingCreator(true);
                setStatus("Checking creator approval…");
                const provider = new BrowserProvider(window.ethereum);
                const factory = new Contract(FACTORY_ADDRESS, MarketFactoryABI, provider);
                const approved: boolean = await factory.approvedCreator(account);
                if (!cancelled) {
                    setIsApprovedCreator(approved);
                    setStatus(
                        approved ? "Creator is approved." : "Creator is not approved."
                    );
                }
            } catch (err: any) {
                if (!cancelled) {
                    setIsApprovedCreator(null);
                    setStatus(
                        err?.shortMessage ?? err?.message ?? "Failed to check creator."
                    );
                }
            } finally {
                if (!cancelled) {
                    setCheckingCreator(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [account]);

    const sepoliaEtherscanAddress = (addr: string) =>
        `https://sepolia.etherscan.io/address/${addr}`;

    async function readFactoryOwner() {
        if (!window.ethereum) return setStatus("MetaMask not detected.");
        if (!account) return setStatus("Connect MetaMask first.");

        try {
            setStatus("Reading contract…");
            const provider = new BrowserProvider(window.ethereum);
            const factory = new Contract(FACTORY_ADDRESS, MarketFactoryABI, provider);
            const owner: string = await factory.owner();
            setFactoryOwner(owner);
            setStatus("Read success.");
        } catch (err: any) {
            setStatus(err?.shortMessage ?? err?.message ?? "Read failed.");
        }
    }

    async function handleCreateMarket(event?: FormEvent<HTMLFormElement>) {
        event?.preventDefault();

        if (!window.ethereum) return setStatus("MetaMask not detected.");
        if (!account) return setStatus("Connect MetaMask first.");

        const trimmedQuestion = questionInput.trim();
        if (!trimmedQuestion) return setStatus("Enter a question for the market.");
        if (!closeTimeInput) return setStatus("Select a closing time.");
        if (!resolverInput) return setStatus("Enter resolver address.");

        const closeTimeSeconds = Math.floor(new Date(closeTimeInput).getTime() / 1000);
        if (!Number.isFinite(closeTimeSeconds)) {
            return setStatus("Invalid closing time.");
        }
        const nowSeconds = Math.floor(Date.now() / 1000);
        if (closeTimeSeconds <= nowSeconds) {
            return setStatus("Closing time must be in the future.");
        }

        try {
            setCreatingMarket(true);
            setStatus("Submitting createMarket transaction…");
            const provider = new BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const factory = new Contract(FACTORY_ADDRESS, MarketFactoryABI, signer);
            const questionId = id(trimmedQuestion);

            const tx = await factory.createMarket(
                questionId,
                closeTimeSeconds,
                resolverInput
            );
            setStatus("Waiting for transaction confirmation…");
            const receipt = await tx.wait();

            let createdAddress = "";
            for (const log of receipt?.logs ?? []) {
                try {
                    const parsed = factory.interface.parseLog({
                        topics: log.topics,
                        data: log.data,
                    });
                    if (parsed?.name === "MarketCreated") {
                        createdAddress = parsed.args?.market;
                        break;
                    }
                } catch {
                    // ignore unrelated events
                }
            }

            if (createdAddress) {
                setStatus(
                    `Market created at ${createdAddress}. View on Etherscan: ${sepoliaEtherscanAddress(
                        createdAddress
                    )}`
                );
            } else {
                setStatus(`Market created. Tx hash: ${receipt?.hash ?? tx.hash}`);
            }

            setQuestionInput("");
            setCloseTimeInput("");
            setResolverInput("");
        } catch (err: any) {
            setStatus(err?.shortMessage ?? err?.message ?? "createMarket failed.");
        } finally {
            setCreatingMarket(false);
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
                    <p>
                        <b>Account:</b>{" "}
                        <a
                            href={sepoliaEtherscanAddress(account)}
                            target="_blank"
                            rel="noreferrer"
                        >
                            {account}
                        </a>
                    </p>

                    <p><b>Chain ID:</b> {chainId}</p>

                    <button onClick={readFactoryOwner}>Read Factory Owner</button>

                    {factoryOwner && (
                        <p>
                            <b>Factory owner:</b>{" "}
                            <a
                                href={sepoliaEtherscanAddress(factoryOwner)}
                                target="_blank"
                                rel="noreferrer"
                            >
                                {factoryOwner}
                            </a>
                        </p>
                    )}
                    <div style={{ marginTop: 24, padding: 12, border: "1px solid #ccc", borderRadius: 8 }}>
                        <h2>Create Market</h2>
                        <p>
                            Creator approval:{" "}
                            {checkingCreator
                                ? "Checking…"
                                : isApprovedCreator
                                ? "Approved"
                                : "Not approved"}
                        </p>

                        {isApprovedCreator ? (
                            <form
                                onSubmit={handleCreateMarket}
                                style={{ display: "flex", flexDirection: "column", gap: 12 }}
                            >
                                <label>
                                    Question
                                    <input
                                        type="text"
                                        value={questionInput}
                                        onChange={(e) => setQuestionInput(e.target.value)}
                                        placeholder="Will ETH be above $3k by June?"
                                        style={{ width: "100%", padding: 8, marginTop: 4 }}
                                    />
                                </label>

                                <label>
                                    Close Time
                                    <input
                                        type="datetime-local"
                                        value={closeTimeInput}
                                        onChange={(e) => setCloseTimeInput(e.target.value)}
                                        style={{ width: "100%", padding: 8, marginTop: 4 }}
                                    />
                                </label>

                                <label>
                                    Resolver Address
                                    <input
                                        type="text"
                                        value={resolverInput}
                                        onChange={(e) => setResolverInput(e.target.value)}
                                        placeholder="0xabc..."
                                        style={{ width: "100%", padding: 8, marginTop: 4 }}
                                    />
                                </label>

                                <button
                                    type="submit"
                                    disabled={creatingMarket}
                                    style={{ padding: "8px 12px" }}
                                >
                                    {creatingMarket ? "Creating…" : "Create Market"}
                                </button>
                            </form>
                        ) : (
                            <p style={{ color: "#a00" }}>
                                Only approved creators can open new markets.
                            </p>
                        )}
                    </div>
                </>
            )}


            {status && <p>{status}</p>}
        </div>
    );
}
