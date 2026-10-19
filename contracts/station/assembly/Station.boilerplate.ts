import { System, Protobuf, authority } from "@koinos/sdk-as";
import { station } from "./proto/station";

export class Station {
  authorize(args: authority.authorize_arguments): authority.authorize_result {
    // const call = args.call;
    // const type = args.type;

    // YOUR CODE HERE

    const res = new authority.authorize_result();
    res.value = true;

    return res;
  }

  get_status(args: station.get_status_arguments): station.get_status_result {
    // YOUR CODE HERE

    const res = new station.get_status_result();
    // res.config = ;
    // res.mana = ;
    // res.daily_budget = ;
    // res.reserve_floor = ;
    // res.big_floor = ;
    // res.used_24h = ;
    // res.sold_capacity = ;
    // res.sold_committed = ;
    // res.big_debt = ;
    // res.buffer_used_24h = ;
    // res.alert_level = ;
    // res.treasury = ;

    return res;
  }

  get_user(args: station.get_user_arguments): station.get_user_result {
    // const user = args.user;

    // YOUR CODE HERE

    const res = new station.get_user_result();
    // res.user = ;
    // res.actions_24h = ;
    // res.mana_24h = ;

    return res;
  }

  get_app(args: station.get_app_arguments): station.get_app_result {
    // const app = args.app;

    // YOUR CODE HERE

    const res = new station.get_app_result();
    // res.app = ;
    // res.allowance = ;
    // res.used_24h = ;
    // res.new_used_24h = ;

    return res;
  }

  get_entry(args: station.get_entry_arguments): station.get_entry_result {
    // const contract_id = args.contract_id;
    // const entry_point = args.entry_point;

    // YOUR CODE HERE

    const res = new station.get_entry_result();
    // res.entry = ;

    return res;
  }

  quote_allowance(
    args: station.quote_allowance_arguments
  ): station.quote_allowance_result {
    // const token = args.token;
    // const mana_per_day = args.mana_per_day;
    // const days = args.days;

    // YOUR CODE HERE

    const res = new station.quote_allowance_result();
    // res.refundable = ;
    // res.auto_renew = ;
    // res.terms = ;
    // res.price = ;
    // res.available = ;
    // res.reason = ;
    // res.unit_price = ;

    return res;
  }

  quote_big_upload(
    args: station.quote_big_upload_arguments
  ): station.quote_big_upload_result {
    // const token = args.token;
    // const mana = args.mana;

    // YOUR CODE HERE

    const res = new station.quote_big_upload_result();
    // res.refundable = ;
    // res.auto_renew = ;
    // res.terms = ;
    // res.price = ;
    // res.available = ;
    // res.reason = ;
    // res.unit_price = ;

    return res;
  }

  get_allowance(
    args: station.get_allowance_arguments
  ): station.get_allowance_result {
    // const id = args.id;

    // YOUR CODE HERE

    const res = new station.get_allowance_result();
    // res.allowance = ;
    // res.used_24h = ;

    return res;
  }

  get_ticket(args: station.get_ticket_arguments): station.get_ticket_result {
    // const payee = args.payee;

    // YOUR CODE HERE

    const res = new station.get_ticket_result();
    // res.ticket = ;

    return res;
  }

  buy_allowance(
    args: station.buy_allowance_arguments
  ): station.buy_allowance_result {
    // const buyer = args.buyer;
    // const kind = args.kind;
    // const target = args.target;
    // const mana_per_day = args.mana_per_day;
    // const days = args.days;
    // const token = args.token;
    // const max_price = args.max_price;

    // YOUR CODE HERE

    const res = new station.buy_allowance_result();
    // res.id = ;
    // res.expiry = ;
    // res.paid = ;

    return res;
  }

  renew(args: station.renew_arguments): station.renew_result {
    // const payer = args.payer;
    // const id = args.id;
    // const days = args.days;
    // const token = args.token;
    // const max_price = args.max_price;

    // YOUR CODE HERE

    const res = new station.renew_result();
    // res.expiry = ;
    // res.paid = ;
    // res.unit_price = ;

    return res;
  }

  buy_big_upload(
    args: station.buy_big_upload_arguments
  ): station.buy_big_upload_result {
    // const buyer = args.buyer;
    // const payee = args.payee;
    // const mana = args.mana;
    // const token = args.token;
    // const max_price = args.max_price;
    // const allow_upload = args.allow_upload;

    // YOUR CODE HERE

    const res = new station.buy_big_upload_result();
    // res.expiry = ;
    // res.paid = ;

    return res;
  }

  close_ticket(
    args: station.close_ticket_arguments
  ): station.close_ticket_result {
    // const payee = args.payee;

    // YOUR CODE HERE

    const res = new station.close_ticket_result();
    // res.refund = ;
    // res.released = ;

    return res;
  }

  cancel_allowance(
    args: station.cancel_allowance_arguments
  ): station.cancel_allowance_result {
    // const buyer = args.buyer;
    // const id = args.id;

    // YOUR CODE HERE

    const res = new station.cancel_allowance_result();
    // res.refund = ;
    // res.expiry = ;

    return res;
  }

  cancel_big_upload(
    args: station.cancel_big_upload_arguments
  ): station.cancel_big_upload_result {
    // const buyer = args.buyer;
    // const payee = args.payee;

    // YOUR CODE HERE

    const res = new station.cancel_big_upload_result();
    // res.refund = ;

    return res;
  }

  release(args: station.release_arguments): station.release_result {
    // const purchase_id = args.purchase_id;

    // YOUR CODE HERE

    const res = new station.release_result();
    // res.amount = ;

    return res;
  }

  owner_refund(
    args: station.owner_refund_arguments
  ): station.owner_refund_result {
    // const allowance_id = args.allowance_id;
    // const ticket_payee = args.ticket_payee;

    // YOUR CODE HERE

    const res = new station.owner_refund_result();
    // res.refund = ;

    return res;
  }

  get_escrow(args: station.get_escrow_arguments): station.get_escrow_result {
    // const purchase_id = args.purchase_id;

    // YOUR CODE HERE

    const res = new station.get_escrow_result();
    // res.purchase = ;
    // res.refundable_now = ;
    // res.releasable = ;

    return res;
  }

  get_escrow_totals(
    args: station.get_escrow_totals_arguments
  ): station.get_escrow_totals_result {
    // const token = args.token;

    // YOUR CODE HERE

    const res = new station.get_escrow_totals_result();
    // res.totals = ;

    return res;
  }

  init(args: station.init_arguments): station.init_result {
    // const config = args.config;

    // YOUR CODE HERE

    const res = new station.init_result();

    return res;
  }

  set_config(args: station.set_config_arguments): station.set_config_result {
    // const config = args.config;

    // YOUR CODE HERE

    const res = new station.set_config_result();

    return res;
  }

  set_paused(args: station.set_paused_arguments): station.set_paused_result {
    // const paused = args.paused;

    // YOUR CODE HERE

    const res = new station.set_paused_result();

    return res;
  }

  set_app(args: station.set_app_arguments): station.set_app_result {
    // const app = args.app;
    // const value = args.value;

    // YOUR CODE HERE

    const res = new station.set_app_result();

    return res;
  }

  set_entry(args: station.set_entry_arguments): station.set_entry_result {
    // const contract_id = args.contract_id;
    // const entry_point = args.entry_point;
    // const value = args.value;
    // const remove = args.remove;

    // YOUR CODE HERE

    const res = new station.set_entry_result();

    return res;
  }

  suspend_allowance(
    args: station.suspend_allowance_arguments
  ): station.suspend_allowance_result {
    // const buyer = args.buyer;
    // const reason = args.reason;

    // YOUR CODE HERE

    const res = new station.suspend_allowance_result();

    return res;
  }

  unsuspend_allowance(
    args: station.unsuspend_allowance_arguments
  ): station.unsuspend_allowance_result {
    // const buyer = args.buyer;
    // const reason = args.reason;

    // YOUR CODE HERE

    const res = new station.unsuspend_allowance_result();

    return res;
  }

  get_suspension(
    args: station.get_suspension_arguments
  ): station.get_suspension_result {
    // const buyer = args.buyer;

    // YOUR CODE HERE

    const res = new station.get_suspension_result();
    // res.suspension = ;

    return res;
  }

  set_exempt(args: station.set_exempt_arguments): station.set_exempt_result {
    // const contract_id = args.contract_id;
    // const value = args.value;
    // const remove = args.remove;

    // YOUR CODE HERE

    const res = new station.set_exempt_result();

    return res;
  }

  get_exempt(args: station.get_exempt_arguments): station.get_exempt_result {
    // const contract_id = args.contract_id;

    // YOUR CODE HERE

    const res = new station.get_exempt_result();
    // res.exempt = ;

    return res;
  }

  set_price(args: station.set_price_arguments): station.set_price_result {
    // const token = args.token;
    // const value = args.value;

    // YOUR CODE HERE

    const res = new station.set_price_result();

    return res;
  }
}
