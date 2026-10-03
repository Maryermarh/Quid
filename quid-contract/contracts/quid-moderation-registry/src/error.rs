use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ModerationError {
    /// `initialize` was already called.
    AlreadyInitialized = 1,
    /// The registry has no admin yet.
    NotInitialized = 2,
    /// Caller is neither the admin nor an active moderator.
    NotModerator = 3,
    /// Target address is already banned.
    AlreadyBanned = 4,
    /// Target address is not banned.
    NotBanned = 5,
    /// Target address is not muted.
    NotMuted = 6,
    /// Mute expiry must be strictly in the future.
    InvalidMuteExpiry = 7,
    /// The admin cannot be banned or muted (it would lock out recovery).
    CannotModerateAdmin = 8,
}
