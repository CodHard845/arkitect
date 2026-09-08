# Eval cases

Six cases, three per engine, covering what matters most: that a plain request
fires the right skill and produces valid, styled, native output; that a missing
product icon is reported or built honestly rather than substituted; and that the
learning skills never fire on their own.

```
evals/
  drawio/
    generate-architecture/          a plain request produces a valid styled .drawio
    missing-icon-honesty/           a missing icon is reported, never substituted
    learning-skill-stays-manual/    reading a diagram must not trigger learning
  excalidraw/
    generate-architecture/          a valid scene with every arrow bound at both ends
    icon-from-logo/                 an icon is built from the real logo, not faked
    learning-skill-stays-manual/    same rule, other engine
```

```bash
claude plugin eval --allow-tools Bash Write Edit WebSearch WebFetch <path to this repo>
claude plugin eval --case generate-architecture --runs 1 <path>
```

**They are not run by default — they cost money.** They spawn real agent runs and
LLM graders. Run them when you want the spend.

Three caveats:

- `claude plugin eval` is early access and may not be enabled on your account,
  in which case the grader schema in these files is unverified. Treat the
  `graders:` blocks as a first draft and expect to adjust field names once the
  command is available to you.
- `icon-from-logo` reaches the network to fetch a real logo. It is the only case
  that does, and it is the point of that case — a run without network fails it
  for the wrong reason.
- `learning-skill-stays-manual` uses `scaffold_script`, which only runs under
  `--scaffold`. Without that flag, create the `eval-input/` fixture by hand
  first; the script in each case file shows what it needs.

## What a good result looks like

Not just "a file appeared". Each generation case checks that the output is
**native and editable** (real XML / real scene JSON, arrows connected at both
ends, no flattened image), that it **passes the validator** rather than merely
parsing, and that the agent's own report states the assumptions it made, says it
looked at the render, and does not claim to have uploaded anything.

The honesty cases are the ones worth watching. An agent that quietly draws
Redshift's icon for Snowflake produces a diagram that looks finished and is
wrong — which is far worse than an empty slot with a `?` in it.
