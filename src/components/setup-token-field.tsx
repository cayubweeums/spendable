"use client";

import { useState } from "react";

export function SetupTokenField() {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <label htmlFor="setup-token">
        Setup token
        <input
          id="setup-token"
          name="token"
          type={visible ? "text" : "password"}
          required
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
        />
      </label>
      <label className="check">
        <input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} />
        Show the token
      </label>
    </>
  );
}
