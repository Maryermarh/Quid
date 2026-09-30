use soroban_sdk::{contracttype, Address, String};

#[derive(Clone, Debug, Default, PartialEq, Eq, Copy)]
#[contracttype]
pub enum MissionStatus {
    #[default]
    Created,
    Open,
    Started,
    Paused,
    Completed,
    Cancelled,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Copy)]
#[contracttype]
pub enum SubmissionStatus {
    #[default]
    Pending,
    Approved,
    Paid,
    Rejected,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Mission {
    pub id: u64,
    pub owner: Address,
    pub title: String,
    pub description_cid: String,
    pub reward_token: Address,
    pub reward_amount: i128,
    pub max_participants: u32,
    pub participants_count: u32,
    pub status: MissionStatus,
    pub created_at: u64,
    pub min_asset: Option<Address>,
    pub min_asset_amount: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Submission {
    pub hunter: Address,
    pub ipfs_cid: String,
    pub status: SubmissionStatus,
    pub submitted_at: u64,
}

#[contracttype]
pub enum DataKey {
    Mission(u64),
    MissionCount,
    Submission(u64, Address),
    HunterStake(u64, Address),
    Treasury,
    /// Optional reusable hunter stake pool.
    StakingPool,
    /// Optional protocol fee vault (`quid-fee-collector`) charged on mission create.
    FeeCollector,
    /// Optional `quid-moderation-registry` consulted by `submit_feedback` (#305).
    ModerationRegistry,
}
