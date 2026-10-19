import { System, Storage, Protobuf, authority } from "@koinos/sdk-as";
import { mocktoken } from "./proto/mocktoken";

const SUPPLY_KEY = new Uint8Array(1);
export class Mocktoken {
  cid: Uint8Array = System.getContractId();
  bal: Storage.Map<Uint8Array, mocktoken.balance_object> = new Storage.Map(this.cid, 0, mocktoken.balance_object.decode, mocktoken.balance_object.encode, () => new mocktoken.balance_object());
  alw: Storage.Map<Uint8Array, mocktoken.balance_object> = new Storage.Map(this.cid, 1, mocktoken.balance_object.decode, mocktoken.balance_object.encode, () => new mocktoken.balance_object());
  sup: Storage.Map<Uint8Array, mocktoken.balance_object> = new Storage.Map(this.cid, 2, mocktoken.balance_object.decode, mocktoken.balance_object.encode, () => new mocktoken.balance_object());

  akey(o: Uint8Array, s: Uint8Array): Uint8Array { const k = new Uint8Array(o.length + s.length); k.set(o, 0); k.set(s, o.length); return k; }
  name(a: mocktoken.name_arguments): mocktoken.name_result { return new mocktoken.name_result("Mock vUSDT (testnet, worthless)"); }
  symbol(a: mocktoken.symbol_arguments): mocktoken.symbol_result { return new mocktoken.symbol_result("tUSDT"); }
  decimals(a: mocktoken.decimals_arguments): mocktoken.decimals_result { return new mocktoken.decimals_result(8); }
  total_supply(a: mocktoken.total_supply_arguments): mocktoken.total_supply_result { return new mocktoken.total_supply_result(this.sup.get(SUPPLY_KEY)!.value); }
  balance_of(a: mocktoken.balance_of_arguments): mocktoken.balance_of_result { return new mocktoken.balance_of_result(this.bal.get(a.owner!)!.value); }
  allowance(a: mocktoken.allowance_arguments): mocktoken.allowance_result { return new mocktoken.allowance_result(this.alw.get(this.akey(a.owner!, a.spender!))!.value); }

  approve(a: mocktoken.approve_arguments): mocktoken.approve_result {
    System.require(System.checkAuthority(authority.authorization_type.contract_call, a.owner!), "approve: not authorized");
    this.alw.put(this.akey(a.owner!, a.spender!), new mocktoken.balance_object(a.value));
    return new mocktoken.approve_result();
  }
  transfer(a: mocktoken.transfer_arguments): mocktoken.transfer_result {
    const caller = System.getCaller().caller;
    if (caller.length > 0 && caller.toString() == a.from!.toString()) {
      // a contract moving its own balance
    } else {
      const k = this.akey(a.from!, caller); const al = this.alw.get(k)!;
      if (caller.length > 0 && al.value >= a.value) { al.value -= a.value; this.alw.put(k, al); }
      else System.require(System.checkAuthority(authority.authorization_type.contract_call, a.from!), "transfer: not authorized");
    }
    const f = this.bal.get(a.from!)!; System.require(f.value >= a.value, "transfer: insufficient balance");
    f.value -= a.value; this.bal.put(a.from!, f);
    const t = this.bal.get(a.to!)!; t.value += a.value; this.bal.put(a.to!, t);
    System.event("token.transfer_event", Protobuf.encode(new mocktoken.transfer_event(a.from, a.to, a.value, a.memo), mocktoken.transfer_event.encode), [a.from!, a.to!]);
    return new mocktoken.transfer_result();
  }
  mint(a: mocktoken.mint_arguments): mocktoken.mint_result {
    System.require(System.checkAuthority(authority.authorization_type.contract_call, this.cid), "mint: token key only");
    const t = this.bal.get(a.to!)!; t.value += a.value; this.bal.put(a.to!, t);
    const s = this.sup.get(SUPPLY_KEY)!; s.value += a.value; this.sup.put(SUPPLY_KEY, s);
    return new mocktoken.mint_result();
  }
}
