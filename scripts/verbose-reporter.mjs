function indent(nesting) {
  return "  ".repeat(Math.max(0, nesting));
}

function errorText(error, depth = 0) {
  if (!error || depth > 6) return "failed";
  if (typeof error === "string") return error;
  const message = error.message || "failed";
  const stack = typeof error.stack === "string" ? error.stack : "";
  const own = stack && !stack.includes(message) ? `${message}\n${stack}` : stack || message;
  const cause = error.cause;
  if (!cause) return own;
  return `${own}\ncaused by: ${errorText(cause, depth + 1)}`;
}

export default async function* verboseReporter(source) {
  const started = Date.now();
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let currentFile = "";
  const failures = [];

  yield "spendable tests\n";

  for await (const event of source) {
    const data = event.data ?? {};
    const file = typeof data.file === "string" ? data.file : "";
    const kind = data.details?.type;

    if (file && file !== currentFile && (event.type === "test:start" || event.type === "test:pass")) {
      currentFile = file;
      yield `\n${file}\n`;
    }

    if (event.type === "test:start" && kind === "suite") {
      yield `${indent(data.nesting ?? 0)}${data.name}\n`;
      continue;
    }

    if (event.type === "test:pass" && kind !== "suite") {
      passed += 1;
      const ms = data.details?.duration_ms;
      const timing = typeof ms === "number" ? `  ${ms.toFixed(1)}ms` : "";
      yield `${indent(data.nesting ?? 0)}ok    ${data.name}${timing}\n`;
    }

    if (event.type === "test:fail" && kind !== "suite") {
      failed += 1;
      const text = errorText(data.details?.error);
      failures.push({ file, name: data.name, text });
      yield `${indent(data.nesting ?? 0)}fail  ${data.name}\n`;
      for (const line of text.split("\n")) {
        yield `${indent((data.nesting ?? 0) + 1)}${line}\n`;
      }
    }

    if (event.type === "test:fail" && kind === "suite") {
      failed += 1;
      const text = errorText(data.details?.error);
      failures.push({ file, name: data.name, text });
      yield `${indent(data.nesting ?? 0)}fail  ${data.name}\n`;
      for (const line of text.split("\n")) {
        yield `${indent((data.nesting ?? 0) + 1)}${line}\n`;
      }
    }

    if (event.type === "test:diagnostic") {
      const message = String(data.message ?? "");
      if (/^(tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\s/.test(message)) continue;
      if (message) yield `${indent((data.nesting ?? 0) + 1)}# ${message}\n`;
    }

    if (data.skip || data.todo) skipped += 1;
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(2);
  yield `\n${passed} passed, ${failed} failed, ${skipped} skipped, ${seconds}s\n`;

  if (failures.length > 0) {
    yield "\nFailures\n";
    for (const failure of failures) {
      yield `\n${failure.file}\n${failure.name}\n${failure.text}\n`;
    }
  }
}
