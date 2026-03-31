module trust_locker_extension::trust_locker;

use trust_locker_extension::config::{Self, ExtensionConfig, TrustLockerAuth};
use sui::{clock::Clock, event};
use world::{
    access::{Self, OwnerCap},
    character::{Self, Character},
    storage_unit::StorageUnit,
};

#[error(code = 0)]
const ELockerPolicyMissing: vector<u8> = b"Locker policy is not configured";
#[error(code = 1)]
const ELockerPolicyFrozen: vector<u8> = b"Locker policy is frozen";
#[error(code = 2)]
const ELockerInactive: vector<u8> = b"Locker is inactive";
#[error(code = 3)]
const EAcceptedItemsLengthMismatch: vector<u8> = b"Accepted item inputs must have the same length";
#[error(code = 4)]
const EAcceptedItemsEmpty: vector<u8> = b"Accepted item allowlist must not be empty";
#[error(code = 5)]
const EAcceptedItemDuplicate: vector<u8> = b"Accepted item type_id must be unique";
#[error(code = 6)]
const EFriendlyRivalOverlap: vector<u8> = b"Friendly and rival tribe lists cannot overlap";
#[error(code = 7)]
const ERequestedItemNotAccepted: vector<u8> = b"Requested item type is not accepted by this locker";
#[error(code = 8)]
const EOfferedItemNotAccepted: vector<u8> = b"Offered item type is not accepted by this locker";
#[error(code = 9)]
const ERequestedQuantityInvalid: vector<u8> = b"Requested quantity must be greater than zero";
#[error(code = 10)]
const ECooldownActive: vector<u8> = b"Visitor is currently on cooldown for this locker";
#[error(code = 11)]
const ELockerNotOwnedByCap: vector<u8> = b"Provided owner cap does not authorize this locker";
#[error(code = 12)]
const EItemPointsInvalid: vector<u8> = b"Base points per unit must be greater than zero";
#[error(code = 13)]
const EStrikeNetworkMissing: vector<u8> = b"Shared penalties are enabled but the strike network policy is missing";
#[error(code = 14)]
const ESharedCooldownActive: vector<u8> = b"Visitor is currently on cooldown for this strike network";
#[error(code = 15)]
const EStrikeNetworkThresholdInvalid: vector<u8> = b"Strike network lockout threshold must be greater than zero";
#[error(code = 16)]
const EMarketModeInvalid: vector<u8> = b"Market mode must be perpetual or procurement";
#[error(code = 17)]
const EFuelFeeNotSupported: vector<u8> = b"Fuel fees are not yet supported by the world contracts";
#[error(code = 18)]
const ESameItemTradeDisabled: vector<u8> = b"Same-item trades are disabled";
#[error(code = 19)]
const EProcurementModeRequired: vector<u8> = b"This action is only available in procurement mode";

const RELATION_FRIENDLY: u8 = 0;
const RELATION_NEUTRAL: u8 = 1;
const RELATION_RIVAL: u8 = 2;
const NEUTRAL_MULTIPLIER_BPS: u64 = 10_000;
const MARKET_MODE_PERPETUAL: u8 = 0;
const MARKET_MODE_PROCUREMENT: u8 = 1;

public struct PolicyKey has copy, drop, store {
    storage_unit_id: ID,
}

public struct StrikeNetworkKey has copy, drop, store {
    strike_scope_id: u64,
}

public struct PersistentPenaltyKey has copy, drop, store {
    strike_scope_id: u64,
    character_id: ID,
}

public struct AcceptedItemRule has copy, drop, store {
    type_id: u64,
    base_points_per_unit: u64,
}

public struct VisitorPenaltyState has copy, drop, store {
    character_id: ID,
    strike_count: u64,
    last_deficit_points: u64,
    cooldown_end_timestamp_ms: u64,
}

public struct StrikeNetworkPolicy has copy, drop, store {
    scope_id: u64,
    pricing_penalty_per_strike_bps: u64,
    max_pricing_penalty_bps: u64,
    lockout_strike_threshold: u64,
    network_lockout_duration_ms: u64,
    is_active: bool,
}

public struct PersistentPenaltyState has copy, drop, store {
    character_id: ID,
    strike_count: u64,
    last_deficit_points: u64,
    network_cooldown_end_timestamp_ms: u64,
    last_locker_id: ID,
}

public struct LockerPolicy has store, drop {
    storage_unit_id: ID,
    accepted_items: vector<AcceptedItemRule>,
    friendly_tribes: vector<u32>,
    rival_tribes: vector<u32>,
    friendly_multiplier_bps: u64,
    rival_multiplier_bps: u64,
    market_mode: u8,
    fuel_fee_units: u64,
    strike_scope_id: u64,
    use_shared_penalties: bool,
    cooldown_ms: u64,
    is_active: bool,
    penalties: vector<VisitorPenaltyState>,
}

public struct PolicyUpdated has copy, drop {
    locker_id: ID,
    accepted_item_count: u64,
    friendly_tribe_count: u64,
    rival_tribe_count: u64,
    friendly_multiplier_bps: u64,
    rival_multiplier_bps: u64,
    market_mode: u8,
    fuel_fee_units: u64,
    cooldown_ms: u64,
    is_active: bool,
    is_frozen: bool,
    strike_scope_id: u64,
    use_shared_penalties: bool,
}

public struct TradeExecuted has copy, drop {
    locker_id: ID,
    visitor_character_id: ID,
    requested_type_id: u64,
    requested_quantity: u32,
    offered_type_id: u64,
    offered_quantity: u32,
    base_requested_points: u64,
    requested_points: u64,
    offered_points: u64,
    deficit_points: u64,
    relation_bucket: u8,
    shared_pricing_penalty_bps: u64,
    shared_penalty_active: bool,
    shared_penalty_scope_id: u64,
    shared_penalty_lockout_active: bool,
    shared_penalty_lockout_end_timestamp_ms: u64,
}

public struct StrikeIssued has copy, drop {
    locker_id: ID,
    visitor_character_id: ID,
    strike_count: u64,
    deficit_points: u64,
}

public struct SharedStrikeIssued has copy, drop {
    strike_scope_id: u64,
    locker_id: ID,
    visitor_character_id: ID,
    strike_count: u64,
    deficit_points: u64,
}

public struct CooldownUpdated has copy, drop {
    locker_id: ID,
    visitor_character_id: ID,
    cooldown_end_timestamp_ms: u64,
}

public struct SharedCooldownUpdated has copy, drop {
    strike_scope_id: u64,
    locker_id: ID,
    visitor_character_id: ID,
    network_cooldown_end_timestamp_ms: u64,
}

public struct StrikeNetworkPolicyUpdated has copy, drop {
    strike_scope_id: u64,
    pricing_penalty_per_strike_bps: u64,
    max_pricing_penalty_bps: u64,
    lockout_strike_threshold: u64,
    network_lockout_duration_ms: u64,
    is_active: bool,
}

public struct LockerFrozen has copy, drop {
    locker_id: ID,
}

public fun has_policy(extension_config: &ExtensionConfig, storage_unit_id: ID): bool {
    config::has_value(extension_config, policy_key(storage_unit_id))
}

public fun accepted_item_count(extension_config: &ExtensionConfig, storage_unit_id: ID): u64 {
    if (!has_policy(extension_config, storage_unit_id)) {
        return 0
    };
    let policy = borrow_policy(extension_config, storage_unit_id);
    vector::length(&policy.accepted_items)
}

public fun strike_scope_id_for_locker(extension_config: &ExtensionConfig, storage_unit_id: ID): u64 {
    if (!has_policy(extension_config, storage_unit_id)) {
        return 0
    };
    let policy = borrow_policy(extension_config, storage_unit_id);
    policy.strike_scope_id
}

public fun uses_shared_penalties_for_locker(
    extension_config: &ExtensionConfig,
    storage_unit_id: ID,
): bool {
    if (!has_policy(extension_config, storage_unit_id)) {
        return false
    };
    let policy = borrow_policy(extension_config, storage_unit_id);
    policy.use_shared_penalties
}

public fun market_mode_for_locker(extension_config: &ExtensionConfig, storage_unit_id: ID): u8 {
    if (!has_policy(extension_config, storage_unit_id)) {
        return MARKET_MODE_PERPETUAL
    };
    let policy = borrow_policy(extension_config, storage_unit_id);
    policy.market_mode
}

public fun fuel_fee_units_for_locker(extension_config: &ExtensionConfig, storage_unit_id: ID): u64 {
    if (!has_policy(extension_config, storage_unit_id)) {
        return 0
    };
    let policy = borrow_policy(extension_config, storage_unit_id);
    policy.fuel_fee_units
}

public fun has_strike_network(extension_config: &ExtensionConfig, strike_scope_id: u64): bool {
    config::has_value(extension_config, strike_network_key(strike_scope_id))
}

public fun strike_network_policy(
    extension_config: &ExtensionConfig,
    strike_scope_id: u64,
): StrikeNetworkPolicy {
    assert!(has_strike_network(extension_config, strike_scope_id), EStrikeNetworkMissing);
    *config::borrow_value(extension_config, strike_network_key(strike_scope_id))
}

public fun strike_count(
    extension_config: &ExtensionConfig,
    storage_unit_id: ID,
    character_id: ID,
): u64 {
    if (!has_policy(extension_config, storage_unit_id)) {
        return 0
    };
    let policy = borrow_policy(extension_config, storage_unit_id);
    let idx = penalty_index(&policy.penalties, character_id);
    if (idx == vector::length(&policy.penalties)) {
        0
    } else {
        vector::borrow(&policy.penalties, idx).strike_count
    }
}

public fun cooldown_end_timestamp_ms(
    extension_config: &ExtensionConfig,
    storage_unit_id: ID,
    character_id: ID,
): u64 {
    if (!has_policy(extension_config, storage_unit_id)) {
        return 0
    };
    let policy = borrow_policy(extension_config, storage_unit_id);
    let idx = penalty_index(&policy.penalties, character_id);
    if (idx == vector::length(&policy.penalties)) {
        0
    } else {
        vector::borrow(&policy.penalties, idx).cooldown_end_timestamp_ms
    }
}

public fun shared_strike_count(
    extension_config: &ExtensionConfig,
    strike_scope_id: u64,
    character_id: ID,
): u64 {
    if (!has_shared_penalty_state(extension_config, strike_scope_id, character_id)) {
        return 0
    };
    if (!has_strike_network(extension_config, strike_scope_id)) {
        return 0
    };
    let policy = strike_network_policy(extension_config, strike_scope_id);
    if (!policy.is_active) {
        0
    } else {
        let state = borrow_shared_penalty_state(extension_config, strike_scope_id, character_id);
        state.strike_count
    }
}

public fun shared_cooldown_end_timestamp_ms(
    extension_config: &ExtensionConfig,
    strike_scope_id: u64,
    character_id: ID,
): u64 {
    if (!has_shared_penalty_state(extension_config, strike_scope_id, character_id)) {
        0
    } else {
        if (!has_strike_network(extension_config, strike_scope_id)) {
            return 0
        };
        let policy = strike_network_policy(extension_config, strike_scope_id);
        if (!policy.is_active) {
            return 0
        };
        let state = borrow_shared_penalty_state(extension_config, strike_scope_id, character_id);
        state.network_cooldown_end_timestamp_ms
    }
}

public fun shared_is_in_cooldown(
    extension_config: &ExtensionConfig,
    strike_scope_id: u64,
    character_id: ID,
    clock: &Clock,
): bool {
    shared_cooldown_end_timestamp_ms(extension_config, strike_scope_id, character_id) > clock.timestamp_ms()
}

public fun shared_pricing_penalty_bps(
    extension_config: &ExtensionConfig,
    strike_scope_id: u64,
    character_id: ID,
): u64 {
    if (!has_strike_network(extension_config, strike_scope_id)) {
        return 0
    };
    let policy = strike_network_policy(extension_config, strike_scope_id);
    if (!policy.is_active) {
        return 0
    };
    let strike_count = shared_strike_count(extension_config, strike_scope_id, character_id);
    shared_pricing_penalty_bps_for_count(&policy, strike_count)
}

public fun is_in_cooldown(
    extension_config: &ExtensionConfig,
    storage_unit_id: ID,
    character_id: ID,
    clock: &Clock,
): bool {
    cooldown_end_timestamp_ms(extension_config, storage_unit_id, character_id) > clock.timestamp_ms()
}

public fun relation_bucket_for_character(
    extension_config: &ExtensionConfig,
    storage_unit_id: ID,
    visitor: &Character,
): u8 {
    let policy = borrow_policy(extension_config, storage_unit_id);
    relation_bucket(policy, visitor)
}

public fun quote_requested_points(
    extension_config: &ExtensionConfig,
    storage_unit_id: ID,
    visitor: &Character,
    requested_type_id: u64,
    requested_quantity: u32,
): u64 {
    let policy = borrow_policy(extension_config, storage_unit_id);
    let relation = relation_bucket(policy, visitor);
    let base_requested_points = requested_points_for(
        policy,
        requested_type_id,
        requested_quantity,
        multiplier_for_relation(policy, relation),
    );
    let shared_penalty_bps = shared_pricing_penalty_bps_for_policy(extension_config, policy, visitor);
    (base_requested_points * (NEUTRAL_MULTIPLIER_BPS + shared_penalty_bps)) / NEUTRAL_MULTIPLIER_BPS
}

public fun set_policy(
    storage_unit: &StorageUnit,
    owner_cap: &OwnerCap<StorageUnit>,
    extension_config: &mut ExtensionConfig,
    accepted_type_ids: vector<u64>,
    accepted_points: vector<u64>,
    friendly_tribes: vector<u32>,
    rival_tribes: vector<u32>,
    friendly_multiplier_bps: u64,
    rival_multiplier_bps: u64,
    market_mode: u8,
    fuel_fee_units: u64,
    strike_scope_id: u64,
    use_shared_penalties: bool,
    cooldown_ms: u64,
    is_active: bool,
) {
    assert_owner(storage_unit, owner_cap);
    assert_mutable(storage_unit);
    let accepted_items = build_accepted_items(accepted_type_ids, accepted_points);
    assert_no_tribe_overlap(&friendly_tribes, &rival_tribes);
    assert_valid_market_mode(market_mode);
    assert!(fuel_fee_units == 0, EFuelFeeNotSupported);

    let locker_id = object::id(storage_unit);
    let penalties = if (config::has_value(extension_config, policy_key(locker_id))) {
        let previous_policy: LockerPolicy = config::remove_value(extension_config, policy_key(locker_id));
        previous_policy.penalties
    } else {
        vector[]
    };
    config::add_value(
        extension_config,
        policy_key(locker_id),
        LockerPolicy {
            storage_unit_id: locker_id,
            accepted_items,
            friendly_tribes,
            rival_tribes,
            friendly_multiplier_bps,
            rival_multiplier_bps,
            market_mode,
            fuel_fee_units,
            strike_scope_id,
            use_shared_penalties,
            cooldown_ms,
            is_active,
            penalties,
        },
    );
    emit_policy_updated(storage_unit, borrow_policy(extension_config, locker_id));
}

public fun set_strike_network_policy(
    storage_unit: &StorageUnit,
    owner_cap: &OwnerCap<StorageUnit>,
    extension_config: &mut ExtensionConfig,
    strike_scope_id: u64,
    pricing_penalty_per_strike_bps: u64,
    max_pricing_penalty_bps: u64,
    lockout_strike_threshold: u64,
    network_lockout_duration_ms: u64,
    is_active: bool,
) {
    assert_owner(storage_unit, owner_cap);
    assert_mutable(storage_unit);
    assert!(lockout_strike_threshold > 0, EStrikeNetworkThresholdInvalid);
    config::upsert_value(
        extension_config,
        strike_network_key(strike_scope_id),
        StrikeNetworkPolicy {
            scope_id: strike_scope_id,
            pricing_penalty_per_strike_bps,
            max_pricing_penalty_bps,
            lockout_strike_threshold,
            network_lockout_duration_ms,
            is_active,
        },
    );
    event::emit(StrikeNetworkPolicyUpdated {
        strike_scope_id,
        pricing_penalty_per_strike_bps,
        max_pricing_penalty_bps,
        lockout_strike_threshold,
        network_lockout_duration_ms,
        is_active,
    });
}

public fun set_item_points(
    storage_unit: &StorageUnit,
    owner_cap: &OwnerCap<StorageUnit>,
    extension_config: &mut ExtensionConfig,
    type_id: u64,
    base_points_per_unit: u64,
) {
    assert_owner(storage_unit, owner_cap);
    assert_mutable(storage_unit);
    assert!(base_points_per_unit > 0, EItemPointsInvalid);
    let locker_id = object::id(storage_unit);
    let policy = borrow_policy_mut(extension_config, locker_id);
    let idx = accepted_item_index(&policy.accepted_items, type_id);
    assert!(idx < vector::length(&policy.accepted_items), ERequestedItemNotAccepted);
    let rule = vector::borrow_mut(&mut policy.accepted_items, idx);
    rule.base_points_per_unit = base_points_per_unit;
    emit_policy_updated(storage_unit, policy);
}

public fun set_relationship_buckets(
    storage_unit: &StorageUnit,
    owner_cap: &OwnerCap<StorageUnit>,
    extension_config: &mut ExtensionConfig,
    friendly_tribes: vector<u32>,
    rival_tribes: vector<u32>,
) {
    assert_owner(storage_unit, owner_cap);
    assert_mutable(storage_unit);
    assert_no_tribe_overlap(&friendly_tribes, &rival_tribes);
    let locker_id = object::id(storage_unit);
    let policy = borrow_policy_mut(extension_config, locker_id);
    policy.friendly_tribes = friendly_tribes;
    policy.rival_tribes = rival_tribes;
    emit_policy_updated(storage_unit, policy);
}

public fun set_pricing_multipliers(
    storage_unit: &StorageUnit,
    owner_cap: &OwnerCap<StorageUnit>,
    extension_config: &mut ExtensionConfig,
    friendly_multiplier_bps: u64,
    rival_multiplier_bps: u64,
) {
    assert_owner(storage_unit, owner_cap);
    assert_mutable(storage_unit);
    let locker_id = object::id(storage_unit);
    let policy = borrow_policy_mut(extension_config, locker_id);
    policy.friendly_multiplier_bps = friendly_multiplier_bps;
    policy.rival_multiplier_bps = rival_multiplier_bps;
    emit_policy_updated(storage_unit, policy);
}

public fun set_cooldown(
    storage_unit: &StorageUnit,
    owner_cap: &OwnerCap<StorageUnit>,
    extension_config: &mut ExtensionConfig,
    cooldown_ms: u64,
) {
    assert_owner(storage_unit, owner_cap);
    assert_mutable(storage_unit);
    let locker_id = object::id(storage_unit);
    let policy = borrow_policy_mut(extension_config, locker_id);
    policy.cooldown_ms = cooldown_ms;
    emit_policy_updated(storage_unit, policy);
}

public fun set_active(
    storage_unit: &StorageUnit,
    owner_cap: &OwnerCap<StorageUnit>,
    extension_config: &mut ExtensionConfig,
    is_active: bool,
) {
    assert_owner(storage_unit, owner_cap);
    assert_mutable(storage_unit);
    let locker_id = object::id(storage_unit);
    let policy = borrow_policy_mut(extension_config, locker_id);
    policy.is_active = is_active;
    emit_policy_updated(storage_unit, policy);
}

public fun seed_open_inventory(
    storage_unit: &mut StorageUnit,
    owner_character: &Character,
    owner_cap: &OwnerCap<StorageUnit>,
    type_id: u64,
    quantity: u32,
    ctx: &mut TxContext,
) {
    assert_owner(storage_unit, owner_cap);
    let item = storage_unit.withdraw_item<TrustLockerAuth>(
        owner_character,
        config::x_auth(),
        type_id,
        quantity,
        ctx,
    );
    storage_unit.deposit_to_open_inventory<TrustLockerAuth>(
        owner_character,
        item,
        config::x_auth(),
        ctx,
    );
}

public fun stock_from_owned_inventory(
    storage_unit: &mut StorageUnit,
    owner_character: &Character,
    owner_storage_cap: &OwnerCap<StorageUnit>,
    owner_character_cap: &OwnerCap<Character>,
    type_id: u64,
    quantity: u32,
    ctx: &mut TxContext,
) {
    assert_owner(storage_unit, owner_storage_cap);
    let item = storage_unit.withdraw_by_owner(
        owner_character,
        owner_character_cap,
        type_id,
        quantity,
        ctx,
    );
    storage_unit.deposit_to_open_inventory<TrustLockerAuth>(
        owner_character,
        item,
        config::x_auth(),
        ctx,
    );
}

public fun claim_to_owned_inventory(
    storage_unit: &mut StorageUnit,
    owner_character: &Character,
    owner_cap: &OwnerCap<StorageUnit>,
    extension_config: &ExtensionConfig,
    type_id: u64,
    quantity: u32,
    ctx: &mut TxContext,
) {
    assert_owner(storage_unit, owner_cap);
    assert_procurement_mode(extension_config, object::id(storage_unit));
    let item = storage_unit.withdraw_item<TrustLockerAuth>(
        owner_character,
        config::x_auth(),
        type_id,
        quantity,
        ctx,
    );
    storage_unit.deposit_to_owned<TrustLockerAuth>(
        owner_character,
        item,
        config::x_auth(),
        ctx,
    );
}

public fun restock_from_owner_reserve(
    storage_unit: &mut StorageUnit,
    owner_character: &Character,
    owner_cap: &OwnerCap<StorageUnit>,
    extension_config: &ExtensionConfig,
    type_id: u64,
    quantity: u32,
    ctx: &mut TxContext,
) {
    assert_owner(storage_unit, owner_cap);
    assert_procurement_mode(extension_config, object::id(storage_unit));
    let item = storage_unit.withdraw_item<TrustLockerAuth>(
        owner_character,
        config::x_auth(),
        type_id,
        quantity,
        ctx,
    );
    storage_unit.deposit_to_open_inventory<TrustLockerAuth>(
        owner_character,
        item,
        config::x_auth(),
        ctx,
    );
}

public fun freeze_locker(
    storage_unit: &mut StorageUnit,
    owner_cap: &OwnerCap<StorageUnit>,
) {
    storage_unit.freeze_extension_config(owner_cap);
    event::emit(LockerFrozen { locker_id: object::id(storage_unit) });
}

public fun trade(
    storage_unit: &mut StorageUnit,
    visitor: &Character,
    visitor_owner_cap: &OwnerCap<Character>,
    extension_config: &mut ExtensionConfig,
    clock: &Clock,
    requested_type_id: u64,
    requested_quantity: u32,
    offered_type_id: u64,
    offered_quantity: u32,
    ctx: &mut TxContext,
) {
    assert!(requested_quantity > 0, ERequestedQuantityInvalid);
    assert!(requested_type_id != offered_type_id, ESameItemTradeDisabled);
    let locker_id = object::id(storage_unit);
    let current_timestamp_ms = clock.timestamp_ms();
    let relation;
    let base_requested_points;
    let shared_pricing_penalty_bps;
    let shared_penalty_active;
    let shared_penalty_scope_id;
    let shared_penalty_lockout_active;
    let shared_penalty_lockout_end_timestamp_ms;
    let requested_points;
    let offered_points;
    let deficit_points;

    {
        let policy = borrow_policy(extension_config, locker_id);
        assert!(policy.is_active, ELockerInactive);
        let visitor_id = character::id(visitor);
        let penalty_idx = penalty_index(&policy.penalties, visitor_id);
        if (penalty_idx < vector::length(&policy.penalties)) {
            let penalty = vector::borrow(&policy.penalties, penalty_idx);
            assert!(penalty.cooldown_end_timestamp_ms <= current_timestamp_ms, ECooldownActive);
        };

        relation = relation_bucket(policy, visitor);
        base_requested_points = requested_points_for(
            policy,
            requested_type_id,
            requested_quantity,
            multiplier_for_relation(policy, relation),
        );
        shared_penalty_scope_id = policy.strike_scope_id;
        shared_penalty_active = policy.use_shared_penalties;
        if (shared_penalty_active) {
            assert!(has_strike_network(extension_config, shared_penalty_scope_id), EStrikeNetworkMissing);
        };
        shared_pricing_penalty_bps = shared_pricing_penalty_bps_for_policy(extension_config, policy, visitor);
        shared_penalty_lockout_end_timestamp_ms = shared_network_cooldown_end_timestamp_ms_for_policy(
            extension_config,
            policy,
            visitor,
        );
        shared_penalty_lockout_active = shared_penalty_lockout_end_timestamp_ms > current_timestamp_ms;
        assert!(!shared_penalty_lockout_active, ESharedCooldownActive);
        requested_points = (base_requested_points * (NEUTRAL_MULTIPLIER_BPS + shared_pricing_penalty_bps)) / NEUTRAL_MULTIPLIER_BPS;
        offered_points = if (offered_quantity == 0) {
            0
        } else {
            offered_points_for(policy, offered_type_id, offered_quantity)
        };
        deficit_points = if (requested_points > offered_points) {
            requested_points - offered_points
        } else {
            0
        };
    };

    let requested_item = storage_unit.withdraw_from_open_inventory<TrustLockerAuth>(
        visitor,
        config::x_auth(),
        requested_type_id,
        requested_quantity,
        ctx,
    );
    storage_unit.deposit_to_owned<TrustLockerAuth>(
        visitor,
        requested_item,
        config::x_auth(),
        ctx,
    );

    if (offered_quantity > 0) {
        let offered_item = storage_unit.withdraw_by_owner(
            visitor,
            visitor_owner_cap,
            offered_type_id,
            offered_quantity,
            ctx,
        );
        let market_mode = {
            let policy = borrow_policy(extension_config, locker_id);
            policy.market_mode
        };
        if (market_mode == MARKET_MODE_PROCUREMENT) {
            storage_unit.deposit_item<TrustLockerAuth>(
                visitor,
                offered_item,
                config::x_auth(),
                ctx,
            );
        } else {
            storage_unit.deposit_to_open_inventory<TrustLockerAuth>(
                visitor,
                offered_item,
                config::x_auth(),
                ctx,
            );
        };
    };

    if (deficit_points > 0) {
        let policy = borrow_policy_mut(extension_config, locker_id);
        let cooldown_end_timestamp_ms = current_timestamp_ms + policy.cooldown_ms;
        let visitor_id = character::id(visitor);
        let idx = penalty_index(&policy.penalties, visitor_id);
        let strike_count = if (idx < vector::length(&policy.penalties)) {
            let penalty = vector::borrow_mut(&mut policy.penalties, idx);
            penalty.strike_count = penalty.strike_count + 1;
            penalty.last_deficit_points = deficit_points;
            penalty.cooldown_end_timestamp_ms = cooldown_end_timestamp_ms;
            penalty.strike_count
        } else {
            vector::push_back(
                &mut policy.penalties,
                VisitorPenaltyState {
                    character_id: visitor_id,
                    strike_count: 1,
                    last_deficit_points: deficit_points,
                    cooldown_end_timestamp_ms,
                },
            );
            1
        };
        event::emit(StrikeIssued {
            locker_id,
            visitor_character_id: visitor_id,
            strike_count,
            deficit_points,
        });
        event::emit(CooldownUpdated {
            locker_id,
            visitor_character_id: visitor_id,
            cooldown_end_timestamp_ms,
        });

        if (shared_penalty_active) {
            let network_policy = strike_network_policy(extension_config, shared_penalty_scope_id);
            if (network_policy.is_active) {
                let shared_strike_count = {
                    let shared_state = borrow_or_create_shared_penalty_state_mut(
                        extension_config,
                        shared_penalty_scope_id,
                        visitor_id,
                        locker_id,
                    );
                    shared_state.strike_count = shared_state.strike_count + 1;
                    shared_state.last_deficit_points = deficit_points;
                    shared_state.last_locker_id = locker_id;
                    if (shared_state.strike_count >= network_policy.lockout_strike_threshold) {
                        shared_state.network_cooldown_end_timestamp_ms =
                            current_timestamp_ms + network_policy.network_lockout_duration_ms;
                    };
                    shared_state.strike_count
                };
                let shared_cooldown_end_timestamp_ms = shared_cooldown_end_timestamp_ms(
                    extension_config,
                    shared_penalty_scope_id,
                    visitor_id,
                );
                event::emit(SharedStrikeIssued {
                    strike_scope_id: shared_penalty_scope_id,
                    locker_id,
                    visitor_character_id: visitor_id,
                    strike_count: shared_strike_count,
                    deficit_points,
                });
                event::emit(SharedCooldownUpdated {
                    strike_scope_id: shared_penalty_scope_id,
                    locker_id,
                    visitor_character_id: visitor_id,
                    network_cooldown_end_timestamp_ms: shared_cooldown_end_timestamp_ms,
                });
            };
        };
    };

    event::emit(TradeExecuted {
        locker_id,
        visitor_character_id: character::id(visitor),
        requested_type_id,
        requested_quantity,
        offered_type_id,
        offered_quantity,
        base_requested_points,
        requested_points,
        offered_points,
        deficit_points,
        relation_bucket: relation,
        shared_pricing_penalty_bps,
        shared_penalty_active,
        shared_penalty_scope_id,
        shared_penalty_lockout_active,
        shared_penalty_lockout_end_timestamp_ms,
    });
}

fun assert_owner(storage_unit: &StorageUnit, owner_cap: &OwnerCap<StorageUnit>) {
    assert!(access::is_authorized(owner_cap, object::id(storage_unit)), ELockerNotOwnedByCap);
}

fun assert_mutable(storage_unit: &StorageUnit) {
    assert!(!storage_unit.is_extension_frozen(), ELockerPolicyFrozen);
}

fun strike_network_key(strike_scope_id: u64): StrikeNetworkKey {
    StrikeNetworkKey { strike_scope_id }
}

fun persistent_penalty_key(strike_scope_id: u64, character_id: ID): PersistentPenaltyKey {
    PersistentPenaltyKey {
        strike_scope_id,
        character_id,
    }
}

fun policy_key(storage_unit_id: ID): PolicyKey {
    PolicyKey { storage_unit_id }
}

fun assert_valid_market_mode(market_mode: u8) {
    assert!(
        market_mode == MARKET_MODE_PERPETUAL || market_mode == MARKET_MODE_PROCUREMENT,
        EMarketModeInvalid,
    );
}

fun assert_procurement_mode(extension_config: &ExtensionConfig, storage_unit_id: ID) {
    let policy = borrow_policy(extension_config, storage_unit_id);
    assert!(policy.market_mode == MARKET_MODE_PROCUREMENT, EProcurementModeRequired);
}

fun has_shared_penalty_state(
    extension_config: &ExtensionConfig,
    strike_scope_id: u64,
    character_id: ID,
): bool {
    config::has_value(extension_config, persistent_penalty_key(strike_scope_id, character_id))
}

fun borrow_shared_penalty_state(
    extension_config: &ExtensionConfig,
    strike_scope_id: u64,
    character_id: ID,
): &PersistentPenaltyState {
    assert!(has_shared_penalty_state(extension_config, strike_scope_id, character_id), EStrikeNetworkMissing);
    config::borrow_value(extension_config, persistent_penalty_key(strike_scope_id, character_id))
}

fun borrow_or_create_shared_penalty_state_mut(
    extension_config: &mut ExtensionConfig,
    strike_scope_id: u64,
    character_id: ID,
    locker_id: ID,
): &mut PersistentPenaltyState {
    let key = persistent_penalty_key(strike_scope_id, character_id);
    if (!config::has_value(extension_config, key)) {
        config::add_value(
            extension_config,
            key,
            PersistentPenaltyState {
                character_id,
                strike_count: 0,
                last_deficit_points: 0,
                network_cooldown_end_timestamp_ms: 0,
                last_locker_id: locker_id,
            },
        );
    };
    config::borrow_value_mut(extension_config, key)
}

fun shared_pricing_penalty_bps_for_count(
    policy: &StrikeNetworkPolicy,
    strike_count: u64,
): u64 {
    let raw_penalty_bps = strike_count * policy.pricing_penalty_per_strike_bps;
    if (raw_penalty_bps > policy.max_pricing_penalty_bps) {
        policy.max_pricing_penalty_bps
    } else {
        raw_penalty_bps
    }
}

fun shared_pricing_penalty_bps_for_policy(
    extension_config: &ExtensionConfig,
    policy: &LockerPolicy,
    visitor: &Character,
): u64 {
    if (!policy.use_shared_penalties || !has_strike_network(extension_config, policy.strike_scope_id)) {
        return 0
    };
    let network_policy = strike_network_policy(extension_config, policy.strike_scope_id);
    if (!network_policy.is_active) {
        return 0
    };
    let visitor_id = character::id(visitor);
    let strike_count = shared_strike_count(extension_config, policy.strike_scope_id, visitor_id);
    shared_pricing_penalty_bps_for_count(&network_policy, strike_count)
}

fun shared_network_cooldown_end_timestamp_ms_for_policy(
    extension_config: &ExtensionConfig,
    policy: &LockerPolicy,
    visitor: &Character,
): u64 {
    if (!policy.use_shared_penalties || !has_strike_network(extension_config, policy.strike_scope_id)) {
        return 0
    };
    let network_policy = strike_network_policy(extension_config, policy.strike_scope_id);
    if (!network_policy.is_active) {
        return 0
    };
    shared_cooldown_end_timestamp_ms(extension_config, policy.strike_scope_id, character::id(visitor))
}

fun borrow_policy(extension_config: &ExtensionConfig, storage_unit_id: ID): &LockerPolicy {
    assert!(has_policy(extension_config, storage_unit_id), ELockerPolicyMissing);
    config::borrow_value(extension_config, policy_key(storage_unit_id))
}

fun borrow_policy_mut(extension_config: &mut ExtensionConfig, storage_unit_id: ID): &mut LockerPolicy {
    assert!(has_policy(extension_config, storage_unit_id), ELockerPolicyMissing);
    config::borrow_value_mut(extension_config, policy_key(storage_unit_id))
}

fun build_accepted_items(
    accepted_type_ids: vector<u64>,
    accepted_points: vector<u64>,
): vector<AcceptedItemRule> {
    assert!(
        vector::length(&accepted_type_ids) == vector::length(&accepted_points),
        EAcceptedItemsLengthMismatch,
    );
    assert!(vector::length(&accepted_type_ids) > 0, EAcceptedItemsEmpty);

    let mut rules = vector[];
    let len = vector::length(&accepted_type_ids);
    let mut i = 0;
    while (i < len) {
        let type_id = *vector::borrow(&accepted_type_ids, i);
        let base_points_per_unit = *vector::borrow(&accepted_points, i);
        assert!(base_points_per_unit > 0, EItemPointsInvalid);
        assert!(accepted_item_index(&rules, type_id) == vector::length(&rules), EAcceptedItemDuplicate);
        vector::push_back(
            &mut rules,
            AcceptedItemRule {
                type_id,
                base_points_per_unit,
            },
        );
        i = i + 1;
    };
    rules
}

fun accepted_item_index(rules: &vector<AcceptedItemRule>, type_id: u64): u64 {
    let len = vector::length(rules);
    let mut i = 0;
    while (i < len) {
        if (vector::borrow(rules, i).type_id == type_id) {
            return i
        };
        i = i + 1;
    };
    len
}

fun penalty_index(penalties: &vector<VisitorPenaltyState>, character_id: ID): u64 {
    let len = vector::length(penalties);
    let mut i = 0;
    while (i < len) {
        if (vector::borrow(penalties, i).character_id == character_id) {
            return i
        };
        i = i + 1;
    };
    len
}

fun assert_no_tribe_overlap(friendly_tribes: &vector<u32>, rival_tribes: &vector<u32>) {
    let len = vector::length(friendly_tribes);
    let mut i = 0;
    while (i < len) {
        let tribe = *vector::borrow(friendly_tribes, i);
        assert!(!contains_tribe(rival_tribes, tribe), EFriendlyRivalOverlap);
        i = i + 1;
    };
}

fun contains_tribe(tribes: &vector<u32>, tribe_id: u32): bool {
    let len = vector::length(tribes);
    let mut i = 0;
    while (i < len) {
        if (*vector::borrow(tribes, i) == tribe_id) {
            return true
        };
        i = i + 1;
    };
    false
}

fun relation_bucket(policy: &LockerPolicy, visitor: &Character): u8 {
    let tribe_id = visitor.tribe();
    if (contains_tribe(&policy.friendly_tribes, tribe_id)) {
        RELATION_FRIENDLY
    } else if (contains_tribe(&policy.rival_tribes, tribe_id)) {
        RELATION_RIVAL
    } else {
        RELATION_NEUTRAL
    }
}

fun multiplier_for_relation(policy: &LockerPolicy, relation: u8): u64 {
    if (relation == RELATION_FRIENDLY) {
        policy.friendly_multiplier_bps
    } else if (relation == RELATION_RIVAL) {
        policy.rival_multiplier_bps
    } else {
        NEUTRAL_MULTIPLIER_BPS
    }
}

fun requested_points_for(
    policy: &LockerPolicy,
    type_id: u64,
    quantity: u32,
    multiplier_bps: u64,
): u64 {
    let idx = accepted_item_index(&policy.accepted_items, type_id);
    assert!(idx < vector::length(&policy.accepted_items), ERequestedItemNotAccepted);
    let rule = vector::borrow(&policy.accepted_items, idx);
    ((rule.base_points_per_unit * (quantity as u64)) * multiplier_bps) / NEUTRAL_MULTIPLIER_BPS
}

fun offered_points_for(policy: &LockerPolicy, type_id: u64, quantity: u32): u64 {
    let idx = accepted_item_index(&policy.accepted_items, type_id);
    assert!(idx < vector::length(&policy.accepted_items), EOfferedItemNotAccepted);
    let rule = vector::borrow(&policy.accepted_items, idx);
    rule.base_points_per_unit * (quantity as u64)
}

fun emit_policy_updated(storage_unit: &StorageUnit, policy: &LockerPolicy) {
    event::emit(PolicyUpdated {
        locker_id: object::id(storage_unit),
        accepted_item_count: vector::length(&policy.accepted_items),
        friendly_tribe_count: vector::length(&policy.friendly_tribes),
        rival_tribe_count: vector::length(&policy.rival_tribes),
        friendly_multiplier_bps: policy.friendly_multiplier_bps,
        rival_multiplier_bps: policy.rival_multiplier_bps,
        market_mode: policy.market_mode,
        fuel_fee_units: policy.fuel_fee_units,
        strike_scope_id: policy.strike_scope_id,
        use_shared_penalties: policy.use_shared_penalties,
        cooldown_ms: policy.cooldown_ms,
        is_active: policy.is_active,
        is_frozen: storage_unit.is_extension_frozen(),
    });
}

#[test_only]
public fun accepted_points_for_type(
    extension_config: &ExtensionConfig,
    storage_unit_id: ID,
    type_id: u64,
): u64 {
    let policy = borrow_policy(extension_config, storage_unit_id);
    let idx = accepted_item_index(&policy.accepted_items, type_id);
    assert!(idx < vector::length(&policy.accepted_items), ERequestedItemNotAccepted);
    vector::borrow(&policy.accepted_items, idx).base_points_per_unit
}

#[test_only]
public fun set_shared_penalty_state_for_testing(
    extension_config: &mut ExtensionConfig,
    strike_scope_id: u64,
    character_id: ID,
    strike_count: u64,
    last_deficit_points: u64,
    network_cooldown_end_timestamp_ms: u64,
    last_locker_id: ID,
) {
    config::upsert_value(
        extension_config,
        persistent_penalty_key(strike_scope_id, character_id),
        PersistentPenaltyState {
            character_id,
            strike_count,
            last_deficit_points,
            network_cooldown_end_timestamp_ms,
            last_locker_id,
        },
    );
}
