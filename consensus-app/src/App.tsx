import { useCallback, useEffect, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { BrowserProvider, Contract, formatEther, parseEther } from "ethers";
import { useNavigate, useMatch } from "react-router-dom";
import { CONFIG } from "./config.ts";
import { MarketFactoryABI } from "./abi/MarketFactory.ts";
import { PredictionMarketABI } from "./abi/PredictionMarket.ts";
import "./App.css";
import { Header } from "./components/Header";

declare global {
    interface Window {
        ethereum?: any;
    }
}

const FACTORY_ADDRESS = CONFIG.FACTORY_ADDRESS;
type OutcomeSide = "Yes" | "No";

type MarketSummary = {
    market: string;
    question: string;
    questionId: string;
    closeTime: number;
    resolver: string;
    outcome: number;
    totalYes: string;
    totalNo: string;
    feeRecipient: string;
    feesAccrued: string;
};

type MarketTx = {
    hash: string;
    type: "Buy YES" | "Buy NO" | "Resolve" | "Fee Withdrawal" | "Redeem" | "Trade";
    sender: string;
    value: string;
};

type MarketHoldings = {
    yes: string;
    no: string;
    claimed: boolean;
    redeemable: string;
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

    const [isApprovedCreator, setIsApprovedCreator] = useState<boolean | null>(null);
    const [creatingMarket, setCreatingMarket] = useState(false);
    const [questionInput, setQuestionInput] = useState("");
    const [closeTimeInput, setCloseTimeInput] = useState("");
    const [resolverInput, setResolverInput] = useState("");
    const [markets, setMarkets] = useState<MarketSummary[]>([]);
    const [loadingMarkets, setLoadingMarkets] = useState(false);
    const [marketsError, setMarketsError] = useState("");
    const [buyAmounts, setBuyAmounts] = useState<Record<string, string>>({});
    const [marketTransactions, setMarketTransactions] = useState<
        Record<string, MarketTx[]>
    >({});
    const navigate = useNavigate();
    const marketMatch = useMatch("/market/:address");
    const viewedMarketAddress = marketMatch?.params?.address?.toLowerCase();
    const viewedMarket = viewedMarketAddress
        ? markets.find((m) => m.market.toLowerCase() === viewedMarketAddress)
        : null;
    const viewingMarketPage = Boolean(marketMatch);
    const [marketHoldings, setMarketHoldings] = useState<
        Record<string, MarketHoldings>
    >({});
    useEffect(() => {
        if (viewedMarket && window.ethereum) {
            void loadTransactions(viewedMarket.market);
            if (account) {
                void loadHoldings(viewedMarket.market);
            }
        }
    }, [viewedMarket?.market, account]);

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
            return;
        }

        try {
            try {
                await ensureSepolia();
            } catch (switchErr: any) {
                // 4902 = chain not added to MetaMask
                if (switchErr?.code === 4902) {
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

            const provider = new BrowserProvider(window.ethereum);
            const accounts: string[] = await provider.send("eth_requestAccounts", []);
            const network = await provider.getNetwork();

            setAccount(accounts[0] ?? "");
            setChainId(network.chainId.toString());
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
                const provider = new BrowserProvider(window.ethereum);
                const factory = new Contract(FACTORY_ADDRESS, MarketFactoryABI, provider);
                const approved: boolean = await factory.approvedCreator(account);
                if (!cancelled) {
                    setIsApprovedCreator(approved);
                }
            } catch (err: any) {
                if (!cancelled) {
                    setIsApprovedCreator(null);
                    setStatus(
                        err?.shortMessage ?? err?.message ?? "Failed to check creator."
                    );
                }
            } finally {
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [account]);

    const sepoliaEtherscanAddress = (addr: string) =>
        `https://sepolia.etherscan.io/address/${addr}`;


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
                        feeRecipient,
                        feesAccrued,
                    ] = await Promise.all([
                        marketContract.questionId(),
                        marketContract.question(),
                        marketContract.closeTime(),
                        marketContract.resolver(),
                        marketContract.outcome(),
                        marketContract.totalYes(),
                        marketContract.totalNo(),
                        marketContract.feeRecipient(),
                        marketContract.feesAccrued(),
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
                        feeRecipient,
                        feesAccrued: formatEther(feesAccrued),
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

    async function loadTransactions(marketAddress: string) {
        if (!window.ethereum) return;
        try {
            const provider = new BrowserProvider(window.ethereum);
            const dummy = new Contract(marketAddress, PredictionMarketABI);
            const iface = dummy.interface;
            const latestBlock = BigInt(await provider.getBlockNumber());
            const history = await provider.getLogs({
                address: marketAddress,
                fromBlock: latestBlock > 5000n ? latestBlock - 5000n : 0n,
                toBlock: "latest",
            });
            const txs: MarketTx[] = await Promise.all(
                history.slice(-10).map(async (log: any) => {
                    let type: MarketTx["type"] = "Trade";
                    let parsed;
                    try {
                        parsed = iface.parseLog({ topics: log.topics, data: log.data });
                        if (parsed?.name === "Resolved") type = "Resolve";
                        if (parsed?.name === "FeesWithdrawn") type = "Fee Withdrawal";
                        if (parsed?.name === "Redeemed") type = "Redeem";
                        if (parsed?.name === "Staked") {
                            const outcome = Number(
                                parsed.args?.side ?? parsed.args?.outcome ?? 0
                            );
                            if (outcome === 1) type = "Buy YES";
                            if (outcome === 2) type = "Buy NO";
                        }
                    } catch {
                        type = "Trade";
                    }
                    const tx = await provider.getTransaction(log.transactionHash);
                    const value =
                        parsed?.args?.grossAmount?.toString() ??
                        (tx?.value ? tx.value : 0n);
                    return {
                        hash: log.transactionHash,
                        type,
                        sender: tx?.from ?? "0x0",
                        value: formatEther(value),
                    };
                })
            );
            setMarketTransactions((prev) => ({
                ...prev,
                [marketAddress]: txs.reverse(),
            }));
        } catch (err: any) {
            console.error("Failed to fetch transactions", err);
        }
    }

    async function loadHoldings(marketAddress: string) {
        if (!window.ethereum || !account) return;
        try {
            const provider = new BrowserProvider(window.ethereum);
            const contract = new Contract(marketAddress, PredictionMarketABI, provider);
            const [yesStake, noStake, claimed, totalYes, totalNo, outcome] =
                await Promise.all([
                    contract.stakeYes(account),
                    contract.stakeNo(account),
                    contract.claimed(account),
                    contract.totalYes(),
                    contract.totalNo(),
                    contract.outcome(),
                ]);
            const yesFloat = Number(formatEther(yesStake));
            const noFloat = Number(formatEther(noStake));
            const poolYes = Number(formatEther(totalYes));
            const poolNo = Number(formatEther(totalNo));
            const totalPool = poolYes + poolNo;
            let redeemable = 0;
            if (Number(outcome) === 1 && yesFloat > 0 && poolYes > 0) {
                redeemable = (yesFloat * totalPool) / poolYes;
            }
            if (Number(outcome) === 2 && noFloat > 0 && poolNo > 0) {
                redeemable = (noFloat * totalPool) / poolNo;
            }
            setMarketHoldings((prev) => ({
                ...prev,
                [marketAddress]: {
                    yes: yesFloat.toFixed(3),
                    no: noFloat.toFixed(3),
                    claimed: Boolean(claimed),
                    redeemable: redeemable.toFixed(3),
                },
            }));
        } catch (err) {
            console.error("Failed to load holdings", err);
        }
    }

    async function resolveMarket(
        market: MarketSummary,
        outcome: OutcomeSide,
        button?: HTMLButtonElement | null
    ) {
        if (!window.ethereum) return setStatus("MetaMask not detected.");
        if (!account) return setStatus("Connect MetaMask first.");

        if (account.toLowerCase() !== market.resolver.toLowerCase()) {
            return setStatus("Only the designated resolver can resolve this market.");
        }

        try {
            button && (button.disabled = true);
            setStatus("Submitting resolve transaction…");
            const provider = new BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = new Contract(market.market, PredictionMarketABI, signer);
            const tx = await contract.resolve(outcome === "Yes" ? 1 : 2);
            setStatus("Waiting for confirmation…");
            await tx.wait();
            setStatus(`Resolved to ${outcome}.`);
            await loadMarkets();
            await loadTransactions(market.market);
        } catch (err: any) {
            setStatus(err?.shortMessage ?? err?.message ?? "Resolve failed.");
        } finally {
            button && (button.disabled = false);
        }
    }

    async function withdrawFees(
        market: MarketSummary,
        button?: HTMLButtonElement | null
    ) {
        if (!window.ethereum) return setStatus("MetaMask not detected.");
        if (!account) return setStatus("Connect MetaMask first.");

        if (account.toLowerCase() !== market.feeRecipient.toLowerCase()) {
            return setStatus("Only the fee recipient can withdraw fees.");
        }

        try {
            button && (button.disabled = true);
            setStatus("Submitting withdraw transaction…");
            const provider = new BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = new Contract(market.market, PredictionMarketABI, signer);
            const tx = await contract.withdrawFees();
            setStatus("Waiting for confirmation…");
            await tx.wait();
            setStatus("Fees withdrawn.");
            await loadMarkets();
            await loadTransactions(market.market);
        } catch (err: any) {
            setStatus(err?.shortMessage ?? err?.message ?? "Withdraw failed.");
        } finally {
            button && (button.disabled = false);
        }
    }

    async function claimWinnings(
        market: MarketSummary,
        button?: HTMLButtonElement | null
    ) {
        if (!window.ethereum) return setStatus("MetaMask not detected.");
        if (!account) return setStatus("Connect MetaMask first.");

        try {
            button && (button.disabled = true);
            setStatus("Submitting redeem transaction…");
            const provider = new BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = new Contract(market.market, PredictionMarketABI, signer);
            const tx = await contract.redeem();
            setStatus("Waiting for confirmation…");
            await tx.wait();
            setStatus("Winnings claimed.");
            await loadMarkets();
            await loadHoldings(market.market);
            await loadTransactions(market.market);
        } catch (err: any) {
            setStatus(err?.shortMessage ?? err?.message ?? "Redeem failed.");
        } finally {
            button && (button.disabled = false);
        }
    }

    function updateBuyAmount(marketAddress: string, value: string) {
        setBuyAmounts((prev) => ({
            ...prev,
            [marketAddress]: value,
        }));
    }

    async function handleBuy(market: MarketSummary, side: OutcomeSide) {
        if (!window.ethereum) return setStatus("MetaMask not detected.");
        if (!account) return setStatus("Connect MetaMask first.");
        const amount = buyAmounts[market.market]?.trim();
        if (!amount) return setStatus("Enter an ETH amount before buying.");

        let parsed;
        try {
            parsed = parseEther(amount);
        } catch {
            return setStatus("Invalid ETH amount.");
        }
        if (parsed <= 0n) return setStatus("Amount must be greater than 0.");

        try {
            setStatus(`Submitting ${side} order…`);
            const provider = new BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const marketContract = new Contract(
                market.market,
                PredictionMarketABI,
                signer
            );
            const tx =
                side === "Yes"
                    ? await marketContract.stakeYesSide({ value: parsed })
                    : await marketContract.stakeNoSide({ value: parsed });
            setStatus("Waiting for confirmation…");
            await tx.wait();
            setStatus(`Buy ${side} confirmed.`);
            updateBuyAmount(market.market, "");
            await loadMarkets();
        } catch (err: any) {
            setStatus(err?.shortMessage ?? err?.message ?? `Buy ${side} failed.`);
        }
    }

    const canCreateMarket = isApprovedCreator === true;

    if (viewingMarketPage) {
        const market = viewedMarket;
        const yesFloat = market ? Number(market.totalYes) || 0 : 0;
        const noFloat = market ? Number(market.totalNo) || 0 : 0;
        const pool = yesFloat + noFloat;
        const yesPct = pool > 0 ? Math.round((yesFloat / pool) * 100) : 50;
        const noPct = 100 - yesPct;
        const amountValue = market ? buyAmounts[market.market] ?? "" : "";
        const amountNumber = Number(amountValue);
        const hasAmount =
            Boolean(amountValue) && Number.isFinite(amountNumber) && amountNumber > 0;
        const potentialYes = market && hasAmount
            ? estimatePotential(amountNumber, yesFloat, noFloat, "Yes")
            : "";
        const potentialNo = market && hasAmount
            ? estimatePotential(amountNumber, yesFloat, noFloat, "No")
            : "";

        return (
            <div className="app">
                <div className="app-shell">
                    <Header
                        hasMetaMask={hasMetaMask}
                        account={account}
                        chainId={chainId}
                        onConnect={connect}
                        accountLink={
                            account ? sepoliaEtherscanAddress(account) : undefined
                        }
                    />
                    <header className="hero">
                        <div>
                            <button className="ghost back-button" onClick={() => navigate("/")}>
                                ← Back to markets
                            </button>
                            <p className="eyebrow">Market</p>
                            <h1>{market ? market.question : "Market not found"}</h1>
                        </div>
                    </header>

                    {status && <div className="status-banner">{status}</div>}

                    <section className="card detail-card">
                        {market ? (
                            <>
                                <div className="detail-meta">
                                    <div>
                                        <p className="muted">Market address</p>
                                        <a
                                            href={sepoliaEtherscanAddress(market.market)}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="address-link"
                                            aria-label="View market on Etherscan"
                                        >
                                            {market.market}
                                            <span className="redirect-icon">↗</span>
                                        </a>
                                    </div>
                                    <div>
                                        <p className="muted">Resolver</p>
                                        <a
                                            href={sepoliaEtherscanAddress(market.resolver)}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="address-link"
                                            aria-label="View resolver on Etherscan"
                                        >
                                            {market.resolver}
                                            <span className="redirect-icon">↗</span>
                                        </a>
                                    </div>
                                    <div>
                                        <p className="muted">Close time</p>
                                        <p>
                                            {market.closeTime
                                                ? new Date(market.closeTime * 1000).toLocaleString()
                                                : "Unknown"}
                                        </p>
                                    </div>
                                </div>

                                <div className="detail-stats">
                                    <div>
                                        <p className="muted">Total ETH</p>
                                        <p className="liquidity">
                                            {(
                                                Number(market.totalYes) + Number(market.totalNo)
                                            ).toFixed(3)}{" "}
                                            ETH
                                        </p>
                                    </div>
                                    <div>
                                        <p className="muted">Outcome</p>
                                        <p className="liquidity">
                                            {OUTCOME_LABEL[market.outcome] ?? "Unknown"}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="muted">Fees accrued</p>
                                        <p className="liquidity">{market.feesAccrued} ETH</p>
                                    </div>
                                </div>

                                <div className="buy-input-row">
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.0001"
                                        placeholder="0.0 ETH"
                                        value={amountValue}
                                        onChange={(e) =>
                                            updateBuyAmount(market.market, e.target.value)
                                        }
                                    />
                                </div>

                                {hasAmount && (
                                    <div className="potential-popup">
                                        <p>Potential YES win: {potentialYes} ETH</p>
                                        <p>Potential NO win: {potentialNo} ETH</p>
                                    </div>
                                )}

                                <div className="buy-row">
                                    <button
                                        className="buy-button buy-button--yes"
                                        onClick={() => handleBuy(market, "Yes")}
                                    >
                                        Buy YES · {yesPct}%
                                    </button>
                                    <button
                                        className="buy-button buy-button--no"
                                        onClick={() => handleBuy(market, "No")}
                                    >
                                        Buy NO · {noPct}%
                                    </button>
                                </div>

                                {account.toLowerCase() === market.resolver.toLowerCase() && (
                                    <div className="resolve-row">
                                        <button
                                            className="resolve-button resolve-button--yes"
                                            onClick={(e) =>
                                                resolveMarket(
                                                    market,
                                                    "Yes",
                                                    e.currentTarget
                                                )
                                            }
                                        >
                                            Resolve YES
                                        </button>
                                        <button
                                            className="resolve-button resolve-button--no"
                                            onClick={(e) =>
                                                resolveMarket(
                                                    market,
                                                    "No",
                                                    e.currentTarget
                                                )
                                            }
                                        >
                                            Resolve NO
                                        </button>
                                    </div>
                                )}

                                {account &&
                                    marketHoldings[market.market] &&
                                    Number(marketHoldings[market.market].redeemable) > 0 &&
                                    !marketHoldings[market.market].claimed && (
                                        <div className="redeem-row">
                                            <p className="muted">
                                                Claimable:{" "}
                                                <strong>
                                                    {marketHoldings[market.market].redeemable} ETH
                                                </strong>
                                            </p>
                                            <button
                                                className="primary"
                                                onClick={(e) =>
                                                    claimWinnings(market, e.currentTarget)
                                                }
                                            >
                                                Claim winnings
                                            </button>
                                        </div>
                                    )}

                                {account &&
                                    account.toLowerCase() === market.feeRecipient.toLowerCase() && (
                                    <div className="withdraw-row">
                                        <p className="muted">
                                            Fees accrued:{" "}
                                            <strong>{market.feesAccrued} ETH</strong>
                                        </p>
                                        <button
                                            className="ghost withdraw-button"
                                            onClick={(e) => withdrawFees(market, e.currentTarget)}
                                        >
                                            Withdraw fees
                                        </button>
                                    </div>
                                    )}

                                <div className="transactions-section">
                                    <div className="section-headline">
                                        <div>
                                            <p className="eyebrow">Activity</p>
                                        </div>
                                        <button
                                            className="ghost icon-button"
                                            aria-label="Refresh activity"
                                            onClick={() =>
                                                void loadTransactions(market.market)
                                            }
                                        >
                                            ↻
                                        </button>
                                    </div>
                                    <div className="transactions-list">
                                        {(marketTransactions[market.market] ?? []).map((tx) => (
                                            <a
                                                key={tx.hash}
                                                href={`https://sepolia.etherscan.io/tx/${tx.hash}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="transaction-row"
                                            >
                                                <div>
                                                    <p className="transaction-type">
                                                        {tx.type}
                                                    </p>
                                                    <p className="transaction-meta">
                                                        {tx.sender.slice(0, 6)}…
                                                        {tx.sender.slice(-4)}
                                                    </p>
                                                </div>
                                                <div className="transaction-value">
                                                    {tx.value} ETH
                                                </div>
                                                <span className="redirect-icon">↗</span>
                                            </a>
                                        ))}
                                        {(marketTransactions[market.market] ?? []).length === 0 && (
                                            <p className="muted">No activity yet.</p>
                                        )}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div>
                                <p>We couldn’t find that market. It might not be deployed yet.</p>
                                <button className="primary" onClick={() => navigate("/")}>
                                    Back to markets
                                </button>
                            </div>
                        )}
                    </section>
                </div>
            </div>
        );
    }

    return (
        <div className="app">
            <div className="app-shell">
                <Header
                    hasMetaMask={hasMetaMask}
                    account={account}
                    chainId={chainId}
                    onConnect={connect}
                    accountLink={
                        account ? sepoliaEtherscanAddress(account) : undefined
                    }
                />

                {status && <div className="status-banner">{status}</div>}
                {account && canCreateMarket && (
                    <section className="card create-card">
                        <div className="section-headline">
                            <div>
                                <p className="eyebrow">Creator tools</p>
                                <h2>Create a market</h2>
                            </div>
                            <p className="approval-pill approval-pill--ok">Approved creator</p>
                        </div>

                        <form className="form-grid" onSubmit={handleCreateMarket}>
                            <label className="form-field">
                                <span>Question</span>
                                <input
                                    type="text"
                                    value={questionInput}
                                    onChange={(e) => setQuestionInput(e.target.value)}
                                    placeholder="Will ETH trade above $3k before June 30?"
                                />
                            </label>

                            <label className="form-field">
                                <span>Close time</span>
                                <input
                                    type="datetime-local"
                                    value={closeTimeInput}
                                    onChange={(e) => setCloseTimeInput(e.target.value)}
                                />
                            </label>

                            <label className="form-field">
                                <span>Resolver address</span>
                                <input
                                    type="text"
                                    value={resolverInput}
                                    onChange={(e) => setResolverInput(e.target.value)}
                                    placeholder="0xabc…"
                                />
                            </label>

                            <button className="primary" type="submit" disabled={creatingMarket}>
                                {creatingMarket ? "Creating…" : "Deploy market"}
                            </button>
                        </form>
                    </section>
                )}

                <section className="markets-section">
                    <div className="section-headline">
                        <div>
                            <p className="eyebrow">Markets</p>
                        </div>
                        {hasMetaMask && (
                            <button
                                className="ghost icon-button"
                                aria-label="Refresh markets"
                                onClick={() => {
                                    void loadMarkets();
                                }}
                                disabled={loadingMarkets}
                            >
                                ↻
                            </button>
                        )}
                    </div>

                    {!hasMetaMask && (
                        <p className="muted">Connect MetaMask to view on-chain markets.</p>
                    )}

                    {hasMetaMask && (
                        <>
                            {marketsError && <p className="error">{marketsError}</p>}
                            {!marketsError && !loadingMarkets && markets.length === 0 && (
                                <p className="muted">No markets deployed yet.</p>
                            )}

                            <div className="markets-grid">
                                {markets.map((mkt) => {
                                    const yesFloat = Number(mkt.totalYes) || 0;
                                    const noFloat = Number(mkt.totalNo) || 0;
                                    const pool = yesFloat + noFloat;
                                    const yesPct = pool > 0 ? Math.round((yesFloat / pool) * 100) : 50;
                                    const noPct = 100 - yesPct;
                                    const amountValue = buyAmounts[mkt.market] ?? "";
                                    const amountNumber = Number(amountValue);
                                    const hasAmount =
                                        Boolean(amountValue) &&
                                        Number.isFinite(amountNumber) &&
                                        amountNumber > 0;
                                    const potentialYes = hasAmount
                                        ? estimatePotential(amountNumber, yesFloat, noFloat, "Yes")
                                        : "";
                                    const potentialNo = hasAmount
                                        ? estimatePotential(amountNumber, yesFloat, noFloat, "No")
                                        : "";
                                    return (
                                    <article
                                        className="card market-card"
                                        key={mkt.market}
                                        role="link"
                                        tabIndex={0}
                                        onClick={() => navigate(`/market/${mkt.market}`)}
                                        onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
                                            if (event.key === "Enter" || event.key === " ") {
                                                event.preventDefault();
                                                navigate(`/market/${mkt.market}`);
                                            }
                                        }}
                                    >
                                        <p className="market-question">{mkt.question}</p>
                                        <div className="market-meta">
                                            <span>
                                                Close:{" "}
                                                {mkt.closeTime
                                                    ? new Date(mkt.closeTime * 1000).toLocaleString()
                                                    : "Unknown"}
                                            </span>
                                            <span>Outcome: {OUTCOME_LABEL[mkt.outcome] ?? "Unknown"}</span>
                                        </div>
                                        <div className="buy-input-row">
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.0001"
                                                placeholder="0.0 ETH"
                                                value={amountValue}
                                                onClick={(e) => e.stopPropagation()}
                                                onChange={(e) =>
                                                    updateBuyAmount(mkt.market, e.target.value)
                                                }
                                            />
                                        </div>
                                        {hasAmount && (
                                            <div
                                                className="potential-popup"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <p>Potential YES win: {potentialYes} ETH</p>
                                                <p>Potential NO win: {potentialNo} ETH</p>
                                            </div>
                                        )}
                                        <div className="buy-row">
                                            <button
                                                className="buy-button buy-button--yes"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleBuy(mkt, "Yes");
                                                }}
                                            >
                                                Buy YES {yesPct}%
                                            </button>
                                            <button
                                                className="buy-button buy-button--no"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleBuy(mkt, "No");
                                                }}
                                            >
                                                Buy NO {noPct}%
                                            </button>
                                        </div>
                                    </article>
                                );
                            })}
                            </div>
                        </>
                    )}
                </section>
            </div>
        </div>
    );
}

function estimatePotential(
    amount: number,
    yesPool: number,
    noPool: number,
    side: OutcomeSide
): string {
    if (amount <= 0) return "0.000";
    const pool = yesPool + noPool;
    const totalAfter = pool + amount;
    const winningPool = side === "Yes" ? yesPool + amount : noPool + amount;
    if (winningPool <= 0) return amount.toFixed(3);
    const payout = (amount * totalAfter) / winningPool;
    return payout.toFixed(3);
}
