#[test_only]
module trust_locker_extension::trust_locker_tests;

use std::{string::utf8, unit_test::assert_eq};
use sui::{clock, test_scenario as ts};
use trust_locker_extension::{
    config::{Self, ExtensionConfig},
    trust_locker::{Self},
};
use world::{
    access::{OwnerCap, AdminACL},
    character::{Self, Character},
    energy::EnergyConfig,
    inventory,
    network_node::{Self, NetworkNode},
    object_registry::ObjectRegistry,
    storage_unit::{Self, StorageUnit},
    test_helpers::{Self, governor, admin, user_a, user_b, tenant},
};

const CHARACTER_A_ITEM_ID: u32 = 1234;
const CHARACTER_B_ITEM_ID: u32 = 5678;

const LOCATION_HASH: vector<u8> =
    x"7a8f3b2e9c4d1a6f5e8b2d9c3f7a1e5b7a8f3b2e9c4d1a6f5e8b2d9c3f7a1e5b";
const MAX_CAPACITY: u64 = 100000;
const STORAGE_TYPE_ID: u64 = 5555;
const STORAGE_ITEM_ID: u64 = 90002;

const FUEL_TYPE_ID: u64 = 1;
const FUEL_VOLUME: u64 = 10;
const FUEL_MAX_CAPACITY: u64 = 1000;
const FUEL_BURN_RATE_IN_MS: u64 = 3600 * 1000;
const MAX_PRODUCTION: u64 = 100;
const NWN_TYPE_ID: u64 = 111000;
const NWN_ITEM_ID: u64 = 5000;

const LENS_TYPE_ID: u64 = 88070;
const LENS_ITEM_ID: u64 = 1000004145108;
const LENS_VOLUME: u64 = 50;
const LENS_QUANTITY: u32 = 5;

const AMMO_TYPE_ID: u64 = 88069;
const AMMO_ITEM_ID: u64 = 1000004145107;
const AMMO_VOLUME: u64 = 100;
const AMMO_QUANTITY: u32 = 10;

const FRIENDLY_MULTIPLIER_BPS: u64 = 9000;
const RIVAL_MULTIPLIER_BPS: u64 = 15000;
const COOLDOWN_MS: u64 = 60_000;
const DEFAULT_TRIBE: u32 = 100;
const RIVAL_TRIBE: u32 = 200;
const UNKNOWN_TYPE_ID: u64 = 999_999;
const SHARED_SCOPE_A: u64 = 7;
const SHARED_SCOPE_B: u64 = 13;
const SHARED_PRICING_PENALTY_BPS: u64 = 500;
const SHARED_MAX_PRICING_PENALTY_BPS: u64 = 5000;
const SHARED_LOCKOUT_THRESHOLD: u64 = 3;
const SHARED_LOCKOUT_DURATION_MS: u64 = 300_000;
const MARKET_MODE_PERPETUAL: u8 = 0;
const MARKET_MODE_PROCUREMENT: u8 = 1;

fun publish_config(ts: &mut ts::Scenario): ID {
    ts::next_tx(ts, admin());
    let config_id = {
        let (admin_cap, extension_config) = config::init_for_testing(ts.ctx());
        let id = object::id(&extension_config);
        transfer::public_transfer(admin_cap, admin());
        config::share_for_testing(extension_config);
        id
    };
    config_id
}

fun setup_nwn(ts: &mut ts::Scenario) {
    test_helpers::setup_world(ts);
    test_helpers::configure_assembly_energy(ts);
}

fun create_character(ts: &mut ts::Scenario, user: address, item_id: u32): ID {
    create_character_with_tribe(ts, user, item_id, DEFAULT_TRIBE)
}

fun create_character_with_tribe(
    ts: &mut ts::Scenario,
    user: address,
    item_id: u32,
    tribe_id: u32,
): ID {
    ts::next_tx(ts, admin());
    let character_id = {
        let admin_acl = ts::take_shared<AdminACL>(ts);
        let mut registry = ts::take_shared<ObjectRegistry>(ts);
        let character = character::create_character(
            &mut registry,
            &admin_acl,
            item_id,
            tenant(),
            tribe_id,
            user,
            utf8(b"name"),
            ts.ctx(),
        );
        let id = object::id(&character);
        character.share_character(&admin_acl, ts.ctx());
        ts::return_shared(registry);
        ts::return_shared(admin_acl);
        id
    };
    character_id
}

fun create_network_node(ts: &mut ts::Scenario, character_id: ID, network_node_item_id: u64): ID {
    ts::next_tx(ts, admin());
    let mut registry = ts::take_shared<ObjectRegistry>(ts);
    let character = ts::take_shared_by_id<Character>(ts, character_id);
    let admin_acl = ts::take_shared<AdminACL>(ts);
        let nwn = network_node::anchor(
            &mut registry,
            &character,
            &admin_acl,
            network_node_item_id,
            NWN_TYPE_ID,
            LOCATION_HASH,
            FUEL_MAX_CAPACITY,
        FUEL_BURN_RATE_IN_MS,
        MAX_PRODUCTION,
        ts.ctx(),
    );
    let id = object::id(&nwn);
    nwn.share_network_node(&admin_acl, ts.ctx());
    ts::return_shared(character);
    ts::return_shared(admin_acl);
    ts::return_shared(registry);
    id
}

fun create_storage_unit(ts: &mut ts::Scenario, owner_character_id: ID, storage_item_id: u64): (ID, ID) {
    let nwn_id = create_network_node(ts, owner_character_id, NWN_ITEM_ID + storage_item_id);
    ts::next_tx(ts, admin());
    let mut registry = ts::take_shared<ObjectRegistry>(ts);
    let mut nwn = ts::take_shared_by_id<NetworkNode>(ts, nwn_id);
    let character = ts::take_shared_by_id<Character>(ts, owner_character_id);
    let storage_id = {
        let admin_acl = ts::take_shared<AdminACL>(ts);
        let storage_unit = storage_unit::anchor(
            &mut registry,
            &mut nwn,
            &character,
            &admin_acl,
            storage_item_id,
            STORAGE_TYPE_ID,
            MAX_CAPACITY,
            LOCATION_HASH,
            ts.ctx(),
        );
        let id = object::id(&storage_unit);
        storage_unit.share_storage_unit(&admin_acl, ts.ctx());
        ts::return_shared(admin_acl);
        id
    };
    ts::return_shared(character);
    ts::return_shared(registry);
    ts::return_shared(nwn);
    (storage_id, nwn_id)
}

fun online_storage_unit(
    ts: &mut ts::Scenario,
    owner_address: address,
    owner_character_id: ID,
    storage_id: ID,
    nwn_id: ID,
) {
    let clock = clock::create_for_testing(ts.ctx());

    ts::next_tx(ts, owner_address);
    let nwn_cap_id = {
        let nwn = ts::take_shared_by_id<NetworkNode>(ts, nwn_id);
        let owner_cap_id = nwn.owner_cap_id();
        ts::return_shared(nwn);
        owner_cap_id
    };
    let mut character = ts::take_shared_by_id<Character>(ts, owner_character_id);
    let (nwn_cap, nwn_receipt) = character.borrow_owner_cap<NetworkNode>(
        ts::receiving_ticket_by_id<OwnerCap<NetworkNode>>(nwn_cap_id),
        ts.ctx(),
    );

    ts::next_tx(ts, owner_address);
    {
        let mut nwn = ts::take_shared_by_id<NetworkNode>(ts, nwn_id);
        nwn.deposit_fuel_test(&nwn_cap, FUEL_TYPE_ID, FUEL_VOLUME, 10, &clock);
        ts::return_shared(nwn);
    };

    ts::next_tx(ts, owner_address);
    {
        let mut nwn = ts::take_shared_by_id<NetworkNode>(ts, nwn_id);
        nwn.online(&nwn_cap, &clock);
        ts::return_shared(nwn);
    };
    character.return_owner_cap(nwn_cap, nwn_receipt);

    ts::next_tx(ts, owner_address);
    {
        let mut storage_unit = ts::take_shared_by_id<StorageUnit>(ts, storage_id);
        let mut nwn = ts::take_shared_by_id<NetworkNode>(ts, nwn_id);
        let energy_config = ts::take_shared<EnergyConfig>(ts);
        let (storage_cap, storage_receipt) = character.borrow_owner_cap<StorageUnit>(
            ts::receiving_ticket_by_id<OwnerCap<StorageUnit>>(storage_unit.owner_cap_id()),
            ts.ctx(),
        );
        storage_unit.online(&mut nwn, &energy_config, &storage_cap);
        character.return_owner_cap(storage_cap, storage_receipt);
        ts::return_shared(storage_unit);
        ts::return_shared(nwn);
        ts::return_shared(energy_config);
    };

    ts::return_shared(character);
    clock.destroy_for_testing();
}

fun mint_ammo<T: key>(ts: &mut ts::Scenario, storage_id: ID, character_id: ID, user: address) {
    ts::next_tx(ts, user);
    {
        let mut character = ts::take_shared_by_id<Character>(ts, character_id);
        let (owner_cap, receipt) = character.borrow_owner_cap<T>(
            ts::most_recent_receiving_ticket<OwnerCap<T>>(&character_id),
            ts.ctx(),
        );
        let mut storage_unit = ts::take_shared_by_id<StorageUnit>(ts, storage_id);
        storage_unit.game_item_to_chain_inventory_test<T>(
            &character,
            &owner_cap,
            AMMO_ITEM_ID,
            AMMO_TYPE_ID,
            AMMO_VOLUME,
            AMMO_QUANTITY,
            ts.ctx(),
        );
        character.return_owner_cap(owner_cap, receipt);
        ts::return_shared(character);
        ts::return_shared(storage_unit);
    };
}

fun mint_lens_to_storage_unit(
    ts: &mut ts::Scenario,
    storage_id: ID,
    character_id: ID,
    user: address,
) {
    ts::next_tx(ts, user);
    {
        let mut storage_unit = ts::take_shared_by_id<StorageUnit>(ts, storage_id);
        let mut character = ts::take_shared_by_id<Character>(ts, character_id);
        let (owner_cap, receipt) = character.borrow_owner_cap<StorageUnit>(
            ts::receiving_ticket_by_id<OwnerCap<StorageUnit>>(storage_unit.owner_cap_id()),
            ts.ctx(),
        );
        storage_unit.game_item_to_chain_inventory_test<StorageUnit>(
            &character,
            &owner_cap,
            LENS_ITEM_ID,
            LENS_TYPE_ID,
            LENS_VOLUME,
            LENS_QUANTITY,
            ts.ctx(),
        );
        character.return_owner_cap(owner_cap, receipt);
        ts::return_shared(character);
        ts::return_shared(storage_unit);
    };
}

fun character_owner_cap_id(ts: &mut ts::Scenario, character_id: ID): ID {
    ts::next_tx(ts, admin());
    let character = ts::take_shared_by_id<Character>(ts, character_id);
    let owner_cap_id = character.owner_cap_id();
    ts::return_shared(character);
    owner_cap_id
}

fun authorize_and_configure_locker(
    ts: &mut ts::Scenario,
    storage_id: ID,
    owner_character_id: ID,
    config_id: ID,
) {
    authorize_and_configure_locker_with_relationships(
        ts,
        storage_id,
        owner_character_id,
        config_id,
        MARKET_MODE_PERPETUAL,
        0,
        vector[],
        vector[RIVAL_TRIBE],
    )
}

fun authorize_and_configure_locker_with_relationships(
    ts: &mut ts::Scenario,
    storage_id: ID,
    owner_character_id: ID,
    config_id: ID,
    market_mode: u8,
    fuel_fee_units: u64,
    friendly_tribes: vector<u32>,
    rival_tribes: vector<u32>,
) {
    ts::next_tx(ts, user_b());
    {
        let mut storage_unit = ts::take_shared_by_id<StorageUnit>(ts, storage_id);
        let mut owner_character = ts::take_shared_by_id<Character>(ts, owner_character_id);
        let (storage_cap, receipt) = owner_character.borrow_owner_cap<StorageUnit>(
            ts::receiving_ticket_by_id<OwnerCap<StorageUnit>>(storage_unit.owner_cap_id()),
            ts.ctx(),
        );
        storage_unit.authorize_extension<config::TrustLockerAuth>(&storage_cap);
        let mut extension_config = ts::take_shared_by_id<ExtensionConfig>(ts, config_id);
        trust_locker::set_policy(
            &storage_unit,
            &storage_cap,
            &mut extension_config,
            vector[LENS_TYPE_ID, AMMO_TYPE_ID],
            vector[2, 1],
            friendly_tribes,
            rival_tribes,
            FRIENDLY_MULTIPLIER_BPS,
            RIVAL_MULTIPLIER_BPS,
            market_mode,
            fuel_fee_units,
            0,
            false,
            COOLDOWN_MS,
            true,
        );
        owner_character.return_owner_cap(storage_cap, receipt);
        ts::return_shared(owner_character);
        ts::return_shared(storage_unit);
        ts::return_shared(extension_config);
    };
}

fun authorize_and_configure_locker_with_shared_network(
    ts: &mut ts::Scenario,
    storage_id: ID,
    owner_character_id: ID,
    config_id: ID,
    market_mode: u8,
    fuel_fee_units: u64,
    strike_scope_id: u64,
    use_shared_penalties: bool,
    friendly_tribes: vector<u32>,
    rival_tribes: vector<u32>,
) {
    ts::next_tx(ts, user_b());
    {
        let mut storage_unit = ts::take_shared_by_id<StorageUnit>(ts, storage_id);
        let mut owner_character = ts::take_shared_by_id<Character>(ts, owner_character_id);
        let (storage_cap, receipt) = owner_character.borrow_owner_cap<StorageUnit>(
            ts::receiving_ticket_by_id<OwnerCap<StorageUnit>>(storage_unit.owner_cap_id()),
            ts.ctx(),
        );
        storage_unit.authorize_extension<config::TrustLockerAuth>(&storage_cap);
        let mut extension_config = ts::take_shared_by_id<ExtensionConfig>(ts, config_id);
        trust_locker::set_policy(
            &storage_unit,
            &storage_cap,
            &mut extension_config,
            vector[LENS_TYPE_ID, AMMO_TYPE_ID],
            vector[2, 1],
            friendly_tribes,
            rival_tribes,
            FRIENDLY_MULTIPLIER_BPS,
            RIVAL_MULTIPLIER_BPS,
            market_mode,
            fuel_fee_units,
            strike_scope_id,
            use_shared_penalties,
            COOLDOWN_MS,
            true,
        );
        owner_character.return_owner_cap(storage_cap, receipt);
        ts::return_shared(owner_character);
        ts::return_shared(storage_unit);
        ts::return_shared(extension_config);
    };
}

fun seed_locker_open_inventory(
    ts: &mut ts::Scenario,
    storage_id: ID,
    owner_character_id: ID,
) {
    ts::next_tx(ts, user_b());
    {
        let mut storage_unit = ts::take_shared_by_id<StorageUnit>(ts, storage_id);
        let mut owner_character = ts::take_shared_by_id<Character>(ts, owner_character_id);
        let (storage_cap, receipt) = owner_character.borrow_owner_cap<StorageUnit>(
            ts::receiving_ticket_by_id<OwnerCap<StorageUnit>>(storage_unit.owner_cap_id()),
            ts.ctx(),
        );
        trust_locker::seed_open_inventory(
            &mut storage_unit,
            &owner_character,
            &storage_cap,
            LENS_TYPE_ID,
            LENS_QUANTITY,
            ts.ctx(),
        );
        owner_character.return_owner_cap(storage_cap, receipt);
        ts::return_shared(owner_character);
        ts::return_shared(storage_unit);
    };
}

fun configure_shared_network_policy(
    ts: &mut ts::Scenario,
    storage_id: ID,
    owner_character_id: ID,
    config_id: ID,
    strike_scope_id: u64,
    pricing_penalty_per_strike_bps: u64,
    max_pricing_penalty_bps: u64,
    lockout_strike_threshold: u64,
    network_lockout_duration_ms: u64,
    is_active: bool,
) {
    ts::next_tx(ts, user_b());
    {
        let storage_unit = ts::take_shared_by_id<StorageUnit>(ts, storage_id);
        let mut owner_character = ts::take_shared_by_id<Character>(ts, owner_character_id);
        let (storage_cap, receipt) = owner_character.borrow_owner_cap<StorageUnit>(
            ts::receiving_ticket_by_id<OwnerCap<StorageUnit>>(storage_unit.owner_cap_id()),
            ts.ctx(),
        );
        let mut extension_config = ts::take_shared_by_id<ExtensionConfig>(ts, config_id);
        trust_locker::set_strike_network_policy(
            &storage_unit,
            &storage_cap,
            &mut extension_config,
            strike_scope_id,
            pricing_penalty_per_strike_bps,
            max_pricing_penalty_bps,
            lockout_strike_threshold,
            network_lockout_duration_ms,
            is_active,
        );
        owner_character.return_owner_cap(storage_cap, receipt);
        ts::return_shared(extension_config);
        ts::return_shared(owner_character);
        ts::return_shared(storage_unit);
    };
}

#[test]
fun test_owner_can_stock_shelf_from_owned_inventory() {
    let mut ts = ts::begin(governor());
    setup_nwn(&mut ts);
    let config_id = publish_config(&mut ts);
    let owner_character_id = create_character(&mut ts, user_b(), CHARACTER_B_ITEM_ID);
    let (storage_id, nwn_id) = create_storage_unit(&mut ts, owner_character_id, STORAGE_ITEM_ID + 20);

    online_storage_unit(&mut ts, user_b(), owner_character_id, storage_id, nwn_id);
    mint_ammo<Character>(&mut ts, storage_id, owner_character_id, user_b());
    authorize_and_configure_locker(&mut ts, storage_id, owner_character_id, config_id);

    let owner_character_cap_id = character_owner_cap_id(&mut ts, owner_character_id);
    let locker_open_key = {
        ts::next_tx(&mut ts, admin());
        let storage_unit = ts::take_shared_by_id<StorageUnit>(&ts, storage_id);
        let key = storage_unit.open_storage_key();
        ts::return_shared(storage_unit);
        key
    };

    ts::next_tx(&mut ts, user_b());
    {
        let mut storage_unit = ts::take_shared_by_id<StorageUnit>(&ts, storage_id);
        let mut owner_character = ts::take_shared_by_id<Character>(&ts, owner_character_id);
        let (storage_cap, storage_receipt) = owner_character.borrow_owner_cap<StorageUnit>(
            ts::receiving_ticket_by_id<OwnerCap<StorageUnit>>(storage_unit.owner_cap_id()),
            ts.ctx(),
        );
        let (owner_cap, receipt) = owner_character.borrow_owner_cap<Character>(
            ts::most_recent_receiving_ticket<OwnerCap<Character>>(&owner_character_id),
            ts.ctx(),
        );
        trust_locker::stock_from_owned_inventory(
            &mut storage_unit,
            &owner_character,
            &storage_cap,
            &owner_cap,
            AMMO_TYPE_ID,
            3,
            ts.ctx(),
        );
        owner_character.return_owner_cap(owner_cap, receipt);
        owner_character.return_owner_cap(storage_cap, storage_receipt);
        ts::return_shared(owner_character);
        ts::return_shared(storage_unit);
    };

    ts::next_tx(&mut ts, admin());
    {
        let storage_unit = ts::take_shared_by_id<StorageUnit>(&ts, storage_id);
        assert_eq!(storage_unit::item_quantity(&storage_unit, owner_character_cap_id, AMMO_TYPE_ID), 7);
        assert_eq!(storage_unit::item_quantity(&storage_unit, locker_open_key, AMMO_TYPE_ID), 3);
        ts::return_shared(storage_unit);
    };

    ts::end(ts);
}

#[test]
fun test_owner_can_claim_and_restock_procurement_receipts() {
    let mut ts = ts::begin(governor());
    setup_nwn(&mut ts);
    let config_id = publish_config(&mut ts);
    let visitor_character_id = create_character(&mut ts, user_a(), CHARACTER_A_ITEM_ID);
    let owner_character_id = create_character(&mut ts, user_b(), CHARACTER_B_ITEM_ID);
    let (storage_id, nwn_id) = create_storage_unit(&mut ts, owner_character_id, STORAGE_ITEM_ID + 21);

    online_storage_unit(&mut ts, user_b(), owner_character_id, storage_id, nwn_id);
    mint_lens_to_storage_unit(&mut ts, storage_id, owner_character_id, user_b());
    mint_ammo<Character>(&mut ts, storage_id, visitor_character_id, user_a());
    authorize_and_configure_locker_with_relationships(
        &mut ts,
        storage_id,
        owner_character_id,
        config_id,
        MARKET_MODE_PROCUREMENT,
        0,
        vector[],
        vector[RIVAL_TRIBE],
    );
    seed_locker_open_inventory(&mut ts, storage_id, owner_character_id);

    let owner_character_cap_id = character_owner_cap_id(&mut ts, owner_character_id);
    let locker_open_key = {
        ts::next_tx(&mut ts, admin());
        let storage_unit = ts::take_shared_by_id<StorageUnit>(&ts, storage_id);
        let key = storage_unit.open_storage_key();
        ts::return_shared(storage_unit);
        key
    };

    let trade_clock = clock::create_for_testing(ts.ctx());
    ts::next_tx(&mut ts, user_a());
    {
        let mut storage_unit = ts::take_shared_by_id<StorageUnit>(&ts, storage_id);
        let mut visitor = ts::take_shared_by_id<Character>(&ts, visitor_character_id);
        let (visitor_cap, visitor_receipt) = visitor.borrow_owner_cap<Character>(
            ts::most_recent_receiving_ticket<OwnerCap<Character>>(&visitor_character_id),
            ts.ctx(),
        );
        let mut extension_config = ts::take_shared_by_id<ExtensionConfig>(&ts, config_id);
        trust_locker::trade(
            &mut storage_unit,
            &visitor,
            &visitor_cap,
            &mut extension_config,
            &trade_clock,
            LENS_TYPE_ID,
            5,
            AMMO_TYPE_ID,
            10,
            ts.ctx(),
        );
        visitor.return_owner_cap(visitor_cap, visitor_receipt);
        ts::return_shared(extension_config);
        ts::return_shared(visitor);
        ts::return_shared(storage_unit);
    };

    ts::next_tx(&mut ts, user_b());
    {
        let mut storage_unit = ts::take_shared_by_id<StorageUnit>(&ts, storage_id);
        let mut owner_character = ts::take_shared_by_id<Character>(&ts, owner_character_id);
        let (storage_cap, receipt) = owner_character.borrow_owner_cap<StorageUnit>(
            ts::receiving_ticket_by_id<OwnerCap<StorageUnit>>(storage_unit.owner_cap_id()),
            ts.ctx(),
        );
        let extension_config = ts::take_shared_by_id<ExtensionConfig>(&ts, config_id);
        trust_locker::claim_to_owned_inventory(
            &mut storage_unit,
            &owner_character,
            &storage_cap,
            &extension_config,
            AMMO_TYPE_ID,
            4,
            ts.ctx(),
        );
        ts::return_shared(extension_config);
        owner_character.return_owner_cap(storage_cap, receipt);
        ts::return_shared(owner_character);
        ts::return_shared(storage_unit);
    };

    ts::next_tx(&mut ts, admin());
    {
        let storage_unit = ts::take_shared_by_id<StorageUnit>(&ts, storage_id);
        assert_eq!(storage_unit::item_quantity(&storage_unit, owner_character_cap_id, AMMO_TYPE_ID), 4);
        assert_eq!(storage_unit::item_quantity(&storage_unit, storage_unit.owner_cap_id(), AMMO_TYPE_ID), 6);
        ts::return_shared(storage_unit);
    };

    ts::next_tx(&mut ts, user_b());
    {
        let mut storage_unit = ts::take_shared_by_id<StorageUnit>(&ts, storage_id);
        let mut owner_character = ts::take_shared_by_id<Character>(&ts, owner_character_id);
        let (storage_cap, receipt) = owner_character.borrow_owner_cap<StorageUnit>(
            ts::receiving_ticket_by_id<OwnerCap<StorageUnit>>(storage_unit.owner_cap_id()),
            ts.ctx(),
        );
        let extension_config = ts::take_shared_by_id<ExtensionConfig>(&ts, config_id);
        trust_locker::restock_from_owner_reserve(
            &mut storage_unit,
            &owner_character,
            &storage_cap,
            &extension_config,
            AMMO_TYPE_ID,
            2,
            ts.ctx(),
        );
        ts::return_shared(extension_config);
        owner_character.return_owner_cap(storage_cap, receipt);
        ts::return_shared(owner_character);
        ts::return_shared(storage_unit);
    };

    ts::next_tx(&mut ts, admin());
    {
        let storage_unit = ts::take_shared_by_id<StorageUnit>(&ts, storage_id);
        assert_eq!(storage_unit::item_quantity(&storage_unit, locker_open_key, AMMO_TYPE_ID), 2);
        assert_eq!(storage_unit::item_quantity(&storage_unit, storage_unit.owner_cap_id(), AMMO_TYPE_ID), 4);
        ts::return_shared(storage_unit);
    };

    trade_clock.destroy_for_testing();
    ts::end(ts);
}

#[test]
fun test_policy_creation_and_update() {
    let mut ts = ts::begin(governor());
    setup_nwn(&mut ts);
    let config_id = publish_config(&mut ts);
    let owner_character_id = create_character(&mut ts, user_b(), CHARACTER_B_ITEM_ID);
    let (storage_id, _nwn_id) = create_storage_unit(&mut ts, owner_character_id, STORAGE_ITEM_ID);

    authorize_and_configure_locker(&mut ts, storage_id, owner_character_id, config_id);

    ts::next_tx(&mut ts, user_b());
    {
        let storage_unit = ts::take_shared_by_id<StorageUnit>(&ts, storage_id);
        let mut owner_character = ts::take_shared_by_id<Character>(&ts, owner_character_id);
        let (storage_cap, receipt) = owner_character.borrow_owner_cap<StorageUnit>(
            ts::receiving_ticket_by_id<OwnerCap<StorageUnit>>(storage_unit.owner_cap_id()),
            ts.ctx(),
        );
        let mut extension_config = ts::take_shared_by_id<ExtensionConfig>(&ts, config_id);
        trust_locker::set_item_points(
            &storage_unit,
            &storage_cap,
            &mut extension_config,
            LENS_TYPE_ID,
            3,
        );
        owner_character.return_owner_cap(storage_cap, receipt);
        ts::return_shared(extension_config);
        ts::return_shared(owner_character);
        ts::return_shared(storage_unit);
    };

    ts::next_tx(&mut ts, admin());
    {
        let extension_config = ts::take_shared_by_id<ExtensionConfig>(&ts, config_id);
        assert!(trust_locker::has_policy(&extension_config, storage_id));
        assert_eq!(trust_locker::accepted_item_count(&extension_config, storage_id), 2);
        assert_eq!(
            trust_locker::accepted_points_for_type(&extension_config, storage_id, LENS_TYPE_ID),
            3,
        );
        assert_eq!(
            trust_locker::market_mode_for_locker(&extension_config, storage_id),
            MARKET_MODE_PERPETUAL,
        );
        assert_eq!(
            trust_locker::fuel_fee_units_for_locker(&extension_config, storage_id),
            0,
        );
        ts::return_shared(extension_config);
    };

    ts::end(ts);
}

#[test]
fun test_fair_trade_has_no_strike() {
    let mut ts = ts::begin(governor());
    setup_nwn(&mut ts);
    let config_id = publish_config(&mut ts);
    let visitor_character_id = create_character(&mut ts, user_a(), CHARACTER_A_ITEM_ID);
    let owner_character_id = create_character(&mut ts, user_b(), CHARACTER_B_ITEM_ID);
    let (storage_id, nwn_id) = create_storage_unit(&mut ts, owner_character_id, STORAGE_ITEM_ID);

    online_storage_unit(&mut ts, user_b(), owner_character_id, storage_id, nwn_id);
    mint_lens_to_storage_unit(&mut ts, storage_id, owner_character_id, user_b());
    mint_ammo<Character>(&mut ts, storage_id, visitor_character_id, user_a());
    authorize_and_configure_locker(&mut ts, storage_id, owner_character_id, config_id);
    seed_locker_open_inventory(&mut ts, storage_id, owner_character_id);

    let visitor_cap_id = character_owner_cap_id(&mut ts, visitor_character_id);
    let locker_open_key = {
        ts::next_tx(&mut ts, admin());
        let storage_unit = ts::take_shared_by_id<StorageUnit>(&ts, storage_id);
        let key = storage_unit.open_storage_key();
        ts::return_shared(storage_unit);
        key
    };

    let trade_clock = clock::create_for_testing(ts.ctx());
    ts::next_tx(&mut ts, user_a());
    {
        let mut storage_unit = ts::take_shared_by_id<StorageUnit>(&ts, storage_id);
        let mut visitor = ts::take_shared_by_id<Character>(&ts, visitor_character_id);
        let (visitor_cap, visitor_receipt) = visitor.borrow_owner_cap<Character>(
            ts::most_recent_receiving_ticket<OwnerCap<Character>>(&visitor_character_id),
            ts.ctx(),
        );
        let mut extension_config = ts::take_shared_by_id<ExtensionConfig>(&ts, config_id);
        trust_locker::trade(
            &mut storage_unit,
            &visitor,
            &visitor_cap,
            &mut extension_config,
            &trade_clock,
            LENS_TYPE_ID,
            LENS_QUANTITY,
            AMMO_TYPE_ID,
            AMMO_QUANTITY,
            ts.ctx(),
        );
        visitor.return_owner_cap(visitor_cap, visitor_receipt);
        ts::return_shared(extension_config);
        ts::return_shared(visitor);
        ts::return_shared(storage_unit);
    };

    ts::next_tx(&mut ts, admin());
    {
        let storage_unit = ts::take_shared_by_id<StorageUnit>(&ts, storage_id);
        assert_eq!(
            storage_unit::item_quantity(&storage_unit, visitor_cap_id, LENS_TYPE_ID),
            LENS_QUANTITY,
        );
        assert_eq!(
            storage_unit::item_quantity(&storage_unit, locker_open_key, AMMO_TYPE_ID),
            AMMO_QUANTITY,
        );
        ts::return_shared(storage_unit);
    };

    ts::next_tx(&mut ts, admin());
    {
        let extension_config = ts::take_shared_by_id<ExtensionConfig>(&ts, config_id);
        assert_eq!(
            trust_locker::strike_count(&extension_config, storage_id, visitor_character_id),
            0,
        );
        ts::return_shared(extension_config);
    };

    trade_clock.destroy_for_testing();
    ts::end(ts);
}

#[test]
fun test_underpay_trade_adds_strike_and_cooldown() {
    let mut ts = ts::begin(governor());
    setup_nwn(&mut ts);
    let config_id = publish_config(&mut ts);
    let visitor_character_id = create_character_with_tribe(&mut ts, user_a(), CHARACTER_A_ITEM_ID, RIVAL_TRIBE);
    let owner_character_id = create_character(&mut ts, user_b(), CHARACTER_B_ITEM_ID);
    let (storage_id, nwn_id) = create_storage_unit(&mut ts, owner_character_id, STORAGE_ITEM_ID + 1);

    online_storage_unit(&mut ts, user_b(), owner_character_id, storage_id, nwn_id);
    mint_lens_to_storage_unit(&mut ts, storage_id, owner_character_id, user_b());
    mint_ammo<Character>(&mut ts, storage_id, visitor_character_id, user_a());
    authorize_and_configure_locker(&mut ts, storage_id, owner_character_id, config_id);
    seed_locker_open_inventory(&mut ts, storage_id, owner_character_id);

    let trade_clock = clock::create_for_testing(ts.ctx());
    ts::next_tx(&mut ts, user_a());
    {
        let mut storage_unit = ts::take_shared_by_id<StorageUnit>(&ts, storage_id);
        let mut visitor = ts::take_shared_by_id<Character>(&ts, visitor_character_id);
        let (visitor_cap, visitor_receipt) = visitor.borrow_owner_cap<Character>(
            ts::most_recent_receiving_ticket<OwnerCap<Character>>(&visitor_character_id),
            ts.ctx(),
        );
        let mut extension_config = ts::take_shared_by_id<ExtensionConfig>(&ts, config_id);
        trust_locker::trade(
            &mut storage_unit,
            &visitor,
            &visitor_cap,
            &mut extension_config,
            &trade_clock,
            LENS_TYPE_ID,
            LENS_QUANTITY,
            AMMO_TYPE_ID,
            5,
            ts.ctx(),
        );
        visitor.return_owner_cap(visitor_cap, visitor_receipt);
        ts::return_shared(extension_config);
        ts::return_shared(visitor);
        ts::return_shared(storage_unit);
    };

    ts::next_tx(&mut ts, admin());
    {
        let extension_config = ts::take_shared_by_id<ExtensionConfig>(&ts, config_id);
        assert_eq!(
            trust_locker::strike_count(&extension_config, storage_id, visitor_character_id),
            1,
        );
        assert!(
            trust_locker::is_in_cooldown(
                &extension_config,
                storage_id,
                visitor_character_id,
                &trade_clock,
            )
        );
        ts::return_shared(extension_config);
    };

    trade_clock.destroy_for_testing();
    ts::end(ts);
}

#[test]
#[expected_failure(abort_code = trust_locker::ECooldownActive)]
fun test_cooldown_blocks_repeat_trade() {
    let mut ts = ts::begin(governor());
    setup_nwn(&mut ts);
    let config_id = publish_config(&mut ts);
    let visitor_character_id =
        create_character_with_tribe(&mut ts, user_a(), CHARACTER_A_ITEM_ID, RIVAL_TRIBE);
    let owner_character_id = create_character(&mut ts, user_b(), CHARACTER_B_ITEM_ID);
    let (storage_id, nwn_id) = create_storage_unit(&mut ts, owner_character_id, STORAGE_ITEM_ID + 10);

    online_storage_unit(&mut ts, user_b(), owner_character_id, storage_id, nwn_id);
    mint_lens_to_storage_unit(&mut ts, storage_id, owner_character_id, user_b());
    mint_ammo<Character>(&mut ts, storage_id, visitor_character_id, user_a());
    authorize_and_configure_locker(&mut ts, storage_id, owner_character_id, config_id);
    seed_locker_open_inventory(&mut ts, storage_id, owner_character_id);

    let trade_clock = clock::create_for_testing(ts.ctx());

    // First trade underpays, creating strike + cooldown.
    ts::next_tx(&mut ts, user_a());
    {
        let mut storage_unit = ts::take_shared_by_id<StorageUnit>(&ts, storage_id);
        let mut visitor = ts::take_shared_by_id<Character>(&ts, visitor_character_id);
        let (visitor_cap, visitor_receipt) = visitor.borrow_owner_cap<Character>(
            ts::most_recent_receiving_ticket<OwnerCap<Character>>(&visitor_character_id),
            ts.ctx(),
        );
        let mut extension_config = ts::take_shared_by_id<ExtensionConfig>(&ts, config_id);
        trust_locker::trade(
            &mut storage_unit,
            &visitor,
            &visitor_cap,
            &mut extension_config,
            &trade_clock,
            LENS_TYPE_ID,
            1,
            AMMO_TYPE_ID,
            0,
            ts.ctx(),
        );
        visitor.return_owner_cap(visitor_cap, visitor_receipt);
        ts::return_shared(extension_config);
        ts::return_shared(visitor);
        ts::return_shared(storage_unit);
    };

    // Repeat trade should fail while cooldown is active.
    ts::next_tx(&mut ts, user_a());
    {
        let mut storage_unit = ts::take_shared_by_id<StorageUnit>(&ts, storage_id);
        let mut visitor = ts::take_shared_by_id<Character>(&ts, visitor_character_id);
        let (visitor_cap, visitor_receipt) = visitor.borrow_owner_cap<Character>(
            ts::most_recent_receiving_ticket<OwnerCap<Character>>(&visitor_character_id),
            ts.ctx(),
        );
        let mut extension_config = ts::take_shared_by_id<ExtensionConfig>(&ts, config_id);
        trust_locker::trade(
            &mut storage_unit,
            &visitor,
            &visitor_cap,
            &mut extension_config,
            &trade_clock,
            LENS_TYPE_ID,
            1,
            AMMO_TYPE_ID,
            1,
            ts.ctx(),
        );
        visitor.return_owner_cap(visitor_cap, visitor_receipt);
        ts::return_shared(extension_config);
        ts::return_shared(visitor);
        ts::return_shared(storage_unit);
    };

    trade_clock.destroy_for_testing();
    ts::end(ts);
}

#[test]
fun test_quote_requested_points_friendly_vs_rival() {
    let mut ts = ts::begin(governor());
    setup_nwn(&mut ts);
    let config_id = publish_config(&mut ts);
    let owner_character_id = create_character(&mut ts, user_b(), CHARACTER_B_ITEM_ID);
    let friendly_character_id = create_character_with_tribe(
        &mut ts,
        user_a(),
        CHARACTER_A_ITEM_ID,
        DEFAULT_TRIBE,
    );
    let rival_character_id = create_character_with_tribe(
        &mut ts,
        user_b(),
        CHARACTER_B_ITEM_ID + 10,
        RIVAL_TRIBE,
    );
    let (storage_id, _nwn_id) = create_storage_unit(&mut ts, owner_character_id, STORAGE_ITEM_ID + 11);

    authorize_and_configure_locker_with_relationships(
        &mut ts,
        storage_id,
        owner_character_id,
        config_id,
        MARKET_MODE_PERPETUAL,
        0,
        vector[DEFAULT_TRIBE],
        vector[RIVAL_TRIBE],
    );

    ts::next_tx(&mut ts, admin());
    {
        let extension_config = ts::take_shared_by_id<ExtensionConfig>(&ts, config_id);
        let friendly = ts::take_shared_by_id<Character>(&ts, friendly_character_id);
        let rival = ts::take_shared_by_id<Character>(&ts, rival_character_id);

        let friendly_quote = trust_locker::quote_requested_points(
            &extension_config,
            storage_id,
            &friendly,
            LENS_TYPE_ID,
            LENS_QUANTITY,
        );
        let rival_quote = trust_locker::quote_requested_points(
            &extension_config,
            storage_id,
            &rival,
            LENS_TYPE_ID,
            LENS_QUANTITY,
        );

        assert_eq!(friendly_quote, 9); // 2 * 5 * 9000 / 10000
        assert_eq!(rival_quote, 15); // 2 * 5 * 15000 / 10000
        assert!(rival_quote > friendly_quote);

        ts::return_shared(rival);
        ts::return_shared(friendly);
        ts::return_shared(extension_config);
    };

    ts::end(ts);
}

#[test]
fun test_shared_penalty_increases_quote_across_lockers() {
    let mut ts = ts::begin(governor());
    setup_nwn(&mut ts);
    let config_id = publish_config(&mut ts);
    let visitor_character_id = create_character_with_tribe(&mut ts, user_a(), CHARACTER_A_ITEM_ID, RIVAL_TRIBE);
    let owner_character_id = create_character(&mut ts, user_b(), CHARACTER_B_ITEM_ID);
    let (storage_a_id, _nwn_a_id) = create_storage_unit(&mut ts, owner_character_id, STORAGE_ITEM_ID + 20);
    let (storage_b_id, _nwn_b_id) = create_storage_unit(&mut ts, owner_character_id, STORAGE_ITEM_ID + 21);
    authorize_and_configure_locker_with_shared_network(
        &mut ts,
        storage_a_id,
        owner_character_id,
        config_id,
        MARKET_MODE_PERPETUAL,
        0,
        SHARED_SCOPE_A,
        true,
        vector[],
        vector[RIVAL_TRIBE],
    );
    authorize_and_configure_locker_with_shared_network(
        &mut ts,
        storage_b_id,
        owner_character_id,
        config_id,
        MARKET_MODE_PERPETUAL,
        0,
        SHARED_SCOPE_A,
        true,
        vector[],
        vector[RIVAL_TRIBE],
    );
    configure_shared_network_policy(
        &mut ts,
        storage_a_id,
        owner_character_id,
        config_id,
        SHARED_SCOPE_A,
        SHARED_PRICING_PENALTY_BPS,
        SHARED_MAX_PRICING_PENALTY_BPS,
        SHARED_LOCKOUT_THRESHOLD,
        SHARED_LOCKOUT_DURATION_MS,
        true,
    );
    ts::next_tx(&mut ts, admin());
    {
        let mut extension_config = ts::take_shared_by_id<ExtensionConfig>(&ts, config_id);
        trust_locker::set_shared_penalty_state_for_testing(
            &mut extension_config,
            SHARED_SCOPE_A,
            visitor_character_id,
            SHARED_LOCKOUT_THRESHOLD + 7,
            9,
            0,
            storage_a_id,
        );
        ts::return_shared(extension_config);
    };

    ts::next_tx(&mut ts, admin());
    {
        let extension_config = ts::take_shared_by_id<ExtensionConfig>(&ts, config_id);
        let visitor = ts::take_shared_by_id<Character>(&ts, visitor_character_id);
        assert_eq!(
            trust_locker::shared_strike_count(&extension_config, SHARED_SCOPE_A, visitor_character_id),
            SHARED_LOCKOUT_THRESHOLD + 7,
        );
        assert_eq!(
            trust_locker::shared_pricing_penalty_bps(&extension_config, SHARED_SCOPE_A, visitor_character_id),
            SHARED_MAX_PRICING_PENALTY_BPS,
        );
        assert_eq!(
            trust_locker::quote_requested_points(
                &extension_config,
                storage_b_id,
                &visitor,
                LENS_TYPE_ID,
                10,
            ),
            45,
        );
        ts::return_shared(visitor);
        ts::return_shared(extension_config);
    };

    ts::end(ts);
}

#[test]
#[expected_failure(abort_code = trust_locker::ESharedCooldownActive)]
fun test_shared_lockout_blocks_other_locker_in_same_scope() {
    let mut ts = ts::begin(governor());
    setup_nwn(&mut ts);
    let config_id = publish_config(&mut ts);
    let visitor_character_id = create_character_with_tribe(&mut ts, user_a(), CHARACTER_A_ITEM_ID, RIVAL_TRIBE);
    let owner_character_id = create_character(&mut ts, user_b(), CHARACTER_B_ITEM_ID);
    let (storage_a_id, _nwn_a_id) = create_storage_unit(&mut ts, owner_character_id, STORAGE_ITEM_ID + 30);
    let (storage_b_id, _nwn_b_id) = create_storage_unit(&mut ts, owner_character_id, STORAGE_ITEM_ID + 31);
    authorize_and_configure_locker_with_shared_network(
        &mut ts,
        storage_a_id,
        owner_character_id,
        config_id,
        MARKET_MODE_PERPETUAL,
        0,
        SHARED_SCOPE_B,
        true,
        vector[],
        vector[RIVAL_TRIBE],
    );
    authorize_and_configure_locker_with_shared_network(
        &mut ts,
        storage_b_id,
        owner_character_id,
        config_id,
        MARKET_MODE_PERPETUAL,
        0,
        SHARED_SCOPE_B,
        true,
        vector[],
        vector[RIVAL_TRIBE],
    );
    configure_shared_network_policy(
        &mut ts,
        storage_a_id,
        owner_character_id,
        config_id,
        SHARED_SCOPE_B,
        SHARED_PRICING_PENALTY_BPS,
        SHARED_MAX_PRICING_PENALTY_BPS,
        1,
        SHARED_LOCKOUT_DURATION_MS,
        true,
    );
    let trade_clock = clock::create_for_testing(ts.ctx());
    ts::next_tx(&mut ts, admin());
    {
        let mut extension_config = ts::take_shared_by_id<ExtensionConfig>(&ts, config_id);
        trust_locker::set_shared_penalty_state_for_testing(
            &mut extension_config,
            SHARED_SCOPE_B,
            visitor_character_id,
            SHARED_LOCKOUT_THRESHOLD,
            9,
            trade_clock.timestamp_ms() + SHARED_LOCKOUT_DURATION_MS,
            storage_a_id,
        );
        assert_eq!(trust_locker::shared_strike_count(&extension_config, SHARED_SCOPE_B, visitor_character_id), SHARED_LOCKOUT_THRESHOLD);
        assert!(trust_locker::shared_is_in_cooldown(
            &extension_config,
            SHARED_SCOPE_B,
            visitor_character_id,
            &trade_clock,
        ));
        ts::return_shared(extension_config);
    };

    ts::next_tx(&mut ts, user_a());
    {
        let mut storage_unit = ts::take_shared_by_id<StorageUnit>(&ts, storage_b_id);
        let mut visitor = ts::take_shared_by_id<Character>(&ts, visitor_character_id);
        let (visitor_cap, visitor_receipt) = visitor.borrow_owner_cap<Character>(
            ts::most_recent_receiving_ticket<OwnerCap<Character>>(&visitor_character_id),
            ts.ctx(),
        );
        let mut extension_config = ts::take_shared_by_id<ExtensionConfig>(&ts, config_id);
        trust_locker::trade(
            &mut storage_unit,
            &visitor,
            &visitor_cap,
            &mut extension_config,
            &trade_clock,
            LENS_TYPE_ID,
            1,
            AMMO_TYPE_ID,
            1,
            ts.ctx(),
        );
        visitor.return_owner_cap(visitor_cap, visitor_receipt);
        ts::return_shared(extension_config);
        ts::return_shared(visitor);
        ts::return_shared(storage_unit);
    };

    trade_clock.destroy_for_testing();
    ts::end(ts);
}

#[test]
fun test_different_shared_scopes_do_not_share_strikes() {
    let mut ts = ts::begin(governor());
    setup_nwn(&mut ts);
    let config_id = publish_config(&mut ts);
    let visitor_character_id = create_character_with_tribe(&mut ts, user_a(), CHARACTER_A_ITEM_ID, RIVAL_TRIBE);
    let owner_character_id = create_character(&mut ts, user_b(), CHARACTER_B_ITEM_ID);
    let (storage_a_id, _nwn_a_id) = create_storage_unit(&mut ts, owner_character_id, STORAGE_ITEM_ID + 40);
    let (storage_b_id, _nwn_b_id) = create_storage_unit(&mut ts, owner_character_id, STORAGE_ITEM_ID + 41);
    authorize_and_configure_locker_with_shared_network(
        &mut ts,
        storage_a_id,
        owner_character_id,
        config_id,
        MARKET_MODE_PERPETUAL,
        0,
        SHARED_SCOPE_A,
        true,
        vector[],
        vector[RIVAL_TRIBE],
    );
    authorize_and_configure_locker_with_shared_network(
        &mut ts,
        storage_b_id,
        owner_character_id,
        config_id,
        MARKET_MODE_PERPETUAL,
        0,
        SHARED_SCOPE_B,
        true,
        vector[],
        vector[RIVAL_TRIBE],
    );
    configure_shared_network_policy(
        &mut ts,
        storage_a_id,
        owner_character_id,
        config_id,
        SHARED_SCOPE_A,
        SHARED_PRICING_PENALTY_BPS,
        SHARED_MAX_PRICING_PENALTY_BPS,
        SHARED_LOCKOUT_THRESHOLD,
        SHARED_LOCKOUT_DURATION_MS,
        true,
    );
    configure_shared_network_policy(
        &mut ts,
        storage_b_id,
        owner_character_id,
        config_id,
        SHARED_SCOPE_B,
        SHARED_PRICING_PENALTY_BPS,
        SHARED_MAX_PRICING_PENALTY_BPS,
        SHARED_LOCKOUT_THRESHOLD,
        SHARED_LOCKOUT_DURATION_MS,
        true,
    );
    ts::next_tx(&mut ts, admin());
    {
        let mut extension_config = ts::take_shared_by_id<ExtensionConfig>(&ts, config_id);
        trust_locker::set_shared_penalty_state_for_testing(
            &mut extension_config,
            SHARED_SCOPE_A,
            visitor_character_id,
            1,
            9,
            0,
            storage_a_id,
        );
        ts::return_shared(extension_config);
    };

    ts::next_tx(&mut ts, admin());
    {
        let extension_config = ts::take_shared_by_id<ExtensionConfig>(&ts, config_id);
        let visitor = ts::take_shared_by_id<Character>(&ts, visitor_character_id);
        assert_eq!(trust_locker::shared_strike_count(&extension_config, SHARED_SCOPE_A, visitor_character_id), 1);
        assert_eq!(trust_locker::shared_strike_count(&extension_config, SHARED_SCOPE_B, visitor_character_id), 0);
        assert_eq!(
            trust_locker::shared_pricing_penalty_bps(&extension_config, SHARED_SCOPE_A, visitor_character_id),
            SHARED_PRICING_PENALTY_BPS,
        );
        assert_eq!(
            trust_locker::shared_pricing_penalty_bps(&extension_config, SHARED_SCOPE_B, visitor_character_id),
            0,
        );
        assert_eq!(
            trust_locker::quote_requested_points(
                &extension_config,
                storage_b_id,
                &visitor,
                LENS_TYPE_ID,
                10,
            ),
            30,
        );
        ts::return_shared(visitor);
        ts::return_shared(extension_config);
    };

    ts::end(ts);
}

#[test]
fun test_shared_penalties_can_be_disabled_per_locker() {
    let mut ts = ts::begin(governor());
    setup_nwn(&mut ts);
    let config_id = publish_config(&mut ts);
    let visitor_character_id = create_character_with_tribe(&mut ts, user_a(), CHARACTER_A_ITEM_ID, RIVAL_TRIBE);
    let owner_character_id = create_character(&mut ts, user_b(), CHARACTER_B_ITEM_ID);
    let (storage_a_id, _nwn_a_id) = create_storage_unit(&mut ts, owner_character_id, STORAGE_ITEM_ID + 50);
    let (storage_b_id, _nwn_b_id) = create_storage_unit(&mut ts, owner_character_id, STORAGE_ITEM_ID + 51);
    authorize_and_configure_locker_with_shared_network(
        &mut ts,
        storage_a_id,
        owner_character_id,
        config_id,
        MARKET_MODE_PERPETUAL,
        0,
        SHARED_SCOPE_A,
        true,
        vector[],
        vector[RIVAL_TRIBE],
    );
    authorize_and_configure_locker_with_shared_network(
        &mut ts,
        storage_b_id,
        owner_character_id,
        config_id,
        MARKET_MODE_PERPETUAL,
        0,
        SHARED_SCOPE_A,
        false,
        vector[],
        vector[RIVAL_TRIBE],
    );
    configure_shared_network_policy(
        &mut ts,
        storage_a_id,
        owner_character_id,
        config_id,
        SHARED_SCOPE_A,
        SHARED_PRICING_PENALTY_BPS,
        SHARED_MAX_PRICING_PENALTY_BPS,
        SHARED_LOCKOUT_THRESHOLD,
        SHARED_LOCKOUT_DURATION_MS,
        true,
    );
    ts::next_tx(&mut ts, admin());
    {
        let mut extension_config = ts::take_shared_by_id<ExtensionConfig>(&ts, config_id);
        trust_locker::set_shared_penalty_state_for_testing(
            &mut extension_config,
            SHARED_SCOPE_A,
            visitor_character_id,
            1,
            9,
            0,
            storage_a_id,
        );
        ts::return_shared(extension_config);
    };

    ts::next_tx(&mut ts, admin());
    {
        let extension_config = ts::take_shared_by_id<ExtensionConfig>(&ts, config_id);
        let visitor = ts::take_shared_by_id<Character>(&ts, visitor_character_id);
        assert_eq!(trust_locker::shared_strike_count(&extension_config, SHARED_SCOPE_A, visitor_character_id), 1);
        assert_eq!(
            trust_locker::shared_pricing_penalty_bps(&extension_config, SHARED_SCOPE_A, visitor_character_id),
            SHARED_PRICING_PENALTY_BPS,
        );
        assert_eq!(
            trust_locker::quote_requested_points(
                &extension_config,
                storage_a_id,
                &visitor,
                LENS_TYPE_ID,
                10,
            ),
            31,
        );
        assert_eq!(
            trust_locker::quote_requested_points(
                &extension_config,
                storage_b_id,
                &visitor,
                LENS_TYPE_ID,
                10,
            ),
            30,
        );
        ts::return_shared(visitor);
        ts::return_shared(extension_config);
    };

    ts::end(ts);
}

#[test]
fun test_procurement_market_routes_offered_items_to_owner_reserve() {
    let mut ts = ts::begin(governor());
    setup_nwn(&mut ts);
    let config_id = publish_config(&mut ts);
    let visitor_character_id = create_character(&mut ts, user_a(), CHARACTER_A_ITEM_ID);
    let owner_character_id = create_character(&mut ts, user_b(), CHARACTER_B_ITEM_ID);
    let (storage_id, nwn_id) = create_storage_unit(&mut ts, owner_character_id, STORAGE_ITEM_ID + 15);

    online_storage_unit(&mut ts, user_b(), owner_character_id, storage_id, nwn_id);
    mint_lens_to_storage_unit(&mut ts, storage_id, owner_character_id, user_b());
    mint_ammo<Character>(&mut ts, storage_id, visitor_character_id, user_a());
    authorize_and_configure_locker_with_relationships(
        &mut ts,
        storage_id,
        owner_character_id,
        config_id,
        MARKET_MODE_PROCUREMENT,
        0,
        vector[],
        vector[RIVAL_TRIBE],
    );
    seed_locker_open_inventory(&mut ts, storage_id, owner_character_id);

    let visitor_cap_id = character_owner_cap_id(&mut ts, visitor_character_id);
    let (locker_open_key, locker_owner_key) = {
        ts::next_tx(&mut ts, admin());
        let storage_unit = ts::take_shared_by_id<StorageUnit>(&ts, storage_id);
        let open_key = storage_unit.open_storage_key();
        let owner_key = storage_unit.owner_cap_id();
        ts::return_shared(storage_unit);
        (open_key, owner_key)
    };

    let trade_clock = clock::create_for_testing(ts.ctx());
    ts::next_tx(&mut ts, user_a());
    {
        let mut storage_unit = ts::take_shared_by_id<StorageUnit>(&ts, storage_id);
        let mut visitor = ts::take_shared_by_id<Character>(&ts, visitor_character_id);
        let (visitor_cap, visitor_receipt) = visitor.borrow_owner_cap<Character>(
            ts::most_recent_receiving_ticket<OwnerCap<Character>>(&visitor_character_id),
            ts.ctx(),
        );
        let mut extension_config = ts::take_shared_by_id<ExtensionConfig>(&ts, config_id);
        trust_locker::trade(
            &mut storage_unit,
            &visitor,
            &visitor_cap,
            &mut extension_config,
            &trade_clock,
            LENS_TYPE_ID,
            LENS_QUANTITY,
            AMMO_TYPE_ID,
            AMMO_QUANTITY,
            ts.ctx(),
        );
        visitor.return_owner_cap(visitor_cap, visitor_receipt);
        ts::return_shared(extension_config);
        ts::return_shared(visitor);
        ts::return_shared(storage_unit);
    };

    ts::next_tx(&mut ts, admin());
    {
        let storage_unit = ts::take_shared_by_id<StorageUnit>(&ts, storage_id);
        assert_eq!(
            storage_unit::item_quantity(&storage_unit, visitor_cap_id, LENS_TYPE_ID),
            LENS_QUANTITY,
        );
        assert!(!storage_unit::contains_item(&storage_unit, locker_open_key, AMMO_TYPE_ID));
        assert_eq!(
            storage_unit::item_quantity(&storage_unit, locker_owner_key, AMMO_TYPE_ID),
            AMMO_QUANTITY,
        );
        ts::return_shared(storage_unit);
    };

    trade_clock.destroy_for_testing();
    ts::end(ts);
}

#[test]
#[expected_failure(abort_code = trust_locker::EFriendlyRivalOverlap)]
fun test_set_policy_rejects_friendly_rival_overlap() {
    let mut ts = ts::begin(governor());
    setup_nwn(&mut ts);
    let config_id = publish_config(&mut ts);
    let owner_character_id = create_character(&mut ts, user_b(), CHARACTER_B_ITEM_ID);
    let (storage_id, _nwn_id) = create_storage_unit(&mut ts, owner_character_id, STORAGE_ITEM_ID + 12);

    ts::next_tx(&mut ts, user_b());
    {
        let storage_unit = ts::take_shared_by_id<StorageUnit>(&ts, storage_id);
        let mut owner_character = ts::take_shared_by_id<Character>(&ts, owner_character_id);
        let (storage_cap, receipt) = owner_character.borrow_owner_cap<StorageUnit>(
            ts::receiving_ticket_by_id<OwnerCap<StorageUnit>>(storage_unit.owner_cap_id()),
            ts.ctx(),
        );
        let mut extension_config = ts::take_shared_by_id<ExtensionConfig>(&ts, config_id);
        trust_locker::set_policy(
            &storage_unit,
            &storage_cap,
            &mut extension_config,
            vector[LENS_TYPE_ID, AMMO_TYPE_ID],
            vector[2, 1],
            vector[DEFAULT_TRIBE],
            vector[DEFAULT_TRIBE],
            FRIENDLY_MULTIPLIER_BPS,
            RIVAL_MULTIPLIER_BPS,
            MARKET_MODE_PERPETUAL,
            0,
            0,
            false,
            COOLDOWN_MS,
            true,
        );
        owner_character.return_owner_cap(storage_cap, receipt);
        ts::return_shared(extension_config);
        ts::return_shared(owner_character);
        ts::return_shared(storage_unit);
    };

    ts::end(ts);
}

#[test]
#[expected_failure(abort_code = trust_locker::EFuelFeeNotSupported)]
fun test_set_policy_rejects_nonzero_fuel_fee_until_supported() {
    let mut ts = ts::begin(governor());
    setup_nwn(&mut ts);
    let config_id = publish_config(&mut ts);
    let owner_character_id = create_character(&mut ts, user_b(), CHARACTER_B_ITEM_ID);
    let (storage_id, _nwn_id) = create_storage_unit(&mut ts, owner_character_id, STORAGE_ITEM_ID + 16);

    ts::next_tx(&mut ts, user_b());
    {
        let mut storage_unit = ts::take_shared_by_id<StorageUnit>(&ts, storage_id);
        let mut owner_character = ts::take_shared_by_id<Character>(&ts, owner_character_id);
        let (storage_cap, receipt) = owner_character.borrow_owner_cap<StorageUnit>(
            ts::receiving_ticket_by_id<OwnerCap<StorageUnit>>(storage_unit.owner_cap_id()),
            ts.ctx(),
        );
        storage_unit.authorize_extension<config::TrustLockerAuth>(&storage_cap);
        let mut extension_config = ts::take_shared_by_id<ExtensionConfig>(&ts, config_id);
        trust_locker::set_policy(
            &storage_unit,
            &storage_cap,
            &mut extension_config,
            vector[LENS_TYPE_ID, AMMO_TYPE_ID],
            vector[2, 1],
            vector[],
            vector[RIVAL_TRIBE],
            FRIENDLY_MULTIPLIER_BPS,
            RIVAL_MULTIPLIER_BPS,
            MARKET_MODE_PERPETUAL,
            1,
            0,
            false,
            COOLDOWN_MS,
            true,
        );
        owner_character.return_owner_cap(storage_cap, receipt);
        ts::return_shared(extension_config);
        ts::return_shared(owner_character);
        ts::return_shared(storage_unit);
    };

    ts::end(ts);
}

#[test]
#[expected_failure(abort_code = trust_locker::ERequestedItemNotAccepted)]
fun test_trade_rejects_unaccepted_requested_type() {
    let mut ts = ts::begin(governor());
    setup_nwn(&mut ts);
    let config_id = publish_config(&mut ts);
    let visitor_character_id = create_character(&mut ts, user_a(), CHARACTER_A_ITEM_ID);
    let owner_character_id = create_character(&mut ts, user_b(), CHARACTER_B_ITEM_ID);
    let (storage_id, _nwn_id) = create_storage_unit(&mut ts, owner_character_id, STORAGE_ITEM_ID + 13);

    authorize_and_configure_locker(&mut ts, storage_id, owner_character_id, config_id);

    let trade_clock = clock::create_for_testing(ts.ctx());
    ts::next_tx(&mut ts, user_a());
    {
        let mut storage_unit = ts::take_shared_by_id<StorageUnit>(&ts, storage_id);
        let mut visitor = ts::take_shared_by_id<Character>(&ts, visitor_character_id);
        let (visitor_cap, visitor_receipt) = visitor.borrow_owner_cap<Character>(
            ts::most_recent_receiving_ticket<OwnerCap<Character>>(&visitor_character_id),
            ts.ctx(),
        );
        let mut extension_config = ts::take_shared_by_id<ExtensionConfig>(&ts, config_id);
        trust_locker::trade(
            &mut storage_unit,
            &visitor,
            &visitor_cap,
            &mut extension_config,
            &trade_clock,
            UNKNOWN_TYPE_ID,
            1,
            AMMO_TYPE_ID,
            1,
            ts.ctx(),
        );
        visitor.return_owner_cap(visitor_cap, visitor_receipt);
        ts::return_shared(extension_config);
        ts::return_shared(visitor);
        ts::return_shared(storage_unit);
    };

    trade_clock.destroy_for_testing();
    ts::end(ts);
}

#[test]
#[expected_failure(abort_code = trust_locker::EOfferedItemNotAccepted)]
fun test_trade_rejects_unaccepted_offered_type() {
    let mut ts = ts::begin(governor());
    setup_nwn(&mut ts);
    let config_id = publish_config(&mut ts);
    let visitor_character_id = create_character(&mut ts, user_a(), CHARACTER_A_ITEM_ID);
    let owner_character_id = create_character(&mut ts, user_b(), CHARACTER_B_ITEM_ID);
    let (storage_id, _nwn_id) = create_storage_unit(&mut ts, owner_character_id, STORAGE_ITEM_ID + 14);

    authorize_and_configure_locker(&mut ts, storage_id, owner_character_id, config_id);

    let trade_clock = clock::create_for_testing(ts.ctx());
    ts::next_tx(&mut ts, user_a());
    {
        let mut storage_unit = ts::take_shared_by_id<StorageUnit>(&ts, storage_id);
        let mut visitor = ts::take_shared_by_id<Character>(&ts, visitor_character_id);
        let (visitor_cap, visitor_receipt) = visitor.borrow_owner_cap<Character>(
            ts::most_recent_receiving_ticket<OwnerCap<Character>>(&visitor_character_id),
            ts.ctx(),
        );
        let mut extension_config = ts::take_shared_by_id<ExtensionConfig>(&ts, config_id);
        trust_locker::trade(
            &mut storage_unit,
            &visitor,
            &visitor_cap,
            &mut extension_config,
            &trade_clock,
            LENS_TYPE_ID,
            1,
            UNKNOWN_TYPE_ID,
            1,
            ts.ctx(),
        );
        visitor.return_owner_cap(visitor_cap, visitor_receipt);
        ts::return_shared(extension_config);
        ts::return_shared(visitor);
        ts::return_shared(storage_unit);
    };

    trade_clock.destroy_for_testing();
    ts::end(ts);
}

#[test]
#[expected_failure(abort_code = trust_locker::ESameItemTradeDisabled)]
fun test_trade_rejects_same_item_on_chain() {
    let mut ts = ts::begin(governor());
    setup_nwn(&mut ts);
    let config_id = publish_config(&mut ts);
    let visitor_character_id = create_character(&mut ts, user_a(), CHARACTER_A_ITEM_ID);
    let owner_character_id = create_character(&mut ts, user_b(), CHARACTER_B_ITEM_ID);
    let (storage_id, nwn_id) = create_storage_unit(&mut ts, owner_character_id, STORAGE_ITEM_ID + 17);

    online_storage_unit(&mut ts, user_b(), owner_character_id, storage_id, nwn_id);
    mint_lens_to_storage_unit(&mut ts, storage_id, owner_character_id, user_b());
    mint_ammo<Character>(&mut ts, storage_id, visitor_character_id, user_a());
    authorize_and_configure_locker(&mut ts, storage_id, owner_character_id, config_id);
    seed_locker_open_inventory(&mut ts, storage_id, owner_character_id);

    let trade_clock = clock::create_for_testing(ts.ctx());
    ts::next_tx(&mut ts, user_a());
    {
        let mut storage_unit = ts::take_shared_by_id<StorageUnit>(&ts, storage_id);
        let mut visitor = ts::take_shared_by_id<Character>(&ts, visitor_character_id);
        let (visitor_cap, visitor_receipt) = visitor.borrow_owner_cap<Character>(
            ts::most_recent_receiving_ticket<OwnerCap<Character>>(&visitor_character_id),
            ts.ctx(),
        );
        let mut extension_config = ts::take_shared_by_id<ExtensionConfig>(&ts, config_id);
        trust_locker::trade(
            &mut storage_unit,
            &visitor,
            &visitor_cap,
            &mut extension_config,
            &trade_clock,
            LENS_TYPE_ID,
            1,
            LENS_TYPE_ID,
            1,
            ts.ctx(),
        );
        visitor.return_owner_cap(visitor_cap, visitor_receipt);
        ts::return_shared(extension_config);
        ts::return_shared(visitor);
        ts::return_shared(storage_unit);
    };

    trade_clock.destroy_for_testing();
    ts::end(ts);
}

#[test]
#[expected_failure(abort_code = trust_locker::EProcurementModeRequired)]
fun test_owner_cannot_claim_receipts_in_perpetual_mode() {
    let mut ts = ts::begin(governor());
    setup_nwn(&mut ts);
    let config_id = publish_config(&mut ts);
    let owner_character_id = create_character(&mut ts, user_b(), CHARACTER_B_ITEM_ID);
    let (storage_id, nwn_id) = create_storage_unit(&mut ts, owner_character_id, STORAGE_ITEM_ID + 18);

    online_storage_unit(&mut ts, user_b(), owner_character_id, storage_id, nwn_id);
    mint_lens_to_storage_unit(&mut ts, storage_id, owner_character_id, user_b());
    authorize_and_configure_locker(&mut ts, storage_id, owner_character_id, config_id);

    ts::next_tx(&mut ts, user_b());
    {
        let mut storage_unit = ts::take_shared_by_id<StorageUnit>(&ts, storage_id);
        let mut owner_character = ts::take_shared_by_id<Character>(&ts, owner_character_id);
        let (storage_cap, receipt) = owner_character.borrow_owner_cap<StorageUnit>(
            ts::receiving_ticket_by_id<OwnerCap<StorageUnit>>(storage_unit.owner_cap_id()),
            ts.ctx(),
        );
        let extension_config = ts::take_shared_by_id<ExtensionConfig>(&ts, config_id);
        trust_locker::claim_to_owned_inventory(
            &mut storage_unit,
            &owner_character,
            &storage_cap,
            &extension_config,
            LENS_TYPE_ID,
            1,
            ts.ctx(),
        );
        ts::return_shared(extension_config);
        owner_character.return_owner_cap(storage_cap, receipt);
        ts::return_shared(owner_character);
        ts::return_shared(storage_unit);
    };

    ts::end(ts);
}

#[test]
#[expected_failure(abort_code = inventory::EItemDoesNotExist)]
fun test_owner_cannot_restock_missing_procurement_receipts() {
    let mut ts = ts::begin(governor());
    setup_nwn(&mut ts);
    let config_id = publish_config(&mut ts);
    let owner_character_id = create_character(&mut ts, user_b(), CHARACTER_B_ITEM_ID);
    let (storage_id, nwn_id) = create_storage_unit(&mut ts, owner_character_id, STORAGE_ITEM_ID + 19);

    online_storage_unit(&mut ts, user_b(), owner_character_id, storage_id, nwn_id);
    mint_lens_to_storage_unit(&mut ts, storage_id, owner_character_id, user_b());
    authorize_and_configure_locker_with_relationships(
        &mut ts,
        storage_id,
        owner_character_id,
        config_id,
        MARKET_MODE_PROCUREMENT,
        0,
        vector[],
        vector[RIVAL_TRIBE],
    );

    ts::next_tx(&mut ts, user_b());
    {
        let mut storage_unit = ts::take_shared_by_id<StorageUnit>(&ts, storage_id);
        let mut owner_character = ts::take_shared_by_id<Character>(&ts, owner_character_id);
        let (storage_cap, receipt) = owner_character.borrow_owner_cap<StorageUnit>(
            ts::receiving_ticket_by_id<OwnerCap<StorageUnit>>(storage_unit.owner_cap_id()),
            ts.ctx(),
        );
        let extension_config = ts::take_shared_by_id<ExtensionConfig>(&ts, config_id);
        trust_locker::restock_from_owner_reserve(
            &mut storage_unit,
            &owner_character,
            &storage_cap,
            &extension_config,
            AMMO_TYPE_ID,
            1,
            ts.ctx(),
        );
        ts::return_shared(extension_config);
        owner_character.return_owner_cap(storage_cap, receipt);
        ts::return_shared(owner_character);
        ts::return_shared(storage_unit);
    };

    ts::end(ts);
}

#[test]
#[expected_failure(abort_code = trust_locker::ELockerPolicyFrozen)]
fun test_freeze_blocks_policy_edits() {
    let mut ts = ts::begin(governor());
    setup_nwn(&mut ts);
    let config_id = publish_config(&mut ts);
    let owner_character_id = create_character(&mut ts, user_b(), CHARACTER_B_ITEM_ID);
    let (storage_id, _nwn_id) = create_storage_unit(&mut ts, owner_character_id, STORAGE_ITEM_ID + 2);

    authorize_and_configure_locker(&mut ts, storage_id, owner_character_id, config_id);

    ts::next_tx(&mut ts, user_b());
    {
        let mut storage_unit = ts::take_shared_by_id<StorageUnit>(&ts, storage_id);
        let mut owner_character = ts::take_shared_by_id<Character>(&ts, owner_character_id);
        let (storage_cap, receipt) = owner_character.borrow_owner_cap<StorageUnit>(
            ts::receiving_ticket_by_id<OwnerCap<StorageUnit>>(storage_unit.owner_cap_id()),
            ts.ctx(),
        );
        trust_locker::freeze_locker(&mut storage_unit, &storage_cap);
        owner_character.return_owner_cap(storage_cap, receipt);
        ts::return_shared(owner_character);
        ts::return_shared(storage_unit);
    };

    ts::next_tx(&mut ts, user_b());
    {
        let storage_unit = ts::take_shared_by_id<StorageUnit>(&ts, storage_id);
        let mut owner_character = ts::take_shared_by_id<Character>(&ts, owner_character_id);
        let (storage_cap, receipt) = owner_character.borrow_owner_cap<StorageUnit>(
            ts::receiving_ticket_by_id<OwnerCap<StorageUnit>>(storage_unit.owner_cap_id()),
            ts.ctx(),
        );
        let mut extension_config = ts::take_shared_by_id<ExtensionConfig>(&ts, config_id);
        trust_locker::set_cooldown(
            &storage_unit,
            &storage_cap,
            &mut extension_config,
            COOLDOWN_MS * 2,
        );
        owner_character.return_owner_cap(storage_cap, receipt);
        ts::return_shared(extension_config);
        ts::return_shared(owner_character);
        ts::return_shared(storage_unit);
    };

    ts::end(ts);
}
