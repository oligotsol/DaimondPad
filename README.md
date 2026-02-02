# DiamondPad 💎

**Launch to last.**

The launchpad for believers. Where real projects meet diamond hands.

---

## The Problem

Current launchpads reward the wrong people:

| Platform | Graduation Rate | Who Wins |
|----------|-----------------|----------|
| Pump.fun | **1.4%** | Snipers, bundlers, insiders |
| Bonk.fun | Similar | Same extractors, different casino |

**98.6% of tokens die.** Only 3% of users make money. 

Builders get dumped on. Believers get rugged. The people who actually *care* about projects lose.

**DiamondPad flips the script.**

---

## The DiamondPad Difference

### For Believers
This is **your** launchpad. We built it for people who:
- Actually read the whitepaper
- Hold through the dips
- Believe in the project, not just the pump

**Diamond hands get diamond treatment.** Guaranteed allocations. Priority access. Loyalty rewards that compound over time.

### For Projects
Your token deserves holders who stick around.

| Problem | Pump.fun | DiamondPad |
|---------|----------|------------|
| Day 1 dump | 80%+ crash | Tiered vesting protects price |
| No liquidity | Bonding curve trap | 15% locked LP + market makers |
| Ghost town by week 2 | Normal | Holder rewards keep community engaged |
| "Just another memecoin" | Default perception | Vetting = quality signal |

**Real projects have a real chance here.** Our target graduation rate is 15%+ (vs 1.4% industry average).

### For Traders
We're holder-first, but traders aren't locked out.

| What You Get | Details |
|--------------|---------|
| **Public pools** | 20% of every launch, zero staking required |
| **Better odds** | Curated projects = fewer rugs, more winners |
| **Volume rewards** | 10% of each launch reserved for active traders |
| **Deep liquidity** | Mandatory LP means you can actually exit |

**Your $100 flip has better odds here than a $1000 gamble on pump.fun.**

---

## Why It Works

### The Numbers

| Metric | Pump.fun | DiamondPad Target |
|--------|----------|-------------------|
| Graduation Rate | 1.4% | **15%+** |
| 30-day Holder Retention | ~20% | **60%+** |
| 7-day Volume Retention | ~10% | **40%+** |
| Users Profiting | 3% | **20%+** |

### The Logic

1. **Vetting filters garbage** → Only real projects launch
2. **Locked liquidity** → Projects can't rug, traders can exit
3. **Holder tiers** → Believers get priority, not bots
4. **Vesting protects price** → Whales can't dump day 1
5. **Loyalty rewards** → Holding is incentivized, not punished
6. **Trader pools** → Volume stays healthy, everyone benefits

**Virtuous cycle:** Quality projects → Diamond hand holders → Stable prices → More quality projects  

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

We're not competing with meme casinos. We're building something different.

| | Pump.fun | DAO Maker | DiamondPad |
|---|----------|-----------|------------|
| **Who wins** | Extractors | Big stakers | **Believers** |
| **Curation** | None | High | High |
| **Entry Barrier** | Zero | High staking | **Low** (public pools) |
| **Graduation Rate** | 1.4% | Higher | **15%+ target** |
| **Liquidity** | Bonding curve | Varies | **Mandatory locked LP** |
| **Holder Incentives** | None | Some | **Core focus** |
| **Trader Access** | Wide open | Limited | **20% public pools** |

### The Core Ethos

**DiamondPad is for believers.**

Not for snipers. Not for bundlers. Not for people who flip in 10 minutes.

For people who find a project they believe in and *stay*.

We make sure those people get rewarded — with better access, better prices, and better odds.

And because believers stick around, projects survive. Because projects survive, traders profit. Because traders profit, volume stays healthy. Because volume stays healthy, everyone wins.

**Belief is the alpha.**

---

## Taglines

- *"Launch to last."*
- *"The launchpad for believers."*
- *"Where diamond hands get diamond treatment."*
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
