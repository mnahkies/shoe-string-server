import type {DeepReadonly} from "ts-essentials"

export function deepFreeze<Type extends object>(obj: Type): DeepReadonly<Type> {
  // Retrieve the property names defined on object
  const propNames = Reflect.ownKeys(obj) as (keyof Type)[]

  // Freeze properties before freezing self
  for (const name of propNames) {
    const value = obj[name]

    if ((value && typeof value === "object") || typeof value === "function") {
      deepFreeze(value)
    }
  }

  return Object.freeze(obj) as DeepReadonly<Type>
}
