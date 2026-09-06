import {$} from "zx"
import {loadNetworks} from "../compose-files/load-networks.ts"

type CreateNetwork = (network: string) => Promise<void> | void
type NetworkExists = (network: string) => Promise<boolean> | boolean

const dockerCreateNetwork: CreateNetwork = async (net) => {
  await $`docker network create --driver=bridge ${net}`
}

const dockerNetworkExists: NetworkExists = async (net) => {
  try {
    const result = await $`docker network inspect ${net}`.quiet().nothrow()
    return result.exitCode === 0
  } catch {
    return false
  }
}

export async function createNetworks(
  directories: string[],
  createNetwork: CreateNetwork = dockerCreateNetwork,
  hasNetwork: NetworkExists = dockerNetworkExists,
): Promise<string[]> {
  const networks = await loadNetworks(directories)

  for (const network of networks) {
    if (await hasNetwork(network)) {
      console.log(`docker network '${network}' already exists`)
    } else {
      console.log(`creating docker network '${network}'...`)
      await createNetwork(network)
    }
  }

  return networks
}
