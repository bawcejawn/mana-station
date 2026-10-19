import { System, Protobuf, authority } from "@koinos/sdk-as";
import { testapp } from "./proto/testapp";

export class Testapp {
  play(args: testapp.play_arguments): testapp.play_result {
    // const user = args.user;

    // YOUR CODE HERE

    const res = new testapp.play_result();
    // res.n = ;

    return res;
  }

  heavy(args: testapp.heavy_arguments): testapp.heavy_result {
    // const user = args.user;
    // const items = args.items;

    // YOUR CODE HERE

    const res = new testapp.heavy_result();

    return res;
  }

  nope(args: testapp.nope_arguments): testapp.nope_result {
    // YOUR CODE HERE

    const res = new testapp.nope_result();

    return res;
  }

  boom(args: testapp.boom_arguments): testapp.boom_result {
    // YOUR CODE HERE

    const res = new testapp.boom_result();

    return res;
  }

  get(args: testapp.get_arguments): testapp.get_result {
    // const user = args.user;

    // YOUR CODE HERE

    const res = new testapp.get_result();
    // res.n = ;

    return res;
  }
}
