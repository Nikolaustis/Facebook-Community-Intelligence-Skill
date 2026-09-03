# AI evaluation

`tools/ai_evaluation.js` provides a reproducible evaluation harness for region/language-style semantic decisions.

```powershell
npm run eval:ai
```

To evaluate an external LLM or agent, supply predictions:

```json
[
  {"case_id":"ai-001","label":"TH","latency_ms":840,"cost_usd":0.0004}
]
```

Then run:

```powershell
node tools/ai_evaluation.js --predictions predictions.json
```

The harness reports accuracy, abstention rate, mean latency when supplied, and total cost when supplied. It does not fabricate model outputs or costs.
