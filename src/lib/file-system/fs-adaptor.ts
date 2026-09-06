import {NodeFsAdaptor} from "./node.fs-adaptor.ts"
import type {FsAdaptor} from "./types.ts"

let currentAdaptor: FsAdaptor | undefined

// we don't want our code to directly depend on `node:fs/promises` - rather it should
// use the FsAdaptor interface such that in tests we can use an in-memory adaptor.
export function getFsAdaptor(): FsAdaptor {
  if (currentAdaptor) {
    return currentAdaptor
  }
  return new NodeFsAdaptor()
}

export function setFsAdaptor(adaptor: FsAdaptor | undefined): void {
  currentAdaptor = adaptor
}

export function resetFsAdaptor(): void {
  currentAdaptor = undefined
}
