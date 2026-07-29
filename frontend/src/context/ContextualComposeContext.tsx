import React, { createContext, useContext, useMemo, useState } from "react";

interface ContextualComposeValue {
  communityComposeDisabled: boolean;
  setCommunityComposeDisabled: (disabled: boolean) => void;
}

const ContextualComposeContext = createContext<ContextualComposeValue | null>(null);

export const ContextualComposeProvider = ({ children }: { children: React.ReactNode }) => {
  const [communityComposeDisabled, setCommunityComposeDisabled] = useState(false);
  const value = useMemo(
    () => ({ communityComposeDisabled, setCommunityComposeDisabled }),
    [communityComposeDisabled],
  );
  return <ContextualComposeContext.Provider value={value}>{children}</ContextualComposeContext.Provider>;
};

export const useContextualCompose = (): ContextualComposeValue => {
  const value = useContext(ContextualComposeContext);
  if (!value) throw new Error("useContextualCompose must be used within ContextualComposeProvider");
  return value;
};
