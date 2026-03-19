# Utopia ItemId Checklist

Use this to obtain one real Utopia `itemId` for read-only validation.

## What The Docs Say

- Open the EVE Frontier external-browser entry for Utopia: [https://uat.dapps.evefrontier.com/?tenant=utopia](https://uat.dapps.evefrontier.com/?tenant=utopia)
- Connect with EVE Vault.
- The selected assembly is determined by `?tenant` and `?itemId`.
- `itemId` is the in-game game item ID.

Official sources:
- [Connecting from an External Browser](https://docs.evefrontier.com/dapps/connecting-from-an-external-browser)
- [Interfacing with the EVE Frontier World](https://docs.evefrontier.com/tools/interfacing-with-the-eve-frontier-world)

## Practical Checklist

1. Open the local Trust Locker dApp in the browser and enable EVE Vault again if you had disabled it for the localnet proof.
2. Click `Connect Wallet` and connect EVE Vault on Utopia.
3. In the `Utopia Object Discovery` panel:
   - click `Load owned objects` if the connected wallet already owns Utopia objects, or
   - click `Load public Utopia objects` if you have no owned objects yet
4. Review the returned candidates and copy one full URL of the form `https://uat.dapps.evefrontier.com/?tenant=utopia&itemId=...`.
5. Only fall back to the in-game/browser-link path if both discovery paths return no usable candidates.
6. Send only the `itemId` or URL, not any wallet secrets or auth tokens.

## Current Known-Good Public Samples

- Preferred:
  - [https://uat.dapps.evefrontier.com/?tenant=utopia&itemId=1000000015336](https://uat.dapps.evefrontier.com/?tenant=utopia&itemId=1000000015336)
- Also valid:
  - [https://uat.dapps.evefrontier.com/?tenant=utopia&itemId=1000000016965](https://uat.dapps.evefrontier.com/?tenant=utopia&itemId=1000000016965)
  - [https://uat.dapps.evefrontier.com/?tenant=utopia&itemId=1000000016389](https://uat.dapps.evefrontier.com/?tenant=utopia&itemId=1000000016389)

## Inference

- The docs do not spell out the exact in-game click path for every object type.
- The most reliable current flow is to use the browser dApp’s GraphQL-backed discovery panel instead of trying to extract `itemId` from the in-game loot or market UI.
