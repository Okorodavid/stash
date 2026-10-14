"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Names for guardians ("Mum", "My phone") and the addresses this vault has sent to before. Kept in this
 * browser only: names are for the owner's eyes, and nothing about them needs to be on-chain.
 */
type Book = { names: Record<string, string>; sent: string[] };
const key = (vault: string) => `stash:address-book:${vault.toLowerCase()}`;
const empty: Book = { names: {}, sent: [] };

function read(vault: string): Book {
  try {
    const raw = localStorage.getItem(key(vault));
    if (!raw) return empty;
    const b = JSON.parse(raw) as Partial<Book>;
    return { names: b.names ?? {}, sent: b.sent ?? [] };
  } catch {
    return empty;
  }
}

export function useAddressBook(vault: string | null) {
  const [book, setBook] = useState<Book>(empty);
  useEffect(() => {
    if (!vault) return;
    const t = setTimeout(() => setBook(read(vault)), 0);
    return () => clearTimeout(t);
  }, [vault]);

  const save = useCallback(
    (next: Book) => {
      setBook(next);
      if (!vault) return;
      try {
        localStorage.setItem(key(vault), JSON.stringify(next));
      } catch {
        // Storage blocked: names last for this visit only.
      }
    },
    [vault],
  );

  return {
    nameOf: (addr: string) => book.names[addr.toLowerCase()] as string | undefined,
    setName: (addr: string, name: string) => {
      const names = { ...book.names };
      if (name.trim()) names[addr.toLowerCase()] = name.trim().slice(0, 40);
      else delete names[addr.toLowerCase()];
      save({ ...book, names });
    },
    sentBefore: (addr: string) => book.sent.includes(addr.toLowerCase()),
    rememberSent: (addr: string) => {
      if (!book.sent.includes(addr.toLowerCase())) save({ ...book, sent: [...book.sent, addr.toLowerCase()].slice(-50) });
    },
  };
}

export type AddressBook = ReturnType<typeof useAddressBook>;
