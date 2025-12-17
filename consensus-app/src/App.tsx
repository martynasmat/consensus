import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { BrowserProvider, Contract, formatEther } from "ethers";
import { CONFIG } from "./config.ts";
import { MarketFactoryABI } from "./abi/MarketFactory.ts";
import { PredictionMarketABI } from "./abi/PredictionMarket.ts";
import "./App.css";

declare global {
    interface Window {
        ethereum?: any;
    }
}

const FACTORY_ADDRESS = CONFIG.FACTORY_ADDRESS;

type MarketSummary = {
    market: string;
    question: string;
    questionId: string;
    closeTime: number;
    resolver: string;
    outcome: number;
    totalYes: string;
    totalNo: string;
};

const OUTCOME_LABEL: Record<number, string> = {
    0: "Unresolved",
    1: "Yes",
    2: "No",
};

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
    const [markets, setMarkets] = useState<MarketSummary[]>([]);
    const [loadingMarkets, setLoadingMarkets] = useState(false);
    const [marketsError, setMarketsError] = useState("");

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

    const loadMarkets = useCallback(async () => {
        if (!window.ethereum) {
            setMarkets([]);
            setMarketsError("MetaMask not detected.");
            return;
        }

        try {
            setLoadingMarkets(true);
            setMarketsError("");

            const provider = new BrowserProvider(window.ethereum);
            const factory = new Contract(FACTORY_ADDRESS, MarketFactoryABI, provider);
            const count = Number(await factory.marketsCount());
            if (!Number.isFinite(count) || count < 1) {
                setMarkets([]);
                return;
            }

            const indices = Array.from({ length: count }, (_, i) => i);
            const marketAddresses: string[] = await Promise.all(
                indices.map((idx) => factory.markets(idx))
            );

            const summaries: MarketSummary[] = await Promise.all(
                marketAddresses.map(async (marketAddr) => {
            const marketContract = new Contract(
                marketAddr,
                PredictionMarketABI,
                provider
            );
            const [
                questionId,
                question,
                closeTime,
                resolver,
                outcome,
                totalYes,
                totalNo,
            ] = await Promise.all([
                marketContract.questionId(),
                marketContract.question(),
                marketContract.closeTime(),
                marketContract.resolver(),
                marketContract.outcome(),
                marketContract.totalYes(),
                marketContract.totalNo(),
            ]);

            return {
                market: marketAddr,
                question,
                questionId: questionId.toString(),
                closeTime: Number(closeTime),
                resolver,
                outcome: Number(outcome),
                totalYes: formatEther(totalYes),
                totalNo: formatEther(totalNo),
            };
        })
    );

            setMarkets(summaries);
        } catch (err: any) {
            setMarketsError(
                err?.shortMessage ?? err?.message ?? "Failed to fetch markets."
            );
            setMarkets([]);
        } finally {
            setLoadingMarkets(false);
        }
    }, []);

    useEffect(() => {
        if (!hasMetaMask) return;
        void loadMarkets();
    }, [hasMetaMask, loadMarkets]);

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
            setStatus("Confirm the createMarket transaction in MetaMask…");
            const provider = new BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const factory = new Contract(FACTORY_ADDRESS, MarketFactoryABI, signer);
            const tx = await factory.createMarket(
                trimmedQuestion,
                closeTimeSeconds,
                resolverInput
            );
            setStatus(
                `Transaction sent. Waiting for confirmation… (hash: ${tx.hash})`
            );
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
            await loadMarkets();
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

            <div style={{ marginTop: 32, padding: 12, border: "1px solid #ccc", borderRadius: 8 }}>
                <h2>Existing Markets</h2>
                {!hasMetaMask && <p>Connect MetaMask to load markets.</p>}

                {hasMetaMask && (
                    <>
                        <button
                            onClick={() => {
                                void loadMarkets();
                            }}
                            disabled={loadingMarkets}
                            style={{ marginBottom: 12 }}
                        >
                            {loadingMarkets ? "Refreshing…" : "Refresh Markets"}
                        </button>

                        {marketsError && (
                            <p style={{ color: "#a00" }}>{marketsError}</p>
                        )}

                        {!marketsError && !loadingMarkets && markets.length === 0 && (
                            <p>No markets deployed yet.</p>
                        )}

                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            {markets.map((mkt) => (
                                <div
                                    key={mkt.market}
                                    style={{
                                        border: "1px solid #eee",
                                        borderRadius: 8,
                                        padding: 12,
                                    }}
                                >
                                    <p>
                                        <b>Question:</b> {mkt.question}
                                    </p>
                                    <p>
                                        <b>Market:</b>{" "}
                                        <a
                                            href={sepoliaEtherscanAddress(mkt.market)}
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            {mkt.market}
                                        </a>
                                    </p>
                                    <p>
                                        <b>Question ID:</b> {mkt.questionId}
                                    </p>
                                    <p>
                                        <b>Resolver:</b>{" "}
                                        <a
                                            href={sepoliaEtherscanAddress(mkt.resolver)}
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            {mkt.resolver}
                                        </a>
                                    </p>
                                    <p>
                                        <b>Close Time:</b>{" "}
                                        {mkt.closeTime
                                            ? new Date(mkt.closeTime * 1000).toLocaleString()
                                            : "Unknown"}
                                    </p>
                                    <p>
                                        <b>Outcome:</b>{" "}
                                        {OUTCOME_LABEL[mkt.outcome] ?? "Unknown"}
                                    </p>
                                    <p>
                                        <b>Total YES:</b> {mkt.totalYes} ETH
                                    </p>
                                    <p>
                                        <b>Total NO:</b> {mkt.totalNo} ETH
                                    </p>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
