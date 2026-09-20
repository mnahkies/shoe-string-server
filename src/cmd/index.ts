import {downCmd} from "./down.ts"
import {reconcileCmd} from "./reconcile.ts"
import {upCmd} from "./up.ts"

export const cmds = {
  up: upCmd,
  down: downCmd,
  reconcile: reconcileCmd,
}
