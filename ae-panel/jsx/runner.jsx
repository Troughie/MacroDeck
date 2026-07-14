// MacroDeckRunner: evaluates JSX handed over from MacroDeck and returns a JSON
// string the panel forwards into response.json. Wrapping eval in try/catch turns
// AE script errors into a structured { ok, error } instead of a silent failure.
function MacroDeckRunner(jsxCode) {
    try {
        eval(jsxCode);
        return JSON.stringify({ ok: true, error: null });
    } catch (e) {
        return JSON.stringify({ ok: false, error: e.toString() });
    }
}
