module trust_locker_extension::config;

use sui::dynamic_field as df;

public struct ExtensionConfig has key {
    id: UID,
}

public struct AdminCap has key, store {
    id: UID,
}

public struct TrustLockerAuth has drop {}

fun init(ctx: &mut TxContext) {
    let admin_cap = AdminCap { id: object::new(ctx) };
    transfer::transfer(admin_cap, ctx.sender());

    let config = ExtensionConfig { id: object::new(ctx) };
    transfer::share_object(config);
}

public fun admin_cap_id(admin_cap: &AdminCap): ID {
    object::id(admin_cap)
}

public(package) fun has_value<K: copy + drop + store>(config: &ExtensionConfig, key: K): bool {
    df::exists_(&config.id, key)
}

public(package) fun borrow_value<K: copy + drop + store, V: store>(
    config: &ExtensionConfig,
    key: K,
): &V {
    df::borrow(&config.id, key)
}

public(package) fun borrow_value_mut<K: copy + drop + store, V: store>(
    config: &mut ExtensionConfig,
    key: K,
): &mut V {
    df::borrow_mut(&mut config.id, key)
}

public(package) fun add_value<K: copy + drop + store, V: store>(
    config: &mut ExtensionConfig,
    key: K,
    value: V,
) {
    df::add(&mut config.id, key, value);
}

public(package) fun upsert_value<K: copy + drop + store, V: store + drop>(
    config: &mut ExtensionConfig,
    key: K,
    value: V,
) {
    if (df::exists_(&config.id, copy key)) {
        let _old: V = df::remove(&mut config.id, copy key);
    };
    df::add(&mut config.id, key, value);
}

public(package) fun remove_value<K: copy + drop + store, V: store>(
    config: &mut ExtensionConfig,
    key: K,
): V {
    df::remove(&mut config.id, key)
}

public(package) fun x_auth(): TrustLockerAuth {
    TrustLockerAuth {}
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext): (AdminCap, ExtensionConfig) {
    (
        AdminCap { id: object::new(ctx) },
        ExtensionConfig { id: object::new(ctx) },
    )
}

#[test_only]
public fun share_for_testing(config: ExtensionConfig) {
    transfer::share_object(config);
}
