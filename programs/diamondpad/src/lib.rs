use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};

declare_id!("DiamPad1111111111111111111111111111111111");

/// DiamondPad - The launchpad for believers
/// 
/// Core features:
/// 1. Staking tiers (Diamond/Gold/Silver/Bronze) with lock periods
/// 2. Token launches with enforced safety settings
/// 3. Allocation pools (guaranteed, lottery, public)
/// 4. Holder rewards based on diamond rank
/// 5. Anti-bundle detection and penalties

#[program]
pub mod diamondpad {
    use super::*;

    // ============ Protocol Setup ============

    /// Initialize the DiamondPad protocol
    pub fn initialize(ctx: Context<Initialize>, launch_token_mint: Pubkey) -> Result<()> {
        let protocol = &mut ctx.accounts.protocol;
        protocol.authority = ctx.accounts.authority.key();
        protocol.launch_token_mint = launch_token_mint;
        protocol.total_launches = 0;
        protocol.total_stakers = 0;
        protocol.total_staked = 0;
        protocol.total_bundlers_caught = 0;
        protocol.early_unstake_penalty_bps = 1000; // 10%
        protocol.bump = ctx.bumps.protocol;
        Ok(())
    }

    // ============ Staking ============

    /// Stake $LAUNCH tokens to earn tier benefits
    pub fn stake(
        ctx: Context<Stake>,
        amount: u64,
        lock_days: u16,
    ) -> Result<()> {
        require!(amount > 0, DiamondPadError::InvalidAmount);
        
        let clock = Clock::get()?;
        let staker = &mut ctx.accounts.staker_account;
        let protocol = &mut ctx.accounts.protocol;
        
        // Determine tier based on amount and lock period
        let tier = calculate_staking_tier(amount, lock_days);
        
        // Initialize or update staker account
        if staker.staked_amount == 0 {
            staker.owner = ctx.accounts.owner.key();
            staker.staked_at = clock.unix_timestamp;
            staker.bump = ctx.bumps.staker_account;
            protocol.total_stakers += 1;
        }
        
        // Update staker state
        staker.staked_amount = staker.staked_amount.checked_add(amount).unwrap();
        staker.lock_end_timestamp = clock.unix_timestamp + (lock_days as i64 * 86400);
        staker.tier = tier;
        staker.last_update_timestamp = clock.unix_timestamp;
        
        // Update protocol totals
        protocol.total_staked = protocol.total_staked.checked_add(amount).unwrap();
        
        // Transfer tokens to vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.staker_token_account.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        emit!(Staked {
            owner: staker.owner,
            amount,
            lock_days,
            tier,
            total_staked: staker.staked_amount,
        });

        Ok(())
    }

    /// Unstake tokens (with penalty if before lock period ends)
    pub fn unstake(
        ctx: Context<Unstake>,
        amount: u64,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let staker = &mut ctx.accounts.staker_account;
        let protocol = &mut ctx.accounts.protocol;
        
        require!(amount > 0, DiamondPadError::InvalidAmount);
        require!(staker.staked_amount >= amount, DiamondPadError::InsufficientStake);
        
        // Calculate penalty if early unstake
        let mut return_amount = amount;
        let mut penalty_amount: u64 = 0;
        
        if clock.unix_timestamp < staker.lock_end_timestamp {
            penalty_amount = amount
                .checked_mul(protocol.early_unstake_penalty_bps as u64).unwrap()
                .checked_div(10000).unwrap();
            return_amount = amount.checked_sub(penalty_amount).unwrap();
        }
        
        // Update staker state
        staker.staked_amount = staker.staked_amount.checked_sub(amount).unwrap();
        staker.last_update_timestamp = clock.unix_timestamp;
        
        // Recalculate tier
        let remaining_lock_days = if staker.lock_end_timestamp > clock.unix_timestamp {
            ((staker.lock_end_timestamp - clock.unix_timestamp) / 86400) as u16
        } else {
            0
        };
        staker.tier = calculate_staking_tier(staker.staked_amount, remaining_lock_days);
        
        // Update protocol totals
        protocol.total_staked = protocol.total_staked.checked_sub(amount).unwrap();
        
        if staker.staked_amount == 0 {
            protocol.total_stakers = protocol.total_stakers.saturating_sub(1);
        }
        
        // Transfer tokens from vault (minus penalty)
        let seeds = &[b"vault".as_ref(), &[ctx.accounts.vault.to_account_info().key().to_bytes()[0]]];
        let signer = &[&seeds[..]];
        
        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.staker_token_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, return_amount)?;

        emit!(Unstaked {
            owner: staker.owner,
            amount,
            return_amount,
            penalty_amount,
            early: clock.unix_timestamp < staker.lock_end_timestamp,
            remaining_stake: staker.staked_amount,
            new_tier: staker.tier,
        });

        Ok(())
    }

    // ============ Launches ============

    /// Create a new token launch with enforced safety settings
    pub fn create_launch(
        ctx: Context<CreateLaunch>,
        name: String,
        symbol: String,
        total_supply: u64,
        dev_allocation_bps: u16,
        dev_vesting_days: u16,
        lp_lock_days: u16,
        holder_rewards_bps: u16,
    ) -> Result<()> {
        require!(dev_allocation_bps <= 1000, DiamondPadError::DevAllocationTooHigh);
        require!(dev_vesting_days >= 180, DiamondPadError::VestingTooShort);
        require!(lp_lock_days >= 365, DiamondPadError::LpLockTooShort);
        require!(name.len() <= 32, DiamondPadError::NameTooLong);
        require!(symbol.len() <= 10, DiamondPadError::SymbolTooLong);

        let launch = &mut ctx.accounts.launch;
        let protocol = &mut ctx.accounts.protocol;
        
        launch.creator = ctx.accounts.creator.key();
        launch.name = name.clone();
        launch.symbol = symbol.clone();
        launch.total_supply = total_supply;
        launch.dev_allocation_bps = dev_allocation_bps;
        launch.dev_vesting_days = dev_vesting_days;
        launch.lp_lock_days = lp_lock_days;
        launch.holder_rewards_bps = holder_rewards_bps;
        launch.created_at = Clock::get()?.unix_timestamp;
        launch.launch_id = protocol.total_launches;
        launch.status = LaunchStatus::Pending;
        launch.total_raised = 0;
        launch.holder_count = 0;
        
        // Allocation pools (in basis points of total supply)
        launch.guaranteed_pool_bps = 3000;      // 30%
        launch.lottery_pool_bps = 2500;         // 25%
        launch.public_pool_bps = 1000;          // 10%
        launch.fcfs_pool_bps = 500;             // 5%
        launch.flipper_pool_bps = 500;          // 5%
        launch.liquidity_pool_bps = 1500;       // 15%
        launch.trader_rewards_pool_bps = 1000;  // 10%
        
        launch.bump = ctx.bumps.launch;

        protocol.total_launches += 1;

        emit!(LaunchCreated {
            launch_id: launch.launch_id,
            creator: launch.creator,
            name,
            symbol,
            total_supply,
            dev_allocation_bps,
            dev_vesting_days,
        });

        Ok(())
    }

    /// Request allocation for a launch
    pub fn request_allocation(
        ctx: Context<RequestAllocation>,
        pool: AllocationPool,
        amount_usd: u64,
    ) -> Result<()> {
        let allocation = &mut ctx.accounts.allocation;
        let staker = &ctx.accounts.staker_account;
        let launch = &ctx.accounts.launch;
        let clock = Clock::get()?;
        
        // Validate pool access based on tier
        match pool {
            AllocationPool::Guaranteed => {
                require!(
                    staker.tier == StakingTier::Diamond || staker.tier == StakingTier::Gold,
                    DiamondPadError::TierTooLow
                );
            },
            AllocationPool::WeightedLottery => {
                require!(
                    staker.tier != StakingTier::Public,
                    DiamondPadError::StakingRequired
                );
            },
            _ => {} // Public pools open to all
        }
        
        // Calculate weight based on tier
        let weight = get_tier_weight(staker.tier);
        
        allocation.owner = ctx.accounts.requester.key();
        allocation.launch = launch.key();
        allocation.pool = pool;
        allocation.requested_amount_usd = amount_usd;
        allocation.weight = weight;
        allocation.status = AllocationStatus::Pending;
        allocation.requested_at = clock.unix_timestamp;
        allocation.bump = ctx.bumps.allocation;

        emit!(AllocationRequested {
            owner: allocation.owner,
            launch_id: launch.launch_id,
            pool,
            amount_usd,
            weight,
        });

        Ok(())
    }

    /// Fulfill allocation (called by protocol after lottery/distribution)
    pub fn fulfill_allocation(
        ctx: Context<FulfillAllocation>,
        allocated_tokens: u64,
        vesting_cliff_days: u16,
        vesting_duration_days: u16,
        tge_unlock_bps: u16,
    ) -> Result<()> {
        let allocation = &mut ctx.accounts.allocation;
        let clock = Clock::get()?;
        
        require!(
            ctx.accounts.authority.key() == ctx.accounts.protocol.authority,
            DiamondPadError::Unauthorized
        );
        
        allocation.allocated_tokens = allocated_tokens;
        allocation.vesting_start = clock.unix_timestamp;
        allocation.vesting_cliff_days = vesting_cliff_days;
        allocation.vesting_duration_days = vesting_duration_days;
        allocation.tge_unlock_bps = tge_unlock_bps;
        allocation.tokens_claimed = 0;
        allocation.status = if allocated_tokens > 0 {
            AllocationStatus::Won
        } else {
            AllocationStatus::Lost
        };

        emit!(AllocationFulfilled {
            owner: allocation.owner,
            launch: allocation.launch,
            allocated_tokens,
            status: allocation.status,
        });

        Ok(())
    }

    /// Claim vested tokens from allocation
    pub fn claim_allocation(ctx: Context<ClaimAllocation>) -> Result<()> {
        let allocation = &mut ctx.accounts.allocation;
        let clock = Clock::get()?;
        
        require!(
            allocation.status == AllocationStatus::Won,
            DiamondPadError::NoAllocation
        );
        
        // Calculate claimable amount based on vesting
        let claimable = calculate_vested_amount(
            allocation.allocated_tokens,
            allocation.vesting_start,
            allocation.vesting_cliff_days,
            allocation.vesting_duration_days,
            allocation.tge_unlock_bps,
            clock.unix_timestamp,
        ).checked_sub(allocation.tokens_claimed).unwrap_or(0);
        
        require!(claimable > 0, DiamondPadError::NothingToClaim);
        
        allocation.tokens_claimed = allocation.tokens_claimed.checked_add(claimable).unwrap();
        
        // Token transfer would happen here via CPI
        
        emit!(AllocationClaimed {
            owner: allocation.owner,
            launch: allocation.launch,
            claimed: claimable,
            total_claimed: allocation.tokens_claimed,
            remaining: allocation.allocated_tokens.checked_sub(allocation.tokens_claimed).unwrap(),
        });

        Ok(())
    }

    // ============ Holder Tracking ============

    /// Record a holder's position (called on buy)
    pub fn record_position(
        ctx: Context<RecordPosition>,
        amount: u64,
    ) -> Result<()> {
        let position = &mut ctx.accounts.position;
        let launch = &mut ctx.accounts.launch;
        let clock = Clock::get()?;

        if position.balance == 0 {
            position.holder = ctx.accounts.holder.key();
            position.launch = launch.key();
            position.first_buy_timestamp = clock.unix_timestamp;
            position.bump = ctx.bumps.position;
            launch.holder_count += 1;
        }

        position.balance = position.balance.checked_add(amount).unwrap();
        position.last_activity_timestamp = clock.unix_timestamp;
        position.diamond_rank = calculate_diamond_rank(
            position.first_buy_timestamp,
            clock.unix_timestamp
        );
        position.multiplier_bps = get_diamond_multiplier_bps(position.diamond_rank);

        emit!(PositionUpdated {
            holder: position.holder,
            launch: position.launch,
            balance: position.balance,
            diamond_rank: position.diamond_rank,
            multiplier_bps: position.multiplier_bps,
        });

        Ok(())
    }

    /// Flag a wallet as a bundler
    pub fn flag_bundler(
        ctx: Context<FlagBundler>,
        evidence: String,
    ) -> Result<()> {
        let bundler = &mut ctx.accounts.bundler;
        let protocol = &mut ctx.accounts.protocol;

        bundler.wallet = ctx.accounts.flagged_wallet.key();
        bundler.flagged_at = Clock::get()?.unix_timestamp;
        bundler.evidence = evidence.clone();
        bundler.incident_count = 1;
        bundler.bump = ctx.bumps.bundler;

        protocol.total_bundlers_caught += 1;

        emit!(BundlerFlagged {
            wallet: bundler.wallet,
            evidence,
        });

        Ok(())
    }
}

// ============ Helper Functions ============

fn calculate_staking_tier(amount: u64, lock_days: u16) -> StakingTier {
    if amount >= 100_000_000_000 && lock_days >= 180 { // 100k tokens (assuming 6 decimals)
        StakingTier::Diamond
    } else if amount >= 50_000_000_000 && lock_days >= 90 {
        StakingTier::Gold
    } else if amount >= 20_000_000_000 && lock_days >= 60 {
        StakingTier::Silver
    } else if amount >= 5_000_000_000 && lock_days >= 30 {
        StakingTier::Bronze
    } else {
        StakingTier::Public
    }
}

fn get_tier_weight(tier: StakingTier) -> u16 {
    match tier {
        StakingTier::Diamond => 1000,  // 10x
        StakingTier::Gold => 500,      // 5x
        StakingTier::Silver => 250,    // 2.5x
        StakingTier::Bronze => 100,    // 1x
        StakingTier::Public => 25,     // 0.25x
    }
}

fn calculate_diamond_rank(first_buy: i64, now: i64) -> DiamondRank {
    let days_held = (now - first_buy) / 86400;
    
    if days_held >= 180 { DiamondRank::Diamond }
    else if days_held >= 90 { DiamondRank::Platinum }
    else if days_held >= 60 { DiamondRank::Gold }
    else if days_held >= 30 { DiamondRank::Silver }
    else if days_held >= 7 { DiamondRank::Bronze }
    else { DiamondRank::Paper }
}

fn get_diamond_multiplier_bps(rank: DiamondRank) -> u16 {
    match rank {
        DiamondRank::Paper => 10000,
        DiamondRank::Bronze => 15000,
        DiamondRank::Silver => 20000,
        DiamondRank::Gold => 25000,
        DiamondRank::Platinum => 30000,
        DiamondRank::Diamond => 35000,
    }
}

fn calculate_vested_amount(
    total: u64,
    start: i64,
    cliff_days: u16,
    duration_days: u16,
    tge_bps: u16,
    now: i64,
) -> u64 {
    let tge_amount = total.checked_mul(tge_bps as u64).unwrap() / 10000;
    let vesting_amount = total.checked_sub(tge_amount).unwrap();
    
    let elapsed = now - start;
    let cliff_seconds = cliff_days as i64 * 86400;
    let duration_seconds = duration_days as i64 * 86400;
    
    if elapsed < cliff_seconds {
        return tge_amount;
    }
    
    let vesting_elapsed = elapsed - cliff_seconds;
    if vesting_elapsed >= duration_seconds {
        return total;
    }
    
    let vested = vesting_amount
        .checked_mul(vesting_elapsed as u64).unwrap()
        .checked_div(duration_seconds as u64).unwrap();
    
    tge_amount.checked_add(vested).unwrap()
}

// ============ Account Contexts ============

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        init,
        payer = authority,
        space = Protocol::SIZE,
        seeds = [b"protocol"],
        bump
    )]
    pub protocol: Account<'info, Protocol>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,
    
    #[account(
        init_if_needed,
        payer = owner,
        space = StakerAccount::SIZE,
        seeds = [b"staker", owner.key().as_ref()],
        bump
    )]
    pub staker_account: Account<'info, StakerAccount>,
    
    #[account(mut)]
    pub staker_token_account: Account<'info, TokenAccount>,
    
    #[account(mut, seeds = [b"vault"], bump)]
    pub vault: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,
    
    #[account(
        mut,
        seeds = [b"staker", owner.key().as_ref()],
        bump = staker_account.bump,
        constraint = staker_account.owner == owner.key()
    )]
    pub staker_account: Account<'info, StakerAccount>,
    
    #[account(mut)]
    pub staker_token_account: Account<'info, TokenAccount>,
    
    #[account(mut, seeds = [b"vault"], bump)]
    pub vault: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(name: String, symbol: String)]
pub struct CreateLaunch<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,
    
    #[account(
        init,
        payer = creator,
        space = Launch::SIZE,
        seeds = [b"launch", protocol.total_launches.to_le_bytes().as_ref()],
        bump
    )]
    pub launch: Account<'info, Launch>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RequestAllocation<'info> {
    #[account(mut)]
    pub requester: Signer<'info>,
    
    pub launch: Account<'info, Launch>,
    
    #[account(seeds = [b"staker", requester.key().as_ref()], bump = staker_account.bump)]
    pub staker_account: Account<'info, StakerAccount>,
    
    #[account(
        init,
        payer = requester,
        space = Allocation::SIZE,
        seeds = [b"allocation", launch.key().as_ref(), requester.key().as_ref()],
        bump
    )]
    pub allocation: Account<'info, Allocation>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FulfillAllocation<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,
    
    #[account(mut)]
    pub allocation: Account<'info, Allocation>,
}

#[derive(Accounts)]
pub struct ClaimAllocation<'info> {
    pub claimer: Signer<'info>,
    
    #[account(
        mut,
        constraint = allocation.owner == claimer.key()
    )]
    pub allocation: Account<'info, Allocation>,
}

#[derive(Accounts)]
pub struct RecordPosition<'info> {
    #[account(mut)]
    pub holder: Signer<'info>,
    
    #[account(mut)]
    pub launch: Account<'info, Launch>,
    
    #[account(
        init_if_needed,
        payer = holder,
        space = Position::SIZE,
        seeds = [b"position", launch.key().as_ref(), holder.key().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FlagBundler<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"protocol"],
        bump = protocol.bump,
        constraint = protocol.authority == authority.key()
    )]
    pub protocol: Account<'info, Protocol>,
    
    /// CHECK: Wallet being flagged
    pub flagged_wallet: UncheckedAccount<'info>,
    
    #[account(
        init,
        payer = authority,
        space = Bundler::SIZE,
        seeds = [b"bundler", flagged_wallet.key().as_ref()],
        bump
    )]
    pub bundler: Account<'info, Bundler>,
    
    pub system_program: Program<'info, System>,
}

// ============ State Accounts ============

#[account]
pub struct Protocol {
    pub authority: Pubkey,
    pub launch_token_mint: Pubkey,
    pub total_launches: u64,
    pub total_stakers: u64,
    pub total_staked: u64,
    pub total_bundlers_caught: u64,
    pub early_unstake_penalty_bps: u16,
    pub bump: u8,
}

impl Protocol {
    pub const SIZE: usize = 8 + 32 + 32 + 8 + 8 + 8 + 8 + 2 + 1 + 64;
}

#[account]
pub struct StakerAccount {
    pub owner: Pubkey,
    pub staked_amount: u64,
    pub staked_at: i64,
    pub lock_end_timestamp: i64,
    pub tier: StakingTier,
    pub strong_holder_score: u16,
    pub total_allocations_received: u32,
    pub last_update_timestamp: i64,
    pub bump: u8,
}

impl StakerAccount {
    pub const SIZE: usize = 8 + 32 + 8 + 8 + 8 + 1 + 2 + 4 + 8 + 1 + 64;
}

#[account]
pub struct Launch {
    pub creator: Pubkey,
    pub name: String,
    pub symbol: String,
    pub total_supply: u64,
    pub dev_allocation_bps: u16,
    pub dev_vesting_days: u16,
    pub lp_lock_days: u16,
    pub holder_rewards_bps: u16,
    pub created_at: i64,
    pub launch_id: u64,
    pub status: LaunchStatus,
    pub total_raised: u64,
    pub holder_count: u64,
    // Allocation pools
    pub guaranteed_pool_bps: u16,
    pub lottery_pool_bps: u16,
    pub public_pool_bps: u16,
    pub fcfs_pool_bps: u16,
    pub flipper_pool_bps: u16,
    pub liquidity_pool_bps: u16,
    pub trader_rewards_pool_bps: u16,
    pub bump: u8,
}

impl Launch {
    pub const SIZE: usize = 8 + 32 + 36 + 14 + 8 + 2 + 2 + 2 + 2 + 8 + 8 + 1 + 8 + 8 + 2 + 2 + 2 + 2 + 2 + 2 + 2 + 1 + 64;
}

#[account]
pub struct Allocation {
    pub owner: Pubkey,
    pub launch: Pubkey,
    pub pool: AllocationPool,
    pub requested_amount_usd: u64,
    pub allocated_tokens: u64,
    pub weight: u16,
    pub status: AllocationStatus,
    pub requested_at: i64,
    pub vesting_start: i64,
    pub vesting_cliff_days: u16,
    pub vesting_duration_days: u16,
    pub tge_unlock_bps: u16,
    pub tokens_claimed: u64,
    pub bump: u8,
}

impl Allocation {
    pub const SIZE: usize = 8 + 32 + 32 + 1 + 8 + 8 + 2 + 1 + 8 + 8 + 2 + 2 + 2 + 8 + 1 + 64;
}

#[account]
pub struct Position {
    pub holder: Pubkey,
    pub launch: Pubkey,
    pub balance: u64,
    pub first_buy_timestamp: i64,
    pub last_activity_timestamp: i64,
    pub last_claim_timestamp: i64,
    pub diamond_rank: DiamondRank,
    pub multiplier_bps: u16,
    pub total_rewards_claimed: u64,
    pub bump: u8,
}

impl Position {
    pub const SIZE: usize = 8 + 32 + 32 + 8 + 8 + 8 + 8 + 1 + 2 + 8 + 1 + 64;
}

#[account]
pub struct Bundler {
    pub wallet: Pubkey,
    pub flagged_at: i64,
    pub evidence: String,
    pub incident_count: u32,
    pub bump: u8,
}

impl Bundler {
    pub const SIZE: usize = 8 + 32 + 8 + 256 + 4 + 1 + 64;
}

// ============ Enums ============

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum StakingTier {
    Public,
    Bronze,
    Silver,
    Gold,
    Diamond,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum LaunchStatus {
    Pending,
    Active,
    Graduated,
    Failed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum DiamondRank {
    Paper,
    Bronze,
    Silver,
    Gold,
    Platinum,
    Diamond,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum AllocationPool {
    Guaranteed,
    WeightedLottery,
    PublicLottery,
    FCFS,
    Flipper,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum AllocationStatus {
    Pending,
    Won,
    Lost,
    Claimed,
}

// ============ Events ============

#[event]
pub struct Staked {
    pub owner: Pubkey,
    pub amount: u64,
    pub lock_days: u16,
    pub tier: StakingTier,
    pub total_staked: u64,
}

#[event]
pub struct Unstaked {
    pub owner: Pubkey,
    pub amount: u64,
    pub return_amount: u64,
    pub penalty_amount: u64,
    pub early: bool,
    pub remaining_stake: u64,
    pub new_tier: StakingTier,
}

#[event]
pub struct LaunchCreated {
    pub launch_id: u64,
    pub creator: Pubkey,
    pub name: String,
    pub symbol: String,
    pub total_supply: u64,
    pub dev_allocation_bps: u16,
    pub dev_vesting_days: u16,
}

#[event]
pub struct AllocationRequested {
    pub owner: Pubkey,
    pub launch_id: u64,
    pub pool: AllocationPool,
    pub amount_usd: u64,
    pub weight: u16,
}

#[event]
pub struct AllocationFulfilled {
    pub owner: Pubkey,
    pub launch: Pubkey,
    pub allocated_tokens: u64,
    pub status: AllocationStatus,
}

#[event]
pub struct AllocationClaimed {
    pub owner: Pubkey,
    pub launch: Pubkey,
    pub claimed: u64,
    pub total_claimed: u64,
    pub remaining: u64,
}

#[event]
pub struct PositionUpdated {
    pub holder: Pubkey,
    pub launch: Pubkey,
    pub balance: u64,
    pub diamond_rank: DiamondRank,
    pub multiplier_bps: u16,
}

#[event]
pub struct BundlerFlagged {
    pub wallet: Pubkey,
    pub evidence: String,
}

// ============ Errors ============

#[error_code]
pub enum DiamondPadError {
    #[msg("Dev allocation cannot exceed 10% (1000 bps)")]
    DevAllocationTooHigh,
    
    #[msg("Dev vesting must be at least 180 days")]
    VestingTooShort,
    
    #[msg("LP must be locked for at least 365 days")]
    LpLockTooShort,
    
    #[msg("Token name too long (max 32 chars)")]
    NameTooLong,
    
    #[msg("Token symbol too long (max 10 chars)")]
    SymbolTooLong,
    
    #[msg("Unauthorized")]
    Unauthorized,
    
    #[msg("Invalid amount")]
    InvalidAmount,
    
    #[msg("Insufficient stake")]
    InsufficientStake,
    
    #[msg("Tier too low for this pool")]
    TierTooLow,
    
    #[msg("Staking required for this pool")]
    StakingRequired,
    
    #[msg("No allocation to claim")]
    NoAllocation,
    
    #[msg("Nothing to claim yet")]
    NothingToClaim,
}
