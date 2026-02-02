/**
 * DiamondPad - The launchpad that rewards believers, not flippers 💎
 * 
 * Built by Kiki for the Colosseum Agent Hackathon
 */

// Core exports
export { BundleDetector } from './detector/bundle';
export { DiamondRewardsCalculator, diamondCalculator } from './rewards/diamond';
export { db } from './db/index';

// Staking system
export { 
  StakingTierManager, 
  stakingManager, 
  TIER_CONFIG,
  type StakingTier,
  type StakerPosition 
} from './staking/tiers';
export { 
  AllocationManager, 
  allocationManager, 
  POOL_CONFIG,
  type AllocationPool,
  type LaunchAllocation 
} from './staking/allocation';

// Types
export * from './types';

// Version info
export const VERSION = '0.1.0';
export const TAGLINE = 'The launchpad that rewards believers, not flippers 💎';

/**
 * Quick demo - show how DiamondPad works
 */
export async function demo() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   💎 DiamondPad - Rewards Believers, Not Flippers 💎          ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║   PROBLEMS WE FIX:                                            ║
║   ❌ Bundling      → Devs buy with 50 wallets, dump on you    ║
║   ❌ Multi-wallet  → Sybils farm all the rewards              ║
║   ❌ Quick flips   → Traders win, believers lose              ║
║   ❌ Dev rugs      → No accountability, devs disappear        ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║   OUR SOLUTION:                                               ║
║   ✅ Hold-to-Earn        → Time held = more rewards           ║
║   ✅ Bundle Detection    → Flag coordinated buys              ║
║   ✅ Diamond Multiplier  → 1 week=1.5x, 1 month=2x, etc      ║
║   ✅ Dev Locks           → Transparent vesting on-chain       ║
║   ✅ Believer Airdrops   → Past holders get priority          ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║   DIAMOND RANKS:                                              ║
║   📄 Paper    (< 7 days)    → 1.0x multiplier                 ║
║   🥉 Bronze   (7-30 days)   → 1.5x multiplier                 ║
║   🥈 Silver   (30-60 days)  → 2.0x multiplier                 ║
║   🥇 Gold     (60-90 days)  → 2.5x multiplier                 ║
║   💠 Platinum (90-180 days) → 3.0x multiplier                 ║
║   💎 Diamond  (180+ days)   → 3.5x multiplier                 ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);

  // Demo the rewards calculator
  const { diamondCalculator } = await import('./rewards/diamond');
  
  console.log('\n📊 Example Reward Calculations:\n');
  
  const holdDurations = [1, 7, 30, 60, 90, 180, 365];
  
  for (const days of holdDurations) {
    const rank = diamondCalculator.getDiamondRank(days);
    const multiplier = diamondCalculator.getMultiplier(days);
    const emoji = getEmoji(rank);
    console.log(`   ${emoji} ${days} days → ${rank} (${multiplier}x rewards)`);
  }

  console.log('\n💎 Diamond hands win. Paper hands don\'t.\n');
}

function getEmoji(rank: string): string {
  switch (rank) {
    case 'Paper': return '📄';
    case 'Bronze': return '🥉';
    case 'Silver': return '🥈';
    case 'Gold': return '🥇';
    case 'Platinum': return '💠';
    case 'Diamond': return '💎';
    default: return '❓';
  }
}

// Run demo if called directly
if (require.main === module) {
  demo().catch(console.error);
}
