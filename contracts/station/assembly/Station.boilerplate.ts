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
    // res.price = ;
    // res.available = ;
    // res.reason = ;

    return res;
  }

  quote_big_upload(
    args: station.quote_big_upload_arguments
  ): station.quote_big_upload_result {
    // const token = args.token;
    // const mana = args.mana;

    // YOUR CODE HERE

    const res = new station.quote_big_upload_result();
    // res.price = ;
    // res.available = ;
    // res.reason = ;

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

  withdraw_revenue(
    args: station.withdraw_revenue_arguments
  ): station.withdraw_revenue_result {
    // const token = args.token;
    // const to = args.to;
    // const amount = args.amount;

    // YOUR CODE HERE

    const res = new station.withdraw_revenue_result();

    return res;
  }

  cancel_allowance(
    args: station.cancel_allowance_arguments
  ): station.cancel_allowance_result {
    // const id = args.id;
    // const token = args.token;
    // const refund = args.refund;

    // YOUR CODE HERE

    const res = new station.cancel_allowance_result();

    return res;
  }
}
