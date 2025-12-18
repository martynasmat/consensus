type HeaderProps = {
    hasMetaMask: boolean;
    account: string;
    chainId: string;
    onConnect: () => void;
    accountLink?: string;
};

export function Header({
    hasMetaMask,
    account,
    chainId,
    onConnect,
    accountLink,
}: HeaderProps) {
    return (
        <header className="app-header">
            <div className="brand">
                <span>consensus</span>
            </div>
            <div className="header-actions">
                {!hasMetaMask && (
                    <p className="muted small-text">Install MetaMask to get started.</p>
                )}

                {hasMetaMask && !account && (
                    <button className="primary" onClick={onConnect}>
                        Connect MetaMask
                    </button>
                )}

                {account && (
                    <div className="header-account">
                        <a
                            href={accountLink}
                            target="_blank"
                            rel="noreferrer"
                            className="address-link"
                        >
                            {account}
                        </a>
                        <span className="muted small-text">Chain: {chainId}</span>
                    </div>
                )}
            </div>
        </header>
    );
}
