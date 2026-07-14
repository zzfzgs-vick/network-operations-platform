import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { App } from "./App.js";

test("renders the platform runtime identity", () => {
  const html = renderToStaticMarkup(<App />);

  assert.match(html, /Network Operations Platform/);
  assert.match(html, /Web runtime version=dev/);
  assert.match(html, /data-contract-version="v1"/);
});
