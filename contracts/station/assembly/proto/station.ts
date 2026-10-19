import { Writer, Reader } from "as-proto";

export namespace station {
  export class config_object {
    static encode(message: config_object, writer: Writer): void {
      const unique_name_owner = message.owner;
      if (unique_name_owner !== null) {
        writer.uint32(10);
        writer.bytes(unique_name_owner);
      }

      if (message.paused != false) {
        writer.uint32(16);
        writer.bool(message.paused);
      }

      if (message.koin_amount != 0) {
        writer.uint32(24);
        writer.uint64(message.koin_amount);
      }

      if (message.refill_bp != 0) {
        writer.uint32(32);
        writer.uint32(message.refill_bp);
      }

      if (message.admin_min != 0) {
        writer.uint32(40);
        writer.uint64(message.admin_min);
      }

      if (message.hard_max != 0) {
        writer.uint32(48);
        writer.uint64(message.hard_max);
      }

      if (message.per_min != 0) {
        writer.uint32(56);
        writer.uint32(message.per_min);
      }

      if (message.cooldown_ms != 0) {
        writer.uint32(64);
        writer.uint64(message.cooldown_ms);
      }

      if (message.day_actions != 0) {
        writer.uint32(72);
        writer.uint32(message.day_actions);
      }

      if (message.day_mana != 0) {
        writer.uint32(80);
        writer.uint64(message.day_mana);
      }

      if (message.new_actions != 0) {
        writer.uint32(88);
        writer.uint32(message.new_actions);
      }

      if (message.new_mana != 0) {
        writer.uint32(96);
        writer.uint64(message.new_mana);
      }

      if (message.new_pct != 0) {
        writer.uint32(104);
        writer.uint32(message.new_pct);
      }

      if (message.max_ops != 0) {
        writer.uint32(112);
        writer.uint32(message.max_ops);
      }

      if (message.big_max != 0) {
        writer.uint32(128);
        writer.uint64(message.big_max);
      }

      if (message.big_cooldown_ms != 0) {
        writer.uint32(136);
        writer.uint64(message.big_cooldown_ms);
      }

      if (message.big_week_cap != 0) {
        writer.uint32(144);
        writer.uint64(message.big_week_cap);
      }

      if (message.big_max_debt != 0) {
        writer.uint32(152);
        writer.uint64(message.big_max_debt);
      }

      if (message.big_ticket_ms != 0) {
        writer.uint32(160);
        writer.uint64(message.big_ticket_ms);
      }

      if (message.max_allowances != 0) {
        writer.uint32(168);
        writer.uint32(message.max_allowances);
      }

      if (message.max_days != 0) {
        writer.uint32(176);
        writer.uint64(message.max_days);
      }

      const unique_name_treasury = message.treasury;
      if (unique_name_treasury !== null) {
        writer.uint32(186);
        writer.bytes(unique_name_treasury);
      }

      if (message.buffer_bp != 0) {
        writer.uint32(192);
        writer.uint32(message.buffer_bp);
      }

      if (message.alert_mana != 0) {
        writer.uint32(200);
        writer.uint64(message.alert_mana);
      }
    }

    static decode(reader: Reader, length: i32): config_object {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new config_object();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.owner = reader.bytes();
            break;

          case 2:
            message.paused = reader.bool();
            break;

          case 3:
            message.koin_amount = reader.uint64();
            break;

          case 4:
            message.refill_bp = reader.uint32();
            break;

          case 5:
            message.admin_min = reader.uint64();
            break;

          case 6:
            message.hard_max = reader.uint64();
            break;

          case 7:
            message.per_min = reader.uint32();
            break;

          case 8:
            message.cooldown_ms = reader.uint64();
            break;

          case 9:
            message.day_actions = reader.uint32();
            break;

          case 10:
            message.day_mana = reader.uint64();
            break;

          case 11:
            message.new_actions = reader.uint32();
            break;

          case 12:
            message.new_mana = reader.uint64();
            break;

          case 13:
            message.new_pct = reader.uint32();
            break;

          case 14:
            message.max_ops = reader.uint32();
            break;

          case 16:
            message.big_max = reader.uint64();
            break;

          case 17:
            message.big_cooldown_ms = reader.uint64();
            break;

          case 18:
            message.big_week_cap = reader.uint64();
            break;

          case 19:
            message.big_max_debt = reader.uint64();
            break;

          case 20:
            message.big_ticket_ms = reader.uint64();
            break;

          case 21:
            message.max_allowances = reader.uint32();
            break;

          case 22:
            message.max_days = reader.uint64();
            break;

          case 23:
            message.treasury = reader.bytes();
            break;

          case 24:
            message.buffer_bp = reader.uint32();
            break;

          case 25:
            message.alert_mana = reader.uint64();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    owner: Uint8Array | null;
    paused: bool;
    koin_amount: u64;
    refill_bp: u32;
    admin_min: u64;
    hard_max: u64;
    per_min: u32;
    cooldown_ms: u64;
    day_actions: u32;
    day_mana: u64;
    new_actions: u32;
    new_mana: u64;
    new_pct: u32;
    max_ops: u32;
    big_max: u64;
    big_cooldown_ms: u64;
    big_week_cap: u64;
    big_max_debt: u64;
    big_ticket_ms: u64;
    max_allowances: u32;
    max_days: u64;
    treasury: Uint8Array | null;
    buffer_bp: u32;
    alert_mana: u64;

    constructor(
      owner: Uint8Array | null = null,
      paused: bool = false,
      koin_amount: u64 = 0,
      refill_bp: u32 = 0,
      admin_min: u64 = 0,
      hard_max: u64 = 0,
      per_min: u32 = 0,
      cooldown_ms: u64 = 0,
      day_actions: u32 = 0,
      day_mana: u64 = 0,
      new_actions: u32 = 0,
      new_mana: u64 = 0,
      new_pct: u32 = 0,
      max_ops: u32 = 0,
      big_max: u64 = 0,
      big_cooldown_ms: u64 = 0,
      big_week_cap: u64 = 0,
      big_max_debt: u64 = 0,
      big_ticket_ms: u64 = 0,
      max_allowances: u32 = 0,
      max_days: u64 = 0,
      treasury: Uint8Array | null = null,
      buffer_bp: u32 = 0,
      alert_mana: u64 = 0
    ) {
      this.owner = owner;
      this.paused = paused;
      this.koin_amount = koin_amount;
      this.refill_bp = refill_bp;
      this.admin_min = admin_min;
      this.hard_max = hard_max;
      this.per_min = per_min;
      this.cooldown_ms = cooldown_ms;
      this.day_actions = day_actions;
      this.day_mana = day_mana;
      this.new_actions = new_actions;
      this.new_mana = new_mana;
      this.new_pct = new_pct;
      this.max_ops = max_ops;
      this.big_max = big_max;
      this.big_cooldown_ms = big_cooldown_ms;
      this.big_week_cap = big_week_cap;
      this.big_max_debt = big_max_debt;
      this.big_ticket_ms = big_ticket_ms;
      this.max_allowances = max_allowances;
      this.max_days = max_days;
      this.treasury = treasury;
      this.buffer_bp = buffer_bp;
      this.alert_mana = alert_mana;
    }
  }

  @unmanaged
  export class app_object {
    static encode(message: app_object, writer: Writer): void {
      if (message.reserved_mana != 0) {
        writer.uint32(8);
        writer.uint64(message.reserved_mana);
      }

      if (message.active != false) {
        writer.uint32(16);
        writer.bool(message.active);
      }

      if (message.boost_mana != 0) {
        writer.uint32(24);
        writer.uint64(message.boost_mana);
      }

      if (message.boost_until != 0) {
        writer.uint32(32);
        writer.uint64(message.boost_until);
      }
    }

    static decode(reader: Reader, length: i32): app_object {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new app_object();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.reserved_mana = reader.uint64();
            break;

          case 2:
            message.active = reader.bool();
            break;

          case 3:
            message.boost_mana = reader.uint64();
            break;

          case 4:
            message.boost_until = reader.uint64();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    reserved_mana: u64;
    active: bool;
    boost_mana: u64;
    boost_until: u64;

    constructor(
      reserved_mana: u64 = 0,
      active: bool = false,
      boost_mana: u64 = 0,
      boost_until: u64 = 0
    ) {
      this.reserved_mana = reserved_mana;
      this.active = active;
      this.boost_mana = boost_mana;
      this.boost_until = boost_until;
    }
  }

  @unmanaged
  export class exempt_object {
    static encode(message: exempt_object, writer: Writer): void {
      if (message.app != 0) {
        writer.uint32(8);
        writer.uint32(message.app);
      }

      if (message.strict != false) {
        writer.uint32(16);
        writer.bool(message.strict);
      }
    }

    static decode(reader: Reader, length: i32): exempt_object {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new exempt_object();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.app = reader.uint32();
            break;

          case 2:
            message.strict = reader.bool();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    app: u32;
    strict: bool;

    constructor(app: u32 = 0, strict: bool = false) {
      this.app = app;
      this.strict = strict;
    }
  }

  export class exempt_event {
    static encode(message: exempt_event, writer: Writer): void {
      const unique_name_contract_id = message.contract_id;
      if (unique_name_contract_id !== null) {
        writer.uint32(10);
        writer.bytes(unique_name_contract_id);
      }

      const unique_name_value = message.value;
      if (unique_name_value !== null) {
        writer.uint32(18);
        writer.fork();
        exempt_object.encode(unique_name_value, writer);
        writer.ldelim();
      }

      if (message.removed != false) {
        writer.uint32(24);
        writer.bool(message.removed);
      }
    }

    static decode(reader: Reader, length: i32): exempt_event {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new exempt_event();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.contract_id = reader.bytes();
            break;

          case 2:
            message.value = exempt_object.decode(reader, reader.uint32());
            break;

          case 3:
            message.removed = reader.bool();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    contract_id: Uint8Array | null;
    value: exempt_object | null;
    removed: bool;

    constructor(
      contract_id: Uint8Array | null = null,
      value: exempt_object | null = null,
      removed: bool = false
    ) {
      this.contract_id = contract_id;
      this.value = value;
      this.removed = removed;
    }
  }

  @unmanaged
  export class entry_object {
    static encode(message: entry_object, writer: Writer): void {
      if (message.app != 0) {
        writer.uint32(8);
        writer.uint32(message.app);
      }

      if (message.cap != 0) {
        writer.uint32(16);
        writer.uint64(message.cap);
      }

      if (message.max_args != 0) {
        writer.uint32(24);
        writer.uint32(message.max_args);
      }
    }

    static decode(reader: Reader, length: i32): entry_object {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new entry_object();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.app = reader.uint32();
            break;

          case 2:
            message.cap = reader.uint64();
            break;

          case 3:
            message.max_args = reader.uint32();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    app: u32;
    cap: u64;
    max_args: u32;

    constructor(app: u32 = 0, cap: u64 = 0, max_args: u32 = 0) {
      this.app = app;
      this.cap = cap;
      this.max_args = max_args;
    }
  }

  export class window_object {
    static encode(message: window_object, writer: Writer): void {
      if (message.base != 0) {
        writer.uint32(8);
        writer.uint64(message.base);
      }

      const unique_name_n = message.n;
      if (unique_name_n.length !== 0) {
        for (let i = 0; i < unique_name_n.length; ++i) {
          writer.uint32(16);
          writer.uint32(unique_name_n[i]);
        }
      }

      const unique_name_mana = message.mana;
      if (unique_name_mana.length !== 0) {
        for (let i = 0; i < unique_name_mana.length; ++i) {
          writer.uint32(24);
          writer.uint64(unique_name_mana[i]);
        }
      }

      const unique_name_new_mana = message.new_mana;
      if (unique_name_new_mana.length !== 0) {
        for (let i = 0; i < unique_name_new_mana.length; ++i) {
          writer.uint32(32);
          writer.uint64(unique_name_new_mana[i]);
        }
      }
    }

    static decode(reader: Reader, length: i32): window_object {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new window_object();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.base = reader.uint64();
            break;

          case 2:
            message.n.push(reader.uint32());
            break;

          case 3:
            message.mana.push(reader.uint64());
            break;

          case 4:
            message.new_mana.push(reader.uint64());
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    base: u64;
    n: Array<u32>;
    mana: Array<u64>;
    new_mana: Array<u64>;

    constructor(
      base: u64 = 0,
      n: Array<u32> = [],
      mana: Array<u64> = [],
      new_mana: Array<u64> = []
    ) {
      this.base = base;
      this.n = n;
      this.mana = mana;
      this.new_mana = new_mana;
    }
  }

  export class user_object {
    static encode(message: user_object, writer: Writer): void {
      if (message.first_seen != 0) {
        writer.uint32(8);
        writer.uint64(message.first_seen);
      }

      if (message.last_block != 0) {
        writer.uint32(16);
        writer.uint64(message.last_block);
      }

      if (message.minute != 0) {
        writer.uint32(24);
        writer.uint64(message.minute);
      }

      if (message.n_min != 0) {
        writer.uint32(32);
        writer.uint32(message.n_min);
      }

      if (message.cooldown_until != 0) {
        writer.uint32(40);
        writer.uint64(message.cooldown_until);
      }

      const unique_name_day = message.day;
      if (unique_name_day !== null) {
        writer.uint32(50);
        writer.fork();
        window_object.encode(unique_name_day, writer);
        writer.ldelim();
      }
    }

    static decode(reader: Reader, length: i32): user_object {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new user_object();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.first_seen = reader.uint64();
            break;

          case 2:
            message.last_block = reader.uint64();
            break;

          case 3:
            message.minute = reader.uint64();
            break;

          case 4:
            message.n_min = reader.uint32();
            break;

          case 5:
            message.cooldown_until = reader.uint64();
            break;

          case 6:
            message.day = window_object.decode(reader, reader.uint32());
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    first_seen: u64;
    last_block: u64;
    minute: u64;
    n_min: u32;
    cooldown_until: u64;
    day: window_object | null;

    constructor(
      first_seen: u64 = 0,
      last_block: u64 = 0,
      minute: u64 = 0,
      n_min: u32 = 0,
      cooldown_until: u64 = 0,
      day: window_object | null = null
    ) {
      this.first_seen = first_seen;
      this.last_block = last_block;
      this.minute = minute;
      this.n_min = n_min;
      this.cooldown_until = cooldown_until;
      this.day = day;
    }
  }

  @unmanaged
  export class price_object {
    static encode(message: price_object, writer: Writer): void {
      if (message.active != false) {
        writer.uint32(8);
        writer.bool(message.active);
      }

      if (message.max_per_purchase != 0) {
        writer.uint32(40);
        writer.uint64(message.max_per_purchase);
      }

      if (message.price_1d != 0) {
        writer.uint32(48);
        writer.uint64(message.price_1d);
      }

      if (message.price_7d != 0) {
        writer.uint32(56);
        writer.uint64(message.price_7d);
      }

      if (message.price_30d != 0) {
        writer.uint32(64);
        writer.uint64(message.price_30d);
      }

      if (message.big_per_1000 != 0) {
        writer.uint32(72);
        writer.uint64(message.big_per_1000);
      }

      if (message.big_min_mana != 0) {
        writer.uint32(80);
        writer.uint64(message.big_min_mana);
      }
    }

    static decode(reader: Reader, length: i32): price_object {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new price_object();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.active = reader.bool();
            break;

          case 5:
            message.max_per_purchase = reader.uint64();
            break;

          case 6:
            message.price_1d = reader.uint64();
            break;

          case 7:
            message.price_7d = reader.uint64();
            break;

          case 8:
            message.price_30d = reader.uint64();
            break;

          case 9:
            message.big_per_1000 = reader.uint64();
            break;

          case 10:
            message.big_min_mana = reader.uint64();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    active: bool;
    max_per_purchase: u64;
    price_1d: u64;
    price_7d: u64;
    price_30d: u64;
    big_per_1000: u64;
    big_min_mana: u64;

    constructor(
      active: bool = false,
      max_per_purchase: u64 = 0,
      price_1d: u64 = 0,
      price_7d: u64 = 0,
      price_30d: u64 = 0,
      big_per_1000: u64 = 0,
      big_min_mana: u64 = 0
    ) {
      this.active = active;
      this.max_per_purchase = max_per_purchase;
      this.price_1d = price_1d;
      this.price_7d = price_7d;
      this.price_30d = price_30d;
      this.big_per_1000 = big_per_1000;
      this.big_min_mana = big_min_mana;
    }
  }

  export class allowance_object {
    static encode(message: allowance_object, writer: Writer): void {
      if (message.id != 0) {
        writer.uint32(8);
        writer.uint32(message.id);
      }

      const unique_name_buyer = message.buyer;
      if (unique_name_buyer !== null) {
        writer.uint32(18);
        writer.bytes(unique_name_buyer);
      }

      if (message.kind != 0) {
        writer.uint32(24);
        writer.uint32(message.kind);
      }

      const unique_name_target = message.target;
      if (unique_name_target !== null) {
        writer.uint32(34);
        writer.bytes(unique_name_target);
      }

      if (message.mana_per_day != 0) {
        writer.uint32(40);
        writer.uint64(message.mana_per_day);
      }

      if (message.expiry != 0) {
        writer.uint32(48);
        writer.uint64(message.expiry);
      }

      const unique_name_day = message.day;
      if (unique_name_day !== null) {
        writer.uint32(58);
        writer.fork();
        window_object.encode(unique_name_day, writer);
        writer.ldelim();
      }

      const unique_name_token = message.token;
      if (unique_name_token !== null) {
        writer.uint32(66);
        writer.bytes(unique_name_token);
      }

      if (message.term_days != 0) {
        writer.uint32(72);
        writer.uint64(message.term_days);
      }

      if (message.unit_price != 0) {
        writer.uint32(80);
        writer.uint64(message.unit_price);
      }

      if (message.paid != 0) {
        writer.uint32(88);
        writer.uint64(message.paid);
      }

      if (message.term_start != 0) {
        writer.uint32(96);
        writer.uint64(message.term_start);
      }

      if (message.total_paid != 0) {
        writer.uint32(104);
        writer.uint64(message.total_paid);
      }

      const unique_name_purchase_ids = message.purchase_ids;
      if (unique_name_purchase_ids.length !== 0) {
        for (let i = 0; i < unique_name_purchase_ids.length; ++i) {
          writer.uint32(112);
          writer.uint32(unique_name_purchase_ids[i]);
        }
      }
    }

    static decode(reader: Reader, length: i32): allowance_object {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new allowance_object();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.id = reader.uint32();
            break;

          case 2:
            message.buyer = reader.bytes();
            break;

          case 3:
            message.kind = reader.uint32();
            break;

          case 4:
            message.target = reader.bytes();
            break;

          case 5:
            message.mana_per_day = reader.uint64();
            break;

          case 6:
            message.expiry = reader.uint64();
            break;

          case 7:
            message.day = window_object.decode(reader, reader.uint32());
            break;

          case 8:
            message.token = reader.bytes();
            break;

          case 9:
            message.term_days = reader.uint64();
            break;

          case 10:
            message.unit_price = reader.uint64();
            break;

          case 11:
            message.paid = reader.uint64();
            break;

          case 12:
            message.term_start = reader.uint64();
            break;

          case 13:
            message.total_paid = reader.uint64();
            break;

          case 14:
            message.purchase_ids.push(reader.uint32());
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    id: u32;
    buyer: Uint8Array | null;
    kind: u32;
    target: Uint8Array | null;
    mana_per_day: u64;
    expiry: u64;
    day: window_object | null;
    token: Uint8Array | null;
    term_days: u64;
    unit_price: u64;
    paid: u64;
    term_start: u64;
    total_paid: u64;
    purchase_ids: Array<u32>;

    constructor(
      id: u32 = 0,
      buyer: Uint8Array | null = null,
      kind: u32 = 0,
      target: Uint8Array | null = null,
      mana_per_day: u64 = 0,
      expiry: u64 = 0,
      day: window_object | null = null,
      token: Uint8Array | null = null,
      term_days: u64 = 0,
      unit_price: u64 = 0,
      paid: u64 = 0,
      term_start: u64 = 0,
      total_paid: u64 = 0,
      purchase_ids: Array<u32> = []
    ) {
      this.id = id;
      this.buyer = buyer;
      this.kind = kind;
      this.target = target;
      this.mana_per_day = mana_per_day;
      this.expiry = expiry;
      this.day = day;
      this.token = token;
      this.term_days = term_days;
      this.unit_price = unit_price;
      this.paid = paid;
      this.term_start = term_start;
      this.total_paid = total_paid;
      this.purchase_ids = purchase_ids;
    }
  }

  export class ticket_object {
    static encode(message: ticket_object, writer: Writer): void {
      const unique_name_buyer = message.buyer;
      if (unique_name_buyer !== null) {
        writer.uint32(10);
        writer.bytes(unique_name_buyer);
      }

      if (message.mana != 0) {
        writer.uint32(16);
        writer.uint64(message.mana);
      }

      if (message.remaining != 0) {
        writer.uint32(24);
        writer.uint64(message.remaining);
      }

      if (message.expiry != 0) {
        writer.uint32(32);
        writer.uint64(message.expiry);
      }

      if (message.allow_upload != false) {
        writer.uint32(40);
        writer.bool(message.allow_upload);
      }

      const unique_name_token = message.token;
      if (unique_name_token !== null) {
        writer.uint32(50);
        writer.bytes(unique_name_token);
      }

      if (message.paid != 0) {
        writer.uint32(56);
        writer.uint64(message.paid);
      }

      if (message.purchase_id != 0) {
        writer.uint32(64);
        writer.uint32(message.purchase_id);
      }
    }

    static decode(reader: Reader, length: i32): ticket_object {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new ticket_object();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.buyer = reader.bytes();
            break;

          case 2:
            message.mana = reader.uint64();
            break;

          case 3:
            message.remaining = reader.uint64();
            break;

          case 4:
            message.expiry = reader.uint64();
            break;

          case 5:
            message.allow_upload = reader.bool();
            break;

          case 6:
            message.token = reader.bytes();
            break;

          case 7:
            message.paid = reader.uint64();
            break;

          case 8:
            message.purchase_id = reader.uint32();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    buyer: Uint8Array | null;
    mana: u64;
    remaining: u64;
    expiry: u64;
    allow_upload: bool;
    token: Uint8Array | null;
    paid: u64;
    purchase_id: u32;

    constructor(
      buyer: Uint8Array | null = null,
      mana: u64 = 0,
      remaining: u64 = 0,
      expiry: u64 = 0,
      allow_upload: bool = false,
      token: Uint8Array | null = null,
      paid: u64 = 0,
      purchase_id: u32 = 0
    ) {
      this.buyer = buyer;
      this.mana = mana;
      this.remaining = remaining;
      this.expiry = expiry;
      this.allow_upload = allow_upload;
      this.token = token;
      this.paid = paid;
      this.purchase_id = purchase_id;
    }
  }

  export class big_object {
    static encode(message: big_object, writer: Writer): void {
      if (message.debt != 0) {
        writer.uint32(8);
        writer.uint64(message.debt);
      }

      if (message.debt_ts != 0) {
        writer.uint32(16);
        writer.uint64(message.debt_ts);
      }

      if (message.last_buy != 0) {
        writer.uint32(24);
        writer.uint64(message.last_buy);
      }

      const unique_name_week = message.week;
      if (unique_name_week !== null) {
        writer.uint32(34);
        writer.fork();
        window_object.encode(unique_name_week, writer);
        writer.ldelim();
      }

      if (message.next_id != 0) {
        writer.uint32(40);
        writer.uint32(message.next_id);
      }

      if (message.low_alerted != false) {
        writer.uint32(48);
        writer.bool(message.low_alerted);
      }

      if (message.next_purchase != 0) {
        writer.uint32(56);
        writer.uint32(message.next_purchase);
      }

      if (message.paused_at != 0) {
        writer.uint32(64);
        writer.uint64(message.paused_at);
      }
    }

    static decode(reader: Reader, length: i32): big_object {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new big_object();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.debt = reader.uint64();
            break;

          case 2:
            message.debt_ts = reader.uint64();
            break;

          case 3:
            message.last_buy = reader.uint64();
            break;

          case 4:
            message.week = window_object.decode(reader, reader.uint32());
            break;

          case 5:
            message.next_id = reader.uint32();
            break;

          case 6:
            message.low_alerted = reader.bool();
            break;

          case 7:
            message.next_purchase = reader.uint32();
            break;

          case 8:
            message.paused_at = reader.uint64();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    debt: u64;
    debt_ts: u64;
    last_buy: u64;
    week: window_object | null;
    next_id: u32;
    low_alerted: bool;
    next_purchase: u32;
    paused_at: u64;

    constructor(
      debt: u64 = 0,
      debt_ts: u64 = 0,
      last_buy: u64 = 0,
      week: window_object | null = null,
      next_id: u32 = 0,
      low_alerted: bool = false,
      next_purchase: u32 = 0,
      paused_at: u64 = 0
    ) {
      this.debt = debt;
      this.debt_ts = debt_ts;
      this.last_buy = last_buy;
      this.week = week;
      this.next_id = next_id;
      this.low_alerted = low_alerted;
      this.next_purchase = next_purchase;
      this.paused_at = paused_at;
    }
  }

  export class purchase_event {
    static encode(message: purchase_event, writer: Writer): void {
      const unique_name_allowance = message.allowance;
      if (unique_name_allowance !== null) {
        writer.uint32(10);
        writer.fork();
        allowance_object.encode(unique_name_allowance, writer);
        writer.ldelim();
      }

      const unique_name_ticket = message.ticket;
      if (unique_name_ticket !== null) {
        writer.uint32(18);
        writer.fork();
        ticket_object.encode(unique_name_ticket, writer);
        writer.ldelim();
      }

      const unique_name_token = message.token;
      if (unique_name_token !== null) {
        writer.uint32(26);
        writer.bytes(unique_name_token);
      }

      if (message.paid != 0) {
        writer.uint32(32);
        writer.uint64(message.paid);
      }

      if (message.refundable != false) {
        writer.uint32(40);
        writer.bool(message.refundable);
      }

      if (message.auto_renew != false) {
        writer.uint32(48);
        writer.bool(message.auto_renew);
      }

      const unique_name_terms = message.terms;
      if (unique_name_terms !== null) {
        writer.uint32(58);
        writer.string(unique_name_terms);
      }
    }

    static decode(reader: Reader, length: i32): purchase_event {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new purchase_event();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.allowance = allowance_object.decode(
              reader,
              reader.uint32()
            );
            break;

          case 2:
            message.ticket = ticket_object.decode(reader, reader.uint32());
            break;

          case 3:
            message.token = reader.bytes();
            break;

          case 4:
            message.paid = reader.uint64();
            break;

          case 5:
            message.refundable = reader.bool();
            break;

          case 6:
            message.auto_renew = reader.bool();
            break;

          case 7:
            message.terms = reader.string();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    allowance: allowance_object | null;
    ticket: ticket_object | null;
    token: Uint8Array | null;
    paid: u64;
    refundable: bool;
    auto_renew: bool;
    terms: string | null;

    constructor(
      allowance: allowance_object | null = null,
      ticket: ticket_object | null = null,
      token: Uint8Array | null = null,
      paid: u64 = 0,
      refundable: bool = false,
      auto_renew: bool = false,
      terms: string | null = null
    ) {
      this.allowance = allowance;
      this.ticket = ticket;
      this.token = token;
      this.paid = paid;
      this.refundable = refundable;
      this.auto_renew = auto_renew;
      this.terms = terms;
    }
  }

  export class buffer_event {
    static encode(message: buffer_event, writer: Writer): void {
      if (message.app != 0) {
        writer.uint32(8);
        writer.uint32(message.app);
      }

      const unique_name_payee = message.payee;
      if (unique_name_payee !== null) {
        writer.uint32(18);
        writer.bytes(unique_name_payee);
      }

      if (message.rc != 0) {
        writer.uint32(24);
        writer.uint64(message.rc);
      }

      if (message.app_used_24h != 0) {
        writer.uint32(32);
        writer.uint64(message.app_used_24h);
      }

      if (message.allowance != 0) {
        writer.uint32(40);
        writer.uint64(message.allowance);
      }

      if (message.buffer_limit != 0) {
        writer.uint32(48);
        writer.uint64(message.buffer_limit);
      }

      if (message.mana_after != 0) {
        writer.uint32(56);
        writer.uint64(message.mana_after);
      }
    }

    static decode(reader: Reader, length: i32): buffer_event {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new buffer_event();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.app = reader.uint32();
            break;

          case 2:
            message.payee = reader.bytes();
            break;

          case 3:
            message.rc = reader.uint64();
            break;

          case 4:
            message.app_used_24h = reader.uint64();
            break;

          case 5:
            message.allowance = reader.uint64();
            break;

          case 6:
            message.buffer_limit = reader.uint64();
            break;

          case 7:
            message.mana_after = reader.uint64();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    app: u32;
    payee: Uint8Array | null;
    rc: u64;
    app_used_24h: u64;
    allowance: u64;
    buffer_limit: u64;
    mana_after: u64;

    constructor(
      app: u32 = 0,
      payee: Uint8Array | null = null,
      rc: u64 = 0,
      app_used_24h: u64 = 0,
      allowance: u64 = 0,
      buffer_limit: u64 = 0,
      mana_after: u64 = 0
    ) {
      this.app = app;
      this.payee = payee;
      this.rc = rc;
      this.app_used_24h = app_used_24h;
      this.allowance = allowance;
      this.buffer_limit = buffer_limit;
      this.mana_after = mana_after;
    }
  }

  @unmanaged
  export class reserve_alert_event {
    static encode(message: reserve_alert_event, writer: Writer): void {
      if (message.mana_after != 0) {
        writer.uint32(8);
        writer.uint64(message.mana_after);
      }

      if (message.alert_level != 0) {
        writer.uint32(16);
        writer.uint64(message.alert_level);
      }

      if (message.hard_floor != 0) {
        writer.uint32(24);
        writer.uint64(message.hard_floor);
      }
    }

    static decode(reader: Reader, length: i32): reserve_alert_event {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new reserve_alert_event();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.mana_after = reader.uint64();
            break;

          case 2:
            message.alert_level = reader.uint64();
            break;

          case 3:
            message.hard_floor = reader.uint64();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    mana_after: u64;
    alert_level: u64;
    hard_floor: u64;

    constructor(
      mana_after: u64 = 0,
      alert_level: u64 = 0,
      hard_floor: u64 = 0
    ) {
      this.mana_after = mana_after;
      this.alert_level = alert_level;
      this.hard_floor = hard_floor;
    }
  }

  export class registry_object {
    static encode(message: registry_object, writer: Writer): void {
      const unique_name_app_ids = message.app_ids;
      if (unique_name_app_ids.length !== 0) {
        for (let i = 0; i < unique_name_app_ids.length; ++i) {
          writer.uint32(8);
          writer.uint32(unique_name_app_ids[i]);
        }
      }

      const unique_name_open_ids = message.open_ids;
      if (unique_name_open_ids.length !== 0) {
        for (let i = 0; i < unique_name_open_ids.length; ++i) {
          writer.uint32(16);
          writer.uint32(unique_name_open_ids[i]);
        }
      }

      const unique_name_open_purchases = message.open_purchases;
      if (unique_name_open_purchases.length !== 0) {
        for (let i = 0; i < unique_name_open_purchases.length; ++i) {
          writer.uint32(24);
          writer.uint32(unique_name_open_purchases[i]);
        }
      }
    }

    static decode(reader: Reader, length: i32): registry_object {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new registry_object();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.app_ids.push(reader.uint32());
            break;

          case 2:
            message.open_ids.push(reader.uint32());
            break;

          case 3:
            message.open_purchases.push(reader.uint32());
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    app_ids: Array<u32>;
    open_ids: Array<u32>;
    open_purchases: Array<u32>;

    constructor(
      app_ids: Array<u32> = [],
      open_ids: Array<u32> = [],
      open_purchases: Array<u32> = []
    ) {
      this.app_ids = app_ids;
      this.open_ids = open_ids;
      this.open_purchases = open_purchases;
    }
  }

  export class escrow_object {
    static encode(message: escrow_object, writer: Writer): void {
      if (message.id != 0) {
        writer.uint32(8);
        writer.uint32(message.id);
      }

      if (message.kind != 0) {
        writer.uint32(16);
        writer.uint32(message.kind);
      }

      const unique_name_buyer = message.buyer;
      if (unique_name_buyer !== null) {
        writer.uint32(26);
        writer.bytes(unique_name_buyer);
      }

      const unique_name_token = message.token;
      if (unique_name_token !== null) {
        writer.uint32(34);
        writer.bytes(unique_name_token);
      }

      if (message.amount != 0) {
        writer.uint32(40);
        writer.uint64(message.amount);
      }

      if (message.start != 0) {
        writer.uint32(48);
        writer.uint64(message.start);
      }

      if (message.end != 0) {
        writer.uint32(56);
        writer.uint64(message.end);
      }

      if (message.days != 0) {
        writer.uint32(64);
        writer.uint64(message.days);
      }

      if (message.per_day != 0) {
        writer.uint32(72);
        writer.uint64(message.per_day);
      }

      if (message.allowance_id != 0) {
        writer.uint32(80);
        writer.uint32(message.allowance_id);
      }

      const unique_name_payee = message.payee;
      if (unique_name_payee !== null) {
        writer.uint32(90);
        writer.bytes(unique_name_payee);
      }

      if (message.mana != 0) {
        writer.uint32(96);
        writer.uint64(message.mana);
      }

      if (message.refunded != 0) {
        writer.uint32(104);
        writer.uint64(message.refunded);
      }

      if (message.released != 0) {
        writer.uint32(112);
        writer.uint64(message.released);
      }

      if (message.closed != false) {
        writer.uint32(120);
        writer.bool(message.closed);
      }
    }

    static decode(reader: Reader, length: i32): escrow_object {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new escrow_object();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.id = reader.uint32();
            break;

          case 2:
            message.kind = reader.uint32();
            break;

          case 3:
            message.buyer = reader.bytes();
            break;

          case 4:
            message.token = reader.bytes();
            break;

          case 5:
            message.amount = reader.uint64();
            break;

          case 6:
            message.start = reader.uint64();
            break;

          case 7:
            message.end = reader.uint64();
            break;

          case 8:
            message.days = reader.uint64();
            break;

          case 9:
            message.per_day = reader.uint64();
            break;

          case 10:
            message.allowance_id = reader.uint32();
            break;

          case 11:
            message.payee = reader.bytes();
            break;

          case 12:
            message.mana = reader.uint64();
            break;

          case 13:
            message.refunded = reader.uint64();
            break;

          case 14:
            message.released = reader.uint64();
            break;

          case 15:
            message.closed = reader.bool();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    id: u32;
    kind: u32;
    buyer: Uint8Array | null;
    token: Uint8Array | null;
    amount: u64;
    start: u64;
    end: u64;
    days: u64;
    per_day: u64;
    allowance_id: u32;
    payee: Uint8Array | null;
    mana: u64;
    refunded: u64;
    released: u64;
    closed: bool;

    constructor(
      id: u32 = 0,
      kind: u32 = 0,
      buyer: Uint8Array | null = null,
      token: Uint8Array | null = null,
      amount: u64 = 0,
      start: u64 = 0,
      end: u64 = 0,
      days: u64 = 0,
      per_day: u64 = 0,
      allowance_id: u32 = 0,
      payee: Uint8Array | null = null,
      mana: u64 = 0,
      refunded: u64 = 0,
      released: u64 = 0,
      closed: bool = false
    ) {
      this.id = id;
      this.kind = kind;
      this.buyer = buyer;
      this.token = token;
      this.amount = amount;
      this.start = start;
      this.end = end;
      this.days = days;
      this.per_day = per_day;
      this.allowance_id = allowance_id;
      this.payee = payee;
      this.mana = mana;
      this.refunded = refunded;
      this.released = released;
      this.closed = closed;
    }
  }

  @unmanaged
  export class escrow_totals_object {
    static encode(message: escrow_totals_object, writer: Writer): void {
      if (message.held != 0) {
        writer.uint32(8);
        writer.uint64(message.held);
      }

      if (message.collected != 0) {
        writer.uint32(16);
        writer.uint64(message.collected);
      }

      if (message.refunded != 0) {
        writer.uint32(24);
        writer.uint64(message.refunded);
      }

      if (message.released != 0) {
        writer.uint32(32);
        writer.uint64(message.released);
      }
    }

    static decode(reader: Reader, length: i32): escrow_totals_object {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new escrow_totals_object();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.held = reader.uint64();
            break;

          case 2:
            message.collected = reader.uint64();
            break;

          case 3:
            message.refunded = reader.uint64();
            break;

          case 4:
            message.released = reader.uint64();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    held: u64;
    collected: u64;
    refunded: u64;
    released: u64;

    constructor(
      held: u64 = 0,
      collected: u64 = 0,
      refunded: u64 = 0,
      released: u64 = 0
    ) {
      this.held = held;
      this.collected = collected;
      this.refunded = refunded;
      this.released = released;
    }
  }

  export class escrow_event {
    static encode(message: escrow_event, writer: Writer): void {
      const unique_name_purchase = message.purchase;
      if (unique_name_purchase !== null) {
        writer.uint32(10);
        writer.fork();
        escrow_object.encode(unique_name_purchase, writer);
        writer.ldelim();
      }

      if (message.amount != 0) {
        writer.uint32(16);
        writer.uint64(message.amount);
      }

      const unique_name_to = message.to;
      if (unique_name_to !== null) {
        writer.uint32(26);
        writer.bytes(unique_name_to);
      }

      const unique_name_action = message.action;
      if (unique_name_action !== null) {
        writer.uint32(34);
        writer.string(unique_name_action);
      }
    }

    static decode(reader: Reader, length: i32): escrow_event {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new escrow_event();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.purchase = escrow_object.decode(reader, reader.uint32());
            break;

          case 2:
            message.amount = reader.uint64();
            break;

          case 3:
            message.to = reader.bytes();
            break;

          case 4:
            message.action = reader.string();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    purchase: escrow_object | null;
    amount: u64;
    to: Uint8Array | null;
    action: string | null;

    constructor(
      purchase: escrow_object | null = null,
      amount: u64 = 0,
      to: Uint8Array | null = null,
      action: string | null = null
    ) {
      this.purchase = purchase;
      this.amount = amount;
      this.to = to;
      this.action = action;
    }
  }

  @unmanaged
  export class revenue_object {
    static encode(message: revenue_object, writer: Writer): void {
      if (message.total != 0) {
        writer.uint32(8);
        writer.uint64(message.total);
      }
    }

    static decode(reader: Reader, length: i32): revenue_object {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new revenue_object();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.total = reader.uint64();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    total: u64;

    constructor(total: u64 = 0) {
      this.total = total;
    }
  }

  @unmanaged
  export class get_status_arguments {
    static encode(message: get_status_arguments, writer: Writer): void {}

    static decode(reader: Reader, length: i32): get_status_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new get_status_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    constructor() {}
  }

  export class get_status_result {
    static encode(message: get_status_result, writer: Writer): void {
      const unique_name_config = message.config;
      if (unique_name_config !== null) {
        writer.uint32(10);
        writer.fork();
        config_object.encode(unique_name_config, writer);
        writer.ldelim();
      }

      if (message.mana != 0) {
        writer.uint32(16);
        writer.uint64(message.mana);
      }

      if (message.daily_budget != 0) {
        writer.uint32(24);
        writer.uint64(message.daily_budget);
      }

      if (message.reserve_floor != 0) {
        writer.uint32(32);
        writer.uint64(message.reserve_floor);
      }

      if (message.big_floor != 0) {
        writer.uint32(40);
        writer.uint64(message.big_floor);
      }

      if (message.used_24h != 0) {
        writer.uint32(48);
        writer.uint64(message.used_24h);
      }

      if (message.sold_capacity != 0) {
        writer.uint32(56);
        writer.uint64(message.sold_capacity);
      }

      if (message.sold_committed != 0) {
        writer.uint32(64);
        writer.uint64(message.sold_committed);
      }

      if (message.big_debt != 0) {
        writer.uint32(72);
        writer.uint64(message.big_debt);
      }

      if (message.buffer_used_24h != 0) {
        writer.uint32(80);
        writer.uint64(message.buffer_used_24h);
      }

      if (message.alert_level != 0) {
        writer.uint32(88);
        writer.uint64(message.alert_level);
      }

      const unique_name_treasury = message.treasury;
      if (unique_name_treasury !== null) {
        writer.uint32(98);
        writer.bytes(unique_name_treasury);
      }
    }

    static decode(reader: Reader, length: i32): get_status_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new get_status_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.config = config_object.decode(reader, reader.uint32());
            break;

          case 2:
            message.mana = reader.uint64();
            break;

          case 3:
            message.daily_budget = reader.uint64();
            break;

          case 4:
            message.reserve_floor = reader.uint64();
            break;

          case 5:
            message.big_floor = reader.uint64();
            break;

          case 6:
            message.used_24h = reader.uint64();
            break;

          case 7:
            message.sold_capacity = reader.uint64();
            break;

          case 8:
            message.sold_committed = reader.uint64();
            break;

          case 9:
            message.big_debt = reader.uint64();
            break;

          case 10:
            message.buffer_used_24h = reader.uint64();
            break;

          case 11:
            message.alert_level = reader.uint64();
            break;

          case 12:
            message.treasury = reader.bytes();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    config: config_object | null;
    mana: u64;
    daily_budget: u64;
    reserve_floor: u64;
    big_floor: u64;
    used_24h: u64;
    sold_capacity: u64;
    sold_committed: u64;
    big_debt: u64;
    buffer_used_24h: u64;
    alert_level: u64;
    treasury: Uint8Array | null;

    constructor(
      config: config_object | null = null,
      mana: u64 = 0,
      daily_budget: u64 = 0,
      reserve_floor: u64 = 0,
      big_floor: u64 = 0,
      used_24h: u64 = 0,
      sold_capacity: u64 = 0,
      sold_committed: u64 = 0,
      big_debt: u64 = 0,
      buffer_used_24h: u64 = 0,
      alert_level: u64 = 0,
      treasury: Uint8Array | null = null
    ) {
      this.config = config;
      this.mana = mana;
      this.daily_budget = daily_budget;
      this.reserve_floor = reserve_floor;
      this.big_floor = big_floor;
      this.used_24h = used_24h;
      this.sold_capacity = sold_capacity;
      this.sold_committed = sold_committed;
      this.big_debt = big_debt;
      this.buffer_used_24h = buffer_used_24h;
      this.alert_level = alert_level;
      this.treasury = treasury;
    }
  }

  export class get_user_arguments {
    static encode(message: get_user_arguments, writer: Writer): void {
      const unique_name_user = message.user;
      if (unique_name_user !== null) {
        writer.uint32(10);
        writer.bytes(unique_name_user);
      }
    }

    static decode(reader: Reader, length: i32): get_user_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new get_user_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.user = reader.bytes();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    user: Uint8Array | null;

    constructor(user: Uint8Array | null = null) {
      this.user = user;
    }
  }

  export class get_user_result {
    static encode(message: get_user_result, writer: Writer): void {
      const unique_name_user = message.user;
      if (unique_name_user !== null) {
        writer.uint32(10);
        writer.fork();
        user_object.encode(unique_name_user, writer);
        writer.ldelim();
      }

      if (message.actions_24h != 0) {
        writer.uint32(16);
        writer.uint32(message.actions_24h);
      }

      if (message.mana_24h != 0) {
        writer.uint32(24);
        writer.uint64(message.mana_24h);
      }
    }

    static decode(reader: Reader, length: i32): get_user_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new get_user_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.user = user_object.decode(reader, reader.uint32());
            break;

          case 2:
            message.actions_24h = reader.uint32();
            break;

          case 3:
            message.mana_24h = reader.uint64();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    user: user_object | null;
    actions_24h: u32;
    mana_24h: u64;

    constructor(
      user: user_object | null = null,
      actions_24h: u32 = 0,
      mana_24h: u64 = 0
    ) {
      this.user = user;
      this.actions_24h = actions_24h;
      this.mana_24h = mana_24h;
    }
  }

  @unmanaged
  export class get_app_arguments {
    static encode(message: get_app_arguments, writer: Writer): void {
      if (message.app != 0) {
        writer.uint32(8);
        writer.uint32(message.app);
      }
    }

    static decode(reader: Reader, length: i32): get_app_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new get_app_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.app = reader.uint32();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    app: u32;

    constructor(app: u32 = 0) {
      this.app = app;
    }
  }

  @unmanaged
  export class get_app_result {
    static encode(message: get_app_result, writer: Writer): void {
      const unique_name_app = message.app;
      if (unique_name_app !== null) {
        writer.uint32(10);
        writer.fork();
        app_object.encode(unique_name_app, writer);
        writer.ldelim();
      }

      if (message.allowance != 0) {
        writer.uint32(16);
        writer.uint64(message.allowance);
      }

      if (message.used_24h != 0) {
        writer.uint32(24);
        writer.uint64(message.used_24h);
      }

      if (message.new_used_24h != 0) {
        writer.uint32(32);
        writer.uint64(message.new_used_24h);
      }
    }

    static decode(reader: Reader, length: i32): get_app_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new get_app_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.app = app_object.decode(reader, reader.uint32());
            break;

          case 2:
            message.allowance = reader.uint64();
            break;

          case 3:
            message.used_24h = reader.uint64();
            break;

          case 4:
            message.new_used_24h = reader.uint64();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    app: app_object | null;
    allowance: u64;
    used_24h: u64;
    new_used_24h: u64;

    constructor(
      app: app_object | null = null,
      allowance: u64 = 0,
      used_24h: u64 = 0,
      new_used_24h: u64 = 0
    ) {
      this.app = app;
      this.allowance = allowance;
      this.used_24h = used_24h;
      this.new_used_24h = new_used_24h;
    }
  }

  export class get_entry_arguments {
    static encode(message: get_entry_arguments, writer: Writer): void {
      const unique_name_contract_id = message.contract_id;
      if (unique_name_contract_id !== null) {
        writer.uint32(10);
        writer.bytes(unique_name_contract_id);
      }

      if (message.entry_point != 0) {
        writer.uint32(16);
        writer.uint32(message.entry_point);
      }
    }

    static decode(reader: Reader, length: i32): get_entry_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new get_entry_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.contract_id = reader.bytes();
            break;

          case 2:
            message.entry_point = reader.uint32();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    contract_id: Uint8Array | null;
    entry_point: u32;

    constructor(contract_id: Uint8Array | null = null, entry_point: u32 = 0) {
      this.contract_id = contract_id;
      this.entry_point = entry_point;
    }
  }

  @unmanaged
  export class get_entry_result {
    static encode(message: get_entry_result, writer: Writer): void {
      const unique_name_entry = message.entry;
      if (unique_name_entry !== null) {
        writer.uint32(10);
        writer.fork();
        entry_object.encode(unique_name_entry, writer);
        writer.ldelim();
      }
    }

    static decode(reader: Reader, length: i32): get_entry_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new get_entry_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.entry = entry_object.decode(reader, reader.uint32());
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    entry: entry_object | null;

    constructor(entry: entry_object | null = null) {
      this.entry = entry;
    }
  }

  export class quote_allowance_arguments {
    static encode(message: quote_allowance_arguments, writer: Writer): void {
      const unique_name_token = message.token;
      if (unique_name_token !== null) {
        writer.uint32(10);
        writer.bytes(unique_name_token);
      }

      if (message.mana_per_day != 0) {
        writer.uint32(16);
        writer.uint64(message.mana_per_day);
      }

      if (message.days != 0) {
        writer.uint32(24);
        writer.uint64(message.days);
      }
    }

    static decode(reader: Reader, length: i32): quote_allowance_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new quote_allowance_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.token = reader.bytes();
            break;

          case 2:
            message.mana_per_day = reader.uint64();
            break;

          case 3:
            message.days = reader.uint64();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    token: Uint8Array | null;
    mana_per_day: u64;
    days: u64;

    constructor(
      token: Uint8Array | null = null,
      mana_per_day: u64 = 0,
      days: u64 = 0
    ) {
      this.token = token;
      this.mana_per_day = mana_per_day;
      this.days = days;
    }
  }

  export class quote_allowance_result {
    static encode(message: quote_allowance_result, writer: Writer): void {
      if (message.refundable != false) {
        writer.uint32(40);
        writer.bool(message.refundable);
      }

      if (message.auto_renew != false) {
        writer.uint32(48);
        writer.bool(message.auto_renew);
      }

      const unique_name_terms = message.terms;
      if (unique_name_terms !== null) {
        writer.uint32(58);
        writer.string(unique_name_terms);
      }

      if (message.price != 0) {
        writer.uint32(8);
        writer.uint64(message.price);
      }

      if (message.available != false) {
        writer.uint32(16);
        writer.bool(message.available);
      }

      const unique_name_reason = message.reason;
      if (unique_name_reason !== null) {
        writer.uint32(26);
        writer.string(unique_name_reason);
      }

      if (message.unit_price != 0) {
        writer.uint32(32);
        writer.uint64(message.unit_price);
      }
    }

    static decode(reader: Reader, length: i32): quote_allowance_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new quote_allowance_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 5:
            message.refundable = reader.bool();
            break;

          case 6:
            message.auto_renew = reader.bool();
            break;

          case 7:
            message.terms = reader.string();
            break;

          case 1:
            message.price = reader.uint64();
            break;

          case 2:
            message.available = reader.bool();
            break;

          case 3:
            message.reason = reader.string();
            break;

          case 4:
            message.unit_price = reader.uint64();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    refundable: bool;
    auto_renew: bool;
    terms: string | null;
    price: u64;
    available: bool;
    reason: string | null;
    unit_price: u64;

    constructor(
      refundable: bool = false,
      auto_renew: bool = false,
      terms: string | null = null,
      price: u64 = 0,
      available: bool = false,
      reason: string | null = null,
      unit_price: u64 = 0
    ) {
      this.refundable = refundable;
      this.auto_renew = auto_renew;
      this.terms = terms;
      this.price = price;
      this.available = available;
      this.reason = reason;
      this.unit_price = unit_price;
    }
  }

  export class quote_big_upload_arguments {
    static encode(message: quote_big_upload_arguments, writer: Writer): void {
      const unique_name_token = message.token;
      if (unique_name_token !== null) {
        writer.uint32(10);
        writer.bytes(unique_name_token);
      }

      if (message.mana != 0) {
        writer.uint32(16);
        writer.uint64(message.mana);
      }
    }

    static decode(reader: Reader, length: i32): quote_big_upload_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new quote_big_upload_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.token = reader.bytes();
            break;

          case 2:
            message.mana = reader.uint64();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    token: Uint8Array | null;
    mana: u64;

    constructor(token: Uint8Array | null = null, mana: u64 = 0) {
      this.token = token;
      this.mana = mana;
    }
  }

  export class quote_big_upload_result {
    static encode(message: quote_big_upload_result, writer: Writer): void {
      if (message.refundable != false) {
        writer.uint32(40);
        writer.bool(message.refundable);
      }

      if (message.auto_renew != false) {
        writer.uint32(48);
        writer.bool(message.auto_renew);
      }

      const unique_name_terms = message.terms;
      if (unique_name_terms !== null) {
        writer.uint32(58);
        writer.string(unique_name_terms);
      }

      if (message.price != 0) {
        writer.uint32(8);
        writer.uint64(message.price);
      }

      if (message.available != false) {
        writer.uint32(16);
        writer.bool(message.available);
      }

      const unique_name_reason = message.reason;
      if (unique_name_reason !== null) {
        writer.uint32(26);
        writer.string(unique_name_reason);
      }

      if (message.unit_price != 0) {
        writer.uint32(32);
        writer.uint64(message.unit_price);
      }
    }

    static decode(reader: Reader, length: i32): quote_big_upload_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new quote_big_upload_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 5:
            message.refundable = reader.bool();
            break;

          case 6:
            message.auto_renew = reader.bool();
            break;

          case 7:
            message.terms = reader.string();
            break;

          case 1:
            message.price = reader.uint64();
            break;

          case 2:
            message.available = reader.bool();
            break;

          case 3:
            message.reason = reader.string();
            break;

          case 4:
            message.unit_price = reader.uint64();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    refundable: bool;
    auto_renew: bool;
    terms: string | null;
    price: u64;
    available: bool;
    reason: string | null;
    unit_price: u64;

    constructor(
      refundable: bool = false,
      auto_renew: bool = false,
      terms: string | null = null,
      price: u64 = 0,
      available: bool = false,
      reason: string | null = null,
      unit_price: u64 = 0
    ) {
      this.refundable = refundable;
      this.auto_renew = auto_renew;
      this.terms = terms;
      this.price = price;
      this.available = available;
      this.reason = reason;
      this.unit_price = unit_price;
    }
  }

  @unmanaged
  export class get_allowance_arguments {
    static encode(message: get_allowance_arguments, writer: Writer): void {
      if (message.id != 0) {
        writer.uint32(8);
        writer.uint32(message.id);
      }
    }

    static decode(reader: Reader, length: i32): get_allowance_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new get_allowance_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.id = reader.uint32();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    id: u32;

    constructor(id: u32 = 0) {
      this.id = id;
    }
  }

  export class get_allowance_result {
    static encode(message: get_allowance_result, writer: Writer): void {
      const unique_name_allowance = message.allowance;
      if (unique_name_allowance !== null) {
        writer.uint32(10);
        writer.fork();
        allowance_object.encode(unique_name_allowance, writer);
        writer.ldelim();
      }

      if (message.used_24h != 0) {
        writer.uint32(16);
        writer.uint64(message.used_24h);
      }
    }

    static decode(reader: Reader, length: i32): get_allowance_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new get_allowance_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.allowance = allowance_object.decode(
              reader,
              reader.uint32()
            );
            break;

          case 2:
            message.used_24h = reader.uint64();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    allowance: allowance_object | null;
    used_24h: u64;

    constructor(allowance: allowance_object | null = null, used_24h: u64 = 0) {
      this.allowance = allowance;
      this.used_24h = used_24h;
    }
  }

  export class get_ticket_arguments {
    static encode(message: get_ticket_arguments, writer: Writer): void {
      const unique_name_payee = message.payee;
      if (unique_name_payee !== null) {
        writer.uint32(10);
        writer.bytes(unique_name_payee);
      }
    }

    static decode(reader: Reader, length: i32): get_ticket_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new get_ticket_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.payee = reader.bytes();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    payee: Uint8Array | null;

    constructor(payee: Uint8Array | null = null) {
      this.payee = payee;
    }
  }

  export class get_ticket_result {
    static encode(message: get_ticket_result, writer: Writer): void {
      const unique_name_ticket = message.ticket;
      if (unique_name_ticket !== null) {
        writer.uint32(10);
        writer.fork();
        ticket_object.encode(unique_name_ticket, writer);
        writer.ldelim();
      }
    }

    static decode(reader: Reader, length: i32): get_ticket_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new get_ticket_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.ticket = ticket_object.decode(reader, reader.uint32());
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    ticket: ticket_object | null;

    constructor(ticket: ticket_object | null = null) {
      this.ticket = ticket;
    }
  }

  export class buy_allowance_arguments {
    static encode(message: buy_allowance_arguments, writer: Writer): void {
      const unique_name_buyer = message.buyer;
      if (unique_name_buyer !== null) {
        writer.uint32(10);
        writer.bytes(unique_name_buyer);
      }

      if (message.kind != 0) {
        writer.uint32(16);
        writer.uint32(message.kind);
      }

      const unique_name_target = message.target;
      if (unique_name_target !== null) {
        writer.uint32(26);
        writer.bytes(unique_name_target);
      }

      if (message.mana_per_day != 0) {
        writer.uint32(32);
        writer.uint64(message.mana_per_day);
      }

      if (message.days != 0) {
        writer.uint32(40);
        writer.uint64(message.days);
      }

      const unique_name_token = message.token;
      if (unique_name_token !== null) {
        writer.uint32(50);
        writer.bytes(unique_name_token);
      }

      if (message.max_price != 0) {
        writer.uint32(56);
        writer.uint64(message.max_price);
      }
    }

    static decode(reader: Reader, length: i32): buy_allowance_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new buy_allowance_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.buyer = reader.bytes();
            break;

          case 2:
            message.kind = reader.uint32();
            break;

          case 3:
            message.target = reader.bytes();
            break;

          case 4:
            message.mana_per_day = reader.uint64();
            break;

          case 5:
            message.days = reader.uint64();
            break;

          case 6:
            message.token = reader.bytes();
            break;

          case 7:
            message.max_price = reader.uint64();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    buyer: Uint8Array | null;
    kind: u32;
    target: Uint8Array | null;
    mana_per_day: u64;
    days: u64;
    token: Uint8Array | null;
    max_price: u64;

    constructor(
      buyer: Uint8Array | null = null,
      kind: u32 = 0,
      target: Uint8Array | null = null,
      mana_per_day: u64 = 0,
      days: u64 = 0,
      token: Uint8Array | null = null,
      max_price: u64 = 0
    ) {
      this.buyer = buyer;
      this.kind = kind;
      this.target = target;
      this.mana_per_day = mana_per_day;
      this.days = days;
      this.token = token;
      this.max_price = max_price;
    }
  }

  @unmanaged
  export class buy_allowance_result {
    static encode(message: buy_allowance_result, writer: Writer): void {
      if (message.id != 0) {
        writer.uint32(8);
        writer.uint32(message.id);
      }

      if (message.expiry != 0) {
        writer.uint32(16);
        writer.uint64(message.expiry);
      }

      if (message.paid != 0) {
        writer.uint32(24);
        writer.uint64(message.paid);
      }
    }

    static decode(reader: Reader, length: i32): buy_allowance_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new buy_allowance_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.id = reader.uint32();
            break;

          case 2:
            message.expiry = reader.uint64();
            break;

          case 3:
            message.paid = reader.uint64();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    id: u32;
    expiry: u64;
    paid: u64;

    constructor(id: u32 = 0, expiry: u64 = 0, paid: u64 = 0) {
      this.id = id;
      this.expiry = expiry;
      this.paid = paid;
    }
  }

  export class renew_arguments {
    static encode(message: renew_arguments, writer: Writer): void {
      const unique_name_payer = message.payer;
      if (unique_name_payer !== null) {
        writer.uint32(10);
        writer.bytes(unique_name_payer);
      }

      if (message.id != 0) {
        writer.uint32(16);
        writer.uint32(message.id);
      }

      if (message.days != 0) {
        writer.uint32(24);
        writer.uint64(message.days);
      }

      const unique_name_token = message.token;
      if (unique_name_token !== null) {
        writer.uint32(34);
        writer.bytes(unique_name_token);
      }

      if (message.max_price != 0) {
        writer.uint32(40);
        writer.uint64(message.max_price);
      }
    }

    static decode(reader: Reader, length: i32): renew_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new renew_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.payer = reader.bytes();
            break;

          case 2:
            message.id = reader.uint32();
            break;

          case 3:
            message.days = reader.uint64();
            break;

          case 4:
            message.token = reader.bytes();
            break;

          case 5:
            message.max_price = reader.uint64();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    payer: Uint8Array | null;
    id: u32;
    days: u64;
    token: Uint8Array | null;
    max_price: u64;

    constructor(
      payer: Uint8Array | null = null,
      id: u32 = 0,
      days: u64 = 0,
      token: Uint8Array | null = null,
      max_price: u64 = 0
    ) {
      this.payer = payer;
      this.id = id;
      this.days = days;
      this.token = token;
      this.max_price = max_price;
    }
  }

  @unmanaged
  export class renew_result {
    static encode(message: renew_result, writer: Writer): void {
      if (message.expiry != 0) {
        writer.uint32(8);
        writer.uint64(message.expiry);
      }

      if (message.paid != 0) {
        writer.uint32(16);
        writer.uint64(message.paid);
      }

      if (message.unit_price != 0) {
        writer.uint32(24);
        writer.uint64(message.unit_price);
      }
    }

    static decode(reader: Reader, length: i32): renew_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new renew_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.expiry = reader.uint64();
            break;

          case 2:
            message.paid = reader.uint64();
            break;

          case 3:
            message.unit_price = reader.uint64();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    expiry: u64;
    paid: u64;
    unit_price: u64;

    constructor(expiry: u64 = 0, paid: u64 = 0, unit_price: u64 = 0) {
      this.expiry = expiry;
      this.paid = paid;
      this.unit_price = unit_price;
    }
  }

  export class buy_big_upload_arguments {
    static encode(message: buy_big_upload_arguments, writer: Writer): void {
      const unique_name_buyer = message.buyer;
      if (unique_name_buyer !== null) {
        writer.uint32(10);
        writer.bytes(unique_name_buyer);
      }

      const unique_name_payee = message.payee;
      if (unique_name_payee !== null) {
        writer.uint32(18);
        writer.bytes(unique_name_payee);
      }

      if (message.mana != 0) {
        writer.uint32(24);
        writer.uint64(message.mana);
      }

      const unique_name_token = message.token;
      if (unique_name_token !== null) {
        writer.uint32(34);
        writer.bytes(unique_name_token);
      }

      if (message.max_price != 0) {
        writer.uint32(40);
        writer.uint64(message.max_price);
      }

      if (message.allow_upload != false) {
        writer.uint32(48);
        writer.bool(message.allow_upload);
      }
    }

    static decode(reader: Reader, length: i32): buy_big_upload_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new buy_big_upload_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.buyer = reader.bytes();
            break;

          case 2:
            message.payee = reader.bytes();
            break;

          case 3:
            message.mana = reader.uint64();
            break;

          case 4:
            message.token = reader.bytes();
            break;

          case 5:
            message.max_price = reader.uint64();
            break;

          case 6:
            message.allow_upload = reader.bool();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    buyer: Uint8Array | null;
    payee: Uint8Array | null;
    mana: u64;
    token: Uint8Array | null;
    max_price: u64;
    allow_upload: bool;

    constructor(
      buyer: Uint8Array | null = null,
      payee: Uint8Array | null = null,
      mana: u64 = 0,
      token: Uint8Array | null = null,
      max_price: u64 = 0,
      allow_upload: bool = false
    ) {
      this.buyer = buyer;
      this.payee = payee;
      this.mana = mana;
      this.token = token;
      this.max_price = max_price;
      this.allow_upload = allow_upload;
    }
  }

  @unmanaged
  export class buy_big_upload_result {
    static encode(message: buy_big_upload_result, writer: Writer): void {
      if (message.expiry != 0) {
        writer.uint32(8);
        writer.uint64(message.expiry);
      }

      if (message.paid != 0) {
        writer.uint32(16);
        writer.uint64(message.paid);
      }
    }

    static decode(reader: Reader, length: i32): buy_big_upload_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new buy_big_upload_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.expiry = reader.uint64();
            break;

          case 2:
            message.paid = reader.uint64();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    expiry: u64;
    paid: u64;

    constructor(expiry: u64 = 0, paid: u64 = 0) {
      this.expiry = expiry;
      this.paid = paid;
    }
  }

  export class close_ticket_arguments {
    static encode(message: close_ticket_arguments, writer: Writer): void {
      const unique_name_payee = message.payee;
      if (unique_name_payee !== null) {
        writer.uint32(10);
        writer.bytes(unique_name_payee);
      }
    }

    static decode(reader: Reader, length: i32): close_ticket_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new close_ticket_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.payee = reader.bytes();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    payee: Uint8Array | null;

    constructor(payee: Uint8Array | null = null) {
      this.payee = payee;
    }
  }

  @unmanaged
  export class close_ticket_result {
    static encode(message: close_ticket_result, writer: Writer): void {
      if (message.refund != 0) {
        writer.uint32(8);
        writer.uint64(message.refund);
      }

      if (message.released != 0) {
        writer.uint32(16);
        writer.uint64(message.released);
      }
    }

    static decode(reader: Reader, length: i32): close_ticket_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new close_ticket_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.refund = reader.uint64();
            break;

          case 2:
            message.released = reader.uint64();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    refund: u64;
    released: u64;

    constructor(refund: u64 = 0, released: u64 = 0) {
      this.refund = refund;
      this.released = released;
    }
  }

  export class cancel_allowance_arguments {
    static encode(message: cancel_allowance_arguments, writer: Writer): void {
      const unique_name_buyer = message.buyer;
      if (unique_name_buyer !== null) {
        writer.uint32(10);
        writer.bytes(unique_name_buyer);
      }

      if (message.id != 0) {
        writer.uint32(16);
        writer.uint32(message.id);
      }
    }

    static decode(reader: Reader, length: i32): cancel_allowance_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new cancel_allowance_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.buyer = reader.bytes();
            break;

          case 2:
            message.id = reader.uint32();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    buyer: Uint8Array | null;
    id: u32;

    constructor(buyer: Uint8Array | null = null, id: u32 = 0) {
      this.buyer = buyer;
      this.id = id;
    }
  }

  @unmanaged
  export class cancel_allowance_result {
    static encode(message: cancel_allowance_result, writer: Writer): void {
      if (message.refund != 0) {
        writer.uint32(8);
        writer.uint64(message.refund);
      }

      if (message.expiry != 0) {
        writer.uint32(16);
        writer.uint64(message.expiry);
      }
    }

    static decode(reader: Reader, length: i32): cancel_allowance_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new cancel_allowance_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.refund = reader.uint64();
            break;

          case 2:
            message.expiry = reader.uint64();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    refund: u64;
    expiry: u64;

    constructor(refund: u64 = 0, expiry: u64 = 0) {
      this.refund = refund;
      this.expiry = expiry;
    }
  }

  export class cancel_big_upload_arguments {
    static encode(message: cancel_big_upload_arguments, writer: Writer): void {
      const unique_name_buyer = message.buyer;
      if (unique_name_buyer !== null) {
        writer.uint32(10);
        writer.bytes(unique_name_buyer);
      }

      const unique_name_payee = message.payee;
      if (unique_name_payee !== null) {
        writer.uint32(18);
        writer.bytes(unique_name_payee);
      }
    }

    static decode(reader: Reader, length: i32): cancel_big_upload_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new cancel_big_upload_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.buyer = reader.bytes();
            break;

          case 2:
            message.payee = reader.bytes();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    buyer: Uint8Array | null;
    payee: Uint8Array | null;

    constructor(
      buyer: Uint8Array | null = null,
      payee: Uint8Array | null = null
    ) {
      this.buyer = buyer;
      this.payee = payee;
    }
  }

  @unmanaged
  export class cancel_big_upload_result {
    static encode(message: cancel_big_upload_result, writer: Writer): void {
      if (message.refund != 0) {
        writer.uint32(8);
        writer.uint64(message.refund);
      }
    }

    static decode(reader: Reader, length: i32): cancel_big_upload_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new cancel_big_upload_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.refund = reader.uint64();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    refund: u64;

    constructor(refund: u64 = 0) {
      this.refund = refund;
    }
  }

  @unmanaged
  export class release_arguments {
    static encode(message: release_arguments, writer: Writer): void {
      if (message.purchase_id != 0) {
        writer.uint32(8);
        writer.uint32(message.purchase_id);
      }
    }

    static decode(reader: Reader, length: i32): release_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new release_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.purchase_id = reader.uint32();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    purchase_id: u32;

    constructor(purchase_id: u32 = 0) {
      this.purchase_id = purchase_id;
    }
  }

  @unmanaged
  export class release_result {
    static encode(message: release_result, writer: Writer): void {
      if (message.amount != 0) {
        writer.uint32(8);
        writer.uint64(message.amount);
      }
    }

    static decode(reader: Reader, length: i32): release_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new release_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.amount = reader.uint64();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    amount: u64;

    constructor(amount: u64 = 0) {
      this.amount = amount;
    }
  }

  export class owner_refund_arguments {
    static encode(message: owner_refund_arguments, writer: Writer): void {
      if (message.allowance_id != 0) {
        writer.uint32(8);
        writer.uint32(message.allowance_id);
      }

      const unique_name_ticket_payee = message.ticket_payee;
      if (unique_name_ticket_payee !== null) {
        writer.uint32(18);
        writer.bytes(unique_name_ticket_payee);
      }
    }

    static decode(reader: Reader, length: i32): owner_refund_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new owner_refund_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.allowance_id = reader.uint32();
            break;

          case 2:
            message.ticket_payee = reader.bytes();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    allowance_id: u32;
    ticket_payee: Uint8Array | null;

    constructor(allowance_id: u32 = 0, ticket_payee: Uint8Array | null = null) {
      this.allowance_id = allowance_id;
      this.ticket_payee = ticket_payee;
    }
  }

  @unmanaged
  export class owner_refund_result {
    static encode(message: owner_refund_result, writer: Writer): void {
      if (message.refund != 0) {
        writer.uint32(8);
        writer.uint64(message.refund);
      }
    }

    static decode(reader: Reader, length: i32): owner_refund_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new owner_refund_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.refund = reader.uint64();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    refund: u64;

    constructor(refund: u64 = 0) {
      this.refund = refund;
    }
  }

  @unmanaged
  export class get_escrow_arguments {
    static encode(message: get_escrow_arguments, writer: Writer): void {
      if (message.purchase_id != 0) {
        writer.uint32(8);
        writer.uint32(message.purchase_id);
      }
    }

    static decode(reader: Reader, length: i32): get_escrow_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new get_escrow_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.purchase_id = reader.uint32();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    purchase_id: u32;

    constructor(purchase_id: u32 = 0) {
      this.purchase_id = purchase_id;
    }
  }

  export class get_escrow_result {
    static encode(message: get_escrow_result, writer: Writer): void {
      const unique_name_purchase = message.purchase;
      if (unique_name_purchase !== null) {
        writer.uint32(10);
        writer.fork();
        escrow_object.encode(unique_name_purchase, writer);
        writer.ldelim();
      }

      if (message.refundable_now != 0) {
        writer.uint32(16);
        writer.uint64(message.refundable_now);
      }

      if (message.releasable != false) {
        writer.uint32(24);
        writer.bool(message.releasable);
      }
    }

    static decode(reader: Reader, length: i32): get_escrow_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new get_escrow_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.purchase = escrow_object.decode(reader, reader.uint32());
            break;

          case 2:
            message.refundable_now = reader.uint64();
            break;

          case 3:
            message.releasable = reader.bool();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    purchase: escrow_object | null;
    refundable_now: u64;
    releasable: bool;

    constructor(
      purchase: escrow_object | null = null,
      refundable_now: u64 = 0,
      releasable: bool = false
    ) {
      this.purchase = purchase;
      this.refundable_now = refundable_now;
      this.releasable = releasable;
    }
  }

  export class get_escrow_totals_arguments {
    static encode(message: get_escrow_totals_arguments, writer: Writer): void {
      const unique_name_token = message.token;
      if (unique_name_token !== null) {
        writer.uint32(10);
        writer.bytes(unique_name_token);
      }
    }

    static decode(reader: Reader, length: i32): get_escrow_totals_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new get_escrow_totals_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.token = reader.bytes();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    token: Uint8Array | null;

    constructor(token: Uint8Array | null = null) {
      this.token = token;
    }
  }

  @unmanaged
  export class get_escrow_totals_result {
    static encode(message: get_escrow_totals_result, writer: Writer): void {
      const unique_name_totals = message.totals;
      if (unique_name_totals !== null) {
        writer.uint32(10);
        writer.fork();
        escrow_totals_object.encode(unique_name_totals, writer);
        writer.ldelim();
      }
    }

    static decode(reader: Reader, length: i32): get_escrow_totals_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new get_escrow_totals_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.totals = escrow_totals_object.decode(
              reader,
              reader.uint32()
            );
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    totals: escrow_totals_object | null;

    constructor(totals: escrow_totals_object | null = null) {
      this.totals = totals;
    }
  }

  export class init_arguments {
    static encode(message: init_arguments, writer: Writer): void {
      const unique_name_config = message.config;
      if (unique_name_config !== null) {
        writer.uint32(10);
        writer.fork();
        config_object.encode(unique_name_config, writer);
        writer.ldelim();
      }
    }

    static decode(reader: Reader, length: i32): init_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new init_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.config = config_object.decode(reader, reader.uint32());
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    config: config_object | null;

    constructor(config: config_object | null = null) {
      this.config = config;
    }
  }

  @unmanaged
  export class init_result {
    static encode(message: init_result, writer: Writer): void {}

    static decode(reader: Reader, length: i32): init_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new init_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    constructor() {}
  }

  export class set_config_arguments {
    static encode(message: set_config_arguments, writer: Writer): void {
      const unique_name_config = message.config;
      if (unique_name_config !== null) {
        writer.uint32(10);
        writer.fork();
        config_object.encode(unique_name_config, writer);
        writer.ldelim();
      }
    }

    static decode(reader: Reader, length: i32): set_config_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new set_config_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.config = config_object.decode(reader, reader.uint32());
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    config: config_object | null;

    constructor(config: config_object | null = null) {
      this.config = config;
    }
  }

  @unmanaged
  export class set_config_result {
    static encode(message: set_config_result, writer: Writer): void {}

    static decode(reader: Reader, length: i32): set_config_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new set_config_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    constructor() {}
  }

  @unmanaged
  export class set_paused_arguments {
    static encode(message: set_paused_arguments, writer: Writer): void {
      if (message.paused != false) {
        writer.uint32(8);
        writer.bool(message.paused);
      }
    }

    static decode(reader: Reader, length: i32): set_paused_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new set_paused_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.paused = reader.bool();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    paused: bool;

    constructor(paused: bool = false) {
      this.paused = paused;
    }
  }

  @unmanaged
  export class set_paused_result {
    static encode(message: set_paused_result, writer: Writer): void {}

    static decode(reader: Reader, length: i32): set_paused_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new set_paused_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    constructor() {}
  }

  @unmanaged
  export class set_app_arguments {
    static encode(message: set_app_arguments, writer: Writer): void {
      if (message.app != 0) {
        writer.uint32(8);
        writer.uint32(message.app);
      }

      const unique_name_value = message.value;
      if (unique_name_value !== null) {
        writer.uint32(18);
        writer.fork();
        app_object.encode(unique_name_value, writer);
        writer.ldelim();
      }
    }

    static decode(reader: Reader, length: i32): set_app_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new set_app_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.app = reader.uint32();
            break;

          case 2:
            message.value = app_object.decode(reader, reader.uint32());
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    app: u32;
    value: app_object | null;

    constructor(app: u32 = 0, value: app_object | null = null) {
      this.app = app;
      this.value = value;
    }
  }

  @unmanaged
  export class set_app_result {
    static encode(message: set_app_result, writer: Writer): void {}

    static decode(reader: Reader, length: i32): set_app_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new set_app_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    constructor() {}
  }

  export class set_entry_arguments {
    static encode(message: set_entry_arguments, writer: Writer): void {
      const unique_name_contract_id = message.contract_id;
      if (unique_name_contract_id !== null) {
        writer.uint32(10);
        writer.bytes(unique_name_contract_id);
      }

      if (message.entry_point != 0) {
        writer.uint32(16);
        writer.uint32(message.entry_point);
      }

      const unique_name_value = message.value;
      if (unique_name_value !== null) {
        writer.uint32(26);
        writer.fork();
        entry_object.encode(unique_name_value, writer);
        writer.ldelim();
      }

      if (message.remove != false) {
        writer.uint32(32);
        writer.bool(message.remove);
      }
    }

    static decode(reader: Reader, length: i32): set_entry_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new set_entry_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.contract_id = reader.bytes();
            break;

          case 2:
            message.entry_point = reader.uint32();
            break;

          case 3:
            message.value = entry_object.decode(reader, reader.uint32());
            break;

          case 4:
            message.remove = reader.bool();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    contract_id: Uint8Array | null;
    entry_point: u32;
    value: entry_object | null;
    remove: bool;

    constructor(
      contract_id: Uint8Array | null = null,
      entry_point: u32 = 0,
      value: entry_object | null = null,
      remove: bool = false
    ) {
      this.contract_id = contract_id;
      this.entry_point = entry_point;
      this.value = value;
      this.remove = remove;
    }
  }

  @unmanaged
  export class set_entry_result {
    static encode(message: set_entry_result, writer: Writer): void {}

    static decode(reader: Reader, length: i32): set_entry_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new set_entry_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    constructor() {}
  }

  @unmanaged
  export class suspend_object {
    static encode(message: suspend_object, writer: Writer): void {
      if (message.reason != 0) {
        writer.uint32(8);
        writer.uint32(message.reason);
      }

      if (message.since != 0) {
        writer.uint32(16);
        writer.uint64(message.since);
      }
    }

    static decode(reader: Reader, length: i32): suspend_object {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new suspend_object();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.reason = reader.uint32();
            break;

          case 2:
            message.since = reader.uint64();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    reason: u32;
    since: u64;

    constructor(reason: u32 = 0, since: u64 = 0) {
      this.reason = reason;
      this.since = since;
    }
  }

  export class suspend_event {
    static encode(message: suspend_event, writer: Writer): void {
      const unique_name_buyer = message.buyer;
      if (unique_name_buyer !== null) {
        writer.uint32(10);
        writer.bytes(unique_name_buyer);
      }

      if (message.reason != 0) {
        writer.uint32(16);
        writer.uint32(message.reason);
      }

      if (message.suspended != false) {
        writer.uint32(24);
        writer.bool(message.suspended);
      }

      if (message.at != 0) {
        writer.uint32(32);
        writer.uint64(message.at);
      }
    }

    static decode(reader: Reader, length: i32): suspend_event {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new suspend_event();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.buyer = reader.bytes();
            break;

          case 2:
            message.reason = reader.uint32();
            break;

          case 3:
            message.suspended = reader.bool();
            break;

          case 4:
            message.at = reader.uint64();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    buyer: Uint8Array | null;
    reason: u32;
    suspended: bool;
    at: u64;

    constructor(
      buyer: Uint8Array | null = null,
      reason: u32 = 0,
      suspended: bool = false,
      at: u64 = 0
    ) {
      this.buyer = buyer;
      this.reason = reason;
      this.suspended = suspended;
      this.at = at;
    }
  }

  export class suspend_allowance_arguments {
    static encode(message: suspend_allowance_arguments, writer: Writer): void {
      const unique_name_buyer = message.buyer;
      if (unique_name_buyer !== null) {
        writer.uint32(10);
        writer.bytes(unique_name_buyer);
      }

      if (message.reason != 0) {
        writer.uint32(16);
        writer.uint32(message.reason);
      }
    }

    static decode(reader: Reader, length: i32): suspend_allowance_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new suspend_allowance_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.buyer = reader.bytes();
            break;

          case 2:
            message.reason = reader.uint32();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    buyer: Uint8Array | null;
    reason: u32;

    constructor(buyer: Uint8Array | null = null, reason: u32 = 0) {
      this.buyer = buyer;
      this.reason = reason;
    }
  }

  @unmanaged
  export class suspend_allowance_result {
    static encode(message: suspend_allowance_result, writer: Writer): void {}

    static decode(reader: Reader, length: i32): suspend_allowance_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new suspend_allowance_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    constructor() {}
  }

  export class unsuspend_allowance_arguments {
    static encode(
      message: unsuspend_allowance_arguments,
      writer: Writer
    ): void {
      const unique_name_buyer = message.buyer;
      if (unique_name_buyer !== null) {
        writer.uint32(10);
        writer.bytes(unique_name_buyer);
      }

      if (message.reason != 0) {
        writer.uint32(16);
        writer.uint32(message.reason);
      }
    }

    static decode(reader: Reader, length: i32): unsuspend_allowance_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new unsuspend_allowance_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.buyer = reader.bytes();
            break;

          case 2:
            message.reason = reader.uint32();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    buyer: Uint8Array | null;
    reason: u32;

    constructor(buyer: Uint8Array | null = null, reason: u32 = 0) {
      this.buyer = buyer;
      this.reason = reason;
    }
  }

  @unmanaged
  export class unsuspend_allowance_result {
    static encode(message: unsuspend_allowance_result, writer: Writer): void {}

    static decode(reader: Reader, length: i32): unsuspend_allowance_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new unsuspend_allowance_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    constructor() {}
  }

  export class get_suspension_arguments {
    static encode(message: get_suspension_arguments, writer: Writer): void {
      const unique_name_buyer = message.buyer;
      if (unique_name_buyer !== null) {
        writer.uint32(10);
        writer.bytes(unique_name_buyer);
      }
    }

    static decode(reader: Reader, length: i32): get_suspension_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new get_suspension_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.buyer = reader.bytes();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    buyer: Uint8Array | null;

    constructor(buyer: Uint8Array | null = null) {
      this.buyer = buyer;
    }
  }

  @unmanaged
  export class get_suspension_result {
    static encode(message: get_suspension_result, writer: Writer): void {
      const unique_name_suspension = message.suspension;
      if (unique_name_suspension !== null) {
        writer.uint32(10);
        writer.fork();
        suspend_object.encode(unique_name_suspension, writer);
        writer.ldelim();
      }
    }

    static decode(reader: Reader, length: i32): get_suspension_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new get_suspension_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.suspension = suspend_object.decode(reader, reader.uint32());
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    suspension: suspend_object | null;

    constructor(suspension: suspend_object | null = null) {
      this.suspension = suspension;
    }
  }

  export class set_exempt_arguments {
    static encode(message: set_exempt_arguments, writer: Writer): void {
      const unique_name_contract_id = message.contract_id;
      if (unique_name_contract_id !== null) {
        writer.uint32(10);
        writer.bytes(unique_name_contract_id);
      }

      const unique_name_value = message.value;
      if (unique_name_value !== null) {
        writer.uint32(18);
        writer.fork();
        exempt_object.encode(unique_name_value, writer);
        writer.ldelim();
      }

      if (message.remove != false) {
        writer.uint32(24);
        writer.bool(message.remove);
      }
    }

    static decode(reader: Reader, length: i32): set_exempt_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new set_exempt_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.contract_id = reader.bytes();
            break;

          case 2:
            message.value = exempt_object.decode(reader, reader.uint32());
            break;

          case 3:
            message.remove = reader.bool();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    contract_id: Uint8Array | null;
    value: exempt_object | null;
    remove: bool;

    constructor(
      contract_id: Uint8Array | null = null,
      value: exempt_object | null = null,
      remove: bool = false
    ) {
      this.contract_id = contract_id;
      this.value = value;
      this.remove = remove;
    }
  }

  @unmanaged
  export class set_exempt_result {
    static encode(message: set_exempt_result, writer: Writer): void {}

    static decode(reader: Reader, length: i32): set_exempt_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new set_exempt_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    constructor() {}
  }

  export class get_exempt_arguments {
    static encode(message: get_exempt_arguments, writer: Writer): void {
      const unique_name_contract_id = message.contract_id;
      if (unique_name_contract_id !== null) {
        writer.uint32(10);
        writer.bytes(unique_name_contract_id);
      }
    }

    static decode(reader: Reader, length: i32): get_exempt_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new get_exempt_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.contract_id = reader.bytes();
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    contract_id: Uint8Array | null;

    constructor(contract_id: Uint8Array | null = null) {
      this.contract_id = contract_id;
    }
  }

  @unmanaged
  export class get_exempt_result {
    static encode(message: get_exempt_result, writer: Writer): void {
      const unique_name_exempt = message.exempt;
      if (unique_name_exempt !== null) {
        writer.uint32(10);
        writer.fork();
        exempt_object.encode(unique_name_exempt, writer);
        writer.ldelim();
      }
    }

    static decode(reader: Reader, length: i32): get_exempt_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new get_exempt_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.exempt = exempt_object.decode(reader, reader.uint32());
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    exempt: exempt_object | null;

    constructor(exempt: exempt_object | null = null) {
      this.exempt = exempt;
    }
  }

  export class set_price_arguments {
    static encode(message: set_price_arguments, writer: Writer): void {
      const unique_name_token = message.token;
      if (unique_name_token !== null) {
        writer.uint32(10);
        writer.bytes(unique_name_token);
      }

      const unique_name_value = message.value;
      if (unique_name_value !== null) {
        writer.uint32(18);
        writer.fork();
        price_object.encode(unique_name_value, writer);
        writer.ldelim();
      }
    }

    static decode(reader: Reader, length: i32): set_price_arguments {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new set_price_arguments();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          case 1:
            message.token = reader.bytes();
            break;

          case 2:
            message.value = price_object.decode(reader, reader.uint32());
            break;

          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    token: Uint8Array | null;
    value: price_object | null;

    constructor(
      token: Uint8Array | null = null,
      value: price_object | null = null
    ) {
      this.token = token;
      this.value = value;
    }
  }

  @unmanaged
  export class set_price_result {
    static encode(message: set_price_result, writer: Writer): void {}

    static decode(reader: Reader, length: i32): set_price_result {
      const end: usize = length < 0 ? reader.end : reader.ptr + length;
      const message = new set_price_result();

      while (reader.ptr < end) {
        const tag = reader.uint32();
        switch (tag >>> 3) {
          default:
            reader.skipType(tag & 7);
            break;
        }
      }

      return message;
    }

    constructor() {}
  }
}
