#![cfg(test)]

use super::*;
use crate::types::MissionStatus;
use soroban_sdk::testutils::Events;
use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};
use soroban_sdk::{
    testutils::Address as _, Address, Env, Map as SorobanMap, String, Symbol, TryFromVal, Val,
};

fn setup_test_env() -> (Env, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(QuidStoreContract, ());
    let token_admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_address = token_contract.address();
    let owner = Address::generate(&env);
    let token_admin_client = StellarAssetClient::new(&env, &token_address);
    token_admin_client.mint(&owner, &1_000_000_000_000);

    (env, contract_id, owner, token_address)
}

fn mint_tokens_for_hunter(env: &Env, token_address: &Address, hunter: &Address, amount: i128) {
    let token_admin_client = StellarAssetClient::new(env, token_address);
    token_admin_client.mint(hunter, &amount);
}

#[test]
fn test_happy_path_create_submit_payout() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    let token_client = TokenClient::new(&env, &token_address);

    let hunter = Address::generate(&env);
    let reward_amount = 100;
    let stake = 10;

    mint_tokens_for_hunter(&env, &token_address, &hunter, 1000);

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount,
    };

    let min_asset = MinAsset {
        min_asset_token: None,
        min_asset_amount: 0,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "Happy Path"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &5,
        &min_asset,
    );

    let cid = String::from_str(&env, "QmSubmission");
    client.submit_feedback(&mission_id, &hunter, &cid, &token_address, &stake);

    let balance_before = token_client.balance(&hunter);
    client.payout_participant(&mission_id, &hunter);

    let balance_after = token_client.balance(&hunter);
    // Hunter receives reward + stake refund
    assert_eq!(balance_after, balance_before + reward_amount + stake);

    let mission = client.get_mission(&mission_id);
    assert_eq!(mission.participants_count, 1);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_prevent_double_submission() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    let hunter = Address::generate(&env);

    mint_tokens_for_hunter(&env, &token_address, &hunter, 1000);

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 100,
    };

    let min_asset = MinAsset {
        min_asset_token: None,
        min_asset_amount: 0,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "Double Sub Test"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &5,
        &min_asset,
    );

    let cid = String::from_str(&env, "QmFirst");
    client.submit_feedback(&mission_id, &hunter, &cid, &token_address, &10);
    client.submit_feedback(&mission_id, &hunter, &cid, &token_address, &10);
}

#[test]
fn test_cancel_mission_refund() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    let token_client = TokenClient::new(&env, &token_address);

    let reward_amount: i128 = 100;
    let slots: u32 = 10;
    let total_deposit = reward_amount * (slots as i128);

    let min_asset = MinAsset {
        min_asset_token: None,
        min_asset_amount: 0,
    };

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "Refund Test"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &slots,
        &min_asset,
    );

    let contract_balance = token_client.balance(&contract_id);
    assert_eq!(contract_balance, total_deposit);

    client.cancel_mission(&mission_id);

    let contract_balance_after = token_client.balance(&contract_id);
    assert_eq!(contract_balance_after, 0);

    let mission = client.get_mission(&mission_id);
    assert_eq!(mission.status, MissionStatus::Cancelled);
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_mission_capacity_limit() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 100,
    };

    let min_asset = MinAsset {
        min_asset_token: None,
        min_asset_amount: 0,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "Full Test"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &1,
        &min_asset,
    );

    let hunter1 = Address::generate(&env);
    let hunter2 = Address::generate(&env);
    mint_tokens_for_hunter(&env, &token_address, &hunter1, 1000);
    mint_tokens_for_hunter(&env, &token_address, &hunter2, 1000);
    let cid = String::from_str(&env, "QmVal");

    client.submit_feedback(&mission_id, &hunter1, &cid, &token_address, &10);
    client.submit_feedback(&mission_id, &hunter2, &cid, &token_address, &10);

    client.payout_participant(&mission_id, &hunter1);
    client.payout_participant(&mission_id, &hunter2);
}

#[test]
#[should_panic(expected = "Error(Contract, #9)")]
fn test_cannot_payout_twice() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    let hunter = Address::generate(&env);

    mint_tokens_for_hunter(&env, &token_address, &hunter, 1000);

    let min_asset = MinAsset {
        min_asset_token: None,
        min_asset_amount: 0,
    };

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 100,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "Double Pay"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &5,
        &min_asset,
    );

    client.submit_feedback(
        &mission_id,
        &hunter,
        &String::from_str(&env, "Qm"),
        &token_address,
        &10,
    );
    client.payout_participant(&mission_id, &hunter);
    client.payout_participant(&mission_id, &hunter);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_get_mission_not_found() {
    let (env, contract_id, _owner, _token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    let _ = client.get_mission(&999);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_submit_feedback_mission_not_found() {
    let (env, contract_id, _owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    let hunter = Address::generate(&env);
    mint_tokens_for_hunter(&env, &token_address, &hunter, 1000);
    client.submit_feedback(
        &999,
        &hunter,
        &String::from_str(&env, "Qm"),
        &token_address,
        &10,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #7)")]
fn test_create_mission_negative_reward() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 0,
    };

    let min_asset = MinAsset {
        min_asset_token: None,
        min_asset_amount: 0,
    };

    let _ = client.create_mission(
        &owner,
        &String::from_str(&env, "Bad Reward"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &5,
        &min_asset,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #10)")]
fn test_submit_feedback_when_paused() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    let hunter = Address::generate(&env);

    mint_tokens_for_hunter(&env, &token_address, &hunter, 1000);

    let min_asset = MinAsset {
        min_asset_token: None,
        min_asset_amount: 0,
    };

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 100,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "Pause Test"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &5,
        &min_asset,
    );
    client.pause_mission(&mission_id);
    client.submit_feedback(
        &mission_id,
        &hunter,
        &String::from_str(&env, "Qm"),
        &token_address,
        &10,
    );
}

#[test]
fn test_cancel_mission_partial_payouts_refund() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    let token_client = TokenClient::new(&env, &token_address);

    let reward_amount: i128 = 100;
    let slots: u32 = 3;

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount,
    };

    let min_asset = MinAsset {
        min_asset_token: None,
        min_asset_amount: 0,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "Partial Refund"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &slots,
        &min_asset,
    );

    let hunter = Address::generate(&env);
    mint_tokens_for_hunter(&env, &token_address, &hunter, 1000);
    client.submit_feedback(
        &mission_id,
        &hunter,
        &String::from_str(&env, "QmSub"),
        &token_address,
        &10,
    );
    client.payout_participant(&mission_id, &hunter);

    let owner_balance_before_cancel = token_client.balance(&owner);
    client.cancel_mission(&mission_id);
    let owner_balance_after_cancel = token_client.balance(&owner);

    let expected_refund = (slots - 1) as i128 * reward_amount;
    assert_eq!(
        owner_balance_after_cancel,
        owner_balance_before_cancel + expected_refund
    );

    let contract_balance = token_client.balance(&contract_id);
    // Contract should have no stake left (refunded to hunter)
    assert_eq!(contract_balance, 0);

    let mission = client.get_mission(&mission_id);
    assert_eq!(mission.status, MissionStatus::Cancelled);
}

#[test]
#[should_panic(expected = "Error(Contract, #11)")]
fn test_payout_without_submission() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    let hunter = Address::generate(&env);

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 100,
    };

    let min_asset = MinAsset {
        min_asset_token: None,
        min_asset_amount: 0,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "No Sub"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &5,
        &min_asset,
    );
    client.payout_participant(&mission_id, &hunter);
}

#[test]
fn test_stake_deducted_on_submission() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    let token_client = TokenClient::new(&env, &token_address);

    let hunter = Address::generate(&env);
    let stake_amount = 50;
    mint_tokens_for_hunter(&env, &token_address, &hunter, 1000);

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 100,
    };

    let min_asset = MinAsset {
        min_asset_token: None,
        min_asset_amount: 0,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "Stake Test"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &5,
        &min_asset,
    );

    let hunter_balance_before = token_client.balance(&hunter);
    let contract_balance_before = token_client.balance(&contract_id);

    client.submit_feedback(
        &mission_id,
        &hunter,
        &String::from_str(&env, "QmSubmission"),
        &token_address,
        &stake_amount,
    );

    let hunter_balance_after = token_client.balance(&hunter);
    let contract_balance_after = token_client.balance(&contract_id);

    assert_eq!(hunter_balance_after, hunter_balance_before - stake_amount);
    assert_eq!(
        contract_balance_after,
        contract_balance_before + stake_amount
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #13)")]
fn test_stake_invalid_amount_zero() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    let hunter = Address::generate(&env);

    mint_tokens_for_hunter(&env, &token_address, &hunter, 1000);

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 100,
    };

    let min_asset = MinAsset {
        min_asset_token: None,
        min_asset_amount: 0,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "Invalid Stake"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &5,
        &min_asset,
    );

    client.submit_feedback(
        &mission_id,
        &hunter,
        &String::from_str(&env, "QmSubmission"),
        &token_address,
        &0,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #13)")]
fn test_stake_invalid_amount_negative() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    let hunter = Address::generate(&env);

    mint_tokens_for_hunter(&env, &token_address, &hunter, 1000);

    let min_asset = MinAsset {
        min_asset_token: None,
        min_asset_amount: 0,
    };

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 100,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "Negative Stake"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &5,
        &min_asset,
    );

    client.submit_feedback(
        &mission_id,
        &hunter,
        &String::from_str(&env, "QmSubmission"),
        &token_address,
        &-10,
    );
}

#[test]
fn test_update_submission_success() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    let hunter = Address::generate(&env);

    mint_tokens_for_hunter(&env, &token_address, &hunter, 1000);

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 100,
    };

    let min_asset = MinAsset {
        min_asset_token: None,
        min_asset_amount: 0,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "Update Test"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &5,
        &min_asset,
    );

    let original_cid = String::from_str(&env, "QmOriginal");
    client.submit_feedback(&mission_id, &hunter, &original_cid, &token_address, &10);

    let new_cid = String::from_str(&env, "QmUpdated");
    client.update_submission(&mission_id, &hunter, &new_cid);

    // Verify submission was updated (by trying to payout - should work)
    client.payout_participant(&mission_id, &hunter);
}

#[test]
#[should_panic(expected = "Error(Contract, #9)")]
fn test_update_submission_after_payout() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    let hunter = Address::generate(&env);

    mint_tokens_for_hunter(&env, &token_address, &hunter, 1000);

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 100,
    };

    let min_asset = MinAsset {
        min_asset_token: None,
        min_asset_amount: 0,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "Update After Pay"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &5,
        &min_asset,
    );

    client.submit_feedback(
        &mission_id,
        &hunter,
        &String::from_str(&env, "QmFirst"),
        &token_address,
        &10,
    );
    client.payout_participant(&mission_id, &hunter);

    // Should fail: already paid
    client.update_submission(&mission_id, &hunter, &String::from_str(&env, "QmNew"));
}

#[test]
#[should_panic(expected = "Error(Contract, #11)")]
fn test_update_submission_not_found() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    let hunter = Address::generate(&env);

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 100,
    };

    let min_asset = MinAsset {
        min_asset_token: None,
        min_asset_amount: 0,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "No Sub Update"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &5,
        &min_asset,
    );

    // Try to update without submitting first
    client.update_submission(&mission_id, &hunter, &String::from_str(&env, "QmNew"));
}

#[test]
#[should_panic(expected = "Error(Contract, #10)")]
fn test_update_submission_mission_not_open() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    let hunter = Address::generate(&env);

    mint_tokens_for_hunter(&env, &token_address, &hunter, 1000);

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 100,
    };

    let min_asset = MinAsset {
        min_asset_token: None,
        min_asset_amount: 0,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "Paused Update"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &5,
        &min_asset,
    );

    client.submit_feedback(
        &mission_id,
        &hunter,
        &String::from_str(&env, "QmFirst"),
        &token_address,
        &10,
    );
    client.pause_mission(&mission_id);

    // Should fail: mission is paused
    client.update_submission(&mission_id, &hunter, &String::from_str(&env, "QmNew"));
}

#[test]
fn test_create_mission_with_asset_gating() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);

    let gating_token = Address::generate(&env);
    let min_amount: i128 = 1000;

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 100,
    };

    let min_asset = MinAsset {
        min_asset_token: Some(gating_token.clone()),
        min_asset_amount: min_amount,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "Gated Mission"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &5,
        &min_asset,
    );

    let mission = client.get_mission(&mission_id);
    assert_eq!(mission.min_asset, Some(gating_token));
    assert_eq!(mission.min_asset_amount, min_amount);
}

#[test]
fn test_create_mission_without_asset_gating() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 100,
    };

    let min_asset = MinAsset {
        min_asset_token: None,
        min_asset_amount: 0,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "No Gate"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &5,
        &min_asset,
    );

    let mission = client.get_mission(&mission_id);
    assert_eq!(mission.min_asset, None);
    assert_eq!(mission.min_asset_amount, 0);
}

#[test]
#[should_panic(expected = "Error(Contract, #13)")]
fn test_create_mission_with_zero_asset_amount() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);

    let gating_token = Address::generate(&env);

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 100,
    };

    let min_asset = MinAsset {
        min_asset_token: Some(gating_token),
        min_asset_amount: 0,
    };

    let _ = client.create_mission(
        &owner,
        &String::from_str(&env, "Invalid Gate"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &5,
        &min_asset,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #13)")]
fn test_create_mission_with_negative_asset_amount() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);

    let gating_token = Address::generate(&env);

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 100,
    };

    let min_asset = MinAsset {
        min_asset_token: Some(gating_token),
        min_asset_amount: -100,
    };

    let _ = client.create_mission(
        &owner,
        &String::from_str(&env, "Negative Gate"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &5,
        &min_asset,
    );
}

#[test]
fn test_full_lifecycle_integration() {
    // Setup environment
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    let token_client = TokenClient::new(&env, &token_address);

    // Create hunter and mint tokens
    let hunter = Address::generate(&env);
    let hunter_initial_balance: i128 = 1000;
    mint_tokens_for_hunter(&env, &token_address, &hunter, hunter_initial_balance);

    // Mission parameters
    let reward_amount: i128 = 100;
    let stake_amount: i128 = 10;
    let max_participants: u32 = 5;

    // Record initial balances
    let owner_balance_initial = token_client.balance(&owner);
    let hunter_balance_initial = token_client.balance(&hunter);
    let contract_balance_initial = token_client.balance(&contract_id);

    // Step 1: Create mission
    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount,
    };

    let min_asset = MinAsset {
        min_asset_token: None,
        min_asset_amount: 0,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "Full Lifecycle Test"),
        &String::from_str(&env, "QmTestDescription"),
        &reward,
        &max_participants,
        &min_asset,
    );

    // Verify mission was created
    let mission = client.get_mission(&mission_id);
    assert_eq!(mission.id, mission_id);
    assert_eq!(mission.owner, owner);
    assert_eq!(mission.reward_amount, reward_amount);
    assert_eq!(mission.max_participants, max_participants);
    assert_eq!(mission.participants_count, 0);
    assert_eq!(mission.status, MissionStatus::Open);

    // Verify balances after mission creation
    let total_reward_pool = reward_amount * (max_participants as i128);
    let owner_balance_after_create = token_client.balance(&owner);
    let contract_balance_after_create = token_client.balance(&contract_id);

    assert_eq!(
        owner_balance_after_create,
        owner_balance_initial - total_reward_pool
    );
    assert_eq!(
        contract_balance_after_create,
        contract_balance_initial + total_reward_pool
    );

    // Step 2: Submit work
    let submission_cid = String::from_str(&env, "QmSubmissionHash");
    client.submit_feedback(
        &mission_id,
        &hunter,
        &submission_cid,
        &token_address,
        &stake_amount,
    );

    // Verify balances after submission (stake deducted)
    let hunter_balance_after_submit = token_client.balance(&hunter);
    let contract_balance_after_submit = token_client.balance(&contract_id);

    assert_eq!(
        hunter_balance_after_submit,
        hunter_balance_initial - stake_amount
    );
    assert_eq!(
        contract_balance_after_submit,
        contract_balance_after_create + stake_amount
    );

    // Step 3: Payout participant
    client.payout_participant(&mission_id, &hunter);

    // Verify final balances
    let hunter_balance_final = token_client.balance(&hunter);
    let contract_balance_final = token_client.balance(&contract_id);
    let mission_final = client.get_mission(&mission_id);

    // Hunter should have: initial - stake + stake + reward = initial + reward
    assert_eq!(hunter_balance_final, hunter_balance_initial + reward_amount);

    // Contract should have: initial pool + stake - reward - stake = initial pool - reward
    assert_eq!(
        contract_balance_final,
        contract_balance_after_create - reward_amount
    );

    // Mission should be updated
    assert_eq!(mission_final.participants_count, 1);
    assert_eq!(mission_final.status, MissionStatus::Open);

    // Verify the submission status was updated
    // (We can't directly access submission, but payout wouldn't work if status wasn't Pending)
}

#[test]
fn test_set_and_get_treasury() {
    let (env, contract_id, _owner, _token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);

    let treasury = Address::generate(&env);
    client.set_treasury(&treasury);

    let stored = client.get_treasury();
    assert_eq!(stored, treasury);
}

#[test]
#[should_panic(expected = "Error(Contract, #14)")]
fn test_get_treasury_not_set() {
    let (env, contract_id, _owner, _token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    client.get_treasury();
}

#[test]
fn test_slash_stake_sends_to_treasury() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    let token_client = TokenClient::new(&env, &token_address);

    let treasury = Address::generate(&env);
    client.set_treasury(&treasury);

    let hunter = Address::generate(&env);
    let stake_amount: i128 = 50;
    mint_tokens_for_hunter(&env, &token_address, &hunter, 1000);

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 100,
    };
    let min_asset = MinAsset {
        min_asset_token: None,
        min_asset_amount: 0,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "Slash Test"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &5,
        &min_asset,
    );

    client.submit_feedback(
        &mission_id,
        &hunter,
        &String::from_str(&env, "QmSpam"),
        &token_address,
        &stake_amount,
    );

    let treasury_balance_before = token_client.balance(&treasury);

    client.slash_hunter_stake(&mission_id, &hunter, &token_address);

    let treasury_balance_after = token_client.balance(&treasury);
    assert_eq!(
        treasury_balance_after,
        treasury_balance_before + stake_amount
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #15)")]
fn test_slash_stake_not_found() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);

    let treasury = Address::generate(&env);
    client.set_treasury(&treasury);

    let hunter = Address::generate(&env);

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 100,
    };
    let min_asset = MinAsset {
        min_asset_token: None,
        min_asset_amount: 0,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "No Stake"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &5,
        &min_asset,
    );

    // No submission — stake doesn't exist
    client.slash_hunter_stake(&mission_id, &hunter, &token_address);
}

#[test]
#[should_panic(expected = "Error(Contract, #14)")]
fn test_slash_stake_treasury_not_set() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);

    let hunter = Address::generate(&env);
    mint_tokens_for_hunter(&env, &token_address, &hunter, 1000);

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 100,
    };
    let min_asset = MinAsset {
        min_asset_token: None,
        min_asset_amount: 0,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "No Treasury"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &5,
        &min_asset,
    );

    client.submit_feedback(
        &mission_id,
        &hunter,
        &String::from_str(&env, "QmSpam"),
        &token_address,
        &50,
    );

    // Treasury not set — should fail
    client.slash_hunter_stake(&mission_id, &hunter, &token_address);
}

#[test]
fn test_slash_stake_removes_storage_key() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);

    let treasury = Address::generate(&env);
    client.set_treasury(&treasury);

    let hunter = Address::generate(&env);
    mint_tokens_for_hunter(&env, &token_address, &hunter, 1000);

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 100,
    };
    let min_asset = MinAsset {
        min_asset_token: None,
        min_asset_amount: 0,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "Key Removal"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &5,
        &min_asset,
    );

    client.submit_feedback(
        &mission_id,
        &hunter,
        &String::from_str(&env, "QmSpam"),
        &token_address,
        &50,
    );

    client.slash_hunter_stake(&mission_id, &hunter, &token_address);

    // Slashing again should fail because the key was removed
    let result = client.try_slash_hunter_stake(&mission_id, &hunter, &token_address);
    assert!(result.is_err());
}

#[test]
fn test_refund_stake_success() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    let token_client = TokenClient::new(&env, &token_address);

    let hunter = Address::generate(&env);
    let stake_amount: i128 = 50;
    mint_tokens_for_hunter(&env, &token_address, &hunter, 1000);

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 100,
    };
    let min_asset = MinAsset {
        min_asset_token: None,
        min_asset_amount: 0,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "Refund Test"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &5,
        &min_asset,
    );

    // Submit feedback with stake
    client.submit_feedback(
        &mission_id,
        &hunter,
        &String::from_str(&env, "QmSubmission"),
        &token_address,
        &stake_amount,
    );

    let hunter_balance_after_submit = token_client.balance(&hunter);
    let contract_balance_after_submit = token_client.balance(&contract_id);

    // Call refund_stake (via payout which should call it internally)
    client.payout_participant(&mission_id, &hunter);

    // After payout, hunter should have reward + stake refund
    let hunter_balance_after_payout = token_client.balance(&hunter);
    let contract_balance_after_payout = token_client.balance(&contract_id);

    // Hunter gets reward + stake back: balance_after_submit + reward_amount + stake_amount
    assert_eq!(
        hunter_balance_after_payout,
        hunter_balance_after_submit + reward.reward_amount + stake_amount
    );

    // Contract should have lost both reward and stake
    assert_eq!(
        contract_balance_after_payout,
        contract_balance_after_submit - reward.reward_amount - stake_amount
    );
}

#[test]
fn test_refund_stake_no_stake_exists() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    let token_client = TokenClient::new(&env, &token_address);

    let hunter = Address::generate(&env);
    mint_tokens_for_hunter(&env, &token_address, &hunter, 1000);

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 100,
    };
    let min_asset = MinAsset {
        min_asset_token: None,
        min_asset_amount: 0,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "No Stake Refund"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &5,
        &min_asset,
    );

    // Submit without stake by first slashing it
    let stake_amount: i128 = 50;
    client.submit_feedback(
        &mission_id,
        &hunter,
        &String::from_str(&env, "QmSubmission"),
        &token_address,
        &stake_amount,
    );

    // Set treasury and slash the stake (removes it from storage)
    let treasury = Address::generate(&env);
    client.set_treasury(&treasury);
    client.slash_hunter_stake(&mission_id, &hunter, &token_address);

    let hunter_balance_before = token_client.balance(&hunter);

    // Now payout - refund_stake should handle missing stake gracefully
    // Should not panic, just skip the refund and pay the reward
    client.payout_participant(&mission_id, &hunter);

    let hunter_balance_after = token_client.balance(&hunter);

    // Hunter should only receive reward (no stake to refund)
    assert_eq!(
        hunter_balance_after,
        hunter_balance_before + reward.reward_amount
    );
}

#[test]
fn test_refund_stake_removes_storage_key() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    let token_client = TokenClient::new(&env, &token_address);

    let hunter = Address::generate(&env);
    let stake_amount: i128 = 50;
    mint_tokens_for_hunter(&env, &token_address, &hunter, 1000);

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 100,
    };
    let min_asset = MinAsset {
        min_asset_token: None,
        min_asset_amount: 0,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "Key Removal Test"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &5,
        &min_asset,
    );

    client.submit_feedback(
        &mission_id,
        &hunter,
        &String::from_str(&env, "QmSubmission"),
        &token_address,
        &stake_amount,
    );

    let hunter_balance_before = token_client.balance(&hunter);
    let contract_balance_before = token_client.balance(&contract_id);

    // Payout should refund stake and pay reward
    client.payout_participant(&mission_id, &hunter);

    let hunter_balance_after = token_client.balance(&hunter);
    let contract_balance_after = token_client.balance(&contract_id);

    // Verify hunter received reward + stake
    assert_eq!(
        hunter_balance_after,
        hunter_balance_before + reward.reward_amount + stake_amount
    );

    // Verify contract balance decreased by reward + stake
    assert_eq!(
        contract_balance_after,
        contract_balance_before - reward.reward_amount - stake_amount
    );

    // Storage key should be removed - attempting to payout again should fail
    let result = client.try_payout_participant(&mission_id, &hunter);
    assert!(result.is_err());
}

#[test]
fn test_refund_stake_correct_amount() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    let token_client = TokenClient::new(&env, &token_address);

    let hunter = Address::generate(&env);
    let stake_amount: i128 = 75;
    mint_tokens_for_hunter(&env, &token_address, &hunter, 1000);

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 100,
    };
    let min_asset = MinAsset {
        min_asset_token: None,
        min_asset_amount: 0,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "Amount Test"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &5,
        &min_asset,
    );

    let hunter_balance_initial = token_client.balance(&hunter);

    client.submit_feedback(
        &mission_id,
        &hunter,
        &String::from_str(&env, "QmSubmission"),
        &token_address,
        &stake_amount,
    );

    let hunter_balance_after_submit = token_client.balance(&hunter);
    assert_eq!(
        hunter_balance_after_submit,
        hunter_balance_initial - stake_amount
    );

    // Once refund_stake is integrated into payout:
    // hunter should receive both reward AND stake back
    // Expected: initial - stake + stake + reward = initial + reward
}

#[test]
fn test_refund_stake_multiple_hunters() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    let token_client = TokenClient::new(&env, &token_address);

    let hunter1 = Address::generate(&env);
    let hunter2 = Address::generate(&env);
    let stake_amount_1: i128 = 30;
    let stake_amount_2: i128 = 50;

    mint_tokens_for_hunter(&env, &token_address, &hunter1, 1000);
    mint_tokens_for_hunter(&env, &token_address, &hunter2, 1000);

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 100,
    };
    let min_asset = MinAsset {
        min_asset_token: None,
        min_asset_amount: 0,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "Multi Hunter"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &5,
        &min_asset,
    );

    // Both hunters submit with different stakes
    client.submit_feedback(
        &mission_id,
        &hunter1,
        &String::from_str(&env, "QmSub1"),
        &token_address,
        &stake_amount_1,
    );

    client.submit_feedback(
        &mission_id,
        &hunter2,
        &String::from_str(&env, "QmSub2"),
        &token_address,
        &stake_amount_2,
    );

    let hunter1_balance_after_submit = token_client.balance(&hunter1);
    let hunter2_balance_after_submit = token_client.balance(&hunter2);

    // Payout both hunters
    client.payout_participant(&mission_id, &hunter1);
    client.payout_participant(&mission_id, &hunter2);

    // Each hunter should get their reward + their stake back
    let hunter1_balance_final = token_client.balance(&hunter1);
    let hunter2_balance_final = token_client.balance(&hunter2);

    assert_eq!(
        hunter1_balance_final,
        hunter1_balance_after_submit + reward.reward_amount + stake_amount_1
    );
    assert_eq!(
        hunter2_balance_final,
        hunter2_balance_after_submit + reward.reward_amount + stake_amount_2
    );
}

#[test]
fn test_refund_stake_prevents_double_refund() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    let token_client = TokenClient::new(&env, &token_address);

    let hunter = Address::generate(&env);
    let stake_amount: i128 = 50;
    mint_tokens_for_hunter(&env, &token_address, &hunter, 1000);

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 100,
    };
    let min_asset = MinAsset {
        min_asset_token: None,
        min_asset_amount: 0,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "Double Refund Test"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &5,
        &min_asset,
    );

    client.submit_feedback(
        &mission_id,
        &hunter,
        &String::from_str(&env, "QmSubmission"),
        &token_address,
        &stake_amount,
    );

    let hunter_balance_before_payout = token_client.balance(&hunter);

    // First payout - should refund stake
    client.payout_participant(&mission_id, &hunter);

    let hunter_balance_after_payout = token_client.balance(&hunter);

    // Verify hunter received reward + stake
    assert_eq!(
        hunter_balance_after_payout,
        hunter_balance_before_payout + reward.reward_amount + stake_amount
    );

    // Attempting to payout again should fail (already paid)
    // This prevents double refund of the stake
    let result = client.try_payout_participant(&mission_id, &hunter);
    assert!(result.is_err());
}

#[test]
#[should_panic(expected = "Error(Contract, #16)")]
fn test_asset_gating_insufficient_balance() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);

    // Create a gating token
    let gating_token_admin = Address::generate(&env);
    let gating_token_contract = env.register_stellar_asset_contract_v2(gating_token_admin.clone());
    let gating_token_address = gating_token_contract.address();

    let hunter = Address::generate(&env);
    let min_asset_amount: i128 = 1000;

    // Hunter has NO balance of the gating token
    mint_tokens_for_hunter(&env, &token_address, &hunter, 1000); // Only stake tokens

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 100,
    };

    let min_asset = MinAsset {
        min_asset_token: Some(gating_token_address.clone()),
        min_asset_amount,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "Gated Mission"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &5,
        &min_asset,
    );

    // Should fail: hunter has 0 balance of gating token
    client.submit_feedback(
        &mission_id,
        &hunter,
        &String::from_str(&env, "QmSubmission"),
        &token_address,
        &10,
    );
}

#[test]
fn test_asset_gating_sufficient_balance() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);

    // Create a gating token
    let gating_token_admin = Address::generate(&env);
    let gating_token_contract = env.register_stellar_asset_contract_v2(gating_token_admin.clone());
    let gating_token_address = gating_token_contract.address();

    let hunter = Address::generate(&env);
    let min_asset_amount: i128 = 1000;

    // Mint gating tokens to hunter
    let gating_token_admin_client = StellarAssetClient::new(&env, &gating_token_address);
    gating_token_admin_client.mint(&hunter, &min_asset_amount);

    // Also mint stake tokens
    mint_tokens_for_hunter(&env, &token_address, &hunter, 1000);

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 100,
    };

    let min_asset = MinAsset {
        min_asset_token: Some(gating_token_address.clone()),
        min_asset_amount,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "Gated Mission"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &5,
        &min_asset,
    );

    // Should succeed: hunter has exactly the required balance
    client.submit_feedback(
        &mission_id,
        &hunter,
        &String::from_str(&env, "QmSubmission"),
        &token_address,
        &10,
    );

    // Verify submission was created
    client.payout_participant(&mission_id, &hunter);
}

#[test]
fn test_asset_gating_more_than_required() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);

    // Create a gating token
    let gating_token_admin = Address::generate(&env);
    let gating_token_contract = env.register_stellar_asset_contract_v2(gating_token_admin.clone());
    let gating_token_address = gating_token_contract.address();

    let hunter = Address::generate(&env);
    let min_asset_amount: i128 = 1000;

    // Mint MORE than required gating tokens to hunter
    let gating_token_admin_client = StellarAssetClient::new(&env, &gating_token_address);
    gating_token_admin_client.mint(&hunter, &5000);

    // Also mint stake tokens
    mint_tokens_for_hunter(&env, &token_address, &hunter, 1000);

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 100,
    };

    let min_asset = MinAsset {
        min_asset_token: Some(gating_token_address.clone()),
        min_asset_amount,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "Gated Mission"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &5,
        &min_asset,
    );

    // Should succeed: hunter has more than required balance
    client.submit_feedback(
        &mission_id,
        &hunter,
        &String::from_str(&env, "QmSubmission"),
        &token_address,
        &10,
    );

    // Verify submission was created
    client.payout_participant(&mission_id, &hunter);
}

#[test]
#[should_panic(expected = "Error(Contract, #16)")]
fn test_asset_gating_just_below_required() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);

    // Create a gating token
    let gating_token_admin = Address::generate(&env);
    let gating_token_contract = env.register_stellar_asset_contract_v2(gating_token_admin.clone());
    let gating_token_address = gating_token_contract.address();

    let hunter = Address::generate(&env);
    let min_asset_amount: i128 = 1000;

    // Mint LESS than required gating tokens to hunter
    let gating_token_admin_client = StellarAssetClient::new(&env, &gating_token_address);
    gating_token_admin_client.mint(&hunter, &999); // Just 1 below required

    // Also mint stake tokens
    mint_tokens_for_hunter(&env, &token_address, &hunter, 1000);

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 100,
    };

    let min_asset = MinAsset {
        min_asset_token: Some(gating_token_address.clone()),
        min_asset_amount,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "Gated Mission"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &5,
        &min_asset,
    );

    // Should fail: hunter has 999 but needs 1000
    client.submit_feedback(
        &mission_id,
        &hunter,
        &String::from_str(&env, "QmSubmission"),
        &token_address,
        &10,
    );
}

#[test]
fn test_no_asset_gating_allows_any_hunter() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);

    let hunter = Address::generate(&env);

    // Hunter only has stake tokens, no gating token
    mint_tokens_for_hunter(&env, &token_address, &hunter, 1000);

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 100,
    };

    // No asset gating
    let min_asset = MinAsset {
        min_asset_token: None,
        min_asset_amount: 0,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "Open Mission"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &5,
        &min_asset,
    );

    // Should succeed: no gating requirement
    client.submit_feedback(
        &mission_id,
        &hunter,
        &String::from_str(&env, "QmSubmission"),
        &token_address,
        &10,
    );

    // Verify submission was created
    client.payout_participant(&mission_id, &hunter);
}

#[test]
fn test_asset_gating_multiple_hunters_different_balances() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);

    // Create a gating token
    let gating_token_admin = Address::generate(&env);
    let gating_token_contract = env.register_stellar_asset_contract_v2(gating_token_admin.clone());
    let gating_token_address = gating_token_contract.address();

    let hunter1 = Address::generate(&env);
    let hunter2 = Address::generate(&env);
    let min_asset_amount: i128 = 1000;

    // Hunter1 has sufficient balance
    let gating_token_admin_client = StellarAssetClient::new(&env, &gating_token_address);
    gating_token_admin_client.mint(&hunter1, &2000);
    mint_tokens_for_hunter(&env, &token_address, &hunter1, 1000);

    // Hunter2 has sufficient balance (exactly minimum)
    gating_token_admin_client.mint(&hunter2, &1000);
    mint_tokens_for_hunter(&env, &token_address, &hunter2, 1000);

    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 100,
    };

    let min_asset = MinAsset {
        min_asset_token: Some(gating_token_address.clone()),
        min_asset_amount,
    };

    let mission_id = client.create_mission(
        &owner,
        &String::from_str(&env, "Gated Mission"),
        &String::from_str(&env, "QmDesc"),
        &reward,
        &5,
        &min_asset,
    );

    // Both hunters should succeed
    client.submit_feedback(
        &mission_id,
        &hunter1,
        &String::from_str(&env, "QmSubmission1"),
        &token_address,
        &10,
    );

    client.submit_feedback(
        &mission_id,
        &hunter2,
        &String::from_str(&env, "QmSubmission2"),
        &token_address,
        &10,
    );

    // Verify both submissions were created
    client.payout_participant(&mission_id, &hunter1);
    client.payout_participant(&mission_id, &hunter2);
}

// -----------------------------------------------------------------------------
// Protocol fee collection (quid-fee-collector integration)
// -----------------------------------------------------------------------------

use quid_fee_collector::{QuidFeeCollectorContract, QuidFeeCollectorContractClient};

/// Register a fee vault at `fee_bps` and point the store at it.
fn setup_fee_collector<'a>(
    env: &Env,
    store_id: &Address,
    fee_bps: u32,
) -> (QuidFeeCollectorContractClient<'a>, Address) {
    let collector_id = env.register(QuidFeeCollectorContract, ());
    let collector = QuidFeeCollectorContractClient::new(env, &collector_id);

    let fee_admin = Address::generate(env);
    collector.initialize(&fee_admin, &fee_bps);

    QuidStoreContractClient::new(env, store_id).set_fee_collector(&collector_id);

    (collector, fee_admin)
}

fn open_mission(
    env: &Env,
    client: &QuidStoreContractClient,
    owner: &Address,
    token_address: &Address,
    reward_amount: i128,
    max_participants: u32,
) -> u64 {
    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount,
    };
    let min_asset = MinAsset {
        min_asset_token: None,
        min_asset_amount: 0,
    };

    client.create_mission(
        owner,
        &String::from_str(env, "Fee Mission"),
        &String::from_str(env, "QmDesc"),
        &reward,
        &max_participants,
        &min_asset,
    )
}

#[test]
fn test_create_mission_charges_protocol_fee_on_top_of_escrow() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    let token_client = TokenClient::new(&env, &token_address);

    // 2.5% of the 1_000 escrowed across 10 slots at 100 each.
    let (collector, _) = setup_fee_collector(&env, &contract_id, 250);

    let owner_before = token_client.balance(&owner);
    let mission_id = open_mission(&env, &client, &owner, &token_address, 100, 10);

    // Owner pays escrow + fee; the escrow itself is untouched.
    assert_eq!(token_client.balance(&owner), owner_before - 1_000 - 25);
    assert_eq!(token_client.balance(&contract_id), 1_000);
    assert_eq!(collector.get_balance(&token_address), 25);
    assert_eq!(token_client.balance(&collector.address), 25);

    // The full reward pool is still payable to hunters.
    assert_eq!(client.get_mission(&mission_id).reward_amount, 100);
}

#[test]
fn test_create_mission_is_fee_free_when_no_collector_is_configured() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    let token_client = TokenClient::new(&env, &token_address);

    let owner_before = token_client.balance(&owner);
    open_mission(&env, &client, &owner, &token_address, 100, 10);

    assert_eq!(token_client.balance(&owner), owner_before - 1_000);
    assert_eq!(token_client.balance(&contract_id), 1_000);
}

#[test]
fn test_zero_rate_collector_charges_nothing() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    let token_client = TokenClient::new(&env, &token_address);

    let (collector, _) = setup_fee_collector(&env, &contract_id, 0);

    let owner_before = token_client.balance(&owner);
    open_mission(&env, &client, &owner, &token_address, 100, 10);

    assert_eq!(token_client.balance(&owner), owner_before - 1_000);
    assert_eq!(collector.get_balance(&token_address), 0);
}

#[test]
fn test_fees_accumulate_across_missions_and_are_withdrawable_by_admin() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    let token_client = TokenClient::new(&env, &token_address);

    let (collector, fee_admin) = setup_fee_collector(&env, &contract_id, 250);

    open_mission(&env, &client, &owner, &token_address, 100, 10); // fee 25
    open_mission(&env, &client, &owner, &token_address, 200, 10); // fee 50

    assert_eq!(collector.get_balance(&token_address), 75);

    let treasury = Address::generate(&env);
    collector.withdraw_fees(&fee_admin, &token_address, &treasury, &75);

    assert_eq!(token_client.balance(&treasury), 75);
    assert_eq!(collector.get_balance(&token_address), 0);
}

#[test]
fn test_fee_does_not_reduce_hunter_payout() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    let token_client = TokenClient::new(&env, &token_address);

    setup_fee_collector(&env, &contract_id, 250);

    let hunter = Address::generate(&env);
    mint_tokens_for_hunter(&env, &token_address, &hunter, 1_000);

    let mission_id = open_mission(&env, &client, &owner, &token_address, 100, 5);
    client.submit_feedback(
        &mission_id,
        &hunter,
        &String::from_str(&env, "QmSubmission"),
        &token_address,
        &10,
    );

    let before = token_client.balance(&hunter);
    client.payout_participant(&mission_id, &hunter);

    // Full reward plus the stake refund, with no fee skimmed off the top.
    assert_eq!(token_client.balance(&hunter), before + 100 + 10);
}

#[test]
fn test_fee_collector_slot_is_transferable_and_the_new_vault_takes_over() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);

    let (first, _) = setup_fee_collector(&env, &contract_id, 250);
    let (second, _) = setup_fee_collector(&env, &contract_id, 100);

    assert_eq!(client.get_fee_collector(), second.address);

    open_mission(&env, &client, &owner, &token_address, 100, 10);

    assert_eq!(first.get_balance(&token_address), 0);
    assert_eq!(second.get_balance(&token_address), 10);
}

#[test]
fn test_get_fee_collector_before_configuration() {
    let (env, contract_id, _, _) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);

    assert_eq!(
        client.try_get_fee_collector(),
        Err(Ok(QuidError::FeeCollectorNotSet))
    );
}

// -----------------------------------------------------------------------------
// Owner rejection with stake refund
// -----------------------------------------------------------------------------

use quid_staking::{QuidStakingContract, QuidStakingContractClient};

/// Create an open mission and return its id.
fn create_pending_mission(
    env: &Env,
    client: &QuidStoreContractClient,
    owner: &Address,
    token_address: &Address,
    max_participants: u32,
) -> u64 {
    let reward = Reward {
        reward_token: token_address.clone(),
        reward_amount: 100,
    };
    let min_asset = MinAsset {
        min_asset_token: None,
        min_asset_amount: 0,
    };

    client.create_mission(
        owner,
        &String::from_str(env, "Reject Test"),
        &String::from_str(env, "QmDesc"),
        &reward,
        &max_participants,
        &min_asset,
    )
}

/// Register a staking pool that trusts `store_id` as a locker.
fn setup_staking_pool<'a>(
    env: &'a Env,
    store_id: &Address,
) -> (QuidStakingContractClient<'a>, Address) {
    let pool_id = env.register(QuidStakingContract, ());
    let pool = QuidStakingContractClient::new(env, &pool_id);

    let admin = Address::generate(env);
    let treasury = Address::generate(env);
    pool.initialize(&admin, &treasury);
    pool.set_locker(&admin, store_id, &true);

    QuidStoreContractClient::new(env, store_id).set_staking_pool(&pool_id);

    (pool, treasury)
}

#[test]
fn test_reject_submission_sets_status_and_refunds_stake() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    let token_client = TokenClient::new(&env, &token_address);

    let hunter = Address::generate(&env);
    let stake_amount: i128 = 40;
    mint_tokens_for_hunter(&env, &token_address, &hunter, 1_000);

    let mission_id = create_pending_mission(&env, &client, &owner, &token_address, 5);
    let escrow_before_submit = token_client.balance(&contract_id);
    client.submit_feedback(
        &mission_id,
        &hunter,
        &String::from_str(&env, "QmSpam"),
        &token_address,
        &stake_amount,
    );

    let balance_before_reject = token_client.balance(&hunter);

    client.reject_submission(&mission_id, &hunter);

    // The stake comes back in full and the reward pool is left untouched.
    assert_eq!(
        token_client.balance(&hunter),
        balance_before_reject + stake_amount
    );
    assert_eq!(token_client.balance(&contract_id), escrow_before_submit);

    let submission = client.get_submission(&mission_id, &hunter);
    assert_eq!(submission.status, SubmissionStatus::Rejected);
}

#[test]
fn test_reject_submission_does_not_consume_a_payout_slot() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    let token_client = TokenClient::new(&env, &token_address);

    let rejected_hunter = Address::generate(&env);
    let paid_hunter = Address::generate(&env);
    mint_tokens_for_hunter(&env, &token_address, &rejected_hunter, 1_000);
    mint_tokens_for_hunter(&env, &token_address, &paid_hunter, 1_000);

    let mission_id = create_pending_mission(&env, &client, &owner, &token_address, 1);

    client.submit_feedback(
        &mission_id,
        &rejected_hunter,
        &String::from_str(&env, "QmSpam"),
        &token_address,
        &10,
    );
    client.submit_feedback(
        &mission_id,
        &paid_hunter,
        &String::from_str(&env, "QmGood"),
        &token_address,
        &20,
    );

    client.reject_submission(&mission_id, &rejected_hunter);

    // The rejected hunter never consumed the single slot, so the other hunter
    // can still be paid and complete the mission.
    let before_payout = token_client.balance(&paid_hunter);
    client.payout_participant(&mission_id, &paid_hunter);
    assert_eq!(token_client.balance(&paid_hunter), before_payout + 100 + 20);

    let mission = client.get_mission(&mission_id);
    assert_eq!(mission.participants_count, 1);
    assert_eq!(mission.status, MissionStatus::Completed);
}

#[test]
fn test_reject_submission_publishes_event() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);

    let hunter = Address::generate(&env);
    mint_tokens_for_hunter(&env, &token_address, &hunter, 1_000);

    let mission_id = create_pending_mission(&env, &client, &owner, &token_address, 5);
    client.submit_feedback(
        &mission_id,
        &hunter,
        &String::from_str(&env, "QmSpam"),
        &token_address,
        &35,
    );

    client.reject_submission(&mission_id, &hunter);

    let (emitter, _topics, data) = env.events().all().last().unwrap();
    assert_eq!(emitter, contract_id);

    // The event data is a map keyed by the event field names.
    let fields = SorobanMap::<Symbol, Val>::try_from_val(&env, &data).unwrap();
    assert_eq!(fields.len(), 3);
    assert_eq!(
        u64::try_from_val(&env, &fields.get(Symbol::new(&env, "mission_id")).unwrap()).unwrap(),
        mission_id
    );
    assert_eq!(
        Address::try_from_val(&env, &fields.get(Symbol::new(&env, "hunter")).unwrap()).unwrap(),
        hunter
    );
    assert_eq!(
        i128::try_from_val(
            &env,
            &fields.get(Symbol::new(&env, "stake_refunded")).unwrap()
        )
        .unwrap(),
        35
    );
}

#[test]
fn test_reject_submission_after_slash_refunds_nothing() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    let token_client = TokenClient::new(&env, &token_address);

    let treasury = Address::generate(&env);
    client.set_treasury(&treasury);

    let hunter = Address::generate(&env);
    mint_tokens_for_hunter(&env, &token_address, &hunter, 1_000);

    let mission_id = create_pending_mission(&env, &client, &owner, &token_address, 5);
    client.submit_feedback(
        &mission_id,
        &hunter,
        &String::from_str(&env, "QmSpam"),
        &token_address,
        &50,
    );

    client.slash_hunter_stake(&mission_id, &hunter, &token_address);

    let balance_before_reject = token_client.balance(&hunter);
    client.reject_submission(&mission_id, &hunter);

    // The stake already went to the treasury; the hunter is not paid twice.
    assert_eq!(token_client.balance(&hunter), balance_before_reject);
    assert_eq!(
        client.get_submission(&mission_id, &hunter).status,
        SubmissionStatus::Rejected
    );
    assert_eq!(token_client.balance(&treasury), 50);
}

#[test]
fn test_reject_submission_unlocks_pooled_stake() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);
    let token_client = TokenClient::new(&env, &token_address);

    let (pool, _treasury) = setup_staking_pool(&env, &contract_id);

    let hunter = Address::generate(&env);
    let stake_amount: i128 = 60;
    mint_tokens_for_hunter(&env, &token_address, &hunter, 1_000);
    pool.deposit(&hunter, &token_address, &stake_amount);

    let mission_id = create_pending_mission(&env, &client, &owner, &token_address, 5);
    client.submit_feedback(
        &mission_id,
        &hunter,
        &String::from_str(&env, "QmSpam"),
        &token_address,
        &stake_amount,
    );

    assert_eq!(
        pool.get_locked_balance(&hunter, &token_address),
        stake_amount
    );

    client.reject_submission(&mission_id, &hunter);

    // The deposit stays in the pool; only the mission lock is released.
    assert_eq!(pool.get_locked_balance(&hunter, &token_address), 0);
    assert_eq!(pool.get_balance(&hunter, &token_address), stake_amount);
    assert_eq!(token_client.balance(&contract_id), 500);
    assert_eq!(
        client.get_submission(&mission_id, &hunter).status,
        SubmissionStatus::Rejected
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #19)")]
fn test_cannot_reject_submission_twice() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);

    let hunter = Address::generate(&env);
    mint_tokens_for_hunter(&env, &token_address, &hunter, 1_000);

    let mission_id = create_pending_mission(&env, &client, &owner, &token_address, 5);
    client.submit_feedback(
        &mission_id,
        &hunter,
        &String::from_str(&env, "QmSpam"),
        &token_address,
        &10,
    );

    client.reject_submission(&mission_id, &hunter);
    client.reject_submission(&mission_id, &hunter);
}

#[test]
#[should_panic(expected = "Error(Contract, #9)")]
fn test_cannot_reject_submission_after_paid() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);

    let hunter = Address::generate(&env);
    mint_tokens_for_hunter(&env, &token_address, &hunter, 1_000);

    let mission_id = create_pending_mission(&env, &client, &owner, &token_address, 5);
    client.submit_feedback(
        &mission_id,
        &hunter,
        &String::from_str(&env, "QmGood"),
        &token_address,
        &10,
    );
    client.payout_participant(&mission_id, &hunter);

    client.reject_submission(&mission_id, &hunter);
}

#[test]
#[should_panic(expected = "Error(Contract, #12)")]
fn test_cannot_payout_rejected_submission() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);

    let hunter = Address::generate(&env);
    mint_tokens_for_hunter(&env, &token_address, &hunter, 1_000);

    let mission_id = create_pending_mission(&env, &client, &owner, &token_address, 5);
    client.submit_feedback(
        &mission_id,
        &hunter,
        &String::from_str(&env, "QmSpam"),
        &token_address,
        &10,
    );
    client.reject_submission(&mission_id, &hunter);

    client.payout_participant(&mission_id, &hunter);
}

#[test]
#[should_panic(expected = "Error(Contract, #19)")]
fn test_cannot_update_rejected_submission() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);

    let hunter = Address::generate(&env);
    mint_tokens_for_hunter(&env, &token_address, &hunter, 1_000);

    let mission_id = create_pending_mission(&env, &client, &owner, &token_address, 5);
    client.submit_feedback(
        &mission_id,
        &hunter,
        &String::from_str(&env, "QmSpam"),
        &token_address,
        &10,
    );
    client.reject_submission(&mission_id, &hunter);

    client.update_submission(&mission_id, &hunter, &String::from_str(&env, "QmRetry"));
}

#[test]
#[should_panic(expected = "Error(Contract, #11)")]
fn test_reject_submission_not_found() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);

    let hunter = Address::generate(&env);
    let mission_id = create_pending_mission(&env, &client, &owner, &token_address, 5);

    client.reject_submission(&mission_id, &hunter);
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_reject_submission_on_cancelled_mission() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);

    let hunter = Address::generate(&env);
    mint_tokens_for_hunter(&env, &token_address, &hunter, 1_000);

    let mission_id = create_pending_mission(&env, &client, &owner, &token_address, 5);
    client.submit_feedback(
        &mission_id,
        &hunter,
        &String::from_str(&env, "QmSpam"),
        &token_address,
        &10,
    );
    client.cancel_mission(&mission_id);

    client.reject_submission(&mission_id, &hunter);
}

#[test]
fn test_reject_submission_requires_owner_auth() {
    let (env, contract_id, owner, token_address) = setup_test_env();
    let client = QuidStoreContractClient::new(&env, &contract_id);

    let hunter = Address::generate(&env);
    mint_tokens_for_hunter(&env, &token_address, &hunter, 1_000);

    let mission_id = create_pending_mission(&env, &client, &owner, &token_address, 5);
    client.submit_feedback(
        &mission_id,
        &hunter,
        &String::from_str(&env, "QmSpam"),
        &token_address,
        &10,
    );

    // Only the hunter's submission auth is authorised, so the owner's
    // `require_auth` inside `reject_submission` is rejected by the host.
    env.mock_auths(&[]);

    let result = client.try_reject_submission(&mission_id, &hunter);
    assert!(result.is_err());
    assert_eq!(
        client.get_submission(&mission_id, &hunter).status,
        SubmissionStatus::Pending
    );
}
