/**
 * Small guard used by the before-command hooks: when the plugin itself needs to
 * move/delete its own action block it flips this flag so the binding hooks do
 * not reject the call.
 */
let allowActionBlockMutation = false

export function isActionBlockMutationAllowed(): boolean {
  return allowActionBlockMutation
}

export async function withActionBlockMutationAllowed<T>(fn: () => Promise<T>): Promise<T> {
  const previous = allowActionBlockMutation
  allowActionBlockMutation = true
  try {
    return await fn()
  } finally {
    allowActionBlockMutation = previous
  }
}
