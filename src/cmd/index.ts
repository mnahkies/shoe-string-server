import {downCmd} from "./down.ts"
import {reconcileCmd} from "./reconcile.ts"
import {reloadHaproxyCmd} from "./reload-haproxy.ts"
import {secretsCmd} from "./secrets.ts"
import {selfUpdateCmd} from "./self-update.ts"
import {upCmd} from "./up.ts"

export const cmds = {
  up: upCmd,
  down: downCmd,
  reconcile: reconcileCmd,
  reloadProxy: reloadHaproxyCmd,
  secrets: secretsCmd,
  selfUpdate: selfUpdateCmd,
}
