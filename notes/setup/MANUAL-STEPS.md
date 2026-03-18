# Remaining Manual Steps

## 1. Fund the dedicated testnet address

Open the Sui faucet for the dedicated Smart Assemblies address:

- <https://faucet.sui.io/?address=0x2860dd7d2afcc9cc567354b07631ca0b316ba48041d8b9c821941413d9fe8bf4>

This address is the active CLI address for the workspace:

- Alias: `eve-smart-assemblies-testnet`
- Address: `0x2860dd7d2afcc9cc567354b07631ca0b316ba48041d8b9c821941413d9fe8bf4`

## 2. Install and sign into EVE Vault

- Open Google Chrome
- Install the EVE Vault browser extension from the official EVE Frontier docs/release path
- Sign in with the Utopia sandbox account
- Set the local PIN
- Confirm the wallet is pointed at `testnet`

## 3. Validate the external-browser dApp flow

- Use the official external browser connection pattern with `tenant=utopia`
- Confirm EVE Vault can connect to the dApp
- Confirm the expected wallet prompt appears in the browser

## 4. Perform read-only Utopia discovery

Once EVE Vault is ready, record the live Utopia values in `notes/setup/STATUS.md` or a new note:

- live world package ID
- character object ID
- network node object ID
- smart assembly or storage/gate object IDs needed for the first target flow
- any shared singleton object IDs required by the EVE Frontier read/write flow

## 5. Decide on Docker Desktop

Docker Desktop is no longer required to prove the local sandbox path, because the host localnet flow is working.

Install Docker Desktop only if you specifically want:

- the official containerized local flow
- a disposable containerized Sui/Node environment
- the local GraphQL/indexer stack that comes with the Docker compose path
