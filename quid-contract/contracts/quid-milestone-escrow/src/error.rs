use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum MilestoneEscrowError {
    InvalidState = 1,
    InvalidAmount = 2,
    ProgramNotFound = 3,
    MilestoneNotFound = 4,
    NotAuthorized = 5,
    /// Issue #293: a status setter was called before `initialize` set an admin.
    NotInitialized = 6,
    /// Issue #293: `initialize` may only run once.
    AlreadyInitialized = 7,
}
