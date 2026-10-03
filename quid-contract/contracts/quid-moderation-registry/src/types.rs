use soroban_sdk::{contracttype, Address};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    /// Registry admin: grants and revokes moderators.
    Admin,
    /// `true` while an address holds the moderator role.
    Moderator(Address),
    /// Present while an address is banned.
    Banned(Address),
    /// Present while an address is muted (until `MuteRecord::until`).
    Muted(Address),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BanRecord {
    /// Moderator (or admin) who issued the ban.
    pub moderator: Address,
    /// Ledger timestamp of the ban.
    pub banned_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MuteRecord {
    /// Moderator (or admin) who issued the mute.
    pub moderator: Address,
    /// Ledger timestamp after which the mute no longer applies (exclusive).
    pub until: u64,
}
