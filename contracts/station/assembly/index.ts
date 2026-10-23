import { System, Protobuf, authority } from "@koinos/sdk-as";
import { Station as ContractClass } from "./Station";
import { station as ProtoNamespace } from "./proto/station";

export function main(): i32 {
  const contractArgs = System.getArguments();
  let retbuf = new Uint8Array(1024);

  const c = new ContractClass();

  switch (contractArgs.entry_point) {
    case 0x4a2dbd90: {
      const args = Protobuf.decode<authority.authorize_arguments>(
        contractArgs.args,
        authority.authorize_arguments.decode
      );
      const res = c.authorize(args);
      retbuf = Protobuf.encode(res, authority.authorize_result.encode);
      break;
    }

    case 0x72cdbfdd: {
      const args = Protobuf.decode<ProtoNamespace.get_status_arguments>(
        contractArgs.args,
        ProtoNamespace.get_status_arguments.decode
      );
      const res = c.get_status(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.get_status_result.encode);
      break;
    }

    case 0xbf1e2a1a: {
      const args = Protobuf.decode<ProtoNamespace.get_user_arguments>(
        contractArgs.args,
        ProtoNamespace.get_user_arguments.decode
      );
      const res = c.get_user(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.get_user_result.encode);
      break;
    }

    case 0xa6d19fee: {
      const args = Protobuf.decode<ProtoNamespace.get_app_arguments>(
        contractArgs.args,
        ProtoNamespace.get_app_arguments.decode
      );
      const res = c.get_app(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.get_app_result.encode);
      break;
    }

    case 0x208b3061: {
      const args = Protobuf.decode<ProtoNamespace.get_entry_arguments>(
        contractArgs.args,
        ProtoNamespace.get_entry_arguments.decode
      );
      const res = c.get_entry(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.get_entry_result.encode);
      break;
    }

    case 0x160c1364: {
      const args = Protobuf.decode<ProtoNamespace.quote_allowance_arguments>(
        contractArgs.args,
        ProtoNamespace.quote_allowance_arguments.decode
      );
      const res = c.quote_allowance(args);
      retbuf = Protobuf.encode(
        res,
        ProtoNamespace.quote_allowance_result.encode
      );
      break;
    }

    case 0xcdde618e: {
      const args = Protobuf.decode<ProtoNamespace.quote_big_upload_arguments>(
        contractArgs.args,
        ProtoNamespace.quote_big_upload_arguments.decode
      );
      const res = c.quote_big_upload(args);
      retbuf = Protobuf.encode(
        res,
        ProtoNamespace.quote_big_upload_result.encode
      );
      break;
    }

    case 0x8b7ac5fe: {
      const args = Protobuf.decode<ProtoNamespace.get_allowance_arguments>(
        contractArgs.args,
        ProtoNamespace.get_allowance_arguments.decode
      );
      const res = c.get_allowance(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.get_allowance_result.encode);
      break;
    }

    case 0x31b048e0: {
      const args = Protobuf.decode<ProtoNamespace.get_ticket_arguments>(
        contractArgs.args,
        ProtoNamespace.get_ticket_arguments.decode
      );
      const res = c.get_ticket(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.get_ticket_result.encode);
      break;
    }

    case 0x60422f5f: {
      const args = Protobuf.decode<ProtoNamespace.buy_allowance_arguments>(
        contractArgs.args,
        ProtoNamespace.buy_allowance_arguments.decode
      );
      const res = c.buy_allowance(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.buy_allowance_result.encode);
      break;
    }

    case 0xa36a2ce1: {
      const args = Protobuf.decode<ProtoNamespace.renew_arguments>(
        contractArgs.args,
        ProtoNamespace.renew_arguments.decode
      );
      const res = c.renew(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.renew_result.encode);
      break;
    }

    case 0x1c1d9f26: {
      const args = Protobuf.decode<ProtoNamespace.buy_big_upload_arguments>(
        contractArgs.args,
        ProtoNamespace.buy_big_upload_arguments.decode
      );
      const res = c.buy_big_upload(args);
      retbuf = Protobuf.encode(
        res,
        ProtoNamespace.buy_big_upload_result.encode
      );
      break;
    }

    case 0xfebe723c: {
      const args = Protobuf.decode<ProtoNamespace.close_ticket_arguments>(
        contractArgs.args,
        ProtoNamespace.close_ticket_arguments.decode
      );
      const res = c.close_ticket(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.close_ticket_result.encode);
      break;
    }

    case 0xc7643cce: {
      const args = Protobuf.decode<ProtoNamespace.cancel_allowance_arguments>(
        contractArgs.args,
        ProtoNamespace.cancel_allowance_arguments.decode
      );
      const res = c.cancel_allowance(args);
      retbuf = Protobuf.encode(
        res,
        ProtoNamespace.cancel_allowance_result.encode
      );
      break;
    }

    case 0xc2985745: {
      const args = Protobuf.decode<ProtoNamespace.cancel_big_upload_arguments>(
        contractArgs.args,
        ProtoNamespace.cancel_big_upload_arguments.decode
      );
      const res = c.cancel_big_upload(args);
      retbuf = Protobuf.encode(
        res,
        ProtoNamespace.cancel_big_upload_result.encode
      );
      break;
    }

    case 0xa4d451ec: {
      const args = Protobuf.decode<ProtoNamespace.release_arguments>(
        contractArgs.args,
        ProtoNamespace.release_arguments.decode
      );
      const res = c.release(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.release_result.encode);
      break;
    }

    case 0xdd1b3c31: {
      const args = Protobuf.decode<ProtoNamespace.claim_arguments>(
        contractArgs.args,
        ProtoNamespace.claim_arguments.decode
      );
      const res = c.claim(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.claim_result.encode);
      break;
    }

    case 0xfd725d34: {
      const args = Protobuf.decode<ProtoNamespace.get_owed_arguments>(
        contractArgs.args,
        ProtoNamespace.get_owed_arguments.decode
      );
      const res = c.get_owed(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.get_owed_result.encode);
      break;
    }

    case 0x15c837ec: {
      const args = Protobuf.decode<ProtoNamespace.owner_refund_arguments>(
        contractArgs.args,
        ProtoNamespace.owner_refund_arguments.decode
      );
      const res = c.owner_refund(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.owner_refund_result.encode);
      break;
    }

    case 0xaeeb717a: {
      const args = Protobuf.decode<ProtoNamespace.get_escrow_arguments>(
        contractArgs.args,
        ProtoNamespace.get_escrow_arguments.decode
      );
      const res = c.get_escrow(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.get_escrow_result.encode);
      break;
    }

    case 0x7e8412a4: {
      const args = Protobuf.decode<ProtoNamespace.get_escrow_totals_arguments>(
        contractArgs.args,
        ProtoNamespace.get_escrow_totals_arguments.decode
      );
      const res = c.get_escrow_totals(args);
      retbuf = Protobuf.encode(
        res,
        ProtoNamespace.get_escrow_totals_result.encode
      );
      break;
    }

    case 0xda1fd8f5: {
      const args = Protobuf.decode<ProtoNamespace.would_pay_arguments>(
        contractArgs.args,
        ProtoNamespace.would_pay_arguments.decode
      );
      const res = c.would_pay(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.would_pay_result.encode);
      break;
    }

    case 0xbb54068a: {
      const args = Protobuf.decode<ProtoNamespace.init_arguments>(
        contractArgs.args,
        ProtoNamespace.init_arguments.decode
      );
      const res = c.init(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.init_result.encode);
      break;
    }

    case 0x4ba58c89: {
      const args = Protobuf.decode<ProtoNamespace.set_config_arguments>(
        contractArgs.args,
        ProtoNamespace.set_config_arguments.decode
      );
      const res = c.set_config(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.set_config_result.encode);
      break;
    }

    case 0x35fbb717: {
      const args = Protobuf.decode<ProtoNamespace.set_paused_arguments>(
        contractArgs.args,
        ProtoNamespace.set_paused_arguments.decode
      );
      const res = c.set_paused(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.set_paused_result.encode);
      break;
    }

    case 0x87ab2112: {
      const args = Protobuf.decode<ProtoNamespace.set_app_arguments>(
        contractArgs.args,
        ProtoNamespace.set_app_arguments.decode
      );
      const res = c.set_app(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.set_app_result.encode);
      break;
    }

    case 0x53a076a4: {
      const args = Protobuf.decode<ProtoNamespace.set_entry_arguments>(
        contractArgs.args,
        ProtoNamespace.set_entry_arguments.decode
      );
      const res = c.set_entry(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.set_entry_result.encode);
      break;
    }

    case 0xea86d421: {
      const args = Protobuf.decode<ProtoNamespace.suspend_allowance_arguments>(
        contractArgs.args,
        ProtoNamespace.suspend_allowance_arguments.decode
      );
      const res = c.suspend_allowance(args);
      retbuf = Protobuf.encode(
        res,
        ProtoNamespace.suspend_allowance_result.encode
      );
      break;
    }

    case 0x5e2456f4: {
      const args =
        Protobuf.decode<ProtoNamespace.unsuspend_allowance_arguments>(
          contractArgs.args,
          ProtoNamespace.unsuspend_allowance_arguments.decode
        );
      const res = c.unsuspend_allowance(args);
      retbuf = Protobuf.encode(
        res,
        ProtoNamespace.unsuspend_allowance_result.encode
      );
      break;
    }

    case 0xc5ca826a: {
      const args = Protobuf.decode<ProtoNamespace.get_suspension_arguments>(
        contractArgs.args,
        ProtoNamespace.get_suspension_arguments.decode
      );
      const res = c.get_suspension(args);
      retbuf = Protobuf.encode(
        res,
        ProtoNamespace.get_suspension_result.encode
      );
      break;
    }

    case 0x664110b4: {
      const args = Protobuf.decode<ProtoNamespace.set_exempt_arguments>(
        contractArgs.args,
        ProtoNamespace.set_exempt_arguments.decode
      );
      const res = c.set_exempt(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.set_exempt_result.encode);
      break;
    }

    case 0xef2023e6: {
      const args = Protobuf.decode<ProtoNamespace.get_exempt_arguments>(
        contractArgs.args,
        ProtoNamespace.get_exempt_arguments.decode
      );
      const res = c.get_exempt(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.get_exempt_result.encode);
      break;
    }

    case 0x2ddf5b5e: {
      const args = Protobuf.decode<ProtoNamespace.set_price_arguments>(
        contractArgs.args,
        ProtoNamespace.set_price_arguments.decode
      );
      const res = c.set_price(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.set_price_result.encode);
      break;
    }

    case 0x4f0d7216: {
      const args = Protobuf.decode<ProtoNamespace.connect_app_arguments>(
        contractArgs.args,
        ProtoNamespace.connect_app_arguments.decode
      );
      const res = c.connect_app(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.connect_app_result.encode);
      break;
    }

    case 0xec85e7d6: {
      const args = Protobuf.decode<ProtoNamespace.disconnect_app_arguments>(
        contractArgs.args,
        ProtoNamespace.disconnect_app_arguments.decode
      );
      const res = c.disconnect_app(args);
      retbuf = Protobuf.encode(
        res,
        ProtoNamespace.disconnect_app_result.encode
      );
      break;
    }

    case 0xa274b08a: {
      const args = Protobuf.decode<ProtoNamespace.list_connected_arguments>(
        contractArgs.args,
        ProtoNamespace.list_connected_arguments.decode
      );
      const res = c.list_connected(args);
      retbuf = Protobuf.encode(
        res,
        ProtoNamespace.list_connected_result.encode
      );
      break;
    }

    case 0x12df7f0e: {
      const args = Protobuf.decode<ProtoNamespace.propose_arguments>(
        contractArgs.args,
        ProtoNamespace.propose_arguments.decode
      );
      const res = c.propose(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.propose_result.encode);
      break;
    }

    case 0x74e21680: {
      const args = Protobuf.decode<ProtoNamespace.approve_arguments>(
        contractArgs.args,
        ProtoNamespace.approve_arguments.decode
      );
      const res = c.approve(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.approve_result.encode);
      break;
    }

    case 0x6008a826: {
      const args = Protobuf.decode<ProtoNamespace.unapprove_arguments>(
        contractArgs.args,
        ProtoNamespace.unapprove_arguments.decode
      );
      const res = c.unapprove(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.unapprove_result.encode);
      break;
    }

    case 0x062f1ed9: {
      const args = Protobuf.decode<ProtoNamespace.cancel_proposal_arguments>(
        contractArgs.args,
        ProtoNamespace.cancel_proposal_arguments.decode
      );
      const res = c.cancel_proposal(args);
      retbuf = Protobuf.encode(
        res,
        ProtoNamespace.cancel_proposal_result.encode
      );
      break;
    }

    case 0xbe6bdfe8: {
      const args = Protobuf.decode<ProtoNamespace.execute_arguments>(
        contractArgs.args,
        ProtoNamespace.execute_arguments.decode
      );
      const res = c.execute(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.execute_result.encode);
      break;
    }

    case 0xab0c868c: {
      const args = Protobuf.decode<ProtoNamespace.get_proposal_arguments>(
        contractArgs.args,
        ProtoNamespace.get_proposal_arguments.decode
      );
      const res = c.get_proposal(args);
      retbuf = Protobuf.encode(res, ProtoNamespace.get_proposal_result.encode);
      break;
    }

    case 0x756c2c35: {
      const args = Protobuf.decode<ProtoNamespace.list_proposals_arguments>(
        contractArgs.args,
        ProtoNamespace.list_proposals_arguments.decode
      );
      const res = c.list_proposals(args);
      retbuf = Protobuf.encode(
        res,
        ProtoNamespace.list_proposals_result.encode
      );
      break;
    }

    default:
      System.exit(1);
      break;
  }

  System.exit(0, retbuf);
  return 0;
}

main();
