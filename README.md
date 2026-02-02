# DiamondPad 💎

**Launch to last.**

The launchpad for projects that actually ship. Holder-first, trader-friendly.

---

## The Problem

Current launchpads are broken:

| Platform | Graduation Rate | What Happens |
|----------|-----------------|--------------|
| Pump.fun | **1.4%** | 98.6% of tokens die. Only 3% of users profit. |
| Bonk.fun | Similar | Same chaos, different branding. |

Builders get dumped on. Believers get rugged. Extractors win.

**DiamondPad fixes this.**

---

## Our Approach

> "The launchpad for builders who build to last."

We're not another memecoin casino. We're infrastructure for projects that want:
- **Committed holders**, not flippers
- **Stable growth**, not pump-and-dump cycles
- **Deep liquidity**, not bonding curve traps
- **Real utility** — DeFi, gaming, AI agents, RWAs

### Target: 15%+ Graduation Rate

| Metric | Pump.fun | DiamondPad Target |
|--------|----------|-------------------|
| Graduation Rate | 1.4% | **15%+** |
| 30-day Holder Retention | ~20% | **60%+** |
| 7-day Volume Retention | ~10% | **40%+** |
| Users Profiting | 3% | **20%+** |

---

## How It Works

### For Projects

> "You built something real. Launch it like you mean it."

✅ **Rigorous vetting** = quality signal (your project stands out)  
✅ **Mandatory liquidity + MM** = you survive week 1  
✅ **Holder tiers** = your token lands in diamond hands, not paper  
✅ **Post-launch tools** = your community grows, not ghosts  

### For Investors

> "Better projects. Better odds. Better returns."

✅ **Curated launches** = fewer rugs, higher quality  
✅ **Stake $LAUNCH** = guaranteed allocation on every drop  
✅ **Zero-stake entry** = public pools for everyone  
✅ **Loyalty rewards** = hold longer, earn more  

---

## Staking Tiers

Higher stakes + longer locks = better access.

| Tier | Stake | Lock | Weight | Guaranteed | Perks |
|------|-------|------|--------|------------|-------|
| 💎 **Diamond** | 100k+ | 180 days | 10x | ✅ | Priority access, 60% fee discount |
| 🥇 **Gold** | 50k | 90 days | 5x | ✅ | Priority access, 40% fee discount |
| 🥈 **Silver** | 20k | 60 days | 2.5x | ❌ | 2x lottery boost, 25% fee discount |
| 🥉 **Bronze** | 5k | 30 days | 1x | ❌ | 1.5x lottery boost, 10% fee discount |
| 📄 **Public** | 0 | None | 0.25x | ❌ | Access to public pools |

### Strong Holder Score (SHS)

Your tier weight is multiplied by your SHS (0.5x - 2.0x), based on:
- **Hold duration** across past launches
- **Loyalty** — didn't dump allocations quickly
- **Activity** — LP provision, governance votes

*A Gold holder with 1.8x SHS beats a Diamond holder with 0.6x SHS.*

---

## Allocation Pools

Every launch distributes tokens across multiple pools:

| Pool | % | Who | Mechanism |
|------|---|-----|-----------|
| **Guaranteed** | 30% | Diamond/Gold stakers | Pro-rata by weight |
| **Weighted Lottery** | 25% | All stakers | Weighted by tier + SHS |
| **Public Lottery** | 10% | Anyone | Simple lottery, $500 max |
| **FCFS Micro** | 5% | Anyone | First come first serve, $100 max |
| **Flipper Pool** | 5% | Anyone | For degens, 5% exit fee |
| **Liquidity** | 15% | Auto | Locked to DEX 12 months |
| **Trader Rewards** | 10% | Post-launch | Volume/LP incentives |

**20% of every launch is accessible with zero staking.**

---

## Anti-Dump Mechanics

### Tiered Vesting

| Allocation Size | Cliff | Vesting | TGE Unlock |
|-----------------|-------|---------|------------|
| < $500 | None | None | 100% |
| $500 - $2k | None | 30 days | 50% |
| $2k - $10k | 7 days | 60 days | 25% |
| > $10k | 14 days | 90 days | 20% |

*Small fish can flip. Whales must wait.*

### Loyalty Bonuses

Hold your allocation without selling:
- **7 days** → +5% airdrop
- **30 days** → +15% airdrop + 1.1x next launch multiplier
- **90 days** → +25% airdrop + 1.25x permanent SHS boost

---

## Bundle Detection 🔍

We catch coordinated buying and protect real believers:

- **Same funding source** — wallets funded from same address
- **Same block buys** — multiple buys in one block
- **New wallet clusters** — fresh wallets buying together
- **Timing patterns** — buys at regular intervals

**Actions:**
- Flag for review
- Delay rewards 30 days
- Reduce rewards 50%
- Block participation

---

## Tech Stack

- **Smart Contracts**: Anchor (Solana)
- **Token Standard**: SPL Token + Token-2022
- **API**: Hono + TypeScript + Bun
- **Detection**: Custom on-chain analysis + Helius
- **Liquidity**: Raydium/Meteora integration

---

## API Endpoints

### Core
```
GET  /api/health              Health check
GET  /api/config              Platform config
POST /api/launch              Create launch
GET  /api/launch/:id          Get launch details
POST /api/buy                 Buy into launch
GET  /api/holder/:wallet      Holder status
GET  /api/leaderboard         Diamond hands ranking
```

### Staking
```
GET  /api/staking/tiers           Tier configs
POST /api/staking/stake           Stake $LAUNCH
POST /api/staking/unstake         Unstake (10% early penalty)
GET  /api/staking/position/:wallet  Check position
POST /api/staking/simulate        Preview tier benefits
```

### Allocation
```
POST /api/staking/allocation/init      Initialize pools
POST /api/staking/allocation/request   Request allocation
GET  /api/staking/allocation/:launchId Pool status
```

---

## Roadmap

- [x] Core tokenomics design
- [x] Anti-bundle detection algorithm
- [x] Staking tiers system
- [x] Allocation pools
- [x] API server
- [ ] Anchor smart contracts (in progress)
- [ ] Frontend
- [ ] Testnet launch
- [ ] Mainnet

---

## Why DiamondPad Wins

We're not competing with meme casinos. We're the **exit ramp** for builders who outgrew them.

| | Pump.fun | DAO Maker | DiamondPad |
|---|----------|-----------|------------|
| **Curation** | None | High | High |
| **Entry Barrier** | Zero | High staking | **Low** (public pools) |
| **Graduation Rate** | 1.4% | Higher | **15%+ target** |
| **Liquidity** | Bonding curve | Varies | **Mandatory locked LP** |
| **Holder Incentives** | None | Some | **Core focus** |

**The gap we own:** High curation + Low barrier.

---

## Taglines

- *"Launch to last."*
- *"Where builders meet believers."*
- *"Stake once, win forever."*
- *"Beyond the pump."*

---

## Links

- **Discord**: [discord.gg/c8DHM68G](https://discord.gg/c8DHM68G)
- **Twitter**: Coming soon
- **Docs**: Coming soon

---

*Built with 💎 by the DiamondPad team*

**Serious projects deserve serious holders.**
