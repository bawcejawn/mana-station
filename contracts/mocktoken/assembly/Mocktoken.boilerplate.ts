import { System, Protobuf, authority } from "@koinos/sdk-as";
import { mocktoken } from "./proto/mocktoken";

export class Mocktoken {
  name(args: mocktoken.name_arguments): mocktoken.name_result {
    // YOUR CODE HERE

    const res = new mocktoken.name_result();
    // res.value = ;

    return res;
  }

  symbol(args: mocktoken.symbol_arguments): mocktoken.symbol_result {
    // YOUR CODE HERE

    const res = new mocktoken.symbol_result();
    // res.value = ;

    return res;
  }

  decimals(args: mocktoken.decimals_arguments): mocktoken.decimals_result {
    // YOUR CODE HERE

    const res = new mocktoken.decimals_result();
    // res.value = ;

    return res;
  }

  total_supply(
    args: mocktoken.total_supply_arguments
  ): mocktoken.total_supply_result {
    // YOUR CODE HERE

    const res = new mocktoken.total_supply_result();
    // res.value = ;

    return res;
  }

  balance_of(
    args: mocktoken.balance_of_arguments
  ): mocktoken.balance_of_result {
    // const owner = args.owner;

    // YOUR CODE HERE

    const res = new mocktoken.balance_of_result();
    // res.value = ;

    return res;
  }

  allowance(args: mocktoken.allowance_arguments): mocktoken.allowance_result {
    // const owner = args.owner;
    // const spender = args.spender;

    // YOUR CODE HERE

    const res = new mocktoken.allowance_result();
    // res.value = ;

    return res;
  }

  transfer(args: mocktoken.transfer_arguments): mocktoken.transfer_result {
    // const from = args.from;
    // const to = args.to;
    // const value = args.value;
    // const memo = args.memo;

    // YOUR CODE HERE

    const res = new mocktoken.transfer_result();

    return res;
  }

  approve(args: mocktoken.approve_arguments): mocktoken.approve_result {
    // const owner = args.owner;
    // const spender = args.spender;
    // const value = args.value;
    // const memo = args.memo;

    // YOUR CODE HERE

    const res = new mocktoken.approve_result();

    return res;
  }

  mint(args: mocktoken.mint_arguments): mocktoken.mint_result {
    // const to = args.to;
    // const value = args.value;
    // const memo = args.memo;

    // YOUR CODE HERE

    const res = new mocktoken.mint_result();

    return res;
  }
}
