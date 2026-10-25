export type MaybePromise<T> = T | Promise<T>

export type AnswersView<
  Context extends object,
  Answers extends object,
> = Readonly<Context & Answers>

type AnyWizard = Wizard<Record<never, never>, Record<never, never>>
type AnyAnswers = Record<string, unknown>

type UnionKeys<T> = T extends unknown ? keyof T : never

/** Make every key produced by either branch optional in the merged result. */
type OptionalBranchAnswers<T> = {
  [K in UnionKeys<T>]?: T extends Record<K, infer V> ? V : never
}

type QuestionStep = {
  readonly kind: "question"
  readonly key: string
  readonly ask: (answers: AnyAnswers) => Promise<unknown>
}

type BranchStep = {
  readonly kind: "branch"
  readonly predicate: (answers: AnyAnswers) => boolean
  readonly match: (answers: AnyAnswers) => AnyWizard
  readonly otherwise: (answers: AnyAnswers) => AnyWizard
}

type NestedStep = {
  readonly kind: "nested"
  readonly key: string
  readonly create: (answers: AnyAnswers) => AnyWizard
}

type TransformStep = {
  readonly kind: "transform"
  readonly transform: (answers: AnyAnswers) => Promise<AnyAnswers>
}

type Step = QuestionStep | BranchStep | NestedStep | TransformStep

export class Wizard<
  Context extends object = Record<never, never>,
  Answers extends object = Record<never, never>,
> {
  private constructor(private readonly steps: readonly Step[] = []) {}

  /** Start a wizard. Context is supplied to run() and is visible to every question. */
  static create<Context extends object = Record<never, never>>(): Wizard<
    Context,
    Record<never, never>
  > {
    return new Wizard<Context, Record<never, never>>()
  }

  /**
   * Add a question. The callback sees the initial context and all answers
   * produced by preceding steps. Keys cannot overwrite context/previous answers
   * at the type level, and are checked again at runtime.
   */
  question<K extends string, T>(
    key: K extends keyof (Context & Answers) ? never : K,
    ask: (answers: AnswersView<Context, Answers>) => MaybePromise<T>,
  ): Wizard<Context, Answers & Record<K, Awaited<T>>> {
    const step: QuestionStep = {
      kind: "question",
      key,
      ask: async (answers) => ask(answers as AnswersView<Context, Answers>),
    }

    return this.append(step) as Wizard<Context, Answers & Record<K, Awaited<T>>>
  }

  transform<ChildAnswers extends object>(
    transform: (
      answers: AnswersView<Context, Answers>,
    ) => MaybePromise<ChildAnswers>,
  ): Wizard<Context, Awaited<ChildAnswers>> {
    const step: TransformStep = {
      kind: "transform",
      transform: async (answers) =>
        transform(answers as AnswersView<Context, Answers>) as AnyAnswers,
    }

    return this.append(step) as Wizard<Context, Awaited<ChildAnswers>>
  }

  /**
   * Conditionally execute one child wizard. Branches are factories so they can
   * inspect the current answers and construct a context-specific workflow.
   * Branch-produced keys are optional in the resulting flat answer object.
   */
  when<
    MatchContext extends object,
    MatchAnswers extends object,
    OtherContext extends object,
    OtherAnswers extends object,
  >(
    predicate: (answers: AnswersView<Context, Answers>) => boolean,
    branches: {
      match:
        | Wizard<MatchContext, MatchAnswers>
        | ((
            answers: AnswersView<Context, Answers>,
          ) => Wizard<MatchContext, MatchAnswers>)
      otherwise:
        | Wizard<OtherContext, OtherAnswers>
        | ((
            answers: AnswersView<Context, Answers>,
          ) => Wizard<OtherContext, OtherAnswers>)
    },
  ): Wizard<
    Context,
    Answers & OptionalBranchAnswers<MatchAnswers | OtherAnswers>
  > {
    const step: BranchStep = {
      kind: "branch",
      predicate: (answers) =>
        predicate(answers as AnswersView<Context, Answers>),
      match: (answers) => {
        const answerView = answers as AnswersView<Context, Answers>
        const candidate = branches.match
        const resolved =
          candidate instanceof Wizard ? candidate : candidate(answerView)
        return resolved as unknown as AnyWizard
      },
      otherwise: (answers) => {
        const answerView = answers as AnswersView<Context, Answers>
        const candidate = branches.otherwise
        const resolved =
          candidate instanceof Wizard ? candidate : candidate(answerView)
        return resolved as unknown as AnyWizard
      },
    }

    return this.append(step) as Wizard<
      Context,
      Answers & OptionalBranchAnswers<MatchAnswers | OtherAnswers>
    >
  }

  /**
   * Run a child workflow and store its output under `key`. This is the preferred
   * way to compose independently authored workflows without key collisions.
   */
  workflow<
    K extends string,
    ChildContext extends object,
    ChildAnswers extends object,
  >(
    key: K extends keyof (Context & Answers) ? never : K,
    create: (
      answers: AnswersView<Context, Answers>,
    ) => Wizard<ChildContext, ChildAnswers>,
  ): Wizard<Context, Answers & Record<K, ChildAnswers>> {
    const step: NestedStep = {
      kind: "nested",
      key,
      create: (answers) =>
        create(
          answers as AnswersView<Context, Answers>,
        ) as unknown as AnyWizard,
    }

    return this.append(step) as Wizard<
      Context,
      Answers & Record<K, ChildAnswers>
    >
  }

  /** Execute this definition with an initial context. Each run gets fresh state. */
  async run(context: Context): Promise<Answers> {
    return (await this.execute(context as AnyAnswers, {})) as Answers
  }

  private append(step: Step): Wizard<Context, Answers> {
    return new Wizard<Context, Answers>([...this.steps, step])
  }

  private async execute(
    context: AnyAnswers,
    initialAnswers: AnyAnswers,
    collisionContext: AnyAnswers = context,
  ): Promise<AnyAnswers> {
    let answers: AnyAnswers = {...initialAnswers}

    for (const step of this.steps) {
      const visibleAnswers = {...context, ...answers}

      switch (step.kind) {
        case "question": {
          assertUnusedKey(step.key, collisionContext, answers)
          answers[step.key] = await step.ask(visibleAnswers)
          break
        }

        case "branch": {
          const child = step.predicate(visibleAnswers)
            ? step.match(visibleAnswers)
            : step.otherwise(visibleAnswers)
          const childAnswers = await child.execute(
            visibleAnswers,
            {},
            visibleAnswers,
          )
          mergeBranchAnswers(answers, childAnswers, context)
          break
        }

        case "nested": {
          assertUnusedKey(step.key, context, answers)
          const child = step.create(visibleAnswers)
          answers[step.key] = await child.execute(visibleAnswers, {}, {})
          break
        }

        case "transform":
          answers = await step.transform(visibleAnswers)
      }
    }

    return answers
  }
}

/** Convenience factory with inference-friendly syntax. */
export function wizard<Context extends object = Record<never, never>>(): Wizard<
  Context,
  Record<never, never>
> {
  return Wizard.create<Context>()
}

function assertUnusedKey(
  key: string,
  context: AnyAnswers,
  answers: AnyAnswers,
): void {
  if (Object.hasOwn(context, key) || Object.hasOwn(answers, key)) {
    throw new Error(
      `Wizard answer key "${key}" already exists in the current context`,
    )
  }
}

function mergeBranchAnswers(
  target: AnyAnswers,
  childAnswers: AnyAnswers,
  context: AnyAnswers,
): void {
  for (const [key, value] of Object.entries(childAnswers)) {
    // Child execution only returns answers produced by that child. The check
    // prevents a child from silently overwriting a parent/context value.
    if (Object.hasOwn(context, key) || Object.hasOwn(target, key)) {
      throw new Error(
        `Branch answer key "${key}" conflicts with an existing answer`,
      )
    }
    target[key] = value
  }
}
