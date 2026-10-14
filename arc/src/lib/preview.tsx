"use client";

import { createContext, useContext, type ReactNode } from "react";

// Preview mode: visitors who haven't signed up see the whole app with a sample, empty vault.
// Reading is free; anything that would act (save, send, swap, change rules…) asks them to sign up.

type Preview = { preview: boolean; signUp: () => void };

const PreviewContext = createContext<Preview>({ preview: false, signUp: () => {} });

export function PreviewProvider({ signUp, children }: { signUp: () => void; children: ReactNode }) {
  return <PreviewContext.Provider value={{ preview: true, signUp }}>{children}</PreviewContext.Provider>;
}

export const usePreview = () => useContext(PreviewContext);

/**
 * Replaces every action with "ask to sign up", keeping the same shape so components stay unchanged.
 * Resolves to undefined, which callers already treat as "nothing was sent".
 */
export function signUpInstead<T extends Record<string, (...args: never[]) => unknown>>(actions: T, signUp: () => void): T {
  return Object.fromEntries(
    Object.keys(actions).map((k) => [
      k,
      async () => {
        signUp();
        return undefined;
      },
    ]),
  ) as unknown as T;
}
